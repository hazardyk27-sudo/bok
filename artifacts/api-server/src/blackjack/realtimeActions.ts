import {
  type BlackjackCoordinatedPlayerAction,
  type BlackjackPlayerActionCoordinator,
} from "./actionCoordinator";
import type { BlackjackPublicSnapshot } from "./publicSnapshot";
import { buildBlackjackPublicSnapshot } from "./publicSnapshot";
import { isBlackjackSeatNumber } from "./seats";

export const BLACKJACK_REALTIME_PLAYER_ACTION_TYPES = [
  "HIT",
  "STAND",
  "DOUBLE",
  "SPLIT",
] as const;

export type BlackjackRealtimePlayerActionType =
  (typeof BLACKJACK_REALTIME_PLAYER_ACTION_TYPES)[number];

export type BlackjackRealtimePlayerActionHandlerResult = Readonly<{
  actionId: string;
  replayed: boolean;
  snapshot: BlackjackPublicSnapshot;
}>;

export type BlackjackRealtimePlayerActionHandler = (
  action: BlackjackCoordinatedPlayerAction,
) =>
  | BlackjackRealtimePlayerActionHandlerResult
  | Promise<BlackjackRealtimePlayerActionHandlerResult>;

function assertNonEmptyId(label: string, value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RangeError(
      "Blackjack realtime " + label + " must be a non-empty string",
    );
  }
  return value;
}

function assertExpectedStateVersion(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new RangeError(
      "Blackjack realtime expectedStateVersion must be a non-negative safe integer",
    );
  }
  return value;
}

function assertActionType(value: unknown): BlackjackRealtimePlayerActionType {
  if (
    typeof value !== "string" ||
    !(BLACKJACK_REALTIME_PLAYER_ACTION_TYPES as readonly string[]).includes(
      value,
    )
  ) {
    throw new Error("Blackjack realtime player action type is unsupported");
  }
  return value as BlackjackRealtimePlayerActionType;
}

export function parseBlackjackRealtimePlayerAction(
  value: unknown,
  input: {
    playerId: string;
    tableId: string;
    nowMs: number;
  },
): BlackjackCoordinatedPlayerAction {
  if (typeof value !== "object" || value === null) {
    throw new Error("Blackjack realtime player action must be an object");
  }

  const raw = value as Record<string, unknown>;
  const type = assertActionType(raw.type);
  const actionId = assertNonEmptyId("actionId", raw.actionId);
  const roundId = assertNonEmptyId("roundId", raw.roundId);
  const handId = assertNonEmptyId("handId", raw.handId);
  const playerId = assertNonEmptyId("playerId", input.playerId);
  const tableId = assertNonEmptyId("tableId", input.tableId);
  const expectedStateVersion = assertExpectedStateVersion(
    raw.expectedStateVersion,
  );

  if (
    typeof raw.seatNumber !== "number" ||
    !isBlackjackSeatNumber(raw.seatNumber)
  ) {
    throw new RangeError(
      "Blackjack realtime seatNumber must be between 1 and 5",
    );
  }

  if (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0) {
    throw new RangeError(
      "Blackjack realtime nowMs must be a non-negative safe integer",
    );
  }

  const payloadFingerprint = [
    type,
    tableId,
    roundId,
    handId,
    raw.seatNumber,
  ].join("|");

  return Object.freeze({
    envelope: Object.freeze({
      actionId,
      actorPlayerId: playerId,
      type,
      tableId,
      expectedStateVersion,
      roundId,
      handId,
      seatNumber: raw.seatNumber,
      payloadFingerprint,
    }),
    nowMs: input.nowMs,
    ...(type === "DOUBLE" || type === "SPLIT"
      ? {
          reservationId:
            "blackjack:" + tableId + ":" + actionId + ":reservation",
          reserveTransactionId:
            "blackjack:" + tableId + ":" + actionId + ":reserve-tx",
        }
      : {}),
  });
}

export function createBlackjackCoordinatorRealtimeActionHandler(
  coordinator: BlackjackPlayerActionCoordinator,
): BlackjackRealtimePlayerActionHandler {
  return async (action) => {
    const result = await coordinator.submit(action);
    return Object.freeze({
      actionId: action.envelope.actionId,
      replayed: result.replayed,
      snapshot: buildBlackjackPublicSnapshot(
        result.table,
        action.nowMs,
      ),
    });
  };
}
