import { describe, expect, it } from "vitest";
import {
  dealerShouldHit,
  evaluateBlackjackHand,
  type BlackjackCard,
  type BlackjackRank,
} from "./blackjackCore";
import {
  BLACKJACK_CUT_CARD_PENETRATION,
  BLACKJACK_DECK_COUNT,
  BLACKJACK_SHOE_CARD_COUNT,
  createBlackjackShoe,
  createOrderedBlackjackShoe,
  drawBlackjackCard,
  fisherYatesShuffle,
  reshuffleBlackjackShoeAtRoundBoundary,
  shouldReshuffleBlackjackShoeAtRoundBoundary,
} from "./shoe";

function card(rank: BlackjackRank, index = 0): BlackjackCard {
  return {
    id: `test:${index}:${rank}`,
    rank,
    suit: "spades",
    deck: 1,
  };
}

describe("blackjack card and hand core", () => {
  it("builds a complete six-deck shoe with unique physical card ids", () => {
    const cards = createOrderedBlackjackShoe();

    expect(BLACKJACK_DECK_COUNT).toBe(6);
    expect(BLACKJACK_SHOE_CARD_COUNT).toBe(312);
    expect(cards).toHaveLength(312);
    expect(new Set(cards.map((candidate) => candidate.id)).size).toBe(312);

    const aces = cards.filter((candidate) => candidate.rank === "A");
    const kings = cards.filter((candidate) => candidate.rank === "K");
    expect(aces).toHaveLength(24);
    expect(kings).toHaveLength(24);
  });

  it("Fisher-Yates preserves every card exactly once", () => {
    const source = createOrderedBlackjackShoe(1);
    let sample = 0;
    const shuffled = fisherYatesShuffle(source, () => {
      sample = (sample + 0.173) % 1;
      return sample;
    });

    expect(shuffled).toHaveLength(source.length);
    expect(new Set(shuffled.map((candidate) => candidate.id))).toEqual(
      new Set(source.map((candidate) => candidate.id)),
    );
    expect(shuffled.map((candidate) => candidate.id)).not.toEqual(
      source.map((candidate) => candidate.id),
    );
  });

  it("rejects RNG samples outside [0, 1)", () => {
    expect(() => fisherYatesShuffle([1, 2, 3], () => 1)).toThrow(
      /RNG must return/,
    );
  });

  it("handles soft and hard ace conversion correctly", () => {
    expect(evaluateBlackjackHand([card("A"), card("6", 1)])).toMatchObject({
      total: 17,
      soft: true,
      blackjack: false,
      bust: false,
    });

    expect(
      evaluateBlackjackHand([card("A"), card("6", 1), card("10", 2)]),
    ).toMatchObject({
      total: 17,
      soft: false,
      blackjack: false,
      bust: false,
    });

    expect(
      evaluateBlackjackHand([
        card("A"),
        card("A", 1),
        card("9", 2),
        card("K", 3),
      ]),
    ).toMatchObject({
      total: 21,
      soft: false,
      blackjack: false,
      bust: false,
    });
  });

  it("recognizes natural blackjack only on exactly two cards", () => {
    expect(evaluateBlackjackHand([card("A"), card("K", 1)]).blackjack).toBe(true);
    expect(
      evaluateBlackjackHand([card("7"), card("7", 1), card("7", 2)]).blackjack,
    ).toBe(false);
  });

  it("marks busts after all usable aces have been reduced", () => {
    expect(
      evaluateBlackjackHand([card("K"), card("Q", 1), card("2", 2)]),
    ).toMatchObject({ total: 22, soft: false, bust: true });
  });

  it("dealer hits soft 17 but stands on hard 17 and all 18+ totals", () => {
    expect(dealerShouldHit([card("A"), card("6", 1)])).toBe(true);
    expect(dealerShouldHit([card("10"), card("7", 1)])).toBe(false);
    expect(dealerShouldHit([card("A"), card("7", 1)])).toBe(false);

    expect(dealerShouldHit([card("A"), card("6", 1)], false)).toBe(false);
  });
});

describe("blackjack shoe lifecycle", () => {
  it("places the cut threshold at 75% penetration", () => {
    const shoe = createBlackjackShoe(() => 0.5);

    expect(BLACKJACK_CUT_CARD_PENETRATION).toBe(0.75);
    expect(shoe.cards).toHaveLength(312);
    expect(shoe.cutIndex).toBe(234);
    expect(shoe.nextIndex).toBe(0);
    expect(shoe.shufflePending).toBe(false);
  });

  it("does not reshuffle mid-round when the cut card is crossed", () => {
    let shoe = createBlackjackShoe(() => 0.5);

    for (let index = 0; index < shoe.cutIndex; index += 1) {
      shoe = drawBlackjackCard(shoe).shoe;
    }

    expect(shoe.nextIndex).toBe(234);
    expect(shoe.shufflePending).toBe(true);
    expect(shouldReshuffleBlackjackShoeAtRoundBoundary(shoe)).toBe(true);

    const continued = drawBlackjackCard(shoe).shoe;
    expect(continued.nextIndex).toBe(235);
    expect(continued.shufflePending).toBe(true);
  });

  it("reshuffles only at the round boundary and resets penetration", () => {
    let shoe = createBlackjackShoe(() => 0.5);

    for (let index = 0; index < shoe.cutIndex; index += 1) {
      shoe = drawBlackjackCard(shoe).shoe;
    }

    const reshuffled = reshuffleBlackjackShoeAtRoundBoundary(shoe, () => 0.25);

    expect(reshuffled).not.toBe(shoe);
    expect(reshuffled.nextIndex).toBe(0);
    expect(reshuffled.shufflePending).toBe(false);
    expect(reshuffled.cutIndex).toBe(234);
    expect(reshuffled.cards).toHaveLength(312);
  });

  it("returns the same shoe when the round boundary does not require a shuffle", () => {
    const shoe = createBlackjackShoe(() => 0.5);
    expect(reshuffleBlackjackShoeAtRoundBoundary(shoe, () => 0.25)).toBe(shoe);
  });
});
