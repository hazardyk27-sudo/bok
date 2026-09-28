import type {
  BlackjackCard,
  BlackjackHand,
  BlackjackHandId,
  BlackjackRound,
  BlackjackSeatNumber,
  BlackjackShoe,
  BlackjackUserId,
} from "./domain";
import {
  drawNextBlackjackCard,
  getBlackjackShoeRemainingCards,
} from "./draw";
import {
  type BlackjackReservationBook,
  reserveBlackjackWager,
} from "./reservations";
import {
  BLACKJACK_RULES_V1,
  calculateHandValue,
  canSplit,
} from "./rules";
import {
  advanceBlackjackTurnAfterHandResolution,
  refreshBlackjackCurrentTurnTimer,
} from "./turnEngine";
import type { BlackjackWalletLedgerState } from "./walletLedger";

export type BlackjackSplitResult = Readonly<{
  round: BlackjackRound;
  shoe: BlackjackShoe;
  wallet: BlackjackWalletLedgerState;
  book: BlackjackReservationBook;
  leftCard: BlackjackCard;
  rightCard: BlackjackCard;
  leftHandId: BlackjackHandId;
  rightHandId: BlackjackHandId;
  reservationId: string;
}>;

function assertNowMs(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError("Blackjack nowMs must be a non-negative safe integer");
  }
}

function assertNonEmptyId(label: string, value: string): void {
  if (!value.trim()) {
    throw new RangeError(`Blackjack ${label} must be a non-empty string`);
  }
}

function createRightSplitHandId(
  hand: BlackjackHand,
  currentPlayerHandCount: number,
): BlackjackHandId {
  return `${hand.handId}:split-${hand.splitDepth + 1}:${currentPlayerHandCount + 1}`;
}

function openingStatus(
  cards: readonly BlackjackCard[],
  isSplitAce: boolean,
): BlackjackHand["status"] {
  if (isSplitAce && !BLACKJACK_RULES_V1.hitSplitAces) return "STOOD";
  return calculateHandValue(cards).total === 21 ? "STOOD" : "WAITING";
}

export function splitBlackjackCurrentHand(
  round: BlackjackRound,
  shoe: BlackjackShoe,
  wallet: BlackjackWalletLedgerState,
  book: BlackjackReservationBook,
  input: {
    expectedHandId: BlackjackHandId;
    expectedSeatNumber: BlackjackSeatNumber;
    userId: BlackjackUserId;
    reservationId: string;
    reserveTransactionId: string;
    nowMs: number;
  },
): BlackjackSplitResult {
  assertNowMs(input.nowMs);
  assertNonEmptyId("reservationId", input.reservationId);
  assertNonEmptyId("reserveTransactionId", input.reserveTransactionId);
  assertNonEmptyId("userId", input.userId);

  if (round.phase !== "PLAYER_TURNS" || round.currentTurn === null) {
    throw new Error("Blackjack SPLIT requires an active player turn");
  }
  if (
    round.currentTurn.handId !== input.expectedHandId ||
    round.currentTurn.seatNumber !== input.expectedSeatNumber
  ) {
    throw new Error("Blackjack SPLIT targets a stale or foreign turn");
  }
  if (input.nowMs >= round.currentTurn.endsAtMs) {
    throw new Error("Blackjack SPLIT arrived after the turn deadline");
  }

  const handIndex = round.hands.findIndex(
    (hand) => hand.handId === input.expectedHandId,
  );
  if (handIndex < 0) {
    throw new Error("Blackjack SPLIT target hand does not exist");
  }

  const currentHand = round.hands[handIndex];
  if (currentHand.seatNumber !== input.expectedSeatNumber) {
    throw new Error("Blackjack SPLIT seat does not own the target hand");
  }

  const currentPlayerHandCount = round.hands.filter(
    (hand) => hand.playerId === currentHand.playerId,
  ).length;

  if (
    !canSplit(
      currentHand,
      { currentPlayerHandCount },
      BLACKJACK_RULES_V1,
    )
  ) {
    throw new Error("Blackjack SPLIT is not legal for the current hand");
  }

  if (getBlackjackShoeRemainingCards(shoe) < 2) {
    throw new Error("Blackjack SPLIT requires two opening cards in the shoe");
  }

  const rightHandId = createRightSplitHandId(
    currentHand,
    currentPlayerHandCount,
  );
  if (round.hands.some((hand) => hand.handId === rightHandId)) {
    throw new Error("Blackjack SPLIT generated a duplicate handId");
  }

  const reserved = reserveBlackjackWager(wallet, book, {
    reservationId: input.reservationId,
    reserveTransactionId: input.reserveTransactionId,
    userId: input.userId,
    roundId: round.roundId,
    handId: rightHandId,
    kind: "SPLIT",
    amountCents: currentHand.betCents,
    createdAtMs: input.nowMs,
  });

  const leftDraw = drawNextBlackjackCard(shoe);
  const rightDraw = drawNextBlackjackCard(leftDraw.shoe);

  const firstOriginalCard = currentHand.cards[0];
  const secondOriginalCard = currentHand.cards[1];
  if (!firstOriginalCard || !secondOriginalCard) {
    throw new Error("Blackjack SPLIT requires exactly two source cards");
  }

  const splitDepth = currentHand.splitDepth + 1;
  const isSplitAce = firstOriginalCard.rank === "A";

  const leftCards = Object.freeze([firstOriginalCard, leftDraw.card]);
  const rightCards = Object.freeze([secondOriginalCard, rightDraw.card]);

  const leftOpeningStatus = openingStatus(leftCards, isSplitAce);
  const rightOpeningStatus = openingStatus(rightCards, isSplitAce);

  const leftHand: BlackjackHand = Object.freeze({
    ...currentHand,
    cards: leftCards,
    status:
      leftOpeningStatus === "WAITING" ? "ACTIVE" : leftOpeningStatus,
    origin: "SPLIT",
    splitDepth,
    isSplitAce,
    isDoubled: false,
    result: null,
    payoutCents: 0,
  });

  const rightHand: BlackjackHand = Object.freeze({
    ...currentHand,
    handId: rightHandId,
    cards: rightCards,
    status: rightOpeningStatus,
    origin: "SPLIT",
    splitDepth,
    isSplitAce,
    isDoubled: false,
    result: null,
    payoutCents: 0,
  });

  const hands = Object.freeze([
    ...round.hands.slice(0, handIndex),
    leftHand,
    rightHand,
    ...round.hands.slice(handIndex + 1),
  ]);

  const splitRound: BlackjackRound = Object.freeze({
    ...round,
    hands,
  });

  const nextRound =
    leftHand.status === "ACTIVE"
      ? refreshBlackjackCurrentTurnTimer(splitRound, input.nowMs)
      : advanceBlackjackTurnAfterHandResolution(splitRound, input.nowMs);

  return Object.freeze({
    round: nextRound,
    shoe: rightDraw.shoe,
    wallet: reserved.wallet,
    book: reserved.book,
    leftCard: leftDraw.card,
    rightCard: rightDraw.card,
    leftHandId: leftHand.handId,
    rightHandId,
    reservationId: reserved.reservation.reservationId,
  });
}
