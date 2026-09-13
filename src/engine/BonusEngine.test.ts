import { describe, expect, it } from "vitest";
import { applyCrystalMultiplier, baseFreeSpins, retriggerFreeSpins } from "./BonusEngine";

describe("bonus rules", () => {
  it("awards the base free spin table", () => {
    expect(baseFreeSpins(4)).toBe(10);
    expect(baseFreeSpins(5)).toBe(12);
    expect(baseFreeSpins(6)).toBe(15);
  });
  it("awards retriggers", () => {
    expect(retriggerFreeSpins(3)).toBe(5);
    expect(retriggerFreeSpins(4)).toBe(8);
    expect(retriggerFreeSpins(6)).toBe(15);
  });
  it("adds crystal values instead of multiplying them", () => {
    expect(applyCrystalMultiplier(7.8, [3, 5])).toBe(62.4);
  });
  it("keeps the crystal total local to one tumble", () => {
    expect(applyCrystalMultiplier(4.5, [3, 10])).toBe(58.5);
  });
  it("leaves a tumble unchanged when no crystals appear", () => {
    expect(applyCrystalMultiplier(4.5, [])).toBe(4.5);
  });
});