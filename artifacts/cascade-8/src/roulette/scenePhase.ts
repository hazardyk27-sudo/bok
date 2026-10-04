export type RouletteScenePhase =
  | "betting"
  | "spinning"
  | "settled";

export const ROULETTE_RESULT_HOLD_MS = 2200;
export const ROULETTE_BETTING_WINDOW_MS = 20_000;
export const ROULETTE_BET_VERIFICATION_MS = 3_000;

export function getRouletteBettingSecondsRemaining(
  deadlineMs: number,
  nowMs: number,
) {
  if (
    !Number.isFinite(deadlineMs) ||
    !Number.isFinite(nowMs)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil(
      (deadlineMs - nowMs) / 1000,
    ),
  );
}

export function canEditRouletteBets(
  phase: RouletteScenePhase,
) {
  return phase === "betting";
}

export function canStartRouletteSpin(
  phase: RouletteScenePhase,
) {
  return phase === "betting";
}

export function getRoulettePhaseStatus(
  phase: RouletteScenePhase,
  resultNumber?: number,
) {
  if (phase === "spinning") {
    return "NO MORE BETS";
  }

  if (
    phase === "settled" &&
    Number.isFinite(resultNumber)
  ) {
    return `RESULT ${resultNumber}`;
  }

  return "BETTING OPEN";
}
