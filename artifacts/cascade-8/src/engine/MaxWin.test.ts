import { describe, expect, it } from "vitest";
import { playSpin } from "./SlotEngine";
import { SeededRNG } from "./RNG";

describe("max win guard", () => {
  it("never exceeds the 10000x originating-spin cap", () => {
    for (let seed = 0; seed < 1000; seed += 1) {
      const result = playSpin(100, new SeededRNG(seed));
      expect(result.totalMultiplier).toBeLessThanOrEqual(10000);
      expect(Number.isFinite(result.totalWinCents)).toBe(true);
    }
  });
});