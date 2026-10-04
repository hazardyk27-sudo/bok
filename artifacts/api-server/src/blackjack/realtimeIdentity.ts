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

export function resolveBlackjackRealtimeSessionId(
  cookieHeader: string | undefined,
): string | null {
  const realtimeCandidates = getCookieCandidatesByName(
    cookieHeader,
    BLACKJACK_REALTIME_SESSION_COOKIE,
  );
  return realtimeCandidates.at(-1) ?? null;
}

export async function resolveBlackjackRealtimeSessionIdWithAuth(
  cookieHeader: string | undefined,
  lookupAuthWalletSessionId: BlackjackAuthWalletSessionLookup,
): Promise<string | null> {
  // Authentication happens once over normal HTTP at /blackjack/session.
  // That endpoint writes the short-lived websocket-path binding. Realtime
  // deliberately does not inspect fy_auth or game_session again.
  void lookupAuthWalletSessionId;
  return resolveBlackjackRealtimeSessionId(cookieHeader);
}
