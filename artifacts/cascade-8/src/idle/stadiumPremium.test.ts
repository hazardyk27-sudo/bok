import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./stadiumPremium.ts", import.meta.url)),
  "utf8",
);
const css = readFileSync(
  fileURLToPath(new URL("./stadium-premium.css", import.meta.url)),
  "utf8",
);

describe("Part 26 premium Stadium control surface", () => {
  it("binds canonical sell, seat and progression actions", () => {
    for (const marker of [
      "sellIdleStadiumTickets",
      "buyIdleStadiumSeats",
      "upgradeIdleStadiumLevel",
      "upgradeIdleStadiumSpeed",
      "upgradeIdleStadiumStorage",
      'data-idle-sell-ratio="0.25"',
      'data-idle-sell-ratio="0.5"',
      'data-idle-sell-ratio="0.75"',
      'data-idle-sell-ratio="1"',
    ]) {
      expect(source).toContain(marker);
    }
  });

  it("keeps progression and 24h market analytics in drawers", () => {
    expect(source).toContain("data-idle-details-drawer");
    expect(source).toContain("data-idle-market-drawer");
    expect(source).toContain("fetchIdleMarketHistory");
    expect(source).toContain("data-idle-market-chart-path");
  });

  it("ships responsive premium sale and drawer styling", () => {
    expect(css).toContain(".stadium-premium-actions");
    expect(css).toContain(".stadium-drawer-sheet");
    expect(css).toContain("@media (max-width:760px)");
    expect(css).toContain("#19d7a1");
  });
});
