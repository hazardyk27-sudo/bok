import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rouletteRouteSource = readFileSync(
  fileURLToPath(new URL("./roulette/index.ts", import.meta.url)),
  "utf8",
);
const rouletteClientSource = readFileSync(
  fileURLToPath(new URL("./roulette/rouletteClient.ts", import.meta.url)),
  "utf8",
);

describe("roulette route smoke contract", () => {
  it("keeps /roulette routed to the roulette page shell", () => {
    expect(rouletteRouteSource).toContain(
      'const isRouletteRoute = currentPath === "/roulette";',
    );
    expect(rouletteRouteSource).toContain(
      'const rouletteModule = isRouletteRoute ? await import("./rouletteClient") : null;',
    );
    expect(rouletteRouteSource).toContain(
      'app.innerHTML = routeShell(rouletteMarkup, "is-route-page is-roulette-page");',
    );
    expect(rouletteRouteSource).toContain('<main class="roulette-page"');
  });

  it("keeps critical roulette markup anchors", () => {
    const requiredAnchors = [
      "data-connection",
      "data-round",
      "data-phase",
      "data-countdown",
      "data-balance",
      "data-wheel",
      "data-physics-wheel",
      "data-roulette-summary",
      'data-action="undo"',
      'data-action="rebet"',
      'data-action="clear"',
      'data-action="sound"',
      'data-action="menu"',
    ];

    for (const anchor of requiredAnchors) {
      expect(rouletteRouteSource).toContain(anchor);
    }
  });

  it("still mounts RouletteClient only for the roulette route", () => {
    expect(rouletteRouteSource).toContain(
      'const rouletteRoot = document.querySelector<HTMLElement>(".roulette-page");',
    );
    expect(rouletteRouteSource).toContain(
      "if (rouletteRoot) new RouletteClient(rouletteRoot);",
    );
    expect(rouletteClientSource).toContain("export class RouletteClient");
    expect(rouletteClientSource).toContain('const API_BASE = "/api/roulette";');
  });
});
