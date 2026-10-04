import type {
  RouletteGlobalTableSnapshot,
} from "./rouletteWalletClient";

export const ROULETTE_BET_VERIFICATION_MS = 3_000;

export function getRouletteVerificationSecondsRemaining(
  table: RouletteGlobalTableSnapshot,
  serverNowMs: number,
) {
  if (
    !Number.isFinite(serverNowMs) ||
    serverNowMs < table.bettingCloseAtMs ||
    serverNowMs >= table.spinStartedAtMs
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil(
      (table.spinStartedAtMs - serverNowMs) / 1_000,
    ),
  );
}

export function isRouletteBetVerificationActive(
  table: RouletteGlobalTableSnapshot,
  serverNowMs: number,
) {
  return (
    Number.isFinite(serverNowMs) &&
    serverNowMs >= table.bettingCloseAtMs &&
    serverNowMs < table.spinStartedAtMs
  );
}
