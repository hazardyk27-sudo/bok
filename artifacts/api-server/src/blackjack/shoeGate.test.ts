import { describe, expect, it } from "vitest";
import { BLACKJACK_SHOE_SIZE } from "./domain";
import { createShuffledBlackjackShoe } from "./shuffle";
import { validateBlackjackShoeComposition } from "./shoe";

describe("blackjack Gate 1 — thousand-shoe integrity", () => {
  it(
    "creates 1,000 valid secure-shuffled shoes with exact physical-card integrity",
    () => {
      const shoeIds = new Set<string>();

      for (let index = 0; index < 1_000; index += 1) {
        const shoeId = `gate1-shoe-${index}`;
        const shoe = createShuffledBlackjackShoe({
          shoeId,
          createdAtMs: index,
        });

        expect(shoe.cards).toHaveLength(BLACKJACK_SHOE_SIZE);
        expect(shoe.nextIndex).toBe(0);
        expect(shoe.reshufflePending).toBe(false);
        expect(validateBlackjackShoeComposition(shoe.cards)).toBe(true);

        const physicalIds = new Set(shoe.cards.map((card) => card.cardId));
        expect(physicalIds.size).toBe(BLACKJACK_SHOE_SIZE);

        shoeIds.add(shoe.shoeId);
      }

      expect(shoeIds.size).toBe(1_000);
    },
    60_000,
  );
});
