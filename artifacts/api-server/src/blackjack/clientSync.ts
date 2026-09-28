import type { BlackjackServerEvent } from "./eventStream";
import { checkBlackjackIncomingEventSequence } from "./eventStream";
import type { BlackjackPublicSnapshot } from "./publicSnapshot";
import type { BlackjackSyncRequest } from "./syncProtocol";

export type BlackjackClientSyncCursor = Readonly<{
  eventSequence: number;
  stateVersion: number;
  resyncRequired: boolean;
}>;

export type BlackjackClientEventApplyResult = Readonly<{
  cursor: BlackjackClientSyncCursor;
  status:
    | "APPLIED"
    | "IGNORED_DUPLICATE_OR_OLD"
    | "RESYNC_REQUIRED"
    | "WAITING_FOR_SNAPSHOT";
}>;

function assertSafeNonNegative(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      "Blackjack " + label + " must be a non-negative safe integer",
    );
  }
}

function freezeCursor(
  cursor: BlackjackClientSyncCursor,
): BlackjackClientSyncCursor {
  return Object.freeze({ ...cursor });
}

export function createBlackjackClientSyncCursor(input?: {
  eventSequence?: number;
  stateVersion?: number;
}): BlackjackClientSyncCursor {
  const eventSequence = input?.eventSequence ?? 0;
  const stateVersion = input?.stateVersion ?? 0;
  assertSafeNonNegative("client eventSequence", eventSequence);
  assertSafeNonNegative("client stateVersion", stateVersion);

  return freezeCursor({
    eventSequence,
    stateVersion,
    resyncRequired: false,
  });
}

export function applyBlackjackServerEventToClientCursor(
  cursor: BlackjackClientSyncCursor,
  event: BlackjackServerEvent,
): BlackjackClientEventApplyResult {
  assertSafeNonNegative("client eventSequence", cursor.eventSequence);
  assertSafeNonNegative("client stateVersion", cursor.stateVersion);
  assertSafeNonNegative("server eventSequence", event.eventSequence);
  assertSafeNonNegative("server stateVersion", event.stateVersion);

  if (cursor.resyncRequired) {
    return Object.freeze({
      cursor,
      status: "WAITING_FOR_SNAPSHOT" as const,
    });
  }

  const sequence = checkBlackjackIncomingEventSequence(
    cursor.eventSequence,
    event.eventSequence,
  );

  if (sequence.status === "DUPLICATE_OR_OLD") {
    return Object.freeze({
      cursor,
      status: "IGNORED_DUPLICATE_OR_OLD" as const,
    });
  }

  if (
    sequence.status === "RESYNC_REQUIRED" ||
    event.stateVersion < cursor.stateVersion
  ) {
    return Object.freeze({
      cursor: freezeCursor({
        ...cursor,
        resyncRequired: true,
      }),
      status: "RESYNC_REQUIRED" as const,
    });
  }

  return Object.freeze({
    cursor: freezeCursor({
      eventSequence: event.eventSequence,
      stateVersion: event.stateVersion,
      resyncRequired: false,
    }),
    status: "APPLIED" as const,
  });
}

export function applyBlackjackFullSnapshotToClientCursor(
  snapshot: BlackjackPublicSnapshot,
): BlackjackClientSyncCursor {
  assertSafeNonNegative("snapshot eventSequence", snapshot.eventSequence);
  assertSafeNonNegative("snapshot stateVersion", snapshot.stateVersion);

  return freezeCursor({
    eventSequence: snapshot.eventSequence,
    stateVersion: snapshot.stateVersion,
    resyncRequired: false,
  });
}

export function buildBlackjackClientSyncRequest(
  cursor: BlackjackClientSyncCursor,
): BlackjackSyncRequest {
  assertSafeNonNegative("client eventSequence", cursor.eventSequence);
  assertSafeNonNegative("client stateVersion", cursor.stateVersion);

  return Object.freeze({
    type: "sync" as const,
    lastEventSequence: cursor.eventSequence,
    lastStateVersion: cursor.stateVersion,
  });
}
