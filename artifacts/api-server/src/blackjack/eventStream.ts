import type {
  BlackjackActionId,
  BlackjackTable,
} from "./domain";

export const BLACKJACK_SERVER_EVENT_TYPES = [
  "TABLE_STATE_COMMITTED",
  "TURN_STARTED",
  "CARD_DEALT",
  "HAND_STOOD",
  "HAND_BUST",
  "BET_UPDATED",
  "ROUND_PHASE_CHANGED",
] as const;

export type BlackjackServerEventType =
  (typeof BLACKJACK_SERVER_EVENT_TYPES)[number];

export type BlackjackServerEvent = Readonly<{
  eventSequence: number;
  stateVersion: number;
  type: BlackjackServerEventType;
  actionId: BlackjackActionId | null;
  createdAtMs: number;
}>;

function assertSafeNonNegativeInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `Blackjack ${label} must be a non-negative safe integer`,
    );
  }
}

function assertEventType(value: string): asserts value is BlackjackServerEventType {
  if (!(BLACKJACK_SERVER_EVENT_TYPES as readonly string[]).includes(value)) {
    throw new Error("Blackjack server event type is not supported");
  }
}

export type BlackjackEventCommitResult = Readonly<{
  table: BlackjackTable;
  event: BlackjackServerEvent;
}>;

export function commitBlackjackServerEvent(
  table: BlackjackTable,
  input: {
    type: BlackjackServerEventType;
    actionId: BlackjackActionId | null;
    createdAtMs: number;
  },
): BlackjackEventCommitResult {
  assertEventType(input.type);
  assertSafeNonNegativeInteger("createdAtMs", input.createdAtMs);
  assertSafeNonNegativeInteger("eventSequence", table.eventSequence);
  assertSafeNonNegativeInteger("stateVersion", table.stateVersion);

  if (table.eventSequence >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Blackjack eventSequence cannot advance safely");
  }

  if (input.actionId !== null && !input.actionId.trim()) {
    throw new RangeError("Blackjack event actionId must be non-empty when present");
  }

  const nextEventSequence = table.eventSequence + 1;

  const event: BlackjackServerEvent = Object.freeze({
    eventSequence: nextEventSequence,
    stateVersion: table.stateVersion,
    type: input.type,
    actionId: input.actionId,
    createdAtMs: input.createdAtMs,
  });

  const nextTable: BlackjackTable = Object.freeze({
    ...table,
    eventSequence: nextEventSequence,
  });

  return Object.freeze({
    table: nextTable,
    event,
  });
}

export type BlackjackEventSequenceCheck =
  | Readonly<{ status: "NEXT"; eventSequence: number }>
  | Readonly<{ status: "DUPLICATE_OR_OLD"; eventSequence: number }>
  | Readonly<{
      status: "RESYNC_REQUIRED";
      expectedEventSequence: number;
      receivedEventSequence: number;
    }>;

export function checkBlackjackIncomingEventSequence(
  lastAppliedEventSequence: number,
  receivedEventSequence: number,
): BlackjackEventSequenceCheck {
  assertSafeNonNegativeInteger(
    "lastAppliedEventSequence",
    lastAppliedEventSequence,
  );
  assertSafeNonNegativeInteger(
    "receivedEventSequence",
    receivedEventSequence,
  );

  const expected = lastAppliedEventSequence + 1;
  if (!Number.isSafeInteger(expected)) {
    throw new RangeError("Blackjack expected eventSequence exceeds safe integer range");
  }

  if (receivedEventSequence === expected) {
    return Object.freeze({
      status: "NEXT" as const,
      eventSequence: receivedEventSequence,
    });
  }

  if (receivedEventSequence <= lastAppliedEventSequence) {
    return Object.freeze({
      status: "DUPLICATE_OR_OLD" as const,
      eventSequence: receivedEventSequence,
    });
  }

  return Object.freeze({
    status: "RESYNC_REQUIRED" as const,
    expectedEventSequence: expected,
    receivedEventSequence,
  });
}
