import { createHash } from "node:crypto";
import type { BlackjackActionId } from "./domain";
import {
  assertBlackjackDurableRuntimeState,
  type BlackjackDurableRuntimeState,
} from "./snapshotState";

export const BLACKJACK_JOURNAL_EVENT_TYPES = [
  "ROUND_STARTED",
  "BET_RESERVED",
  "BET_RELEASED",
  "BET_READY",
  "INITIAL_DEAL_COMPLETED",
  "PLAYER_HIT",
  "PLAYER_STAND",
  "PLAYER_DOUBLE",
  "PLAYER_SPLIT",
  "AUTO_STAND",
  "DEALER_TURN_COMPLETED",
  "SETTLEMENT_COMPLETED",
  "PLAYER_DISCONNECTED",
  "PLAYER_RECONNECTED",
  "SHOE_REPLACED",
  "TABLE_STATE_COMMITTED",
] as const;

export type BlackjackJournalEventType =
  (typeof BLACKJACK_JOURNAL_EVENT_TYPES)[number];

export type BlackjackJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly BlackjackJsonValue[]
  | Readonly<{ [key: string]: BlackjackJsonValue }>;

export type BlackjackJournalRecord = Readonly<{
  eventId: string;
  tableId: string;
  eventSequence: number;
  stateVersion: number;
  actionId: BlackjackActionId | null;
  eventType: BlackjackJournalEventType;
  payload: Readonly<{
    details: Readonly<{ [key: string]: BlackjackJsonValue }>;
    runtimeAfter: BlackjackDurableRuntimeState;
  }>;
  checksum: string;
  createdAtMs: number;
}>;

function assertNonEmptyId(label: string, value: string): void {
  if (!value.trim()) {
    throw new RangeError("Blackjack " + label + " must be a non-empty string");
  }
}

function assertSafeNonNegative(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      "Blackjack " + label + " must be a non-negative safe integer",
    );
  }
}

function assertJsonValue(value: unknown, path = "payload"): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Blackjack journal " + path + " contains non-finite number");
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertJsonValue(entry, path + "[" + index + "]"),
    );
    return;
  }

  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) {
        throw new Error("Blackjack journal " + path + "." + key + " is undefined");
      }
      assertJsonValue(entry, path + "." + key);
    }
    return;
  }

  throw new Error("Blackjack journal " + path + " is not JSON serializable");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const record = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(record)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + canonicalJson(record[key]))
      .join(",") +
    "}"
  );
}

function checksumFor(input: Omit<BlackjackJournalRecord, "checksum">): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

function isJournalEventType(value: string): value is BlackjackJournalEventType {
  return (BLACKJACK_JOURNAL_EVENT_TYPES as readonly string[]).includes(value);
}

export function createBlackjackJournalRecord(input: {
  runtimeAfter: BlackjackDurableRuntimeState;
  eventType: BlackjackJournalEventType;
  actionId: BlackjackActionId | null;
  details?: Readonly<{ [key: string]: BlackjackJsonValue }>;
  createdAtMs: number;
}): BlackjackJournalRecord {
  assertBlackjackDurableRuntimeState(input.runtimeAfter);
  assertSafeNonNegative("journal createdAtMs", input.createdAtMs);

  if (!isJournalEventType(input.eventType)) {
    throw new Error("Blackjack journal eventType is unsupported");
  }
  if (input.actionId !== null) {
    assertNonEmptyId("journal actionId", input.actionId);
  }

  const table = input.runtimeAfter.table;
  if (table.eventSequence < 1) {
    throw new Error("Blackjack journal runtime must have eventSequence >= 1");
  }

  const details = input.details ?? {};
  assertJsonValue(details, "details");

  const base = {
    eventId: table.tableId + ":" + table.eventSequence,
    tableId: table.tableId,
    eventSequence: table.eventSequence,
    stateVersion: table.stateVersion,
    actionId: input.actionId,
    eventType: input.eventType,
    payload: {
      details,
      runtimeAfter: input.runtimeAfter,
    },
    createdAtMs: input.createdAtMs,
  } as const;

  return Object.freeze({
    ...base,
    checksum: checksumFor(base),
  });
}

export function verifyBlackjackJournalRecord(
  record: BlackjackJournalRecord,
): BlackjackDurableRuntimeState {
  assertNonEmptyId("journal eventId", record.eventId);
  assertNonEmptyId("journal tableId", record.tableId);
  assertSafeNonNegative("journal eventSequence", record.eventSequence);
  assertSafeNonNegative("journal stateVersion", record.stateVersion);
  assertSafeNonNegative("journal createdAtMs", record.createdAtMs);

  if (!isJournalEventType(record.eventType)) {
    throw new Error("Blackjack journal eventType is unsupported");
  }
  if (record.actionId !== null) {
    assertNonEmptyId("journal actionId", record.actionId);
  }

  assertJsonValue(record.payload.details, "details");
  assertBlackjackDurableRuntimeState(record.payload.runtimeAfter);

  const table = record.payload.runtimeAfter.table;
  if (
    record.tableId !== table.tableId ||
    record.eventSequence !== table.eventSequence ||
    record.stateVersion !== table.stateVersion ||
    record.eventId !== record.tableId + ":" + record.eventSequence
  ) {
    throw new Error("Blackjack journal metadata does not match runtimeAfter");
  }

  const { checksum, ...base } = record;
  if (checksumFor(base) !== checksum) {
    throw new Error("Blackjack journal checksum mismatch");
  }

  return record.payload.runtimeAfter;
}

export function parseBlackjackJournalRecord(value: unknown): BlackjackJournalRecord {
  if (typeof value !== "object" || value === null) {
    throw new Error("Blackjack journal record is not an object");
  }

  const candidate = value as Partial<BlackjackJournalRecord>;
  if (
    typeof candidate.eventId !== "string" ||
    typeof candidate.tableId !== "string" ||
    typeof candidate.eventSequence !== "number" ||
    typeof candidate.stateVersion !== "number" ||
    (candidate.actionId !== null && typeof candidate.actionId !== "string") ||
    typeof candidate.eventType !== "string" ||
    typeof candidate.payload !== "object" ||
    candidate.payload === null ||
    typeof candidate.checksum !== "string" ||
    typeof candidate.createdAtMs !== "number"
  ) {
    throw new Error("Blackjack journal record shape is invalid");
  }

  const record = candidate as BlackjackJournalRecord;
  verifyBlackjackJournalRecord(record);
  return record;
}
