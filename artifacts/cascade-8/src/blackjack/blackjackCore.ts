export type BlackjackSuit = "clubs" | "diamonds" | "hearts" | "spades";

export type BlackjackRank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export type BlackjackCard = {
  id: string;
  suit: BlackjackSuit;
  rank: BlackjackRank;
  deck: number;
};

export type BlackjackHandValue = {
  total: number;
  soft: boolean;
  blackjack: boolean;
  bust: boolean;
};

export const BLACKJACK_SUITS: readonly BlackjackSuit[] = [
  "clubs",
  "diamonds",
  "hearts",
  "spades",
];

export const BLACKJACK_RANKS: readonly BlackjackRank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

export function getBlackjackRankValue(rank: BlackjackRank): number {
  if (rank === "A") {
    return 11;
  }

  if (rank === "J" || rank === "Q" || rank === "K") {
    return 10;
  }

  return Number(rank);
}

export function evaluateBlackjackHand(cards: readonly BlackjackCard[]): BlackjackHandValue {
  let total = 0;
  let acesAsEleven = 0;

  for (const card of cards) {
    total += getBlackjackRankValue(card.rank);
    if (card.rank === "A") {
      acesAsEleven += 1;
    }
  }

  while (total > 21 && acesAsEleven > 0) {
    total -= 10;
    acesAsEleven -= 1;
  }

  return {
    total,
    soft: acesAsEleven > 0,
    blackjack: cards.length === 2 && total === 21,
    bust: total > 21,
  };
}

export function dealerShouldHit(
  cards: readonly BlackjackCard[],
  hitSoft17 = true,
): boolean {
  const hand = evaluateBlackjackHand(cards);

  if (hand.bust) {
    return false;
  }

  if (hand.total < 17) {
    return true;
  }

  return hitSoft17 && hand.total === 17 && hand.soft;
}
