import {
  ROULETTE_BETTING_WINDOW_MS,
  ROULETTE_BET_VERIFICATION_MS,
  ROULETTE_RESULT_HOLD_MS,
} from "../../../cascade-8/src/roulette/scenePhase";
import {
  ROULETTE_SIMULATION_VERSION,
  simulateSeededRouletteSpin,
  type RouletteWinningResult,
} from "../../../cascade-8/src/roulette/spinResult";

export type RouletteGlobalRoundPhase =
  | "scheduled"
  | "betting"
  | "verifying"
  | "spinning"
  | "result"
  | "complete";

export type RouletteGlobalRoundPlan = {
  roundId: string;
  simulationVersion: string;
  seed: string;
  result: RouletteWinningResult;
  bettingOpenAtMs: number;
  bettingCloseAtMs: number;
  spinStartedAtMs: number;
  resultAtMs: number;
  nextRoundAtMs: number;
};

export type RouletteGlobalRoundSnapshot = {
  roundId: string;
  simulationVersion: string;
  phase: RouletteGlobalRoundPhase;
  serverTimeMs: number;
  bettingOpenAtMs: number;
  bettingCloseAtMs: number;
  spinStartedAtMs: number;
  resultAtMs: number;
  nextRoundAtMs: number;
  seed: string | null;
  result: RouletteWinningResult | null;
};

function assertFiniteTimestamp(
  value: number,
  label: string,
) {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `INVALID_ROULETTE_GLOBAL_${label}`,
    );
  }
}

export function createRouletteGlobalRoundPlan(input: {
  roundId: string;
  seed: string;
  bettingOpenAtMs: number;
}): RouletteGlobalRoundPlan {
  if (!input.roundId.trim()) {
    throw new Error(
      "INVALID_ROULETTE_GLOBAL_ROUND_ID",
    );
  }
  if (!input.seed.trim()) {
    throw new Error(
      "INVALID_ROULETTE_GLOBAL_SEED",
    );
  }

  assertFiniteTimestamp(
    input.bettingOpenAtMs,
    "BETTING_OPEN_AT",
  );

  const simulation =
    simulateSeededRouletteSpin(
      input.seed,
    );

  if (!simulation.result) {
    throw new Error(
      "ROULETTE_GLOBAL_SIMULATION_UNSETTLED",
    );
  }

  const spinDurationMs =
    Math.ceil(
      simulation.ballOrbit.durationMs,
    );
  const bettingCloseAtMs =
    input.bettingOpenAtMs +
    ROULETTE_BETTING_WINDOW_MS;
  const spinStartedAtMs =
    bettingCloseAtMs +
    ROULETTE_BET_VERIFICATION_MS;
  const resultAtMs =
    spinStartedAtMs +
    spinDurationMs;
  const nextRoundAtMs =
    resultAtMs +
    ROULETTE_RESULT_HOLD_MS;

  return {
    roundId: input.roundId,
    simulationVersion:
      ROULETTE_SIMULATION_VERSION,
    seed: input.seed,
    result: simulation.result,
    bettingOpenAtMs:
      input.bettingOpenAtMs,
    bettingCloseAtMs,
    spinStartedAtMs,
    resultAtMs,
    nextRoundAtMs,
  };
}

export function getRouletteGlobalRoundPhase(
  round: RouletteGlobalRoundPlan,
  nowMs: number,
): RouletteGlobalRoundPhase {
  assertFiniteTimestamp(
    nowMs,
    "SERVER_TIME",
  );

  if (
    nowMs <
    round.bettingOpenAtMs
  ) {
    return "scheduled";
  }
  if (
    nowMs <
    round.bettingCloseAtMs
  ) {
    return "betting";
  }
  if (
    nowMs <
    round.spinStartedAtMs
  ) {
    return "verifying";
  }
  if (
    nowMs <
    round.resultAtMs
  ) {
    return "spinning";
  }
  if (
    nowMs <
    round.nextRoundAtMs
  ) {
    return "result";
  }

  return "complete";
}

export function createRouletteGlobalRoundSnapshot(
  round: RouletteGlobalRoundPlan,
  nowMs: number,
): RouletteGlobalRoundSnapshot {
  const phase =
    getRouletteGlobalRoundPhase(
      round,
      nowMs,
    );
  const revealSpin =
    phase === "spinning" ||
    phase === "result" ||
    phase === "complete";
  const revealResult =
    phase === "result" ||
    phase === "complete";

  return {
    roundId: round.roundId,
    simulationVersion:
      round.simulationVersion,
    phase,
    serverTimeMs: nowMs,
    bettingOpenAtMs:
      round.bettingOpenAtMs,
    bettingCloseAtMs:
      round.bettingCloseAtMs,
    spinStartedAtMs:
      round.spinStartedAtMs,
    resultAtMs:
      round.resultAtMs,
    nextRoundAtMs:
      round.nextRoundAtMs,
    seed:
      revealSpin
        ? round.seed
        : null,
    result:
      revealResult
        ? round.result
        : null,
  };
}
