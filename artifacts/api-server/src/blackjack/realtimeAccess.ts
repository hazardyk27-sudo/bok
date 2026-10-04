import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { BlackjackRealtimeIdentity } from "./realtime";

export const BLACKJACK_REALTIME_ACCESS_QUERY = "access" as const;
export const BLACKJACK_REALTIME_ACCESS_PREFIX = "bjrt_" as const;
export const BLACKJACK_REALTIME_ACCESS_TTL_MS = 10 * 60 * 1000;

const BLACKJACK_REALTIME_ACCESS_HASH_DOMAIN =
  "blackjack-realtime-access-v1\u0000";

export type BlackjackRealtimeAccessRecord = Readonly<{
  token: string;
  sessionId: string;
  expiresAtMs: number;
}>;

export type BlackjackRealtimeAccessPersist = (
  input: Readonly<{
    tokenHash: string;
    sessionId: string;
    expiresAtMs: number;
  }>,
) => Promise<boolean>;

export type BlackjackRealtimeAccessLookup = (
  tokenHash: string,
  nowMs: number,
) => Promise<string | null>;

function buildIdentity(sessionId: string): BlackjackRealtimeIdentity {
  return Object.freeze({
    userId: sessionId,
    playerId: `blackjack-player:${sessionId}`,
    sessionId,
  });
}

function isValidSessionId(sessionId: string): boolean {
  return sessionId.length >= 20 && sessionId.length <= 200;
}

function isValidRealtimeToken(token: string): boolean {
  return (
    token.startsWith(BLACKJACK_REALTIME_ACCESS_PREFIX) &&
    token.length >= BLACKJACK_REALTIME_ACCESS_PREFIX.length + 20 &&
    token.length <= 200
  );
}

export function hashBlackjackRealtimeAccessToken(token: string): string {
  return createHash("sha256")
    .update(BLACKJACK_REALTIME_ACCESS_HASH_DOMAIN)
    .update(token)
    .digest("hex");
}

async function persistBlackjackRealtimeAccessDefault(
  input: Readonly<{
    tokenHash: string;
    sessionId: string;
    expiresAtMs: number;
  }>,
): Promise<boolean> {
  const { pool } = await import("@workspace/db");
  const result = await pool.query<{ id: string }>(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
     SELECT u.id, $2, $3
       FROM users u
      WHERE u.wallet_session_id = $1
     RETURNING id`,
    [input.sessionId, input.tokenHash, new Date(input.expiresAtMs)],
  );
  return result.rows.length === 1;
}

async function lookupBlackjackRealtimeAccessDefault(
  tokenHash: string,
  nowMs: number,
): Promise<string | null> {
  const { pool } = await import("@workspace/db");
  const result = await pool.query<{ wallet_session_id: string }>(
    `SELECT u.wallet_session_id
       FROM auth_sessions s
       INNER JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > $2
      LIMIT 1`,
    [tokenHash, new Date(nowMs)],
  );
  const sessionId = result.rows[0]?.wallet_session_id ?? null;
  if (sessionId !== null) {
    void pool
      .query(
        `UPDATE auth_sessions
            SET last_seen_at = NOW()
          WHERE token_hash = $1`,
        [tokenHash],
      )
      .catch(() => undefined);
  }
  return sessionId;
}

export async function issueBlackjackRealtimeAccess(
  sessionId: string,
  input: Readonly<{
    nowMs?: number;
    createToken?: () => string;
    persist?: BlackjackRealtimeAccessPersist;
  }> = {},
): Promise<BlackjackRealtimeAccessRecord> {
  const nowMs = input.nowMs ?? Date.now();
  if (!isValidSessionId(sessionId)) {
    throw new Error("BLACKJACK_REALTIME_ACCESS_SESSION_INVALID");
  }

  const token =
    input.createToken?.() ??
    `${BLACKJACK_REALTIME_ACCESS_PREFIX}${randomBytes(32).toString("base64url")}`;
  if (!isValidRealtimeToken(token)) {
    throw new Error("BLACKJACK_REALTIME_ACCESS_TOKEN_INVALID");
  }

  const expiresAtMs = nowMs + BLACKJACK_REALTIME_ACCESS_TTL_MS;
  const persisted = await (
    input.persist ?? persistBlackjackRealtimeAccessDefault
  )({
    tokenHash: hashBlackjackRealtimeAccessToken(token),
    sessionId,
    expiresAtMs,
  });
  if (!persisted) {
    throw new Error("BLACKJACK_REALTIME_ACCESS_ACCOUNT_NOT_FOUND");
  }

  return Object.freeze({ token, sessionId, expiresAtMs });
}

export async function resolveBlackjackRealtimeAccess(
  request: IncomingMessage,
  input: Readonly<{
    nowMs?: number;
    lookup?: BlackjackRealtimeAccessLookup;
  }> = {},
): Promise<BlackjackRealtimeIdentity | null> {
  let token: string | null = null;
  try {
    const url = new URL(request.url ?? "/", "http://blackjack.local");
    token = url.searchParams.get(BLACKJACK_REALTIME_ACCESS_QUERY);
  } catch {
    return null;
  }

  if (!token || !isValidRealtimeToken(token)) return null;

  const nowMs = input.nowMs ?? Date.now();
  const sessionId = await (
    input.lookup ?? lookupBlackjackRealtimeAccessDefault
  )(hashBlackjackRealtimeAccessToken(token), nowMs);
  if (sessionId === null || !isValidSessionId(sessionId)) return null;

  return buildIdentity(sessionId);
}
