import { describe, expect, it } from "vitest";
import {
  buildIdleLeaderboard,
  calculateInvestedCapitalCents,
} from "./leaderboard";

describe("Idle wealth leaderboard", () => {
  it("keeps the canonical free starting assets out of invested capital", () => {
    expect(calculateInvestedCapitalCents({
      stadiumLevel: 1,
      ownedSeats: 1_000,
      speedLevel: 1,
      storageLevel: 1,
    })).toBe(0);
  });

  it("reconstructs capital from Stadium, seats, Speed and Storage", () => {
    expect(calculateInvestedCapitalCents({
      stadiumLevel: 6,
      ownedSeats: 50_000,
      speedLevel: 2,
      storageLevel: 2,
    })).toBe(86_850_000);
  });

  it("prices the full current progression without relying on expiring receipts", () => {
    expect(calculateInvestedCapitalCents({
      stadiumLevel: 10,
      ownedSeats: 500_000,
      speedLevel: 20,
      storageLevel: 20,
    })).toBe(14_049_050_000);
  });

  it("sorts by total wealth and assigns stable one-based ranks", () => {
    const entries = buildIdleLeaderboard([
      {
        username: "cash_only",
        balanceCents: 100_000_000,
        stadiumLevel: null,
        ownedSeats: null,
        speedLevel: null,
        storageLevel: null,
      },
      {
        username: "investor",
        balanceCents: 20_000_000,
        stadiumLevel: 6,
        ownedSeats: 50_000,
        speedLevel: 2,
        storageLevel: 2,
      },
    ]);

    expect(entries).toEqual([
      {
        rank: 1,
        username: "investor",
        cashCents: 20_000_000,
        capitalCents: 86_850_000,
        totalWealthCents: 106_850_000,
      },
      {
        rank: 2,
        username: "cash_only",
        cashCents: 100_000_000,
        capitalCents: 0,
        totalWealthCents: 100_000_000,
      },
    ]);
  });
});
