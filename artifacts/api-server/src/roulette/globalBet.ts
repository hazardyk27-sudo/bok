import {
  settleRouletteBets,
  type RouletteRoundSettlement,
} from "../../../cascade-8/src/roulette/betRules";
import type {
  RouletteServerBet,
} from "./round";

export type RouletteGlobalBetWindow = {
  bettingOpenAtMs: number;
  bettingCloseAtMs: number;
};

export type RouletteGlobalBetSettlement = {
  settlement: RouletteRoundSettlement;
  payoutCents: number;
};

export function getRouletteGlobalStakeCents(
  bets: readonly RouletteServerBet[],
) {
  const stakeUnits =
    bets.reduce(
      (sum, bet) =>
        sum + bet.amount,
      0,
    );
  const stakeCents =
    stakeUnits * 100;

  if (
    !Number.isSafeInteger(
      stakeCents,
    ) ||
    stakeCents < 0
  ) {
    throw new Error(
      "ROULETTE_GLOBAL_STAKE_OVERFLOW",
    );
  }

  return stakeCents;
}

export function assertRouletteGlobalBettingOpen(
  round: RouletteGlobalBetWindow,
  nowMs: number,
) {
  if (
    !Number.isFinite(nowMs)
  ) {
    throw new Error(
      "INVALID_ROULETTE_GLOBAL_SERVER_TIME",
    );
  }

  if (
    nowMs <
    round.bettingOpenAtMs
  ) {
    throw new Error(
      "ROULETTE_GLOBAL_BETTING_NOT_OPEN",
    );
  }

  if (
    nowMs >=
    round.bettingCloseAtMs
  ) {
    throw new Error(
      "ROULETTE_GLOBAL_BETTING_CLOSED",
    );
  }
}

export function settleRouletteGlobalBet(
  bets: readonly RouletteServerBet[],
  winningNumber: number,
): RouletteGlobalBetSettlement {
  const settlement =
    settleRouletteBets(
      bets,
      winningNumber,
    );
  const payoutCents =
    settlement.grossReturn *
    100;

  if (
    !Number.isSafeInteger(
      payoutCents,
    ) ||
    payoutCents < 0
  ) {
    throw new Error(
      "ROULETTE_GLOBAL_PAYOUT_OVERFLOW",
    );
  }

  return {
    settlement,
    payoutCents,
  };
}
