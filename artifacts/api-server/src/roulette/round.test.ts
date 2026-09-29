import { describe, expect, it } from "vitest";
import {
  createRouletteAuthoritativeRound,
  parseRouletteServerBets,
} from "./round";
import {
  ROULETTE_REGRESSION_SEEDS,
} from "../../../cascade-8/src/roulette/spinResult";

describe("roulette authoritative round", () => {
  it("accepts aggregate positive bet amounts and validates bet ids", () => {
    expect(
      parseRouletteServerBets([
        { betId: "straight-17", amount: 640 },
        { betId: "red", amount: 25 },
      ]),
    ).toEqual([
      { betId: "straight-17", amount: 640 },
      { betId: "red", amount: 25 },
    ]);

    expect(() =>
      parseRouletteServerBets([{ betId: "straight-17", amount: 0 }]),
    ).toThrow("INVALID_ROULETTE_BET_AMOUNT");

    expect(() =>
      parseRouletteServerBets([{ betId: "straight-17", amount: -5 }]),
    ).toThrow("INVALID_ROULETTE_BET_AMOUNT");

    expect(() =>
      parseRouletteServerBets([{ betId: "straight-17", amount: 2.5 }]),
    ).toThrow("INVALID_ROULETTE_BET_AMOUNT");

    expect(() =>
      parseRouletteServerBets([{ betId: "split-1-2", amount: 10 }]),
    ).toThrow("INVALID_ROULETTE_BET_ID");
  });

  it("derives the result only from the server seed and converts wager units to cents", () => {
    const bets = parseRouletteServerBets([
      { betId: "red", amount: 5 },
      { betId: "odd", amount: 10 },
    ]);

    const first = createRouletteAuthoritativeRound(
      "roulette-wallet-part27",
      bets,
    );
    const second = createRouletteAuthoritativeRound(
      "roulette-wallet-part27",
      bets,
    );

    expect(first.result).toEqual(second.result);
    expect(first.settlement).toEqual(second.settlement);
    expect(first.stakeCents).toBe(1500);
  });

  it("keeps all canonical regression seeds server-settleable", () => {
    for (const seed of ROULETTE_REGRESSION_SEEDS) {
      const round =
        createRouletteAuthoritativeRound(
          String(seed),
          [
            {
              betId: "red",
              amount: 10,
            },
          ],
        );

      expect(
        round.result.number,
      ).toBeGreaterThanOrEqual(0);
      expect(
        round.result.number,
      ).toBeLessThanOrEqual(36);
      expect(
        round.result.pocketIndex,
      ).toBeGreaterThanOrEqual(0);
      expect(
        round.result.pocketIndex,
      ).toBeLessThan(37);
      expect(
        round.stakeCents,
      ).toBe(1000);
      expect(
        round.payoutCents,
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it("supports a zero-bet physical spin without fabricating payout", () => {
    const round = createRouletteAuthoritativeRound(
      "roulette-wallet-zero-bet",
      [],
    );

    expect(round.stakeCents).toBe(0);
    expect(round.payoutCents).toBe(0);
    expect(round.settlement.totalStake).toBe(0);
  });
});
