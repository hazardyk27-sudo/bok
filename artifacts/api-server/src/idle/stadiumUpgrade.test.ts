import { describe, expect, it } from "vitest";
import { resolveNextStadiumUpgrade } from "./stadiumPolicy";

describe("Stadium capacity unlock policy", () => {
  it("advances exactly one level using the accepted unlock cost/capacity curve", () => {
    const cases = [
      [1, 2, 500_000, 5_000],
      [2, 3, 1_500_000, 10_000],
      [3, 4, 5_000_000, 20_000],
      [4, 5, 15_000_000, 35_000],
      [5, 6, 50_000_000, 50_000],
      [6, 7, 150_000_000, 75_000],
      [7, 8, 400_000_000, 100_000],
      [8, 9, 1_000_000_000, 150_000],
      [9, 10, 2_000_000_000, 500_000],
    ] as const;

    for (const [current, target, cost, maxSeats] of cases) {
      const balance = cost + 123_456;
      expect(resolveNextStadiumUpgrade(current, balance)).toEqual({
        targetStadiumLevel: target,
        maxSeats,
        costCents: cost,
        balanceAfterCents: 123_456,
      });
    }
  });

  it("allows an exact-balance unlock", () => {
    expect(resolveNextStadiumUpgrade(1, 500_000)).toEqual({
      targetStadiumLevel: 2,
      maxSeats: 5_000,
      costCents: 500_000,
      balanceAfterCents: 0,
    });
  });

  it("rejects insufficient funds", () => {
    expect(() => resolveNextStadiumUpgrade(1, 499_999))
      .toThrow("INSUFFICIENT_IDLE_CREDITS");
  });

  it("rejects any unlock beyond Stadium Lv10", () => {
    expect(() => resolveNextStadiumUpgrade(10, 9_000_000_000))
      .toThrow("IDLE_STADIUM_MAX_LEVEL");
  });

  it("has no seat-fill prerequisite in the unlock policy", () => {
    expect(resolveNextStadiumUpgrade.length).toBe(2);
    expect(resolveNextStadiumUpgrade(4, 15_000_000).targetStadiumLevel)
      .toBe(5);
  });
});
