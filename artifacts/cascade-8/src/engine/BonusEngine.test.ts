import { describe, expect, it } from "vitest";
import { baseFreeSpins, drawMultiplierCore, retriggerFreeSpins } from "./BonusEngine";

describe("bonus rules", () => {
  it("awards the base free spin table", () => {
    expect(baseFreeSpins(4)).toBe(10);
    expect(baseFreeSpins(5)).toBe(12);
    expect(baseFreeSpins(6)).toBe(15);
  });
  it("awards retriggers", () => {
    expect(retriggerFreeSpins(3)).toBe(5);
    expect(retriggerFreeSpins(4)).toBe(5);
    expect(retriggerFreeSpins(6)).toBe(5);
  });
  it("spawns a physical Core at the designed 7% threshold", () => {
    expect(drawMultiplierCore({ nextFloat: () => 0 })).toEqual({ kind: "MULTIPLIER_CORE", value: 2 });
    expect(drawMultiplierCore({ nextFloat: () => 0.07 })).toBeNull();
  });
  it("supports the complete 2x–1000x Core range", () => {
    let index = 0;
    expect(drawMultiplierCore({ nextFloat: () => index++ === 0 ? 0 : 0.999999 })).toEqual({ kind: "MULTIPLIER_CORE", value: 1000 });
  });
});