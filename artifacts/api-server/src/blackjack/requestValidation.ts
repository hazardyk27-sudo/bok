import {
  type BlackjackDealSeat,
  type BlackjackServerActionName,
  type BlackjackServerActionRequest,
} from "../../../cascade-8/src/blackjack/serverContract";

const ACTIONS = new Set<BlackjackServerActionName>([
  "deal",
  "hit",
  "stand",
  "double",
  "split",
  "insurance",
  "declineInsurance",
  "next",
]);

function parseDealSeat(value: unknown): BlackjackDealSeat {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("BLACKJACK_INVALID_SEAT");
  }

  const candidate = value as { seatId?: unknown; wager?: unknown };
  if (
    typeof candidate.seatId !== "number" ||
    typeof candidate.wager !== "number"
  ) {
    throw new Error("BLACKJACK_ACTION_INPUT_REQUIRED");
  }

  return {
    seatId: candidate.seatId as BlackjackDealSeat["seatId"],
    wager: candidate.wager,
  };
}

export function parseBlackjackActionRequest(body: unknown): BlackjackServerActionRequest {
  const input = body as {
    expectedRevision?: unknown;
    idempotencyKey?: unknown;
    action?: unknown;
    seats?: unknown;
  };

  if (
    !input ||
    !Number.isSafeInteger(input.expectedRevision) ||
    Number(input.expectedRevision) < 0 ||
    typeof input.idempotencyKey !== "string" ||
    typeof input.action !== "string" ||
    !ACTIONS.has(input.action as BlackjackServerActionName)
  ) {
    throw new Error("BLACKJACK_ACTION_INPUT_REQUIRED");
  }

  if (input.action !== "deal") {
    if (input.seats !== undefined) {
      throw new Error("BLACKJACK_ACTION_SEATS_NOT_ALLOWED");
    }

    return {
      expectedRevision: Number(input.expectedRevision),
      idempotencyKey: input.idempotencyKey,
      action: input.action as BlackjackServerActionName,
    };
  }

  if (!Array.isArray(input.seats)) {
    throw new Error("BLACKJACK_DEAL_SEATS_REQUIRED");
  }

  return {
    expectedRevision: Number(input.expectedRevision),
    idempotencyKey: input.idempotencyKey,
    action: "deal",
    seats: input.seats.map(parseDealSeat),
  };
}
