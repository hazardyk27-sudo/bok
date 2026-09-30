import type {
  RouletteGlobalTablePhase,
  RouletteGlobalTableSnapshot,
} from "./rouletteWalletClient";

export function estimateRouletteServerClockOffset(
  serverTimeMs: number,
  clientRequestStartedAtMs: number,
  clientResponseReceivedAtMs: number,
) {
  if (
    !Number.isFinite(serverTimeMs) ||
    !Number.isFinite(clientRequestStartedAtMs) ||
    !Number.isFinite(clientResponseReceivedAtMs) ||
    clientResponseReceivedAtMs <
      clientRequestStartedAtMs
  ) {
    return 0;
  }

  const midpoint =
    clientRequestStartedAtMs +
    (
      clientResponseReceivedAtMs -
      clientRequestStartedAtMs
    ) /
      2;

  return serverTimeMs - midpoint;
}

export function getRouletteServerNowMs(
  clockOffsetMs: number,
  clientNowMs: number = Date.now(),
) {
  return clientNowMs +
    (
      Number.isFinite(clockOffsetMs)
        ? clockOffsetMs
        : 0
    );
}

export function getRouletteGlobalClientPhase(
  table: RouletteGlobalTableSnapshot,
  serverNowMs: number,
): RouletteGlobalTablePhase {
  if (
    serverNowMs <
    table.bettingOpenAtMs
  ) {
    return "scheduled";
  }
  if (
    serverNowMs <
    table.bettingCloseAtMs
  ) {
    return "betting";
  }
  if (
    serverNowMs <
    table.resultAtMs
  ) {
    return "spinning";
  }
  if (
    serverNowMs <
    table.nextRoundAtMs
  ) {
    return "result";
  }
  return "complete";
}

export function getRouletteGlobalBettingSecondsRemaining(
  table: RouletteGlobalTableSnapshot,
  serverNowMs: number,
) {
  return Math.max(
    0,
    Math.ceil(
      (
        table.bettingCloseAtMs -
        serverNowMs
      ) /
        1000,
    ),
  );
}

export function getRouletteGlobalSpinElapsedMs(
  table: RouletteGlobalTableSnapshot,
  serverNowMs: number,
) {
  const durationMs =
    Math.max(
      0,
      table.resultAtMs -
        table.spinStartedAtMs,
    );

  return Math.min(
    durationMs,
    Math.max(
      0,
      serverNowMs -
        table.spinStartedAtMs,
    ),
  );
}
