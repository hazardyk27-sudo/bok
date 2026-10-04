import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { BlackjackRealtimeIdentity } from "./realtime";

export const BLACKJACK_REALTIME_ACCESS_QUERY = "access" as const;
export const BLACKJACK_REALTIME_ACCESS_TTL_MS = 10 * 60 * 1000;

export type BlackjackRealtimeAccessRecord = Readonly<{
  token: string;
  sessionId: string;
  expiresAtMs: number;
}>;

const accessByToken = new Map<string, BlackjackRealtimeAccessRecord>();

function cleanupExpired(nowMs: number): void {
  for (const [token, record] of accessByToken) {
    if (record.expiresAtMs <= nowMs) accessByToken.delete(token);
  }
}

function buildIdentity(sessionId: string): BlackjackRealtimeIdentity {
  return Object.freeze({
    userId: sessionId,
    playerId: `blackjack-player:${sessionId}`,
    sessionId,
  });
}

export function issueBlackjackRealtimeAccess(
  sessionId: string,
  input: Readonly<{
    nowMs?: number;
    createToken?: () => string;
  }> = {},
): BlackjackRealtimeAccessRecord {
  const nowMs = input.nowMs ?? Date.now();
  cleanupExpired(nowMs);

  const token = (input.createToken ?? randomUUID)();
  if (!token || token.length < 20 || token.length > 200) {
    throw new Error("BLACKJACK_REALTIME_ACCESS_TOKEN_INVALID");
  }
  if (!sessionId || sessionId.length < 20 || sessionId.length > 200) {
    throw new Error("BLACKJACK_REALTIME_ACCESS_SESSION_INVALID");
  }

  const record = Object.freeze({
    token,
    sessionId,
    expiresAtMs: nowMs + BLACKJACK_REALTIME_ACCESS_TTL_MS,
  });
  accessByToken.set(token, record);
  return record;
}

export function resolveBlackjackRealtimeAccess(
  request: IncomingMessage,
  nowMs = Date.now(),
): BlackjackRealtimeIdentity | null {
  cleanupExpired(nowMs);

  let token: string | null = null;
  try {
    const url = new URL(request.url ?? "/", "http://blackjack.local");
    token = url.searchParams.get(BLACKJACK_REALTIME_ACCESS_QUERY);
  } catch {
    return null;
  }

  if (!token) return null;
  const record = accessByToken.get(token);
  if (!record || record.expiresAtMs <= nowMs) {
    accessByToken.delete(token);
    return null;
  }

  return buildIdentity(record.sessionId);
}

export function clearBlackjackRealtimeAccessForTests(): void {
  accessByToken.clear();
}
