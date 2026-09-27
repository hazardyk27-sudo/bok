import type {
  BlackjackHand,
  BlackjackHandId,
  BlackjackRound,
  BlackjackSeatNumber,
  BlackjackTurn,
} from "./domain";
import { BLACKJACK_RULES_V1 } from "./rules";

function assertNowMs(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError("Blackjack nowMs must be a non-negative safe integer");
  }
}

function turnDurationMs(): number {
  return BLACKJACK_RULES_V1.turnSeconds * 1_000;
}

function safeTurnEnd(startedAtMs: number): number {
  const end = startedAtMs + turnDurationMs();
  if (!Number.isSafeInteger(end)) {
    throw new RangeError("Blackjack turn timer exceeds safe integer range");
  }
  return end;
}

function isPlayableWaitingHand(hand: BlackjackHand): boolean {
  return hand.status === "WAITING";
}

function findHandIndex(
  hands: readonly BlackjackHand[],
  handId: BlackjackHandId,
): number {
  const index = hands.findIndex((hand) => hand.handId === handId);
  if (index < 0) throw new Error("Blackjack current hand does not exist");
  return index;
}

function orderedHandIds(round: BlackjackRound): readonly BlackjackHandId[] {
  const seenSeats = new Set<number>();
  for (const seatNumber of round.activeSeatOrder) {
    if (seenSeats.has(seatNumber)) {
      throw new Error("Blackjack activeSeatOrder contains duplicate seats");
    }
    seenSeats.add(seatNumber);
  }

  const ids: BlackjackHandId[] = [];
  for (const seatNumber of round.activeSeatOrder) {
    const seatHands = round.hands.filter(
      (hand) => hand.seatNumber === seatNumber,
    );
    if (seatHands.length === 0) {
      throw new Error(
        `Blackjack active seat ${seatNumber} has no hand in the round`,
      );
    }
    for (const hand of seatHands) ids.push(hand.handId);
  }

  if (ids.length !== round.hands.length) {
    throw new Error(
      "Blackjack round contains a hand outside activeSeatOrder",
    );
  }

  if (new Set(ids).size !== ids.length) {
    throw new Error("Blackjack round contains duplicate handId values");
  }

  return Object.freeze(ids);
}

function startHandAtIndex(
  round: BlackjackRound,
  handIndex: number,
  nowMs: number,
): BlackjackRound {
  const target = round.hands[handIndex];
  if (!target || target.status !== "WAITING") {
    throw new Error("Blackjack turn target must be a WAITING hand");
  }

  const hands = round.hands.map((hand, index) =>
    index === handIndex
      ? Object.freeze({ ...hand, status: "ACTIVE" as const })
      : hand,
  );
  const currentTurn: BlackjackTurn = Object.freeze({
    seatNumber: target.seatNumber,
    handId: target.handId,
    startedAtMs: nowMs,
    endsAtMs: safeTurnEnd(nowMs),
  });

  return Object.freeze({
    ...round,
    phase: "PLAYER_TURNS" as const,
    hands: Object.freeze(hands),
    currentTurn,
  });
}

function findNextWaitingHandIndex(
  round: BlackjackRound,
  afterHandId: BlackjackHandId | null,
): number {
  const order = orderedHandIds(round);
  const start =
    afterHandId === null ? 0 : order.indexOf(afterHandId) + 1;

  if (afterHandId !== null && start === 0) {
    throw new Error("Blackjack previous hand is missing from turn order");
  }

  for (let orderIndex = start; orderIndex < order.length; orderIndex += 1) {
    const handIndex = findHandIndex(round.hands, order[orderIndex]);
    if (isPlayableWaitingHand(round.hands[handIndex])) return handIndex;
  }

  return -1;
}

function advanceToNextHandOrDealer(
  round: BlackjackRound,
  afterHandId: BlackjackHandId | null,
  nowMs: number,
): BlackjackRound {
  const nextIndex = findNextWaitingHandIndex(round, afterHandId);
  if (nextIndex >= 0) return startHandAtIndex(round, nextIndex, nowMs);

  return Object.freeze({
    ...round,
    phase: "DEALER_TURN" as const,
    currentTurn: null,
  });
}

