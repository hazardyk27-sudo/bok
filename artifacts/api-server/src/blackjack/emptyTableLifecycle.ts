import type {
  BlackjackShoe,
  BlackjackTable,
} from "./domain";
import { getBlackjackShoeRemainingCards } from "./draw";
import { validateBlackjackShoeComposition } from "./shoe";

export const BLACKJACK_EMPTY_TABLE_WARM_MS = 300_000 as const;

export type BlackjackEmptyTableLifecycle = Readonly<{
  emptySinceMs: number | null;
  resetDueAtMs: number | null;
  resetCompletedForCurrentEmptyPeriod: boolean;
}>;

export type BlackjackEmptyTableLifecycleResult = Readonly<{
  table: BlackjackTable;
  lifecycle: BlackjackEmptyTableLifecycle;
  resetPerformed: boolean;
  waitingForSafeBoundary: boolean;
}>;

function assertNowMs(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError(
      "Blackjack empty-table nowMs must be a non-negative safe integer",
    );
  }
}

function safeAddMs(startMs: number, durationMs: number): number {
  const value = startMs + durationMs;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Blackjack empty-table deadline exceeds safe integer range");
  }
  return value;
}

function nextStateVersion(table: BlackjackTable): number {
  if (
    !Number.isSafeInteger(table.stateVersion) ||
    table.stateVersion < 0 ||
    table.stateVersion >= Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError("Blackjack stateVersion cannot advance safely");
  }
  return table.stateVersion + 1;
}

function freezeLifecycle(
  lifecycle: BlackjackEmptyTableLifecycle,
): BlackjackEmptyTableLifecycle {
  return Object.freeze({ ...lifecycle });
}

function validateFreshShoe(
  currentShoe: BlackjackShoe,
  freshShoe: BlackjackShoe,
): void {
  if (freshShoe.shoeId === currentShoe.shoeId) {
    throw new Error("Blackjack empty-table reset requires a new shoeId");
  }
  if (!validateBlackjackShoeComposition(freshShoe.cards)) {
    throw new Error("Blackjack empty-table fresh shoe has invalid composition");
  }
  getBlackjackShoeRemainingCards(freshShoe);
  if (freshShoe.nextIndex !== 0) {
    throw new Error("Blackjack empty-table fresh shoe must start at nextIndex 0");
  }
  if (freshShoe.reshufflePending) {
    throw new Error(
      "Blackjack empty-table fresh shoe cannot start reshufflePending",
    );
  }
}

function isSafeResetBoundary(table: BlackjackTable): boolean {
  if (table.phase === "TABLE_IDLE") {
    return table.round === null;
  }

  if (table.phase === "ROUND_END") {
    return (
      table.round !== null &&
      table.round.phase === "ROUND_END" &&
      table.round.currentTurn === null &&
      table.round.hands.every((hand) => hand.status === "COMPLETE")
    );
  }

  return false;
}

export function createBlackjackEmptyTableLifecycle(): BlackjackEmptyTableLifecycle {
  return freezeLifecycle({
    emptySinceMs: null,
    resetDueAtMs: null,
    resetCompletedForCurrentEmptyPeriod: false,
  });
}

export function reconcileBlackjackEmptyTableLifecycle(
  table: BlackjackTable,
  lifecycle: BlackjackEmptyTableLifecycle,
  nowMs: number,
): BlackjackEmptyTableLifecycle {
  assertNowMs(nowMs);

  if (table.players.length > 0) {
    if (
      lifecycle.emptySinceMs === null &&
      lifecycle.resetDueAtMs === null &&
      !lifecycle.resetCompletedForCurrentEmptyPeriod
    ) {
      return lifecycle;
    }

    return createBlackjackEmptyTableLifecycle();
  }

  if (lifecycle.emptySinceMs !== null) {
    if (
      lifecycle.resetDueAtMs === null ||
      lifecycle.resetDueAtMs < lifecycle.emptySinceMs
    ) {
      throw new Error("Blackjack empty-table lifecycle deadline is inconsistent");
    }
    return lifecycle;
  }

  return freezeLifecycle({
    emptySinceMs: nowMs,
    resetDueAtMs: safeAddMs(nowMs, BLACKJACK_EMPTY_TABLE_WARM_MS),
    resetCompletedForCurrentEmptyPeriod: false,
  });
}

export function applyBlackjackEmptyTableLifecycle(
  table: BlackjackTable,
  lifecycle: BlackjackEmptyTableLifecycle,
  input: {
    nowMs: number;
    createFreshShoe: () => BlackjackShoe;
  },
): BlackjackEmptyTableLifecycleResult {
  const reconciled = reconcileBlackjackEmptyTableLifecycle(
    table,
    lifecycle,
    input.nowMs,
  );

  if (table.players.length > 0) {
    return Object.freeze({
      table,
      lifecycle: reconciled,
      resetPerformed: false,
      waitingForSafeBoundary: false,
    });
  }

  if (
    reconciled.resetCompletedForCurrentEmptyPeriod ||
    reconciled.resetDueAtMs === null ||
    input.nowMs < reconciled.resetDueAtMs
  ) {
    return Object.freeze({
      table,
      lifecycle: reconciled,
      resetPerformed: false,
      waitingForSafeBoundary: false,
    });
  }

  if (!isSafeResetBoundary(table)) {
    return Object.freeze({
      table,
      lifecycle: reconciled,
      resetPerformed: false,
      waitingForSafeBoundary: true,
    });
  }

  const freshShoe = input.createFreshShoe();
  validateFreshShoe(table.shoe, freshShoe);

  return Object.freeze({
    table: Object.freeze({
      ...table,
      shoe: freshShoe,
      stateVersion: nextStateVersion(table),
    }),
    lifecycle: freezeLifecycle({
      ...reconciled,
      resetCompletedForCurrentEmptyPeriod: true,
    }),
    resetPerformed: true,
    waitingForSafeBoundary: false,
  });
}
