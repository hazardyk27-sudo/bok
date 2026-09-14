import { describe, expect, it } from "vitest";
import { baseFreeSpins, drawMultiplierCore, retriggerFreeSpins } from "./BonusEngine";
import { BASE_MULTIPLIER_CORE_WEIGHTS, BONUS_CONFIG } from "../config/GameConfig";

describe("bonus rules", () => {
  it("awards the base free spin table", () => {
    expect(baseFreeSpins(4)).toBe(10);
    expect(baseFreeSpins(5)).toBe(15);
    expect(baseFreeSpins(6)).toBe(20);
  });
  it("awards retriggers", () => {
    expect(retriggerFreeSpins(3)).toBe(5);
    expect(retriggerFreeSpins(4)).toBe(5);
    expect(retriggerFreeSpins(5)).toBe(5);
    expect(retriggerFreeSpins(6)).toBe(5);
  });
  it("spawns a physical Core at the designed 8% threshold", () => {
    expect(drawMultiplierCore({ nextFloat: () => 0 })).toEqual({ kind: "MULTIPLIER_CORE", value: 2 });
    expect(drawMultiplierCore({ nextFloat: () => 0.08 })).toBeNull();
  });
  it("supports the complete 2x–1000x Core range", () => {
    let index = 0;
    expect(drawMultiplierCore({ nextFloat: () => index++ === 0 ? 0 : 0.999999 })).toEqual({ kind: "MULTIPLIER_CORE", value: 1000 });
  });
  it("keeps the requested normal and Free Spin Core distributions separate", () => {
    expect(BASE_MULTIPLIER_CORE_WEIGHTS).toEqual([
      { value: 2, weight: 52 }, { value: 3, weight: 26 }, { value: 5, weight: 12 },
      { value: 10, weight: 5 }, { value: 15, weight: 2 }, { value: 20, weight: 1.2 },
      { value: 25, weight: 0.8 }, { value: 50, weight: 0.5 }, { value: 100, weight: 0.3 },
      { value: 250, weight: 0.12 }, { value: 500, weight: 0.05 }, { value: 1000, weight: 0.03 },
    ]);
    expect(BONUS_CONFIG.multiplierCoreWeights).toEqual([
      { value: 2, weight: 40 }, { value: 3, weight: 25 }, { value: 5, weight: 15 },
      { value: 10, weight: 8 }, { value: 15, weight: 4 }, { value: 20, weight: 3 },
      { value: 25, weight: 2 }, { value: 50, weight: 1.5 }, { value: 100, weight: 1 },
      { value: 250, weight: 0.3 }, { value: 500, weight: 0.15 }, { value: 1000, weight: 0.05 },
    ]);
    expect(BASE_MULTIPLIER_CORE_WEIGHTS.reduce((sum, choice) => sum + choice.weight, 0)).toBeCloseTo(100);
    expect(BONUS_CONFIG.multiplierCoreWeights.reduce((sum, choice) => sum + choice.weight, 0)).toBeCloseTo(100);
  });
});