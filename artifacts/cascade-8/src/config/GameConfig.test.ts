import { describe, expect, it } from "vitest";
import { BETS_CENTS, getMultiplierCoreVisualTier } from "./GameConfig";

describe("bet configuration", () => {
  it("allows progressive bets up to $1,000,000", () => {
    expect(BETS_CENTS.at(-1)).toBe(100_000_000);
    expect(BETS_CENTS.slice(-7)).toEqual([
      1_000_000, 2_000_000, 5_000_000, 10_000_000, 20_000_000,
      50_000_000, 100_000_000,
    ]);
  });

  it("keeps multiplier values in one minimal visual family", () => {
    expect([2, 3, 5].map(getMultiplierCoreVisualTier)).toEqual(["low", "low", "low"]);
    expect([10, 25, 50].map(getMultiplierCoreVisualTier)).toEqual(["mid", "mid", "mid"]);
    expect([100, 250, 500, 1000].map(getMultiplierCoreVisualTier)).toEqual(["high", "high", "high", "high"]);
  });
});