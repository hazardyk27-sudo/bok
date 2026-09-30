export const SESSION_COOKIE = "game_session" as const;
export const LEGACY_SESSION_COOKIE = "roulette_session" as const;
export const SESSION_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 365;
export const SESSION_ID_PATTERN = /^[a-f0-9-]{20,80}$/;

export function isValidSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID_PATTERN.test(value);
}

export function getCanonicalSessionId(
  cookies: Record<string, unknown> | undefined,
) {
  const canonical = cookies?.[SESSION_COOKIE];
  return isValidSessionId(canonical) ? canonical : null;
}

export function getLegacySessionId(
  cookies: Record<string, unknown> | undefined,
) {
  const legacy = cookies?.[LEGACY_SESSION_COOKIE];
  return isValidSessionId(legacy) ? legacy : null;
}

export function chooseSessionIdForWalletMigration(input: {
  canonicalSessionId: string | null;
  legacySessionId: string | null;
  canonicalBalanceCents: number | null;
  legacyBalanceCents: number | null;
  initialBalanceCents: number;
}) {
  const {
    canonicalSessionId,
    legacySessionId,
    canonicalBalanceCents,
    legacyBalanceCents,
    initialBalanceCents,
  } = input;

  if (!canonicalSessionId) return legacySessionId;
  if (!legacySessionId || legacySessionId === canonicalSessionId) {
    return canonicalSessionId;
  }

  if (canonicalBalanceCents === null && legacyBalanceCents !== null) {
    return legacySessionId;
  }

  if (
    canonicalBalanceCents === initialBalanceCents
    && legacyBalanceCents !== null
    && legacyBalanceCents !== initialBalanceCents
  ) {
    return legacySessionId;
  }

  return canonicalSessionId;
}
