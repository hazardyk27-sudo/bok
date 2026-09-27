import type {
  BlackjackActionId,
  BlackjackHandId,
  BlackjackRoundId,
  BlackjackSeatNumber,
  BlackjackTable,
} from "./domain";
import { isBlackjackSeatNumber } from "./seats";

export const BLACKJACK_MUTATION_ACTION_TYPES = [
  "PLACE_BET",
  "UNDO_BET",
  "CLEAR_BET",
  "READY",
  "HIT",
  "STAND",
  "DOUBLE",
  "SPLIT",
  "LEAVE_SEAT",
] as const;

export type BlackjackMutationActionType =
  (typeof BLACKJACK_MUTATION_ACTION_TYPES)[number];

export type BlackjackActionEnvelope = Readonly<{
  actionId: BlackjackActionId;
  type: BlackjackMutationActionType;
  tableId: string;
  expectedStateVersion: number;
  roundId: BlackjackRoundId | null;
  handId: BlackjackHandId | null;
  seatNumber: BlackjackSeatNumber | null;
  payloadFingerprint: string;
}>;

export type BlackjackActionReceipt = Readonly<{
  actionId: BlackjackActionId;
  type: BlackjackMutationActionType;
  tableId: string;
  expectedStateVersion: number;
  roundId: BlackjackRoundId | null;
  handId: BlackjackHandId | null;
  seatNumber: BlackjackSeatNumber | null;
  payloadFingerprint: string;
  resultingStateVersion: number;
}>;

export type BlackjackActionProtocolState = Readonly<{
  receipts: readonly BlackjackActionReceipt[];
}>;

export class BlackjackStaleActionError extends Error {
  readonly code = "STALE_ACTION";

  constructor(expectedStateVersion: number, actualStateVersion: number) {
    super(
      `Blackjack STALE_ACTION: expected stateVersion ${expectedStateVersion}, actual ${actualStateVersion}`,
    );
    this.name = "BlackjackStaleActionError";
  }
}

function assertNonEmptyId(label: string, value: string): void {
  if (!value.trim()) {
    throw new RangeError(`Blackjack ${label} must be a non-empty string`);
  }
}

function assertStateVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      "Blackjack expectedStateVersion must be a non-negative safe integer",
    );
  }
}

function isMutationActionType(value: string): value is BlackjackMutationActionType {
  return (BLACKJACK_MUTATION_ACTION_TYPES as readonly string[]).includes(value);
}

function assertActionShape(envelope: BlackjackActionEnvelope): void {
  if (envelope.seatNumber !== null && !isBlackjackSeatNumber(envelope.seatNumber)) {
    throw new RangeError("Blackjack action seatNumber must be between 1 and 5");
  }

  const roundScoped = envelope.type !== "LEAVE_SEAT";
  if (roundScoped && envelope.roundId === null) {
    throw new Error(`Blackjack ${envelope.type} requires roundId`);
  }

  const handScoped =
    envelope.type === "HIT" ||
    envelope.type === "STAND" ||
    envelope.type === "DOUBLE" ||
    envelope.type === "SPLIT";

  if (handScoped && envelope.handId === null) {
    throw new Error(`Blackjack ${envelope.type} requires handId`);
  }
  if (handScoped && envelope.seatNumber === null) {
    throw new Error(`Blackjack ${envelope.type} requires seatNumber`);
  }

  const seatScoped =
    envelope.type === "PLACE_BET" ||
    envelope.type === "UNDO_BET" ||
    envelope.type === "CLEAR_BET" ||
    envelope.type === "READY" ||
    envelope.type === "LEAVE_SEAT";

  if (seatScoped && envelope.seatNumber === null) {
    throw new Error(`Blackjack ${envelope.type} requires seatNumber`);
  }
}


function sameEnvelope(
  receipt: BlackjackActionReceipt,
  envelope: BlackjackActionEnvelope,
): boolean {
  return (
    receipt.actionId === envelope.actionId &&
    receipt.type === envelope.type &&
    receipt.tableId === envelope.tableId &&
    receipt.expectedStateVersion === envelope.expectedStateVersion &&
    receipt.roundId === envelope.roundId &&
    receipt.handId === envelope.handId &&
    receipt.seatNumber === envelope.seatNumber &&
    receipt.payloadFingerprint === envelope.payloadFingerprint
  );
}

