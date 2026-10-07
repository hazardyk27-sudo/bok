import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildIdleLeaderboard,
  calculateInvestedCapitalCents,
  calculateLegacyStadiumBaselineCents,
} from "./leaderboard";

const leaderboardSource = readFileSync(
  fileURLToPath(new URL("./leaderboard.ts", import.meta.url)),
  "utf8",
);

describe("Idle wealth leaderboard", () => {
  it("keeps the canonical 1,000 free starting seats out of new-player capital", () => {
    expect(calculateInvestedCapitalCents({
      stadiumLevel: 1,
      ownedSeats: 1_000,
      speedLevel: 1,
      storageLevel: 1,
    })).toBe(0);
  });

  it("preserves the first 1,000 seats as paid capital for legacy zero-seat rows", () => {
    expect(calculateInvestedCapitalCents(
      {
        stadiumLevel: 1,
        ownedSeats: 1_000,
        speedLevel: 1,
        storageLevel: 1,
      },
      { freeStartingSeats: 0 },
    )).toBe(300_000);
  });

  it("uses retained Stadium receipts at their exact historical price", () => {
    expect(calculateLegacyStadiumBaselineCents(
      {
        stadiumLevel: 1,
        ownedSeats: 1_000,
        speedLevel: 1,
        storageLevel: 1,
      },
      [
        {
          actionType: "SEAT_PURCHASE",
          purchasedSeats: 500,
          costCents: 100_000,
        },
      ],
    )).toBe(250_000);
  });

  it("reconstructs a one-time canonical baseline from Stadium, seats, Speed and Storage", () => {
    expect(calculateInvestedCapitalCents({
      stadiumLevel: 6,
      ownedSeats: 50_000,
      speedLevel: 2,
      storageLevel: 2,
    })).toBe(86_850_000);
  });

  it("prices the full canonical progression baseline deterministically", () => {
    expect(calculateInvestedCapitalCents({
      stadiumLevel: 10,
      ownedSeats: 500_000,
      speedLevel: 20,
      storageLevel: 20,
    })).toBe(14_049_050_000);
  });

  it("includes only real legacy investment debits and excludes collect credits", () => {
    expect(leaderboardSource).toContain("'BUSINESS_UPGRADE_DEBIT'");
    expect(leaderboardSource).toContain("'VAULT_UPGRADE_DEBIT'");
    expect(leaderboardSource).toContain("SUM(-amount_cents) AS legacy_capital_cents");
    expect(leaderboardSource).toContain("AND amount_cents < 0");
    expect(leaderboardSource).not.toContain("'COLLECT_CREDIT',\n          'BUSINESS_UPGRADE_DEBIT'");
  });

  it("sorts by cash plus durable invested capital", () => {
    const entries = buildIdleLeaderboard([
      {
        username: "cash_only",
        balanceCents: 100_000_000,
        investedCapitalCents: 0,
      },
      {
        username: "investor",
        balanceCents: 20_000_000,
        investedCapitalCents: 86_850_000,
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
