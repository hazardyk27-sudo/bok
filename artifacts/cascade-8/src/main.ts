export {};

const { convergeLegacyGameSessions } = await import("./platform/sessionConvergence");
await convergeLegacyGameSessions();

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
  const sessionResponse = await fetch("/api/blackjack/session", {
    credentials: "same-origin",
  });
  if (!sessionResponse.ok) {
    throw new Error("BLACKJACK_SESSION_BOOTSTRAP_FAILED");
  }

  const blackjackModule = await import("./blackjack");
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
