import {
  ROULETTE_CHIP_VALUES,
  type RouletteBetPlacement,
  type RouletteChipValue,
} from "../../../cascade-8/src/roulette/betState";
import {
  getRouletteBetRule,
  settleRouletteBets,
  type RouletteRoundSettlement,
} from "../../../cascade-8/src/roulette/betRules";
import {
  simulateSeededRouletteSpin,
  type RouletteWinningResult,
} from "../../../cascade-8/src/roulette/spinResult";

export type RouletteServerBet = RouletteBetPlacement;

export type RouletteAuthoritativeRound = {
  seed: string;
  result: RouletteWinningResult;
  settlement: RouletteRoundSettlement;
  stakeCents: number;
  payoutCents: number;
};

const MAX_PLACEMENTS = 500;

function isRouletteChipValue(value: number): value is RouletteChipValue {
  return (ROULETTE_CHIP_VALUES as readonly number[]).includes(value);
}

export function parseRouletteServerBets(value: unknown): RouletteServerBet[] {
  if (!Array.isArray(value)) throw new Error("INVALID_ROULETTE_BETS");
  if (value.length > MAX_PLACEMENTS) throw new Error("ROULETTE_TOO_MANY_BETS");

  return value.map((candidate) => {
    if (typeof candidate !== "object" || candidate === null) {
      throw new Error("INVALID_ROULETTE_BET");
    }

    const betId =
      "betId" in candidate && typeof candidate.betId === "string"
        ? candidate.betId
        : "";
    const amount =
      "amount" in candidate && typeof candidate.amount === "number"
        ? candidate.amount
        : Number.NaN;

    if (!getRouletteBetRule(betId)) throw new Error("INVALID_ROULETTE_BET_ID");
    if (!Number.isSafeInteger(amount) || !isRouletteChipValue(amount)) {
      throw new Error("INVALID_ROULETTE_CHIP");
    }

    return { betId, amount };
  });
}

export function createRouletteAuthoritativeRound(
  seed: string,
  bets: readonly RouletteServerBet[],
): RouletteAuthoritativeRound {
  if (!seed.trim()) throw new Error("INVALID_ROULETTE_SEED");

  const simulation = simulateSeededRouletteSpin(seed);
  if (!simulation.result) throw new Error("ROULETTE_SIMULATION_UNSETTLED");

  const settlement = settleRouletteBets(bets, simulation.result.number);
  const stakeCents = settlement.totalStake * 100;
  const payoutCents = settlement.grossReturn * 100;

  if (
    !Number.isSafeInteger(stakeCents) ||
    !Number.isSafeInteger(payoutCents) ||
    stakeCents < 0 ||
    payoutCents < 0
  ) {
    throw new Error("ROULETTE_SETTLEMENT_OVERFLOW");
  }

  return {
    seed,
    result: simulation.result,
    settlement,
    stakeCents,
    payoutCents,
  };
}
