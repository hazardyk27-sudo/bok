export const SESSION_COOKIE = "game_session" as const;
export const LEGACY_SESSION_COOKIE = "roulette_session" as const;
export const SESSION_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 365;
export const SESSION_ID_PATTERN = /^[a-f0-9-]{20,80}$/;

export const LEGACY_SCOPED_SESSION_PATHS = [
  "/api/slot",
  "/api/roulette",
  "/api/cadi-kazan",
  "/api/idle",
  "/api/blackjack",
] as const;

export function isValidSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID_PATTERN.test(value);
}

export function getLegacyScopedSessionPathForRequest(requestPath: string) {
  return LEGACY_SCOPED_SESSION_PATHS.find(
    (path) => requestPath === path || requestPath.startsWith(`${path}/`),
  ) ?? null;
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

export function getSessionCookieCandidates(cookieHeader: string | undefined) {
  if (!cookieHeader) return [] as string[];

  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt <= 0) continue;
    if (trimmed.slice(0, equalsAt) !== SESSION_COOKIE) continue;

    const raw = trimmed.slice(equalsAt + 1);
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // Keep the raw value; validity is checked below.
    }

    if (!isValidSessionId(value) || seen.has(value)) continue;
    seen.add(value);
    candidates.push(value);
  }

  return candidates;
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

  if (
    legacyBalanceCents !== null
    && (
      canonicalBalanceCents === null
      || legacyBalanceCents > canonicalBalanceCents
    )
  ) {
    return legacySessionId;
  }

  return canonicalSessionId;
}

export function chooseHighestBalanceSessionCandidate(
  candidates: readonly { sessionId: string; balanceCents: number }[],
) {
  let winner: { sessionId: string; balanceCents: number; order: number } | null = null;

  for (let order = 0; order < candidates.length; order += 1) {
    const candidate = candidates[order]!;
    if (
      winner === null
      || candidate.balanceCents > winner.balanceCents
      || (
        candidate.balanceCents === winner.balanceCents
        && order > winner.order
      )
    ) {
      winner = { ...candidate, order };
    }
  }

  return winner ? winner.sessionId : null;
}
