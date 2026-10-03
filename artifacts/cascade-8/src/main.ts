export {};

const SESSION_CONVERGENCE_BROWSER_MARKER =
  "oyun-session-convergence-browser-v1";

let needsLegacySessionConvergence = true;
try {
  needsLegacySessionConvergence =
    window.localStorage.getItem(
      SESSION_CONVERGENCE_BROWSER_MARKER,
    ) !== "done";
} catch {
  // Storage can be unavailable in hardened/private browser contexts.
}

if (needsLegacySessionConvergence) {
  const { convergeLegacyGameSessions } =
    await import(
      "./platform/sessionConvergence"
    );
  const converged =
    await convergeLegacyGameSessions();

  if (converged) {
    try {
      window.localStorage.setItem(
        SESSION_CONVERGENCE_BROWSER_MARKER,
        "done",
      );
    } catch {
      // The session-scoped marker inside the convergence helper still prevents
      // duplicate work for this tab when persistent storage is unavailable.
    }
  }
}

const app = document.querySelector<HTMLDivElement>("#app")!;
const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
const isLab = currentPath === "/lab";
const isSlotRoute = currentPath === "/slot" || isLab;
const isWitchRoute = currentPath === "/cadi-kazan";
const isBusinessesRoute = currentPath === "/businesses";
const isBlackjackRoute = currentPath === "/blackjack";
const isRouletteRoute = currentPath === "/roulette";
const isAccountRoute = currentPath === "/account";
const isHubRoute = !isSlotRoute && !isWitchRoute && !isBusinessesRoute && !isBlackjackRoute && !isRouletteRoute && !isAccountRoute;

if (isWitchRoute || isHubRoute) {
  await import("./styles.css");
}

if (isWitchRoute) {
  const cadiKazanModule = await import("./cadi-kazan");
  cadiKazanModule.mountCadiKazan(app);
} else if (isBusinessesRoute) {
  const businessesModule = await import("./idle");
  businessesModule.mountBusinesses(app);
} else if (isSlotRoute) {
  const slotModule = await import("./slot");
  slotModule.mountSlot(app, currentPath);
} else if (isBlackjackRoute) {
  const blackjackModule = await import("./blackjack");
  blackjackModule.mountBlackjack(app);

  const retryableBlackjackSessionStatuses = new Set([502, 503, 504]);
  const waitForBlackjackSession = async (): Promise<void> => {
    while (true) {
      try {
        const sessionResponse = await fetch("/api/blackjack/session", {
          credentials: "same-origin",
          cache: "no-store",
        });

        if (sessionResponse.ok) return;

        // The artifact proxy can briefly return a gateway error while the API
        // service is restarting. Retry those transient responses like 503s.
        if (!retryableBlackjackSessionStatuses.has(sessionResponse.status)) {
          throw new Error(
            "BLACKJACK_SESSION_BOOTSTRAP_FAILED:" +
              sessionResponse.status,
          );
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith(
            "BLACKJACK_SESSION_BOOTSTRAP_FAILED:",
          )
        ) {
          throw error;
        }
      }

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 1_000);
      });
    }
  };

  await waitForBlackjackSession();
  blackjackModule.mountConnectedBlackjack(app);
} else if (isRouletteRoute) {
  const rouletteModule = await import("./roulette");
  rouletteModule.mountRoulette(app);
} else if (isAccountRoute) {
  const accountModule = await import("./account");
  accountModule.mountAccount(app);
} else {
  const hubModule = await import("./hub");
  hubModule.mountHub(app);
}
