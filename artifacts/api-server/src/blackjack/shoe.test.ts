import { describe, expect, it } from "vitest";
import {
  BLACKJACK_DECK_COUNT,
  BLACKJACK_RANKS,
  BLACKJACK_SHOE_SIZE,
  BLACKJACK_SUITS,
  type BlackjackCard,
} from "./domain";
import {
  BLACKJACK_UNSHUFFLED_ALGORITHM_VERSION,
  createOrderedBlackjackCards,
  createUnshuffledBlackjackShoe,
  validateBlackjackShoeComposition,
} from "./shoe";

describe("blackjack six-deck shoe construction", () => {
  it("creates exactly 312 physical cards", () => {
    const cards = createOrderedBlackjackCards("shoe-test");

    expect(cards).toHaveLength(BLACKJACK_SHOE_SIZE);
    expect(BLACKJACK_SHOE_SIZE).toBe(312);
  });

  it("creates 52 cards in each of six physical decks", () => {
    const cards = createOrderedBlackjackCards("shoe-test");

    for (let deckIndex = 0; deckIndex < BLACKJACK_DECK_COUNT; deckIndex += 1) {
      expect(cards.filter((card) => card.deckIndex === deckIndex)).toHaveLength(52);
    }
  });

  it("creates every suit/rank face exactly six times across the shoe", () => {
    const cards = createOrderedBlackjackCards("shoe-test");

    for (const suit of BLACKJACK_SUITS) {
      for (const rank of BLACKJACK_RANKS) {
        expect(
          cards.filter((card) => card.suit === suit && card.rank === rank),
        ).toHaveLength(BLACKJACK_DECK_COUNT);
      }
    }
  });

  it("gives all 312 physical cards unique cardIds", () => {
    const cards = createOrderedBlackjackCards("shoe-test");
    const ids = new Set(cards.map((card) => card.cardId));

    expect(ids.size).toBe(BLACKJACK_SHOE_SIZE);

    const spadeAces = cards.filter(
      (card) => card.suit === "SPADES" && card.rank === "A",
    );
    expect(spadeAces).toHaveLength(6);
    expect(new Set(spadeAces.map((card) => card.cardId)).size).toBe(6);
  });

  it("initializes an unconsumed, non-pending shoe", () => {
    const shoe = createUnshuffledBlackjackShoe({
      shoeId: "shoe-001",
      createdAtMs: 1_000,
    });

    expect(shoe.shoeId).toBe("shoe-001");
    expect(shoe.cards).toHaveLength(312);
    expect(shoe.nextIndex).toBe(0);
    expect(shoe.reshufflePending).toBe(false);
    expect(shoe.createdAtMs).toBe(1_000);
    expect(shoe.shuffleAlgorithmVersion).toBe(
      BLACKJACK_UNSHUFFLED_ALGORITHM_VERSION,
    );
  });

  it("accepts a correct shoe composition and rejects corrupted shoes", () => {
    const cards = createOrderedBlackjackCards("shoe-test");
    expect(validateBlackjackShoeComposition(cards)).toBe(true);

    expect(validateBlackjackShoeComposition(cards.slice(0, -1))).toBe(false);

    const duplicateId: BlackjackCard[] = cards.map((card) => ({ ...card }));
    duplicateId[1] = { ...duplicateId[1], cardId: duplicateId[0].cardId };
    expect(validateBlackjackShoeComposition(duplicateId)).toBe(false);

    const invalidDeck: BlackjackCard[] = cards.map((card) => ({ ...card }));
    invalidDeck[0] = { ...invalidDeck[0], deckIndex: 99 };
    expect(validateBlackjackShoeComposition(invalidDeck)).toBe(false);

    const duplicatedFace: BlackjackCard[] = cards.map((card) => ({ ...card }));
    duplicatedFace[0] = {
      ...duplicatedFace[0],
      suit: duplicatedFace[1].suit,
      rank: duplicatedFace[1].rank,
    };
    expect(validateBlackjackShoeComposition(duplicatedFace)).toBe(false);
  });

  it("rejects invalid shoe identity metadata", () => {
    expect(() => createOrderedBlackjackCards("   ")).toThrow(/shoeId/);

    expect(() =>
      createUnshuffledBlackjackShoe({
        shoeId: "shoe-test",
        createdAtMs: -1,
      }),
    ).toThrow(/createdAtMs/);

    expect(() =>
      createUnshuffledBlackjackShoe({
        shoeId: "shoe-test",
        createdAtMs: 1.5,
      }),
    ).toThrow(/createdAtMs/);
  });
});
