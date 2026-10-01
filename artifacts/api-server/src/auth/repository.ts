import { pool, type PoolClient } from "@workspace/db";
import {
  AUTH_SESSION_TTL_MS,
  createSessionToken,
  hashPassword,
  hashSessionToken,
  normalizeEmail,
  normalizeUsername,
  verifyPassword,
  formatAuthUserCode,
} from "./security";

const INITIAL_SHARED_BALANCE_CENTS = 100_000;
const REGISTERED_ACCOUNT_INITIAL_BALANCE_CENTS = 500_000;

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  userCode: string;
  balanceCents: number;
  createdAt: string;
};

type UserRow = {
  id: string;
  user_number: number | string;
  username: string;
  email: string;
  password_hash: string;
  wallet_session_id: string;
  balance_cents: number | string;
  created_at: Date;
};

type SessionUser = {
  user: AuthUser;
  walletSessionId: string;
};

function toSessionUser(row: UserRow): SessionUser {
  const userNumber = Number(row.user_number);
  return {
    user: {
      id: row.id,
      email: row.email,
      username: row.username,
      userCode: formatAuthUserCode(userNumber),
      balanceCents: Number(row.balance_cents),
      createdAt: row.created_at.toISOString(),
    },
    walletSessionId: row.wallet_session_id,
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

function uniqueConstraint(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  ) {
    return "constraint" in error && typeof (error as { constraint?: unknown }).constraint === "string"
      ? (error as { constraint: string }).constraint
      : "";
  }
  return null;
}

function throwRegistrationConflict(error: unknown): never {
  const constraint = uniqueConstraint(error);
  if (constraint === null) throw error;
  if (constraint.includes("username")) throw new Error("USERNAME_ALREADY_REGISTERED");
  if (constraint.includes("wallet_session")) throw new Error("WALLET_ALREADY_LINKED");
  throw new Error("EMAIL_ALREADY_REGISTERED");
}

async function ensureWallet(
  client: PoolClient,
  sessionId: string,
  initialBalanceCents = INITIAL_SHARED_BALANCE_CENTS,
) {
  const result = await client.query<{ balance_cents: number | string }>(
    `INSERT INTO shared_wallets (session_id, balance_cents, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (session_id) DO UPDATE
       SET balance_cents = shared_wallets.balance_cents
     RETURNING balance_cents`,
    [sessionId, initialBalanceCents],
  );
  return Number(result.rows[0]?.balance_cents ?? INITIAL_SHARED_BALANCE_CENTS);
}

const USER_SELECT = `
  SELECT
    u.id,
    u.user_number,
    u.username,
    u.email,
    u.password_hash,
    u.wallet_session_id,
    w.balance_cents,
    u.created_at
  FROM users u
  INNER JOIN shared_wallets w
    ON w.session_id = u.wallet_session_id
`;

export const authRepository = {
  async register(
    emailInput: string,
    usernameInput: string,
    password: string,
    walletSessionId: string,
  ) {
    const email = normalizeEmail(emailInput);
    const username = normalizeUsername(usernameInput);
    const passwordHash = await hashPassword(password);

    try {
      return await withTransaction(async (client) => {
        // A registered account must start clean and must never inherit the
        // browser's previous anonymous/guest wallet.
        const balanceCents = await ensureWallet(client, walletSessionId, REGISTERED_ACCOUNT_INITIAL_BALANCE_CENTS);
        const inserted = await client.query<{
          id: string;
          user_number: number | string;
          username: string;
          email: string;
          password_hash: string;
          wallet_session_id: string;
          created_at: Date;
        }>(
          `INSERT INTO users
             (email, username, password_hash, wallet_session_id)
           VALUES ($1, $2, $3, $4)
           RETURNING
             id,
             user_number,
             username,
             email,
             password_hash,
             wallet_session_id,
             created_at`,
          [email, username, passwordHash, walletSessionId],
        );

        const row = inserted.rows[0];
        if (!row) throw new Error("AUTH_USER_CREATE_FAILED");

        const session = await createSession(client, row.id);
        const result = toSessionUser({
          ...row,
          balance_cents: balanceCents,
        });
        return { ...result, ...session };
      });
    } catch (error) {
      throwRegistrationConflict(error);
    }
  },

  async login(identifierInput: string, password: string) {
    const identifier = identifierInput.trim().toLowerCase();
    const result = await pool.query<UserRow>(
      `${USER_SELECT}
       WHERE u.email = $1 OR u.username = $1
       LIMIT 1`,
      [identifier],
    );
    const row = result.rows[0];
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      throw new Error("INVALID_EMAIL_OR_PASSWORD");
    }

    return withTransaction(async (client) => {
      const session = await createSession(client, row.id);
      return { ...toSessionUser(row), ...session };
    });
  },

  async getUserBySessionToken(token: string): Promise<SessionUser | null> {
    const tokenHash = hashSessionToken(token);
    const result = await pool.query<UserRow>(
      `${USER_SELECT}
       INNER JOIN auth_sessions s
         ON s.user_id = u.id
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

    return toSessionUser(row);
  },

  async changePassword(
    token: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const tokenHash = hashSessionToken(token);
    const result = await pool.query<UserRow>(
      `${USER_SELECT}
       INNER JOIN auth_sessions s
         ON s.user_id = u.id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
       LIMIT 1`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) throw new Error("AUTH_REQUIRED");
    if (!(await verifyPassword(currentPassword, row.password_hash))) {
      throw new Error("CURRENT_PASSWORD_INVALID");
    }

    const nextHash = await hashPassword(newPassword);
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE users
         SET password_hash = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [row.id, nextHash],
      );
      await client.query(
        `UPDATE auth_sessions
         SET revoked_at = COALESCE(revoked_at, NOW())
         WHERE user_id = $1
           AND token_hash <> $2`,
        [row.id, tokenHash],
      );
    });

    return toSessionUser(row);
  },

  async ensureAnonymousWallet(sessionId: string) {
    return withTransaction((client) => ensureWallet(client, sessionId));
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
