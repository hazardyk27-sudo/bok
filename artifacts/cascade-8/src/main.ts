const app = document.querySelector<HTMLDivElement>("#app")!;
const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
const isLab = currentPath === "/lab";
const isSlotRoute = currentPath === "/slot" || isLab;
const isRouletteRoute = currentPath === "/roulette";
const isWitchRoute = currentPath === "/cadi-kazan";
const isBusinessesRoute = currentPath === "/businesses";
const isHubRoute = !isSlotRoute && !isRouletteRoute && !isWitchRoute && !isBusinessesRoute;

if (isBusinessesRoute) {
  document.documentElement.classList.add("businesses-route");
  document.body.classList.add("businesses-route");
}

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
  app.innerHTML = `
    <div class="app-shell route-shell is-route-page is-businesses-page">
      ${businessesModule.BUSINESSES_MARKUP}
    </div>
  `;
  const businessesRoot = app.querySelector<HTMLElement>(".businesses-page");
  if (businessesRoot) new businessesModule.BusinessesClient(businessesRoot);
} else if (isSlotRoute) {
  const slotModule = await import("./slot");
  slotModule.mountSlot(app, currentPath);
} else {
  const hubModule = await import("./hub");
  hubModule.mountHub(app);
}
