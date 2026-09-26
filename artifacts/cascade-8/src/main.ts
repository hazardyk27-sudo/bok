export {};

const app = document.querySelector<HTMLDivElement>("#app")!;
const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
const isLab = currentPath === "/lab";
const isSlotRoute = currentPath === "/slot" || isLab;
const isRouletteRoute = currentPath === "/roulette";
const isWitchRoute = currentPath === "/cadi-kazan";
const isBusinessesRoute = currentPath === "/businesses";
const isHubRoute = !isSlotRoute && !isRouletteRoute && !isWitchRoute && !isBusinessesRoute;

if (isRouletteRoute || isWitchRoute || isHubRoute) {
  await import("./styles.css");
}

if (isRouletteRoute) {
  const rouletteModule = await import("./roulette");
  rouletteModule.mountRoulette(app);
} else if (isWitchRoute) {
  const cadiKazanModule = await import("./cadi-kazan");
  cadiKazanModule.mountCadiKazan(app);
} else if (isBusinessesRoute) {
  const businessesModule = await import("./idle");
  businessesModule.mountBusinesses(app);
} else if (isSlotRoute) {
  const slotModule = await import("./slot");
  slotModule.mountSlot(app, currentPath);
} else {
  const hubModule = await import("./hub");
  hubModule.mountHub(app);
}
