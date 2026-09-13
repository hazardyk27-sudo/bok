import { describe, expect, it } from "vitest";
import { SeededRNG } from "./RNG";
import { playSpin } from "./SlotEngine";

describe("spin accounting", () => {
  it("keeps outcomes bet-invariant", () => {
    const one = playSpin(100, new SeededRNG("bet"));
    const two = playSpin(1000, new SeededRNG("bet"));
    expect(two.totalMultiplier).toBe(one.totalMultiplier);
    expect(two.totalWinCents).toBe(one.totalWinCents * 10);
  });
  it("keeps wins finite and non-negative", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const result = playSpin(500, new SeededRNG(seed));
      expect(result.totalWinCents).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.totalWinCents)).toBe(true);
    }
  });
  it("stops originating-spin math at the 5000x cap", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      expect(playSpin(100, new SeededRNG(seed)).totalMultiplier).toBeLessThanOrEqual(5000);
    }
  });
});