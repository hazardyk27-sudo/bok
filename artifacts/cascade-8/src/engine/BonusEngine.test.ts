import { describe, expect, it } from "vitest";
import { applyCrystalMultiplier, baseFreeSpins, drawSpinMultiplier, retriggerFreeSpins } from "./BonusEngine";

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
  it("uses a 5% base-spin and 20% free-spin trigger threshold", () => {
    expect(drawSpinMultiplier({ nextFloat: () => 0.049 }, "base")).toBeGreaterThan(1);
    expect(drawSpinMultiplier({ nextFloat: () => 0.05 }, "base")).toBe(1);
    expect(drawSpinMultiplier({ nextFloat: () => 0.199 }, "free")).toBeGreaterThan(1);
    expect(drawSpinMultiplier({ nextFloat: () => 0.2 }, "free")).toBe(1);
  });
  it("keeps the multiplier tiers inside the designed range", () => {
    const values = [2, 3, 5, 10, 25];
    let index = 0;
    const multiplier = drawSpinMultiplier({ nextFloat: () => (index++ === 0 ? 0 : 0.999) }, "free");
    expect(values).toContain(multiplier);
  });
});