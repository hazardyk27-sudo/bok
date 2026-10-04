import type {
  RouletteGlobalTablePhase,
  RouletteGlobalTableSnapshot,
} from "./rouletteWalletClient";

export const ROULETTE_STATE_SYNC_INTERVAL_MS =
  5_000;
export const ROULETTE_STATE_RETRY_INTERVAL_MS =
  1_000;

export function getRouletteStateSyncDelay(
  apiReady: boolean,
) {
  return apiReady
    ? ROULETTE_STATE_SYNC_INTERVAL_MS
    : ROULETTE_STATE_RETRY_INTERVAL_MS;
}

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
    table.spinStartedAtMs
  ) {
    return "verifying";
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

export function getRouletteGlobalVerificationSecondsRemaining(
  table: RouletteGlobalTableSnapshot,
  serverNowMs: number,
) {
  if (
    serverNowMs <
      table.bettingCloseAtMs ||
    serverNowMs >=
      table.spinStartedAtMs
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil(
      (
        table.spinStartedAtMs -
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

export function getRouletteQueuedBetExpectedRevision(
  serverRevision: number,
  syncInFlight: boolean,
) {
  if (
    !Number.isSafeInteger(
      serverRevision,
    ) ||
    serverRevision < 0
  ) {
    return 0;
  }

  return (
    serverRevision +
    (
      syncInFlight
        ? 1
        : 0
    )
  );
}
