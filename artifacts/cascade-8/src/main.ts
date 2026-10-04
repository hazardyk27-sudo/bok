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
  let bootstrapGeneration = 0;

  const connectBlackjack = async (): Promise<void> => {
    const generation = ++bootstrapGeneration;
    blackjackModule.mountBlackjack(app);

    try {
      const session = await blackjackModule.waitForBlackjackSession();
      if (
        generation !== bootstrapGeneration ||
        !document.body.contains(app)
      ) {
        return;
      }
      blackjackModule.mountConnectedBlackjack(app, {
        createSocket: (url) => {
          if (session.realtimeAccessToken === null) {
            return new WebSocket(url);
          }
          const websocketUrl = new URL(url);
          websocketUrl.searchParams.set(
            "access",
            session.realtimeAccessToken,
          );
          return new WebSocket(websocketUrl.toString());
        },
      });
    } catch {
      if (
        generation !== bootstrapGeneration ||
        !document.body.contains(app)
      ) {
        return;
      }
      blackjackModule.mountBlackjackSessionUnavailable(
        app,
        () => {
          void connectBlackjack();
        },
      );
    }
  };

  void connectBlackjack();
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
