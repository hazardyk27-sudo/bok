import { describe, expect, it } from "vitest";
import {
  BLACKJACK_BASE_CHIP_DENOMINATIONS,
  BLACKJACK_HIGH_CHIP_BASE_CREDITS,
  doubleBlackjackChipCredits,
  formatBlackjackChipCredits,
  getBlackjackHighChipCredits,
  renderBlackjackBettingPanel,
} from "./bettingView";

describe("blackjack premium chip and betting UI foundation", () => {
  it("keeps the approved base tray exact", () => {
    expect(BLACKJACK_BASE_CHIP_DENOMINATIONS).toEqual([
      10,
      25,
      50,
      100,
      250,
      500,
      1_000,
    ]);
    expect(BLACKJACK_HIGH_CHIP_BASE_CREDITS).toBe(1_000);
  });

  it("continues above 1K by exact powers of two without a visual hard cap", () => {
    expect(getBlackjackHighChipCredits(0)).toBe(1_000);
    expect(getBlackjackHighChipCredits(1)).toBe(2_000);
    expect(getBlackjackHighChipCredits(2)).toBe(4_000);
    expect(getBlackjackHighChipCredits(6)).toBe(64_000);
    expect(getBlackjackHighChipCredits(10)).toBe(1_024_000);
    expect(getBlackjackHighChipCredits(12)).toBe(4_096_000);
  });

  it("formats large denominations compactly while preserving exact values", () => {
    expect(formatBlackjackChipCredits(10)).toBe("10");
    expect(formatBlackjackChipCredits(1_000)).toBe("1K");
    expect(formatBlackjackChipCredits(64_000)).toBe("64K");
    expect(formatBlackjackChipCredits(1_000_000)).toBe("1M");
    expect(formatBlackjackChipCredits(4_096_000)).toBe("4.096M");
  });

  it("rejects invalid or unsafe denomination arithmetic", () => {
    expect(() => doubleBlackjackChipCredits(500)).toThrow(/starts at 1K/);
    expect(() => getBlackjackHighChipCredits(-1)).toThrow(/non-negative/);
    expect(() =>
      doubleBlackjackChipCredits(Number.MAX_SAFE_INTEGER),
    ).toThrow(/safe integer range/);
  });

  it("rejects selected values outside the base tray or 1K ×2 chain", () => {
    expect(() =>
      renderBlackjackBettingPanel({
        selectedChipCredits: 3_000,
        totalBetLabel: "0",
        readyLabel: "READY",
        bettingClosesLabel: "WAITING",
      }),
    ).toThrow(/approved denomination/);
  });

  it("escapes dynamic betting labels", () => {
    const markup = renderBlackjackBettingPanel({
      selectedChipCredits: 100,
      totalBetLabel: "<8K>",
      readyLabel: 'READY "NOW"',
      bettingClosesLabel: "08 & GO",
    });

    expect(markup).toContain("&lt;8K&gt;");
    expect(markup).toContain("READY &quot;NOW&quot;");
    expect(markup).toContain("08 &amp; GO");
  });

  it("renders every base chip and the high-value ×2 control", () => {
    const markup = renderBlackjackBettingPanel({
      selectedChipCredits: 1_000,
      totalBetLabel: "8K",
      readyLabel: "READY",
      bettingClosesLabel: "08",
    });

    for (const credits of BLACKJACK_BASE_CHIP_DENOMINATIONS) {
      expect(markup).toContain(`data-blackjack-chip="${credits}"`);
    }

    expect(markup).toContain('data-blackjack-selected-chip="1000"');
    expect(markup).toContain('data-blackjack-chip-scale="DOUBLE"');
    expect(markup).toContain(">×2<");
    expect(markup).toContain('data-blackjack-bet-action="CLEAR"');
    expect(markup).toContain('data-blackjack-bet-action="READY"');
  });

  it("classifies very large selected chips into premium tiers", () => {
    const markup = renderBlackjackBettingPanel({
      selectedChipCredits: 4_096_000,
      totalBetLabel: "4.096M",
      readyLabel: "READY",
      bettingClosesLabel: "05",
    });

    expect(markup).toContain('data-blackjack-selected-chip="4096000"');
    expect(markup).toContain("4.096M");
    expect(markup).toContain('data-chip-tier="ultra"');
  });
});
