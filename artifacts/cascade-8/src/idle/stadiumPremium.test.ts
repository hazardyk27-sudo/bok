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
    expect(source).toContain("mergeLiveHistory");
    expect(source).toContain("maxVisualPoints = 720");
    expect(source).toContain("marketDrawer.hidden");
    expect(source).toContain("data-idle-market-detail-tick");
  });

  it("hardens whole-number inputs and retry idempotency", () => {
    expect(source).toContain("positiveWholeNumber");
    expect(source).toContain("pendingMutationKeys");
    expect(source).toContain("unresolvedMutation");
    expect(source).toContain("isMutationAllowed");
    expect(source).toContain("IdleRequestError");
    expect(source).toContain("outcomeUnknown");
    expect(source).toContain("aynı işlem anahtarı korunuyor");
    expect(source).not.toContain("Number.parseInt");
  });

  it("shows canonical seat pricing and full progression detail", () => {
    expect(source).toContain("quoteSeatPurchase");
    expect(source).toContain("getNextSeatPriceChange");
    expect(source).toContain("data-idle-seat-estimate");
    expect(source).toContain("data-idle-seat-unit-price");
    expect(source).toContain("data-idle-seat-next-band");
    expect(source).toContain("exactMoney");
    expect(source).toContain("sonraki kapasite");
    expect(source).toContain("bilet/koltuk/saat");
  });

  it("ships responsive premium sale and drawer styling", () => {
    expect(css).toContain(".stadium-premium-actions");
    expect(css).toContain(".stadium-drawer-sheet");
    expect(css).toContain("@media (max-width:760px)");
    expect(css).toContain("#19d7a1");
  });
});
