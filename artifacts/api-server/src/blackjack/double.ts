import type {
  BlackjackCard,
  BlackjackHand,
  BlackjackHandId,
  BlackjackRound,
  BlackjackSeatNumber,
  BlackjackShoe,
  BlackjackUserId,
} from "./domain";
import { drawNextBlackjackCard } from "./draw";
import {
  type BlackjackReservationBook,
  reserveBlackjackWager,
} from "./reservations";
import { calculateHandValue, canDouble } from "./rules";
import { advanceBlackjackTurnAfterHandResolution } from "./turnEngine";
import type { BlackjackWalletLedgerState } from "./walletLedger";

export type BlackjackDoubleResult = Readonly<{
  round: BlackjackRound;
  shoe: BlackjackShoe;
  wallet: BlackjackWalletLedgerState;
  book: BlackjackReservationBook;
  card: BlackjackCard;
  handId: BlackjackHandId;
  handTotal: number;
  doubledBetCents: number;
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

function safeDoubleBet(betCents: number): number {
  if (!Number.isSafeInteger(betCents) || betCents <= 0) {
    throw new RangeError("Blackjack hand betCents must be a positive safe integer");
  }
  const doubled = betCents * 2;
  if (!Number.isSafeInteger(doubled)) {
    throw new RangeError("Blackjack doubled bet exceeds safe integer range");
  }
  return doubled;
}

export function doubleBlackjackCurrentHand(
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
): BlackjackDoubleResult {
  assertNowMs(input.nowMs);
  assertNonEmptyId("reservationId", input.reservationId);
  assertNonEmptyId("reserveTransactionId", input.reserveTransactionId);
  assertNonEmptyId("userId", input.userId);

  if (round.phase !== "PLAYER_TURNS" || round.currentTurn === null) {
    throw new Error("Blackjack DOUBLE requires an active player turn");
  }
  if (
    round.currentTurn.handId !== input.expectedHandId ||
    round.currentTurn.seatNumber !== input.expectedSeatNumber
  ) {
    throw new Error("Blackjack DOUBLE targets a stale or foreign turn");
  }
  if (input.nowMs >= round.currentTurn.endsAtMs) {
    throw new Error("Blackjack DOUBLE arrived after the turn deadline");
  }

  const handIndex = round.hands.findIndex(
    (hand) => hand.handId === input.expectedHandId,
  );
  if (handIndex < 0) {
    throw new Error("Blackjack DOUBLE target hand does not exist");
  }

  const currentHand = round.hands[handIndex];
  if (currentHand.seatNumber !== input.expectedSeatNumber) {
    throw new Error("Blackjack DOUBLE seat does not own the target hand");
  }
  if (!canDouble(currentHand)) {
    throw new Error("Blackjack DOUBLE is not legal for the current hand");
  }

  const doubledBetCents = safeDoubleBet(currentHand.betCents);

  const reserved = reserveBlackjackWager(wallet, book, {
    reservationId: input.reservationId,
    reserveTransactionId: input.reserveTransactionId,
    userId: input.userId,
    roundId: round.roundId,
    handId: currentHand.handId,
    kind: "DOUBLE",
    amountCents: currentHand.betCents,
    createdAtMs: input.nowMs,
  });

  const draw = drawNextBlackjackCard(shoe);
  const cards = Object.freeze([...currentHand.cards, draw.card]);
  const handTotal = calculateHandValue(cards).total;
  const status: BlackjackHand["status"] =
    handTotal > 21 ? "BUST" : "STOOD";

  const doubledHand: BlackjackHand = Object.freeze({
    ...currentHand,
    cards,
    betCents: doubledBetCents,
    status,
    isDoubled: true,
  });

  const hands = Object.freeze(
    round.hands.map((hand, index) =>
      index === handIndex ? doubledHand : hand,
    ),
  );

  const resolvedRound: BlackjackRound = Object.freeze({
    ...round,
    hands,
  });

  const advancedRound = advanceBlackjackTurnAfterHandResolution(
    resolvedRound,
    input.nowMs,
  );

  return Object.freeze({
    round: advancedRound,
    shoe: draw.shoe,
    wallet: reserved.wallet,
    book: reserved.book,
    card: draw.card,
    handId: currentHand.handId,
    handTotal,
    doubledBetCents,
    reservationId: reserved.reservation.reservationId,
  });
}
