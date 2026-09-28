import { describe, expect, it } from "vitest";
import {
  createRouletteAuthoritativeRound,
  parseRouletteServerBets,
} from "./round";

describe("roulette authoritative round", () => {
  it("validates the exposed chip denominations and bet ids", () => {
    expect(
      parseRouletteServerBets([
        { betId: "straight-17", amount: 10 },
        { betId: "red", amount: 25 },
      ]),
    ).toEqual([
      { betId: "straight-17", amount: 10 },
      { betId: "red", amount: 25 },
    ]);

    expect(() =>
      parseRouletteServerBets([{ betId: "straight-17", amount: 3 }]),
    ).toThrow("INVALID_ROULETTE_CHIP");

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