export function createBlackjackActionProtocolState(): BlackjackActionProtocolState {
  return Object.freeze({
    receipts: Object.freeze([]),
  });
}

function assertBlackjackActionEnvelopeShape(
  envelope: BlackjackActionEnvelope,
): void {
  assertNonEmptyId("actionId", envelope.actionId);
  assertNonEmptyId("tableId", envelope.tableId);
  assertStateVersion(envelope.expectedStateVersion);
  assertNonEmptyId("payloadFingerprint", envelope.payloadFingerprint);

  if (!isMutationActionType(envelope.type)) {
    throw new Error("Blackjack action type is not supported");
  }

  assertActionShape(envelope);
}

export function assertBlackjackActionEnvelope(
  table: BlackjackTable,
  envelope: BlackjackActionEnvelope,
): void {
  assertBlackjackActionEnvelopeShape(envelope);

  if (table.tableId !== envelope.tableId) {
    throw new Error("Blackjack action targets another table");
  }

  if (envelope.roundId !== null) {
    assertNonEmptyId("roundId", envelope.roundId);
    if (table.round === null || table.round.roundId !== envelope.roundId) {
      throw new Error("Blackjack action targets a stale or foreign round");
    }
  }

  if (envelope.handId !== null) {
    assertNonEmptyId("handId", envelope.handId);
    if (table.round === null) {
      throw new Error("Blackjack hand action requires an active round");
    }
    const hand = table.round.hands.find(
      (candidate) => candidate.handId === envelope.handId,
    );
    if (!hand) {
      throw new Error("Blackjack action targets a stale or foreign hand");
    }
    if (
      envelope.seatNumber !== null &&
      hand.seatNumber !== envelope.seatNumber
    ) {
      throw new Error("Blackjack action seat does not own the target hand");
    }
  }
}

export type BlackjackVersionedActionResult = Readonly<{
  table: BlackjackTable;
  protocol: BlackjackActionProtocolState;
  receipt: BlackjackActionReceipt;
  replayed: boolean;
}>;

export function applyBlackjackVersionedAction(
  table: BlackjackTable,
  protocol: BlackjackActionProtocolState,
  envelope: BlackjackActionEnvelope,
  mutate: (table: BlackjackTable) => BlackjackTable,
): BlackjackVersionedActionResult {
  assertBlackjackActionEnvelopeShape(envelope);

  const existing = protocol.receipts.find(
    (receipt) => receipt.actionId === envelope.actionId,
  );

  if (existing) {
    if (!sameEnvelope(existing, envelope)) {
      throw new Error(
        `Blackjack actionId conflict: ${envelope.actionId}`,
      );
    }

    return Object.freeze({
      table,
      protocol,
      receipt: existing,
      replayed: true,
    });
  }

  assertBlackjackActionEnvelope(table, envelope);

  if (envelope.expectedStateVersion !== table.stateVersion) {
    throw new BlackjackStaleActionError(
      envelope.expectedStateVersion,
      table.stateVersion,
    );
  }

  if (table.stateVersion >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Blackjack stateVersion cannot advance safely");
  }

  const mutated = mutate(table);

  if (mutated.tableId !== table.tableId) {
    throw new Error("Blackjack action mutation cannot change tableId");
  }
  if (mutated.stateVersion !== table.stateVersion) {
    throw new Error(
      "Blackjack action mutation must preserve stateVersion; protocol owns version advancement",
    );
  }

  const committedTable: BlackjackTable = Object.freeze({
    ...mutated,
    stateVersion: table.stateVersion + 1,
  });

  const receipt: BlackjackActionReceipt = Object.freeze({
    ...envelope,
    resultingStateVersion: committedTable.stateVersion,
  });

  const nextProtocol: BlackjackActionProtocolState = Object.freeze({
    receipts: Object.freeze([...protocol.receipts, receipt]),
  });

  return Object.freeze({
    table: committedTable,
    protocol: nextProtocol,
    receipt,
    replayed: false,
  });
}
