import type {
  BlackjackCard,
  BlackjackRound,
  BlackjackShoe,
} from "./domain";
import { drawNextBlackjackCard } from "./draw";
import {
  calculateHandValue,
  dealerShouldHit,
} from "./rules";

export type BlackjackDealerTurnResult = Readonly<{
  round: BlackjackRound;
  shoe: BlackjackShoe;
  drawnCards: readonly BlackjackCard[];
  dealerTotal: number;
  dealerBust: boolean;
}>;

function assertPlayerHandsResolved(round: BlackjackRound): void {
  if (round.hands.length === 0) {
    throw new Error("Blackjack DEALER_TURN requires at least one player hand");
  }
  if (
    round.hands.some(
      (hand) => hand.status === "WAITING" || hand.status === "ACTIVE",
    )
  ) {
    throw new Error(
      "Blackjack dealer cannot act while a player hand is unresolved",
    );
  }
}

function allPlayerHandsBust(round: BlackjackRound): boolean {
  return round.hands.every((hand) => hand.status === "BUST");
}

export function playBlackjackDealerTurn(
  round: BlackjackRound,
  shoe: BlackjackShoe,
): BlackjackDealerTurnResult {
  if (round.phase !== "DEALER_TURN") {
    throw new Error("Blackjack dealer engine requires DEALER_TURN phase");
  }
  if (round.currentTurn !== null) {
    throw new Error("Blackjack dealer engine requires no active player turn");
  }

  assertPlayerHandsResolved(round);

  if (round.dealer.cards.length !== 2) {
    throw new Error("Blackjack dealer must begin with exactly two cards");
  }

  let nextShoe = shoe;
  let dealerCards = [...round.dealer.cards];
  const drawnCards: BlackjackCard[] = [];

  if (!allPlayerHandsBust(round)) {
    while (dealerShouldHit(dealerCards)) {
      const draw = drawNextBlackjackCard(nextShoe);
      nextShoe = draw.shoe;
      dealerCards.push(draw.card);
      drawnCards.push(draw.card);
    }
  }

  const value = calculateHandValue(dealerCards);
  const dealerBust = value.total > 21;

  const nextRound: BlackjackRound = Object.freeze({
    ...round,
    phase: "SETTLEMENT" as const,
    dealer: Object.freeze({
      cards: Object.freeze(dealerCards),
      holeCardRevealed: true,
    }),
    currentTurn: null,
  });

  return Object.freeze({
    round: nextRound,
    shoe: nextShoe,
    drawnCards: Object.freeze(drawnCards),
    dealerTotal: value.total,
    dealerBust,
  });
}
