import type {
  RouletteGlobalRoundPlan,
} from "./globalTable";

export const ROULETTE_GLOBAL_TABLE_LOOKAHEAD_MS =
  60_000;
export const ROULETTE_GLOBAL_TABLE_TICK_MS =
  1_000;
export const ROULETTE_GLOBAL_TABLE_RETRY_MS =
  2_000;
export const ROULETTE_GLOBAL_TABLE_MAX_ROUNDS_PER_TICK =
  256;

export type RouletteGlobalMaterialization = {
  rounds: RouletteGlobalRoundPlan[];
  coveredThroughMs: number;
  reachedHorizon: boolean;
};

export function buildRouletteGlobalRoundChain(input: {
  latestRound: RouletteGlobalRoundPlan | null;
  nowMs: number;
  lookaheadMs?: number;
  maxRounds?: number;
  createRound: (
    bettingOpenAtMs: number,
  ) => RouletteGlobalRoundPlan;
}): RouletteGlobalMaterialization {
  const lookaheadMs =
    input.lookaheadMs ??
    ROULETTE_GLOBAL_TABLE_LOOKAHEAD_MS;
  const maxRounds =
    input.maxRounds ??
    ROULETTE_GLOBAL_TABLE_MAX_ROUNDS_PER_TICK;
  const horizonMs =
    input.nowMs +
    lookaheadMs;

  if (
    !Number.isFinite(
      input.nowMs,
    ) ||
    !Number.isFinite(
      lookaheadMs,
    ) ||
    lookaheadMs < 0 ||
    !Number.isSafeInteger(
      maxRounds,
    ) ||
    maxRounds <= 0
  ) {
    throw new Error(
      "INVALID_ROULETTE_GLOBAL_SCHEDULER_INPUT",
    );
  }

  const rounds:
    RouletteGlobalRoundPlan[] =
      [];
  let cursor =
    input.latestRound;

  if (!cursor) {
    cursor =
      input.createRound(
        input.nowMs,
      );
    rounds.push(cursor);
  }

  while (
    cursor.nextRoundAtMs <=
      horizonMs &&
    rounds.length <
      maxRounds
  ) {
    const next =
      input.createRound(
        cursor.nextRoundAtMs,
      );

    if (
      next.bettingOpenAtMs !==
      cursor.nextRoundAtMs
    ) {
      throw new Error(
        "ROULETTE_GLOBAL_ROUND_GAP",
      );
    }

    rounds.push(next);
    cursor = next;
  }

  return {
    rounds,
    coveredThroughMs:
      cursor.nextRoundAtMs,
    reachedHorizon:
      cursor.nextRoundAtMs >
      horizonMs,
  };
}
