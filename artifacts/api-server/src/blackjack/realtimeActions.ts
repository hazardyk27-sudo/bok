import {
  type BlackjackCoordinatedAction,
  type BlackjackPlayerActionCoordinator,
} from "./actionCoordinator";
import type { BlackjackPublicSnapshot } from "./publicSnapshot";
import { buildBlackjackPublicSnapshot } from "./publicSnapshot";
import { isBlackjackChipDenominationCents } from "./chips";
import { isBlackjackSeatNumber } from "./seats";

export const BLACKJACK_REALTIME_PLAYER_ACTION_TYPES = [
  "HIT",
  "STAND",
  "DOUBLE",
  "SPLIT",
] as const;

export const BLACKJACK_REALTIME_BETTING_ACTION_TYPES = [
  "PLACE_BET",
  "CLEAR_BET",
  "READY",
] as const;

export const BLACKJACK_REALTIME_ACTION_TYPES = [
  ...BLACKJACK_REALTIME_PLAYER_ACTION_TYPES,
  ...BLACKJACK_REALTIME_BETTING_ACTION_TYPES,
] as const;

export type BlackjackRealtimeActionType =
  (typeof BLACKJACK_REALTIME_ACTION_TYPES)[number];

export type BlackjackRealtimePlayerActionHandlerResult = Readonly<{
  actionId: string;
  replayed: boolean;
  snapshot: BlackjackPublicSnapshot;
  betting: Readonly<{
    roundId: string;
    status: "OPEN" | "READY" | "LOCKED";
    betCents: number;
    availableBalanceCents: number;
  }> | null;
}>;

export type BlackjackRealtimePlayerActionHandler = (
  action: BlackjackCoordinatedAction,
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

function assertActionType(value: unknown): BlackjackRealtimeActionType {
  if (
    typeof value !== "string" ||
    !(BLACKJACK_REALTIME_ACTION_TYPES as readonly string[]).includes(
      value,
    )
  ) {
    throw new Error("Blackjack realtime player action type is unsupported");
  }
  return value as BlackjackRealtimeActionType;
}

export function parseBlackjackRealtimePlayerAction(
  value: unknown,
  input: {
    playerId: string;
    tableId: string;
    nowMs: number;
  },
): BlackjackCoordinatedAction {
  if (typeof value !== "object" || value === null) {
    throw new Error("Blackjack realtime player action must be an object");
  }

  const raw = value as Record<string, unknown>;
  const type = assertActionType(raw.type);
  const actionId = assertNonEmptyId("actionId", raw.actionId);
  const roundId = assertNonEmptyId("roundId", raw.roundId);
  const handScoped =
    type === "HIT" ||
    type === "STAND" ||
    type === "DOUBLE" ||
    type === "SPLIT";
  const handId = handScoped ? assertNonEmptyId("handId", raw.handId) : null;
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
    handId ?? "-",
    raw.seatNumber,
    type === "PLACE_BET" ? raw.chipValueCents : "-",
  ].join("|");

  const envelope = Object.freeze({
    actionId,
    actorPlayerId: playerId,
    type,
    tableId,
    expectedStateVersion,
    roundId,
    handId,
    seatNumber: raw.seatNumber,
    payloadFingerprint,
  }) as BlackjackCoordinatedAction["envelope"];

  return Object.freeze({
    envelope,
    nowMs: input.nowMs,
    ...(type === "DOUBLE" || type === "SPLIT"
      ? {
          reservationId:
            "blackjack:" + tableId + ":" + actionId + ":reservation",
          reserveTransactionId:
            "blackjack:" + tableId + ":" + actionId + ":reserve-tx",
        }
      : {}),
    ...(type === "PLACE_BET"
      ? (() => {
          if (
            typeof raw.chipValueCents !== "number" ||
            !isBlackjackChipDenominationCents(raw.chipValueCents)
          ) {
            throw new RangeError(
              "Blackjack realtime chipValueCents is not a valid denomination",
            );
          }
          return {
            chipValueCents: raw.chipValueCents,
            reservationId:
              "blackjack:" + tableId + ":" + actionId + ":bet-reservation",
            reserveTransactionId:
              "blackjack:" + tableId + ":" + actionId + ":bet-reserve-tx",
          };
        })()
      : {}),
    ...(type === "CLEAR_BET"
      ? {
          clearTransactionId:
            "blackjack:" + tableId + ":" + actionId + ":clear-bet-tx",
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
      betting: result.betting,
    });
  };
}
