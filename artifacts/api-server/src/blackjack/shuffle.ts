import { randomInt } from "node:crypto";
import type { BlackjackCard, BlackjackShoe } from "./domain";
import {
  createUnshuffledBlackjackShoe,
  validateBlackjackShoeComposition,
} from "./shoe";

export const BLACKJACK_SHUFFLE_ALGORITHM_VERSION =
  "fisher-yates-node-crypto-randomInt-v1" as const;

export function secureShuffleBlackjackCards(
  cards: readonly BlackjackCard[],
): readonly BlackjackCard[] {
  if (!validateBlackjackShoeComposition(cards)) {
    throw new RangeError(
      "Blackjack secure shuffle requires a valid six-deck shoe composition",
    );
  }

  const shuffled = [...cards];

  for (let currentIndex = shuffled.length - 1; currentIndex > 0; currentIndex -= 1) {
    const swapIndex = randomInt(currentIndex + 1);
    const current = shuffled[currentIndex];
    shuffled[currentIndex] = shuffled[swapIndex];
    shuffled[swapIndex] = current;
  }

  if (!validateBlackjackShoeComposition(shuffled)) {
    throw new Error("Blackjack secure shuffle corrupted shoe composition");
  }

  return Object.freeze(shuffled);
}

export function createShuffledBlackjackShoe(input: {
  shoeId: string;
  createdAtMs: number;
}): BlackjackShoe {
  const unshuffled = createUnshuffledBlackjackShoe(input);
  const cards = secureShuffleBlackjackCards(unshuffled.cards);

  return Object.freeze({
    ...unshuffled,
    cards,
    shuffleAlgorithmVersion: BLACKJACK_SHUFFLE_ALGORITHM_VERSION,
  });
}
