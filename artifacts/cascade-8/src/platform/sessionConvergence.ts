export const SESSION_CONVERGENCE_ENDPOINTS = [
  "/api/slot/session-converge",
  "/api/roulette/session-converge",
  "/api/cadi-kazan/session-converge",
  "/api/idle/session-converge",
  "/api/blackjack/session-converge",
] as const;

const SESSION_CONVERGENCE_MARKER = "oyun-session-convergence-v3";

export async function convergeLegacyGameSessions(
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (sessionStorage.getItem(SESSION_CONVERGENCE_MARKER) === "done") {
    return true;
  }

  for (const endpoint of SESSION_CONVERGENCE_ENDPOINTS) {
    let response: Response;
    try {
      response = await fetcher(endpoint, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch {
      return false;
    }

    if (!response.ok) return false;
  }

  sessionStorage.setItem(SESSION_CONVERGENCE_MARKER, "done");
  return true;
}
