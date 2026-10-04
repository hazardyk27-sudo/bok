import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { BlackjackRealtimeIdentity } from "./realtime";

export const BLACKJACK_REALTIME_ACCESS_QUERY = "access" as const;
export const BLACKJACK_REALTIME_ACCESS_PREFIX = "bjrt_" as const;
export const BLACKJACK_REALTIME_ACCESS_TTL_MS = 10 * 60 * 1000;

const BLACKJACK_REALTIME_ACCESS_VERSION = 1 as const;
const BLACKJACK_REALTIME_ACCESS_KEY_DOMAIN =
  "blackjack-realtime-access-signing-key-v1\u0000";

export type BlackjackRealtimeAccessRecord = Readonly<{
  token: string;
  sessionId: string;
  expiresAtMs: number;
}>;

type BlackjackRealtimeAccessPayload = Readonly<{
  v: typeof BLACKJACK_REALTIME_ACCESS_VERSION;
  s: string;
  e: number;
  n: string;
}>;

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

function resolveSigningSecret(explicit?: string): string {
  const configured = explicit?.trim();
  if (configured) return configured;

  const dedicated = process.env.BLACKJACK_REALTIME_SIGNING_SECRET?.trim();
  if (dedicated) return dedicated;

  const databaseSecret =
    process.env.USE_SUPABASE_DATABASE === "true"
      ? process.env.SUPABASE_DATABASE_URL
      : process.env.DATABASE_URL;
  if (!databaseSecret || databaseSecret.length < 32) {
    throw new Error("BLACKJACK_REALTIME_SIGNING_SECRET_UNAVAILABLE");
  }
  return databaseSecret;
}

function deriveSigningKey(secret: string): Buffer {
  return createHash("sha256")
    .update(BLACKJACK_REALTIME_ACCESS_KEY_DOMAIN)
    .update(secret)
    .digest();
}

function signPayload(payload: string, secret: string): Buffer {
  return createHmac("sha256", deriveSigningKey(secret))
    .update(payload)
    .digest();
}

function encodePayload(payload: BlackjackRealtimeAccessPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(encoded: string): BlackjackRealtimeAccessPayload | null {
  try {
    const value = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as unknown;
    if (typeof value !== "object" || value === null) return null;
    const candidate = value as Partial<BlackjackRealtimeAccessPayload>;
    if (
      candidate.v !== BLACKJACK_REALTIME_ACCESS_VERSION ||
      typeof candidate.s !== "string" ||
      !isValidSessionId(candidate.s) ||
      !Number.isSafeInteger(candidate.e) ||
      typeof candidate.n !== "string" ||
      candidate.n.length < 16 ||
      candidate.n.length > 100
    ) {
      return null;
    }
    return Object.freeze({
      v: BLACKJACK_REALTIME_ACCESS_VERSION,
      s: candidate.s,
      e: candidate.e as number,
      n: candidate.n,
    });
  } catch {
    return null;
  }
}

function signaturesMatch(
  encodedPayload: string,
  encodedSignature: string,
  secret: string,
): boolean {
  let actual: Buffer;
  try {
    actual = Buffer.from(encodedSignature, "base64url");
  } catch {
    return false;
  }
  const expected = signPayload(encodedPayload, secret);
  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  );
}

export function issueBlackjackRealtimeAccess(
  sessionId: string,
  input: Readonly<{
    nowMs?: number;
    signingSecret?: string;
    createNonce?: () => string;
  }> = {},
): BlackjackRealtimeAccessRecord {
  if (!isValidSessionId(sessionId)) {
    throw new Error("BLACKJACK_REALTIME_ACCESS_SESSION_INVALID");
  }

  const nowMs = input.nowMs ?? Date.now();
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error("BLACKJACK_REALTIME_ACCESS_TIME_INVALID");
  }
  const expiresAtMs = nowMs + BLACKJACK_REALTIME_ACCESS_TTL_MS;
  const nonce =
    input.createNonce?.() ?? randomBytes(18).toString("base64url");
  if (nonce.length < 16 || nonce.length > 100) {
    throw new Error("BLACKJACK_REALTIME_ACCESS_NONCE_INVALID");
  }

  const payload = encodePayload({
    v: BLACKJACK_REALTIME_ACCESS_VERSION,
    s: sessionId,
    e: expiresAtMs,
    n: nonce,
  });
  const secret = resolveSigningSecret(input.signingSecret);
  const signature = signPayload(payload, secret).toString("base64url");
  const token = `${BLACKJACK_REALTIME_ACCESS_PREFIX}${payload}.${signature}`;
  if (token.length > 512) {
    throw new Error("BLACKJACK_REALTIME_ACCESS_TOKEN_INVALID");
  }

  return Object.freeze({ token, sessionId, expiresAtMs });
}

export function resolveBlackjackRealtimeAccess(
  request: IncomingMessage,
  input: Readonly<{
    nowMs?: number;
    signingSecret?: string;
  }> = {},
): BlackjackRealtimeIdentity | null {
  let token: string | null = null;
  try {
    const url = new URL(request.url ?? "/", "http://blackjack.local");
    token = url.searchParams.get(BLACKJACK_REALTIME_ACCESS_QUERY);
  } catch {
    return null;
  }

  if (!token || !token.startsWith(BLACKJACK_REALTIME_ACCESS_PREFIX)) {
    return null;
  }

  const compact = token.slice(BLACKJACK_REALTIME_ACCESS_PREFIX.length);
  const separator = compact.indexOf(".");
  if (separator <= 0 || separator !== compact.lastIndexOf(".")) {
    return null;
  }
  const encodedPayload = compact.slice(0, separator);
  const encodedSignature = compact.slice(separator + 1);
  if (!encodedPayload || !encodedSignature) return null;

  let secret: string;
  try {
    secret = resolveSigningSecret(input.signingSecret);
  } catch {
    return null;
  }
  if (!signaturesMatch(encodedPayload, encodedSignature, secret)) {
    return null;
  }

  const payload = decodePayload(encodedPayload);
  if (payload === null) return null;

  const nowMs = input.nowMs ?? Date.now();
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || payload.e <= nowMs) {
    return null;
  }

  return buildIdentity(payload.s);
}
