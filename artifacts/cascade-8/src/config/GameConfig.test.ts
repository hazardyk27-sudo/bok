import { describe, expect, it } from "vitest";
import { BETS_CENTS, getMultiplierCoreVisualTier } from "./GameConfig";

describe("bet configuration", () => {
  it("allows bets up to $500", () => {
    expect(BETS_CENTS.at(-1)).toBe(1_000_000);
  });

  it("keeps multiplier values in one minimal visual family", () => {
    expect([2, 3, 5].map(getMultiplierCoreVisualTier)).toEqual(["low", "low", "low"]);
    expect([10, 25, 50].map(getMultiplierCoreVisualTier)).toEqual(["mid", "mid", "mid"]);
    expect([100, 250, 500, 1000].map(getMultiplierCoreVisualTier)).toEqual(["high", "high", "high", "high"]);
  });
});