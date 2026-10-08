import {
  BLACKJACK_RANKS,
  BLACKJACK_SUITS,
  type BlackjackCard,
} from "./blackjackCore";

export const BLACKJACK_DECK_COUNT = 6;
export const BLACKJACK_CUT_CARD_PENETRATION = 0.75;
export const BLACKJACK_SHOE_CARD_COUNT = BLACKJACK_DECK_COUNT * 52;

export type BlackjackRandom = () => number;

export type BlackjackShoe = {
  cards: BlackjackCard[];
  nextIndex: number;
  cutIndex: number;
  deckCount: number;
  shufflePending: boolean;
};

export function createOrderedBlackjackShoe(
  deckCount = BLACKJACK_DECK_COUNT,
): BlackjackCard[] {
  if (!Number.isInteger(deckCount) || deckCount <= 0) {
    throw new Error("Blackjack deckCount must be a positive integer");
  }

  const cards: BlackjackCard[] = [];

  for (let deck = 1; deck <= deckCount; deck += 1) {
    for (const suit of BLACKJACK_SUITS) {
      for (const rank of BLACKJACK_RANKS) {
        cards.push({
          id: `${deck}:${suit}:${rank}`,
          suit,
          rank,
          deck,
        });
      }
    }
  }

  return cards;
}

export function fisherYatesShuffle<T>(
  source: readonly T[],
  random: BlackjackRandom = Math.random,
): T[] {
  const shuffled = [...source];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new Error("Blackjack RNG must return a finite value in [0, 1)");
    }

    const swapIndex = Math.floor(sample * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

export function createBlackjackShoe(
  random: BlackjackRandom = Math.random,
  deckCount = BLACKJACK_DECK_COUNT,
  penetration = BLACKJACK_CUT_CARD_PENETRATION,
): BlackjackShoe {
  if (!Number.isFinite(penetration) || penetration <= 0 || penetration >= 1) {
    throw new Error("Blackjack penetration must be between 0 and 1");
  }

  const cards = fisherYatesShuffle(createOrderedBlackjackShoe(deckCount), random);

  return {
    cards,
    nextIndex: 0,
    cutIndex: Math.floor(cards.length * penetration),
    deckCount,
    shufflePending: false,
  };
}

export function drawBlackjackCard(shoe: BlackjackShoe): {
  card: BlackjackCard;
  shoe: BlackjackShoe;
} {
  const card = shoe.cards[shoe.nextIndex];
  if (!card) {
    throw new Error("Blackjack shoe exhausted");
  }

  const nextIndex = shoe.nextIndex + 1;

  return {
    card,
    shoe: {
      ...shoe,
      nextIndex,
      shufflePending: shoe.shufflePending || nextIndex >= shoe.cutIndex,
    },
  };
}

export function shouldReshuffleBlackjackShoeAtRoundBoundary(
  shoe: BlackjackShoe,
): boolean {
  return shoe.shufflePending || shoe.nextIndex >= shoe.cutIndex;
}

export function reshuffleBlackjackShoeAtRoundBoundary(
  shoe: BlackjackShoe,
  random: BlackjackRandom = Math.random,
): BlackjackShoe {
  if (!shouldReshuffleBlackjackShoeAtRoundBoundary(shoe)) {
    return shoe;
  }

  return createBlackjackShoe(
    random,
    shoe.deckCount,
    shoe.cutIndex / shoe.cards.length,
  );
}