export function startBlackjackPlayerTurns(
  round: BlackjackRound,
  nowMs: number,
): BlackjackRound {
  assertNowMs(nowMs);

  if (round.phase !== "INITIAL_DEAL") {
    throw new Error("Blackjack player turns must start after INITIAL_DEAL");
  }
  if (round.currentTurn !== null) {
    throw new Error("Blackjack INITIAL_DEAL cannot already have a current turn");
  }
  if (round.hands.some((hand) => hand.status === "ACTIVE")) {
    throw new Error("Blackjack INITIAL_DEAL cannot contain an ACTIVE hand");
  }

  return advanceToNextHandOrDealer(round, null, nowMs);
}

export function advanceBlackjackTurnAfterHandResolution(
  round: BlackjackRound,
  nowMs: number,
): BlackjackRound {
  assertNowMs(nowMs);

  if (round.phase !== "PLAYER_TURNS" || round.currentTurn === null) {
    throw new Error("Blackjack has no active player turn to advance");
  }

  const currentIndex = findHandIndex(
    round.hands,
    round.currentTurn.handId,
  );
  const currentHand = round.hands[currentIndex];

  if (currentHand.seatNumber !== round.currentTurn.seatNumber) {
    throw new Error("Blackjack current turn seat does not match hand owner");
  }
  if (currentHand.status === "ACTIVE" || currentHand.status === "WAITING") {
    throw new Error(
      "Blackjack current hand must be resolved before advancing turn",
    );
  }

  return advanceToNextHandOrDealer(round, currentHand.handId, nowMs);
}

export function applyBlackjackTurnTimeout(
  round: BlackjackRound,
  nowMs: number,
): BlackjackRound {
  assertNowMs(nowMs);

  if (round.phase !== "PLAYER_TURNS" || round.currentTurn === null) {
    throw new Error("Blackjack has no active player turn to timeout");
  }

  if (nowMs < round.currentTurn.endsAtMs) return round;

  const currentIndex = findHandIndex(
    round.hands,
    round.currentTurn.handId,
  );
  const currentHand = round.hands[currentIndex];

  if (currentHand.seatNumber !== round.currentTurn.seatNumber) {
    throw new Error("Blackjack current turn seat does not match hand owner");
  }
  if (currentHand.status !== "ACTIVE") {
    throw new Error("Blackjack timeout requires an ACTIVE hand");
  }

  const hands = round.hands.map((hand, index) =>
    index === currentIndex
      ? Object.freeze({ ...hand, status: "STOOD" as const })
      : hand,
  );
  const stoodRound: BlackjackRound = Object.freeze({
    ...round,
    hands: Object.freeze(hands),
    currentTurn: round.currentTurn,
  });

  return advanceToNextHandOrDealer(
    stoodRound,
    currentHand.handId,
    nowMs,
  );
}


export function refreshBlackjackCurrentTurnTimer(
  round: BlackjackRound,
  nowMs: number,
): BlackjackRound {
  assertNowMs(nowMs);

  if (round.phase !== "PLAYER_TURNS" || round.currentTurn === null) {
    throw new Error("Blackjack has no active player turn to refresh");
  }

  const handIndex = findHandIndex(round.hands, round.currentTurn.handId);
  const hand = round.hands[handIndex];
  if (hand.status !== "ACTIVE") {
    throw new Error("Blackjack turn timer refresh requires an ACTIVE hand");
  }
  if (hand.seatNumber !== round.currentTurn.seatNumber) {
    throw new Error("Blackjack current turn seat does not match hand owner");
  }

  return Object.freeze({
    ...round,
    currentTurn: Object.freeze({
      ...round.currentTurn,
      startedAtMs: nowMs,
      endsAtMs: safeTurnEnd(nowMs),
    }),
  });
}

export function getBlackjackTurnRemainingMs(
  round: BlackjackRound,
  nowMs: number,
): number {
  assertNowMs(nowMs);
  if (round.currentTurn === null) return 0;
  return Math.max(0, round.currentTurn.endsAtMs - nowMs);
}

export function getBlackjackOrderedHandIds(
  round: BlackjackRound,
): readonly BlackjackHandId[] {
  return orderedHandIds(round);
}
