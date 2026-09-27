import { describe, expect, it } from "vitest";
import { BLACKJACK_SHOE_SIZE, type BlackjackCard } from "./domain";
import {
  BLACKJACK_SHUFFLE_ALGORITHM_VERSION,
  createShuffledBlackjackShoe,
  secureShuffleBlackjackCards,
} from "./shuffle";
import {
  createOrderedBlackjackCards,
  validateBlackjackShoeComposition,
} from "./shoe";

describe("blackjack secure shuffle", () => {
  it("preserves the exact six-deck card set", () => {
    const ordered = createOrderedBlackjackCards("shoe-secure");
    const orderedIds = [...ordered.map((card) => card.cardId)].sort();

    const shuffled = secureShuffleBlackjackCards(ordered);
    const shuffledIds = [...shuffled.map((card) => card.cardId)].sort();

    expect(shuffled).toHaveLength(BLACKJACK_SHOE_SIZE);
    expect(validateBlackjackShoeComposition(shuffled)).toBe(true);
    expect(shuffledIds).toEqual(orderedIds);
  });

  it("does not mutate the source card order", () => {
    const ordered = createOrderedBlackjackCards("shoe-immutable");
    const before = ordered.map((card) => card.cardId);

    const shuffled = secureShuffleBlackjackCards(ordered);

    expect(ordered.map((card) => card.cardId)).toEqual(before);
    expect(shuffled).not.toBe(ordered);
    expect(Object.isFrozen(shuffled)).toBe(true);
  });

  it("builds a fresh server-authoritative shuffled shoe with locked metadata", () => {
    const shoe = createShuffledBlackjackShoe({
      shoeId: "shoe-live-001",
      createdAtMs: 5_000,
    });

    expect(shoe.shoeId).toBe("shoe-live-001");
    expect(shoe.cards).toHaveLength(312);
    expect(shoe.nextIndex).toBe(0);
    expect(shoe.reshufflePending).toBe(false);
    expect(shoe.createdAtMs).toBe(5_000);
    expect(shoe.shuffleAlgorithmVersion).toBe(
      BLACKJACK_SHUFFLE_ALGORITHM_VERSION,
    );
    expect(Object.isFrozen(shoe)).toBe(true);
    expect(Object.isFrozen(shoe.cards)).toBe(true);
  });

  it("rejects corrupted input instead of shuffling an invalid shoe", () => {
    const ordered = createOrderedBlackjackCards("shoe-corrupt");
    const corrupt = ordered.slice(0, -1);

    expect(() => secureShuffleBlackjackCards(corrupt)).toThrow(
      /valid six-deck shoe composition/,
    );

    const duplicate: BlackjackCard[] = ordered.map((card) => ({ ...card }));
    duplicate[1] = { ...duplicate[1], cardId: duplicate[0].cardId };

    expect(() => secureShuffleBlackjackCards(duplicate)).toThrow(
      /valid six-deck shoe composition/,
    );
  });
});
