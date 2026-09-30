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

  it("keeps economy mutations disabled until authoritative state renders", () => {
    for (const marker of [
      "data-idle-sell-button disabled",
      'data-idle-sell-ratio="0.25" disabled',
      "data-idle-upgrade-stadium disabled",
      "data-idle-upgrade-speed disabled",
      "data-idle-upgrade-storage disabled",
      "data-idle-buy-seats disabled",
    ]) {
      expect(source).toContain(marker);
    }
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
  });

  it("inherits the approved Businesses visual system instead of a standalone Stadium palette", () => {
    expect(css).toContain("restore the approved Businesses visual system");
    expect(css).toContain("var(--idle-rich-black)");
    expect(css).toContain("var(--idle-surface)");
    expect(css).toContain("var(--idle-shadow-card)");
    expect(css).toContain("var(--idle-accent-bright)");
    expect(css).toContain("var(--idle-accent-secondary) 58%");
    expect(css).toContain("var(--idle-accent)");
    expect(css).toContain("linear-gradient(180deg, #0b1728 0%, #07111f 48%, #050b15 100%)");
  });
  it("re-locks the approved Slate Blue premium palette from the target references", () => {
    expect(css).toContain(
      "restore the approved Slate Blue premium Idle palette",
    );
    expect(css).toContain("--idle-surface-page: #050b17");
    expect(css).toContain("--idle-surface-kpi: #0b1524");
    expect(css).toContain("--idle-surface-detail: #091421");
    expect(css).toContain("--idle-text: #eef4ff");
    expect(css).toContain("--idle-text-muted: #7f8daa");
    expect(css).toContain("--idle-action-primary-start: #6f97ff");
    expect(css).toContain("--idle-action-primary-end: #577fdc");
    expect(css).toContain(
      ".stadium-canonical-balance",
    );
  });


  it("keeps drawer content on a crisp compositing layer above the dim backdrop", () => {
    expect(css).toContain("drawer compositing fix");
    expect(css).toContain("isolation: isolate");
    expect(css).toContain("backdrop-filter: none !important");
    expect(css).toContain("-webkit-backdrop-filter: none !important");
    expect(css).toContain("z-index: 2");
    expect(css).toContain("transform: translateZ(0)");
  });

  it("never exposes a light host canvas around the Businesses workspace", () => {
    expect(css).toContain("full-canvas fix");
    expect(css).toContain("html.businesses-route #app");
    expect(css).toContain("background: #050b17 !important");
    expect(css).toContain("background-color: #050b17 !important");
    expect(css).toContain("min-height: 100dvh");
  });
});
