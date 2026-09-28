import {
  describe,
  expect,
  it,
} from "vitest";
import {
  settleRouletteBets,
} from "./betRules";
import {
  ROULETTE_COLUMN_BETS,
  ROULETTE_DOZEN_BETS,
  ROULETTE_OUTSIDE_BETS,
  ROULETTE_STRAIGHT_BETS,
} from "./betTable";
import {
  runRouletteSeedRegression,
} from "./spinResult";

describe("roulette final integration regression", () => {
  it("keeps the canonical 20-seed physics batch fully settled", () => {
    const summary =
      runRouletteSeedRegression();

    expect(summary.totalSeeds).toBe(20);
    expect(summary.settledSeeds).toBe(20);
    expect(summary.validResultSeeds).toBe(20);
    expect(summary.failedSeeds).toEqual([]);
  });

  it("keeps every visible betting target uniquely addressable", () => {
    const ids = [
      ...ROULETTE_STRAIGHT_BETS,
      ...ROULETTE_COLUMN_BETS,
      ...ROULETTE_DOZEN_BETS,
      ...ROULETTE_OUTSIDE_BETS,
    ].map((bet) => bet.id);

    expect(ids).toHaveLength(49);
    expect(
      new Set(ids).size,
    ).toBe(ids.length);
  });

  it("settles every possible European result without an invalid payout", () => {
    const placements = [
      {
        betId: "straight-0",
        amount: 1 as const,
      },
      {
        betId: "straight-17",
        amount: 5 as const,
      },
      {
        betId: "red",
        amount: 10 as const,
      },
      {
        betId: "black",
        amount: 10 as const,
      },
      {
        betId: "odd",
        amount: 25 as const,
      },
      {
        betId: "even",
        amount: 25 as const,
      },
      {
        betId: "dozen-2",
        amount: 100 as const,
      },
      {
        betId: "column-3",
        amount: 500 as const,
      },
    ];

    for (
      let winningNumber = 0;
      winningNumber <= 36;
      winningNumber += 1
    ) {
      const settlement =
        settleRouletteBets(
          placements,
          winningNumber,
        );

      expect(
        settlement.winningNumber,
      ).toBe(winningNumber);
      expect(
        settlement.totalStake,
      ).toBe(676);
      expect(
        settlement.grossReturn,
      ).toBeGreaterThanOrEqual(0);
      expect(
        Number.isFinite(
          settlement.netProfit,
        ),
      ).toBe(true);
    }
  });
});
