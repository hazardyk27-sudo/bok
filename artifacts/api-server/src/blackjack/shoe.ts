import {
  BLACKJACK_DECK_COUNT,
  BLACKJACK_RANKS,
  BLACKJACK_SHOE_SIZE,
  BLACKJACK_SUITS,
  type BlackjackCard,
  type BlackjackRank,
  type BlackjackShoe,
  type BlackjackSuit,
} from "./domain";

export const BLACKJACK_UNSHUFFLED_ALGORITHM_VERSION = "ordered-v1" as const;

function assertShoeId(shoeId: string): void {
  if (!shoeId.trim()) {
    throw new RangeError("Blackjack shoeId must be a non-empty string");
  }
}

function assertCreatedAtMs(createdAtMs: number): void {
  if (!Number.isSafeInteger(createdAtMs) || createdAtMs < 0) {
    throw new RangeError(
      "Blackjack shoe createdAtMs must be a non-negative safe integer",
    );
  }
}

export function createOrderedBlackjackCards(
  shoeId: string,
): readonly BlackjackCard[] {
  assertShoeId(shoeId);

  const cards: BlackjackCard[] = [];

  for (let deckIndex = 0; deckIndex < BLACKJACK_DECK_COUNT; deckIndex += 1) {
    for (const suit of BLACKJACK_SUITS) {
      for (const rank of BLACKJACK_RANKS) {
        cards.push({
          cardId: `${shoeId}:deck-${deckIndex}:${suit}:${rank}`,
          deckIndex,
          suit,
          rank,
        });
      }
    }
  }

  return cards;
}

export function createUnshuffledBlackjackShoe(input: {
  shoeId: string;
  createdAtMs: number;
}): BlackjackShoe {
  assertShoeId(input.shoeId);
  assertCreatedAtMs(input.createdAtMs);

  const cards = createOrderedBlackjackCards(input.shoeId);

  if (!validateBlackjackShoeComposition(cards)) {
    throw new Error("Generated Blackjack shoe failed composition validation");
  }

  return {
    shoeId: input.shoeId,
    cards,
    nextIndex: 0,
    reshufflePending: false,
    createdAtMs: input.createdAtMs,
    shuffleAlgorithmVersion: BLACKJACK_UNSHUFFLED_ALGORITHM_VERSION,
  };
}

function cardFaceKey(suit: BlackjackSuit, rank: BlackjackRank): string {
  return `${suit}:${rank}`;
}

export function validateBlackjackShoeComposition(
  cards: readonly BlackjackCard[],
): boolean {
  if (cards.length !== BLACKJACK_SHOE_SIZE) return false;

  const cardIds = new Set<string>();
  const deckCounts = new Map<number, number>();
  const faceCounts = new Map<string, number>();

  for (const card of cards) {
    if (
      !Number.isInteger(card.deckIndex) ||
      card.deckIndex < 0 ||
      card.deckIndex >= BLACKJACK_DECK_COUNT
    ) {
      return false;
    }

    if (!BLACKJACK_SUITS.includes(card.suit)) return false;
    if (!BLACKJACK_RANKS.includes(card.rank)) return false;
    if (cardIds.has(card.cardId)) return false;

    cardIds.add(card.cardId);
    deckCounts.set(card.deckIndex, (deckCounts.get(card.deckIndex) ?? 0) + 1);

    const faceKey = cardFaceKey(card.suit, card.rank);
    faceCounts.set(faceKey, (faceCounts.get(faceKey) ?? 0) + 1);
  }

  for (let deckIndex = 0; deckIndex < BLACKJACK_DECK_COUNT; deckIndex += 1) {
    if (deckCounts.get(deckIndex) !== 52) return false;
  }

  for (const suit of BLACKJACK_SUITS) {
    for (const rank of BLACKJACK_RANKS) {
      if (faceCounts.get(cardFaceKey(suit, rank)) !== BLACKJACK_DECK_COUNT) {
        return false;
      }
    }
  }

  return cardIds.size === BLACKJACK_SHOE_SIZE;
}
