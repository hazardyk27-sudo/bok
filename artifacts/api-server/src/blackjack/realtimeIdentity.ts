import { SESSION_COOKIE } from "../platform/session";

export const BLACKJACK_AUTH_COOKIE = "fy_auth" as const;
export const BLACKJACK_REALTIME_SESSION_COOKIE =
  "blackjack_realtime_session" as const;
export const BLACKJACK_REALTIME_SESSION_COOKIE_PATH =
  "/api/blackjack/ws" as const;
export const BLACKJACK_REALTIME_SESSION_COOKIE_MAX_AGE_MS =
  1000 * 60 * 10;

const SESSION_ID_PATTERN = /^[a-f0-9-]{20,80}$/i;

export type BlackjackAuthWalletSessionLookup = (
  authToken: string,
) => Promise<string | null>;

export function isValidBlackjackRealtimeSessionId(
  value: unknown,
): value is string {
  return typeof value === "string" && SESSION_ID_PATTERN.test(value);
}

export function getDecodedCookieValuesByName(
  cookieHeader: string | undefined,
  cookieName: string,
): string[] {
  if (!cookieHeader || !cookieName) return [];

  const values: string[] = [];
  const seen = new Set<string>();

  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt <= 0) continue;
    if (trimmed.slice(0, equalsAt) !== cookieName) continue;

    const raw = trimmed.slice(equalsAt + 1);
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // Keep raw value. The caller owns semantic validation.
    }

    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }

  return values;
}

export function getCookieCandidatesByName(
  cookieHeader: string | undefined,
  cookieName: string,
): string[] {
  return getDecodedCookieValuesByName(cookieHeader, cookieName).filter(
    isValidBlackjackRealtimeSessionId,
  );
}

function resolveDedicatedRealtimeSessionId(
  cookieHeader: string | undefined,
): string | null {
  const realtimeCandidates = getCookieCandidatesByName(
    cookieHeader,
    BLACKJACK_REALTIME_SESSION_COOKIE,
  );
  return realtimeCandidates.at(-1) ?? null;
}

export function resolveBlackjackRealtimeSessionId(
  cookieHeader: string | undefined,
): string | null {
  const dedicated = resolveDedicatedRealtimeSessionId(cookieHeader);
  if (dedicated !== null) return dedicated;

  const canonicalCandidates = getCookieCandidatesByName(
    cookieHeader,
    SESSION_COOKIE,
  );

  return canonicalCandidates.length === 1
    ? canonicalCandidates[0] ?? null
    : null;
}

export async function resolveBlackjackRealtimeSessionIdWithAuth(
  cookieHeader: string | undefined,
  lookupAuthWalletSessionId: BlackjackAuthWalletSessionLookup,
): Promise<string | null> {
  const authTokens = getDecodedCookieValuesByName(
    cookieHeader,
    BLACKJACK_AUTH_COOKIE,
  );

  if (authTokens.length > 0) {
    const authenticatedWalletSessions = new Set<string>();

    for (const authToken of authTokens) {
      let walletSessionId: string | null;
      try {
        walletSessionId = await lookupAuthWalletSessionId(authToken);
      } catch {
        throw new Error("BLACKJACK_AUTH_SESSION_LOOKUP_FAILED");
      }

      if (walletSessionId === null) continue;
      if (!isValidBlackjackRealtimeSessionId(walletSessionId)) {
        throw new Error("BLACKJACK_AUTH_WALLET_SESSION_INVALID");
      }
      authenticatedWalletSessions.add(walletSessionId);
    }

    if (authenticatedWalletSessions.size > 1) {
      // Browsers can retain legacy scoped fy_auth cookies alongside the
      // canonical root cookie. HTTP cookie parsing then selects one token,
      // while the raw WebSocket Cookie header exposes both. The successful
      // /blackjack/session bootstrap writes a short-lived dedicated binding
      // for exactly the canonical wallet selected by HTTP. Use that binding
      // only when it is one of the authenticated wallets; otherwise preserve
      // fail-closed behavior for genuinely ambiguous auth state.
      const dedicated = resolveDedicatedRealtimeSessionId(cookieHeader);
      return dedicated !== null && authenticatedWalletSessions.has(dedicated)
        ? dedicated
        : null;
    }

    const authenticatedSessionId =
      authenticatedWalletSessions.values().next().value as
        | string
        | undefined;
    if (authenticatedSessionId !== undefined) {
      return authenticatedSessionId;
    }
  }

  return resolveBlackjackRealtimeSessionId(cookieHeader);
}
