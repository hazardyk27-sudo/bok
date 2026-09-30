import { describe, expect, it } from "vitest";
import { resolveNextStorageUpgrade } from "./stadiumPolicy";

describe("independent Storage upgrade policy", () => {
  it("advances exactly one level across the accepted 20-level capacity curve", () => {
    const cases = [
      [1, 2, 50, 50_000],
      [2, 3, 100, 100_000],
      [3, 4, 200, 200_000],
      [4, 5, 400, 400_000],
      [5, 6, 750, 750_000],
      [6, 7, 1_250, 1_500_000],
      [7, 8, 2_000, 3_000_000],
      [8, 9, 3_500, 6_000_000],
      [9, 10, 6_000, 10_000_000],
      [10, 11, 10_000, 17_500_000],
      [11, 12, 17_000, 30_000_000],
      [12, 13, 28_000, 50_000_000],
      [13, 14, 45_000, 80_000_000],
      [14, 15, 70_000, 120_000_000],
      [15, 16, 105_000, 180_000_000],
      [16, 17, 155_000, 260_000_000],
      [17, 18, 230_000, 380_000_000],
      [18, 19, 340_000, 520_000_000],
      [19, 20, 500_000, 1_000_000_000],
    ] as const;

    for (const [current, target, capacity, cost] of cases) {
      const balance = cost + 66_666;
      expect(resolveNextStorageUpgrade(current, balance)).toEqual({
        targetStorageLevel: target,
        capacityTickets: capacity,
        costCents: cost,
        balanceAfterCents: 66_666,
      });
    }
  });

  it("allows exact-balance Storage upgrades", () => {
    expect(resolveNextStorageUpgrade(1, 50_000)).toEqual({
      targetStorageLevel: 2,
      capacityTickets: 50,
      costCents: 50_000,
      balanceAfterCents: 0,
    });
  });

  it("rejects insufficient funds", () => {
    expect(() => resolveNextStorageUpgrade(1, 49_999))
      .toThrow("INSUFFICIENT_IDLE_CREDITS");
  });

  it("rejects any upgrade beyond Storage Lv20", () => {
    expect(() => resolveNextStorageUpgrade(20, 9_000_000_000))
      .toThrow("IDLE_STORAGE_MAX_LEVEL");
  });

  it("has no Stadium, seat-count, or Speed prerequisite", () => {
    expect(resolveNextStorageUpgrade.length).toBe(2);
    expect(
      resolveNextStorageUpgrade(10, 17_500_000).targetStorageLevel,
    ).toBe(11);
  });
});
