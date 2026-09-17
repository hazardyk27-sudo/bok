import { describe, expect, it } from "vitest";
import {
  BASE_INITIAL_CORE_CHANCE,
  BASE_INITIAL_SCATTER_CHANCE,
  BASE_REFILL_CORE_CHANCE,
  BASE_REFILL_SCATTER_CHANCE,
  BETS_CENTS,
  BONUS_INITIAL_CORE_CHANCE,
  BONUS_INITIAL_SCATTER_CHANCE,
  BONUS_REFILL_CORE_CHANCE,
  BONUS_REFILL_SCATTER_CHANCE,
  getMultiplierCoreVisualTier,
} from "./GameConfig";

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


describe("special-symbol configuration", () => {
  it("uses the requested Scatter chances", () => {
    expect(BASE_INITIAL_SCATTER_CHANCE).toBe(0.035);
    expect(BASE_REFILL_SCATTER_CHANCE).toBe(0.04);
    expect(BONUS_INITIAL_SCATTER_CHANCE).toBe(0.03);
    expect(BONUS_REFILL_SCATTER_CHANCE).toBe(0.035);
  });

  it("uses the requested Core chances", () => {
    expect(BASE_INITIAL_CORE_CHANCE).toBe(0.002);
    expect(BASE_REFILL_CORE_CHANCE).toBe(0.007);
    expect(BONUS_INITIAL_CORE_CHANCE).toBe(0.05);
    expect(BONUS_REFILL_CORE_CHANCE).toBe(0.055);
  });
});