import { describe, expect, it } from "vitest";
import {
  canAffordBet,
  formatCredits,
  formatTumbleCredits,
  isFreeBetCents,
} from "./GameController";

describe("slot credit presentation", () => {
  it("shows one decimal and compacts million-scale HUD values", () => {
    expect(formatCredits(0)).toBe("$0.0");
    expect(formatCredits(123_456)).toBe("$1,234.6");
    expect(formatCredits(100_000_000)).toBe("$1.0M");
    expect(formatCredits(125_000_000)).toBe("$1.3M");
  });

  it("keeps tumble values expanded while using one decimal", () => {
    expect(formatTumbleCredits(123_456)).toBe("$1,234.6");
    expect(formatTumbleCredits(100_000_000)).toBe("$1,000,000.0");
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