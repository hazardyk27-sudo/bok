import type {
  BlackjackCard,
  BlackjackHand,
  BlackjackHandId,
  BlackjackRound,
  BlackjackSeatNumber,
  BlackjackShoe,
} from "./domain";
import { drawNextBlackjackCard } from "./draw";
import { calculateHandValue, canHit } from "./rules";
import {
  advanceBlackjackTurnAfterHandResolution,
  refreshBlackjackCurrentTurnTimer,
} from "./turnEngine";

export type BlackjackHitResult = Readonly<{
  round: BlackjackRound;
  shoe: BlackjackShoe;
  card: BlackjackCard;
  handId: BlackjackHandId;
  handTotal: number;
  turnAdvanced: boolean;
}>;

function assertNowMs(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError("Blackjack nowMs must be a non-negative safe integer");
  }
}

function freezeHandWithCard(
  hand: BlackjackHand,
  card: BlackjackCard,
  status: BlackjackHand["status"],
): BlackjackHand {
  return Object.freeze({
    ...hand,
    cards: Object.freeze([...hand.cards, card]),
    status,
  });
}

export function hitBlackjackCurrentHand(
  round: BlackjackRound,
  shoe: BlackjackShoe,
  input: {
    expectedHandId: BlackjackHandId;
    expectedSeatNumber: BlackjackSeatNumber;
    nowMs: number;
  },
): BlackjackHitResult {
  assertNowMs(input.nowMs);

  if (round.phase !== "PLAYER_TURNS" || round.currentTurn === null) {
    throw new Error("Blackjack HIT requires an active player turn");
  }
  if (
    round.currentTurn.handId !== input.expectedHandId ||
    round.currentTurn.seatNumber !== input.expectedSeatNumber
  ) {
    throw new Error("Blackjack HIT targets a stale or foreign turn");
  }
  if (input.nowMs >= round.currentTurn.endsAtMs) {
    throw new Error("Blackjack HIT arrived after the turn deadline");
  }

  const handIndex = round.hands.findIndex(
    (hand) => hand.handId === input.expectedHandId,
  );
  if (handIndex < 0) {
    throw new Error("Blackjack HIT target hand does not exist");
  }

  const currentHand = round.hands[handIndex];
  if (currentHand.seatNumber !== input.expectedSeatNumber) {
    throw new Error("Blackjack HIT seat does not own the target hand");
  }
  if (!canHit(currentHand)) {
    throw new Error("Blackjack HIT is not legal for the current hand");
  }

  const draw = drawNextBlackjackCard(shoe);
  const nextCards = [...currentHand.cards, draw.card];
  const value = calculateHandValue(nextCards);

  let status: BlackjackHand["status"] = "ACTIVE";
  if (value.total > 21) status = "BUST";
  else if (value.total === 21) status = "STOOD";

  const nextHand = freezeHandWithCard(currentHand, draw.card, status);
  const hands = Object.freeze(
    round.hands.map((hand, index) =>
      index === handIndex ? nextHand : hand,
    ),
  );
  const updatedRound: BlackjackRound = Object.freeze({
    ...round,
    hands,
  });

  if (status === "ACTIVE") {
    const refreshed = refreshBlackjackCurrentTurnTimer(
      updatedRound,
      input.nowMs,
    );
    return Object.freeze({
      round: refreshed,
      shoe: draw.shoe,
      card: draw.card,
      handId: currentHand.handId,
      handTotal: value.total,
      turnAdvanced: false,
    });
  }

  const advanced = advanceBlackjackTurnAfterHandResolution(
    updatedRound,
    input.nowMs,
  );

  return Object.freeze({
    round: advanced,
    shoe: draw.shoe,
    card: draw.card,
    handId: currentHand.handId,
    handTotal: value.total,
    turnAdvanced: true,
  });
}
