import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const idleIndexSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);
const idleCssSource = readFileSync(
  fileURLToPath(new URL("./idle.css", import.meta.url)),
  "utf8",
);

describe("Part 25 canonical Businesses shell", () => {
  it("keeps the isolated Businesses route shell and Stadium identity", () => {
    expect(idleIndexSource).toContain(
      'document.documentElement.classList.add(',
    );
    expect(idleIndexSource).toContain(
      '"businesses-route"',
    );
    expect(idleIndexSource).toContain(
      'src="/businesses/stadium.webp"',
    );
    expect(idleIndexSource).toContain(
      "STADIUM OPERATIONS",
    );
  });

  it("shows ticket inventory, production, seats, Storage and live market instead of cash collection", () => {
    for (const marker of [
      "data-idle-ticket-inventory",
      "data-idle-production-rate",
      "data-idle-seats",
      "data-idle-storage-track",
      "data-idle-market-price",
      "data-idle-market-source",
    ]) {
      expect(idleIndexSource).toContain(marker);
    }

    for (const retired of [
      "TÜMÜNÜ TOPLA",
      "TOPLANABİLİR",
      "BİRİKMİŞ GELİR",
      "SAATLİK GELİR",
      "KASA GELİŞTİR",
      "data-business-collect",
      "data-idle-collect-all",
    ]) {
      expect(idleIndexSource).not.toContain(retired);
    }
  });

  it("projects production locally and receives the global market stream", () => {
    expect(idleIndexSource).toContain(
      "projectIdleStadiumLive(",
    );
    expect(idleIndexSource).toContain(
      "subscribeIdleMarket(",
    );
    expect(idleIndexSource).toContain(
      "market.feedStatus",
    );
  });

  it("includes a responsive canonical Stadium presentation without replacing the approved navy shell", () => {
    expect(idleCssSource).toContain(
      "/* 2026-09-30 — Part 25: canonical Stadium ticket-state cutover */",
    );
    expect(idleCssSource).toContain(
      ".stadium-canonical-card",
    );
    expect(idleCssSource).toContain(
      ".stadium-canonical-storage-track",
    );
    expect(idleCssSource).toContain(
      "@media (max-width: 760px)",
    );
    expect(idleCssSource).toContain("#00072d");
  });

  it("connects the Part 26 premium sale, progression and 24h market controls", () => {
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
      "data-idle-details-drawer",
      "data-idle-market-drawer",
      "fetchIdleMarketHistory",
    ]) {
      expect(stadiumPremiumSource).toContain(marker);
    }

    expect(stadiumPremiumCss).toContain(
      ".stadium-premium-actions",
    );
    expect(stadiumPremiumCss).toContain(
      ".stadium-drawer-sheet",
    );
    expect(stadiumPremiumCss).toContain(
      "@media (max-width:760px)",
    );
  });
});
