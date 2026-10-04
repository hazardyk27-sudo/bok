export {};

const SESSION_CONVERGENCE_BROWSER_MARKER =
  "oyun-session-convergence-browser-v1";
const BLACKJACK_POST_LIVE_REPAIR_POLL_MS = 250;
const BLACKJACK_POST_LIVE_RECONNECT_DEADLINE_MS = 25_000;

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
      const connection = blackjackModule.mountConnectedBlackjack(app, {
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

      let hasBeenReady = false;
      let reconnectingSinceMs: number | null = null;
      let repairStarted = false;

      const repairPostLiveConnection = (): void => {
        if (repairStarted) return;
        repairStarted = true;
        window.clearInterval(repairPoll);
        connection.close();

        void blackjackModule.repairBlackjackSessionIdentity()
          .then(() => {
            if (
              generation !== bootstrapGeneration ||
              !document.body.contains(app)
            ) {
              return;
            }
            window.location.reload();
          })
          .catch(() => {
            if (
              generation !== bootstrapGeneration ||
              !document.body.contains(app)
            ) {
              return;
            }
            blackjackModule.mountBlackjackConnectionUnavailable(
              app,
              () => {
                void connectBlackjack();
              },
            );
          });
      };

      const repairPoll = window.setInterval(() => {
        if (
          generation !== bootstrapGeneration ||
          !document.body.contains(app)
        ) {
          window.clearInterval(repairPoll);
          return;
        }

        const state = connection.getStatus().state;
        if (state === "READY") {
          hasBeenReady = true;
          reconnectingSinceMs = null;
          return;
        }
        if (!hasBeenReady) return;

        if (state === "ERROR") {
          repairPostLiveConnection();
          return;
        }
        if (state === "RECONNECTING") {
          reconnectingSinceMs ??= Date.now();
          if (
            Date.now() - reconnectingSinceMs >=
            BLACKJACK_POST_LIVE_RECONNECT_DEADLINE_MS
          ) {
            repairPostLiveConnection();
          }
          return;
        }
        reconnectingSinceMs = null;
      }, BLACKJACK_POST_LIVE_REPAIR_POLL_MS);
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
