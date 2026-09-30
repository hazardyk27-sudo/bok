import { describe, expect, it } from "vitest";
import { resolveNextSpeedUpgrade } from "./stadiumPolicy";

describe("independent Speed upgrade policy", () => {
  it("advances exactly one level across the accepted 20-level curve", () => {
    const cases = [
      [1, 2, 2_500, 100_000],
      [2, 3, 3_000, 250_000],
      [3, 4, 3_700, 500_000],
      [4, 5, 4_600, 1_000_000],
      [5, 6, 5_700, 2_000_000],
      [6, 7, 7_000, 4_000_000],
      [7, 8, 8_600, 7_500_000],
      [8, 9, 10_500, 12_500_000],
      [9, 10, 13_000, 20_000_000],
      [10, 11, 16_000, 35_000_000],
      [11, 12, 19_700, 60_000_000],
      [12, 13, 24_300, 100_000_000],
      [13, 14, 29_900, 160_000_000],
      [14, 15, 36_800, 250_000_000],
      [15, 16, 45_300, 400_000_000],
      [16, 17, 55_800, 600_000_000],
      [17, 18, 68_700, 900_000_000],
      [18, 19, 84_600, 1_300_000_000],
      [19, 20, 104_170, 3_000_000_000],
    ] as const;

    for (const [current, target, rate, cost] of cases) {
      const balance = cost + 77_777;
      expect(resolveNextSpeedUpgrade(current, balance)).toEqual({
        targetSpeedLevel: target,
        microTicketsPerSeatPerHour: rate,
        costCents: cost,
        balanceAfterCents: 77_777,
      });
    }
  });

  it("allows exact-balance Speed upgrades", () => {
    expect(resolveNextSpeedUpgrade(1, 100_000)).toEqual({
      targetSpeedLevel: 2,
      microTicketsPerSeatPerHour: 2_500,
      costCents: 100_000,
      balanceAfterCents: 0,
    });
  });

  it("rejects insufficient funds", () => {
    expect(() => resolveNextSpeedUpgrade(1, 99_999))
      .toThrow("INSUFFICIENT_IDLE_CREDITS");
  });

  it("rejects any upgrade beyond Speed Lv20", () => {
    expect(() => resolveNextSpeedUpgrade(20, 9_000_000_000))
      .toThrow("IDLE_SPEED_MAX_LEVEL");
  });

  it("has no Stadium, seat-count, or Storage prerequisite", () => {
    expect(resolveNextSpeedUpgrade.length).toBe(2);
    expect(resolveNextSpeedUpgrade(10, 35_000_000).targetSpeedLevel)
      .toBe(11);
  });
});
