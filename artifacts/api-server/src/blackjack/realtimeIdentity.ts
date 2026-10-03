export const BLACKJACK_REALTIME_SESSION_COOKIE =
  "blackjack_realtime_session" as const;
export const BLACKJACK_REALTIME_SESSION_COOKIE_PATH =
  "/api/blackjack/ws" as const;
export const BLACKJACK_REALTIME_SESSION_COOKIE_MAX_AGE_MS =
  1000 * 60 * 10;

const SESSION_ID_PATTERN = /^[a-f0-9-]{20,80}$/i;

export function isValidBlackjackRealtimeSessionId(
  value: unknown,
): value is string {
  return typeof value === "string" && SESSION_ID_PATTERN.test(value);
}

export function getCookieCandidatesByName(
  cookieHeader: string | undefined,
  cookieName: string,
): string[] {
  if (!cookieHeader || !cookieName) return [];

  const candidates: string[] = [];
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
      // Invalid percent encoding is handled by the validator below.
    }

    if (!isValidBlackjackRealtimeSessionId(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    candidates.push(value);
  }

  return candidates;
}

export function resolveBlackjackRealtimeSessionId(
  cookieHeader: string | undefined,
): string | null {
  const candidates = getCookieCandidatesByName(
    cookieHeader,
    BLACKJACK_REALTIME_SESSION_COOKIE,
  );
  return candidates.at(-1) ?? null;
}
