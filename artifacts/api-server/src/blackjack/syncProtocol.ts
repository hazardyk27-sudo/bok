import type { BlackjackPublicSnapshot } from "./publicSnapshot";

export const BLACKJACK_FULL_SNAPSHOT_REASONS = [
  "INITIAL_CONNECT",
  "EXPLICIT_SYNC",
  "EVENT_GAP",
  "STATE_MISMATCH",
] as const;

export type BlackjackFullSnapshotReason =
  (typeof BLACKJACK_FULL_SNAPSHOT_REASONS)[number];

export type BlackjackSyncRequest = Readonly<{
  type: "sync";
  lastEventSequence?: number;
  lastStateVersion?: number;
}>;

export type BlackjackFullSnapshotMessage = Readonly<{
  type: "FULL_TABLE_SNAPSHOT";
  reason: BlackjackFullSnapshotReason;
  snapshot: BlackjackPublicSnapshot;
  resetEventSequenceTo: number;
  resetStateVersionTo: number;
}>;

export type BlackjackSyncOkMessage = Readonly<{
  type: "SYNC_OK";
  eventSequence: number;
  stateVersion: number;
}>;

export type BlackjackSyncResponse =
  | BlackjackFullSnapshotMessage
  | BlackjackSyncOkMessage;

function assertSafeNonNegativeInteger(
  label: string,
  value: number,
): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `Blackjack ${label} must be a non-negative safe integer`,
    );
  }
}

export function parseBlackjackSyncRequest(
  value: unknown,
): BlackjackSyncRequest | null {
  if (value === "sync") {
    return Object.freeze({ type: "sync" as const });
  }

  if (typeof value !== "object" || value === null) return null;
  if (!("type" in value) || (value as { type?: unknown }).type !== "sync") {
    return null;
  }

  const raw = value as {
    type: "sync";
    lastEventSequence?: unknown;
    lastStateVersion?: unknown;
  };

  if (
    raw.lastEventSequence !== undefined &&
    (typeof raw.lastEventSequence !== "number" ||
      !Number.isSafeInteger(raw.lastEventSequence) ||
      raw.lastEventSequence < 0)
  ) {
    throw new RangeError(
      "Blackjack lastEventSequence must be a non-negative safe integer",
    );
  }

  if (
    raw.lastStateVersion !== undefined &&
    (typeof raw.lastStateVersion !== "number" ||
      !Number.isSafeInteger(raw.lastStateVersion) ||
      raw.lastStateVersion < 0)
  ) {
    throw new RangeError(
      "Blackjack lastStateVersion must be a non-negative safe integer",
    );
  }

  return Object.freeze({
    type: "sync" as const,
    ...(raw.lastEventSequence === undefined
      ? {}
      : { lastEventSequence: raw.lastEventSequence }),
    ...(raw.lastStateVersion === undefined
      ? {}
      : { lastStateVersion: raw.lastStateVersion }),
  });
}

export function buildBlackjackFullSnapshotMessage(
  snapshot: BlackjackPublicSnapshot,
  reason: BlackjackFullSnapshotReason,
): BlackjackFullSnapshotMessage {
  assertSafeNonNegativeInteger("snapshot eventSequence", snapshot.eventSequence);
  assertSafeNonNegativeInteger("snapshot stateVersion", snapshot.stateVersion);

  return Object.freeze({
    type: "FULL_TABLE_SNAPSHOT" as const,
    reason,
    snapshot,
    resetEventSequenceTo: snapshot.eventSequence,
    resetStateVersionTo: snapshot.stateVersion,
  });
}

export function buildBlackjackInitialSyncResponse(
  snapshot: BlackjackPublicSnapshot,
): BlackjackFullSnapshotMessage {
  return buildBlackjackFullSnapshotMessage(snapshot, "INITIAL_CONNECT");
}

export function evaluateBlackjackSyncRequest(
  snapshot: BlackjackPublicSnapshot,
  request: BlackjackSyncRequest,
): BlackjackSyncResponse {
  assertSafeNonNegativeInteger("snapshot eventSequence", snapshot.eventSequence);
  assertSafeNonNegativeInteger("snapshot stateVersion", snapshot.stateVersion);

  const hasEventSequence = request.lastEventSequence !== undefined;
  const hasStateVersion = request.lastStateVersion !== undefined;

  if (!hasEventSequence && !hasStateVersion) {
    return buildBlackjackFullSnapshotMessage(snapshot, "EXPLICIT_SYNC");
  }

  if (
    request.lastEventSequence !== undefined &&
    request.lastEventSequence !== snapshot.eventSequence
  ) {
    return buildBlackjackFullSnapshotMessage(
      snapshot,
      request.lastEventSequence < snapshot.eventSequence
        ? "EVENT_GAP"
        : "STATE_MISMATCH",
    );
  }

  if (
    request.lastStateVersion !== undefined &&
    request.lastStateVersion !== snapshot.stateVersion
  ) {
    return buildBlackjackFullSnapshotMessage(snapshot, "STATE_MISMATCH");
  }

  return Object.freeze({
    type: "SYNC_OK" as const,
    eventSequence: snapshot.eventSequence,
    stateVersion: snapshot.stateVersion,
  });
}
