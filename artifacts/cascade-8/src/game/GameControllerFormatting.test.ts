import { describe, expect, it } from "vitest";
import {
  canAffordBet,
  formatCredits,
  formatTumbleCredits,
  formatWinDetailCredits,
  isFreeBetCents,
} from "./GameController";

describe("slot credit presentation", () => {
  it("shows cents below $10,000 and whole expanded amounts at or above the threshold", () => {
    expect(formatCredits(0)).toBe("$0.00");
    expect(formatCredits(155)).toBe("$1.55");
    expect(formatCredits(999_999)).toBe("$9,999.99");
    expect(formatCredits(1_000_000)).toBe("$10,000");
    expect(formatCredits(1_000_001)).toBe("$10,000");
    expect(formatCredits(100_000_000)).toBe("$1,000,000");
  });

  it("keeps tumble values expanded and shows two decimals", () => {
    expect(formatTumbleCredits(123_456)).toBe("$1,234.56");
    expect(formatTumbleCredits(100_000_000)).toBe("$1,000,000.00");
  });

  it("shows two decimals for Free Spin calculation details", () => {
    expect(formatWinDetailCredits(0)).toBe("$0.00");
    expect(formatWinDetailCredits(12_345)).toBe("$123.45");
    expect(formatWinDetailCredits(100_000_000)).toBe("$1,000,000.00");
  });
});

describe("$1 free bet", () => {
  it("allows a $1 bet at zero balance without making other bets free", () => {
    expect(isFreeBetCents(100)).toBe(true);
    expect(canAffordBet(0, 100)).toBe(true);
    expect(isFreeBetCents(200)).toBe(false);
    expect(canAffordBet(0, 200)).toBe(false);
    expect(canAffordBet(200, 200)).toBe(true);
  });
});