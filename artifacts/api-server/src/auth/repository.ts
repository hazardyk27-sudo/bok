import { pool, type PoolClient } from "@workspace/db";
import {
  AUTH_SESSION_TTL_MS,
  EMAIL_VERIFICATION_TTL_MS,
  createOpaqueToken,
  createSessionToken,
  hashOpaqueToken,
  hashPassword,
  hashSessionToken,
  normalizeEmail,
  verifyPassword,
} from "./security";

export type AuthUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  email_verified_at: Date | null;
  created_at: Date;
};

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.email_verified_at !== null,
    createdAt: row.created_at.toISOString(),
  };
}

async function createSession(client: PoolClient, userId: string) {
  const { token, tokenHash } = createSessionToken();
  const expiresAt = new Date(Date.now() + AUTH_SESSION_TTL_MS);
  await client.query(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
  return { token, expiresAt };
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505",
  );
}

export const authRepository = {
  async register(emailInput: string, password: string) {
    const email = normalizeEmail(emailInput);
    const passwordHash = await hashPassword(password);

    try {
      return await withTransaction(async (client) => {
        const inserted = await client.query<UserRow>(
          `INSERT INTO users (email, password_hash)
           VALUES ($1, $2)
           RETURNING id, email, password_hash, email_verified_at, created_at`,
          [email, passwordHash],
        );
        const row = inserted.rows[0];
        if (!row) throw new Error("AUTH_USER_CREATE_FAILED");
        const session = await createSession(client, row.id);
        return { user: toAuthUser(row), ...session };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error("EMAIL_ALREADY_REGISTERED");
      throw error;
    }
  },

  async login(emailInput: string, password: string) {
    const email = normalizeEmail(emailInput);
    const result = await pool.query<UserRow>(
      `SELECT id, email, password_hash, email_verified_at, created_at
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email],
    );
    const row = result.rows[0];
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      throw new Error("INVALID_EMAIL_OR_PASSWORD");
    }

    return withTransaction(async (client) => {
      const session = await createSession(client, row.id);
      return { user: toAuthUser(row), ...session };
    });
  },

  async getUserBySessionToken(token: string) {
    const tokenHash = hashSessionToken(token);
    const result = await pool.query<UserRow>(
      `SELECT u.id, u.email, u.password_hash, u.email_verified_at, u.created_at
       FROM auth_sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
       LIMIT 1`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) return null;

    void pool
      .query(
        `UPDATE auth_sessions
         SET last_seen_at = NOW()
         WHERE token_hash = $1`,
        [tokenHash],
      )
      .catch(() => undefined);

    return toAuthUser(row);
  },

  async issueEmailVerification(userId: string) {
    return withTransaction(async (client) => {
      const userResult = await client.query<UserRow>(
        `SELECT id, email, password_hash, email_verified_at, created_at
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [userId],
      );
      const user = userResult.rows[0];
      if (!user) throw new Error("AUTH_USER_NOT_FOUND");
      if (user.email_verified_at) {
        return { alreadyVerified: true as const, user: toAuthUser(user) };
      }

      const recent = await client.query<{ created_at: Date }>(
        `SELECT created_at
         FROM email_verification_tokens
         WHERE user_id = $1
           AND consumed_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId],
      );
      const latest = recent.rows[0]?.created_at;
      if (latest && Date.now() - latest.getTime() < 60_000) {
        throw new Error("EMAIL_VERIFICATION_RATE_LIMIT");
      }

      const hourly = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM email_verification_tokens
         WHERE user_id = $1
           AND created_at > NOW() - INTERVAL '1 hour'`,
        [userId],
      );
      if (Number(hourly.rows[0]?.count ?? 0) >= 5) {
        throw new Error("EMAIL_VERIFICATION_RATE_LIMIT");
      }

      const { token, tokenHash } = createOpaqueToken();
      const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [userId, tokenHash, expiresAt],
      );
      const verificationId = inserted.rows[0]?.id;
      if (!verificationId) throw new Error("EMAIL_VERIFICATION_CREATE_FAILED");

      return {
        alreadyVerified: false as const,
        user: toAuthUser(user),
        token,
        verificationId,
        expiresAt,
      };
    });
  },

  async discardEmailVerification(verificationId: string) {
    await pool.query(
      `UPDATE email_verification_tokens
       SET consumed_at = COALESCE(consumed_at, NOW())
       WHERE id = $1`,
      [verificationId],
    );
  },

  async verifyEmail(token: string) {
    if (token.length < 40 || token.length > 128) {
      throw new Error("INVALID_OR_EXPIRED_VERIFICATION_TOKEN");
    }

    return withTransaction(async (client) => {
      const tokenHash = hashOpaqueToken(token);
      const tokenResult = await client.query<{ user_id: string }>(
        `SELECT user_id
         FROM email_verification_tokens
         WHERE token_hash = $1
           AND consumed_at IS NULL
           AND expires_at > NOW()
         LIMIT 1
         FOR UPDATE`,
        [tokenHash],
      );
      const userId = tokenResult.rows[0]?.user_id;
      if (!userId) throw new Error("INVALID_OR_EXPIRED_VERIFICATION_TOKEN");

      const updated = await client.query<UserRow>(
        `UPDATE users
         SET email_verified_at = COALESCE(email_verified_at, NOW()),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, email, password_hash, email_verified_at, created_at`,
        [userId],
      );
      const user = updated.rows[0];
      if (!user) throw new Error("AUTH_USER_NOT_FOUND");

      await client.query(
        `UPDATE email_verification_tokens
         SET consumed_at = COALESCE(consumed_at, NOW())
         WHERE user_id = $1
           AND consumed_at IS NULL`,
        [userId],
      );

      return toAuthUser(user);
    });
  },

  async revokeSession(token: string) {
    await pool.query(
      `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE token_hash = $1`,
      [hashSessionToken(token)],
    );
  },
};
