import { pool, type PoolClient } from "@workspace/db";
import {
  AUTH_SESSION_TTL_MS,
  createSessionToken,
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

  async revokeSession(token: string) {
    await pool.query(
      `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE token_hash = $1`,
      [hashSessionToken(token)],
    );
  },
};
