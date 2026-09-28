import { describe, expect, it } from "vitest";
import type { BlackjackShoe } from "./domain";
import {
  BlackjackShoeExhaustedError,
  drawNextBlackjackCard,
  getBlackjackShoeRemainingCards,
} from "./draw";
import { createShuffledBlackjackShoe } from "./shuffle";
import { createUnshuffledBlackjackShoe } from "./shoe";

describe("blackjack authoritative shoe cursor", () => {
  it("draws exactly the card at nextIndex and advances by one", () => {
    const shoe = createUnshuffledBlackjackShoe({
      shoeId: "shoe-draw-1",
      createdAtMs: 1,
    });
    const originalIndex = shoe.nextIndex;
    const expectedCard = shoe.cards[originalIndex];

    const result = drawNextBlackjackCard(shoe);

    expect(result.card).toBe(expectedCard);
    expect(result.shoe.nextIndex).toBe(originalIndex + 1);
    expect(shoe.nextIndex).toBe(originalIndex);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.shoe)).toBe(true);
  });

  it("consumes the shoe in its locked order without duplicates or skips", () => {
    let shoe = createShuffledBlackjackShoe({
      shoeId: "shoe-draw-sequence",
      createdAtMs: 2,
    });
    const expectedIds = shoe.cards.map((card) => card.cardId);
    const drawnIds: string[] = [];

    while (getBlackjackShoeRemainingCards(shoe) > 0) {
      const result = drawNextBlackjackCard(shoe);
      drawnIds.push(result.card.cardId);
      shoe = result.shoe;
    }

    expect(drawnIds).toEqual(expectedIds);
    expect(new Set(drawnIds).size).toBe(312);
    expect(shoe.nextIndex).toBe(312);
    expect(getBlackjackShoeRemainingCards(shoe)).toBe(0);
  });

  it("never wraps around or silently creates a new shoe when exhausted", () => {
    let shoe = createUnshuffledBlackjackShoe({
      shoeId: "shoe-exhaust",
      createdAtMs: 3,
    });

    for (let index = 0; index < shoe.cards.length; index += 1) {
      shoe = drawNextBlackjackCard(shoe).shoe;
    }

    expect(() => drawNextBlackjackCard(shoe)).toThrow(
      BlackjackShoeExhaustedError,
    );
    expect(shoe.nextIndex).toBe(shoe.cards.length);
  });

  it("rejects corrupted persisted cursors", () => {
    const shoe = createUnshuffledBlackjackShoe({
      shoeId: "shoe-corrupt-cursor",
      createdAtMs: 4,
    });

    const negative = { ...shoe, nextIndex: -1 } as BlackjackShoe;
    const tooLarge = {
      ...shoe,
      nextIndex: shoe.cards.length + 1,
    } as BlackjackShoe;
    const fractional = { ...shoe, nextIndex: 1.5 } as BlackjackShoe;

    expect(() => getBlackjackShoeRemainingCards(negative)).toThrow(
      /nextIndex/,
    );
    expect(() => drawNextBlackjackCard(tooLarge)).toThrow(/nextIndex/);
    expect(() => drawNextBlackjackCard(fractional)).toThrow(/nextIndex/);
  });
});
