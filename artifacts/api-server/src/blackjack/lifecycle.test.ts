import { describe, expect, it, vi } from "vitest";
import type { BlackjackShoe } from "./domain";
import {
  BLACKJACK_TARGET_PENETRATION,
  getBlackjackShoePenetration,
  markBlackjackReshuffleAfterRound,
  prepareBlackjackShoeBeforeRound,
  shouldReshuffleBlackjackBeforeRound,
} from "./lifecycle";
import { createShuffledBlackjackShoe } from "./shuffle";
import { createUnshuffledBlackjackShoe } from "./shoe";

function withIndex(shoe: BlackjackShoe, nextIndex: number): BlackjackShoe {
  return Object.freeze({
    ...shoe,
    nextIndex,
  });
}

describe("blackjack shoe round-boundary lifecycle", () => {
  it("locks the V1 target penetration at 75 percent", () => {
    expect(BLACKJACK_TARGET_PENETRATION).toBe(0.75);

    const shoe = createUnshuffledBlackjackShoe({
      shoeId: "shoe-penetration",
      createdAtMs: 1,
    });

    expect(getBlackjackShoePenetration(withIndex(shoe, 234))).toBe(0.75);
  });

  it("does not mark reshuffle before the 75 percent threshold", () => {
    const shoe = withIndex(
      createUnshuffledBlackjackShoe({
        shoeId: "shoe-below-cut",
        createdAtMs: 2,
      }),
      233,
    );

    const next = markBlackjackReshuffleAfterRound(shoe);

    expect(next).toBe(shoe);
    expect(next.reshufflePending).toBe(false);
    expect(next.nextIndex).toBe(233);
  });

  it("marks reshuffle only as pending when the threshold is reached", () => {
    const shoe = withIndex(
      createUnshuffledBlackjackShoe({
        shoeId: "shoe-at-cut",
        createdAtMs: 3,
      }),
      234,
    );
    const originalOrder = shoe.cards.map((card) => card.cardId);

    const next = markBlackjackReshuffleAfterRound(shoe);

    expect(next).not.toBe(shoe);
    expect(next.reshufflePending).toBe(true);
    expect(next.nextIndex).toBe(234);
    expect(next.cards.map((card) => card.cardId)).toEqual(originalOrder);
    expect(shoe.reshufflePending).toBe(false);
  });

  it("keeps a previously pending shoe pending without changing it", () => {
    const base = createUnshuffledBlackjackShoe({
      shoeId: "shoe-pending",
      createdAtMs: 4,
    });
    const pending = Object.freeze({
      ...base,
      reshufflePending: true,
    });

    expect(markBlackjackReshuffleAfterRound(pending)).toBe(pending);
  });

  it("can force a fresh shoe before a round when the caller safety floor is not met", () => {
    const current = withIndex(
      createUnshuffledBlackjackShoe({
        shoeId: "shoe-low-reserve",
        createdAtMs: 5,
      }),
      233,
    );

    expect(current.reshufflePending).toBe(false);
    expect(shouldReshuffleBlackjackBeforeRound(current, 80)).toBe(true);
    expect(shouldReshuffleBlackjackBeforeRound(current, 79)).toBe(false);
  });

  it("replaces a pending shoe only at the before-round boundary", () => {
    const base = withIndex(
      createUnshuffledBlackjackShoe({
        shoeId: "shoe-old",
        createdAtMs: 6,
      }),
      234,
    );
    const pending = markBlackjackReshuffleAfterRound(base);
    const createFreshShoe = vi.fn(() =>
      createShuffledBlackjackShoe({
        shoeId: "shoe-new",
        createdAtMs: 7,
      }),
    );

    const prepared = prepareBlackjackShoeBeforeRound({
      currentShoe: pending,
      minimumCardsRequired: 1,
      createFreshShoe,
    });

    expect(createFreshShoe).toHaveBeenCalledTimes(1);
    expect(prepared.shoeId).toBe("shoe-new");
    expect(prepared.nextIndex).toBe(0);
    expect(prepared.reshufflePending).toBe(false);
  });

  it("does not create a fresh shoe when neither cut-card nor safety floor requires it", () => {
    const current = withIndex(
      createUnshuffledBlackjackShoe({
        shoeId: "shoe-keep",
        createdAtMs: 8,
      }),
      100,
    );
    const createFreshShoe = vi.fn(() =>
      createShuffledBlackjackShoe({
        shoeId: "should-not-be-created",
        createdAtMs: 9,
      }),
    );

    const prepared = prepareBlackjackShoeBeforeRound({
      currentShoe: current,
      minimumCardsRequired: 50,
      createFreshShoe,
    });

    expect(prepared).toBe(current);
    expect(createFreshShoe).not.toHaveBeenCalled();
  });

  it("rejects malformed replacement shoes and invalid policy inputs", () => {
    const current = Object.freeze({
      ...createUnshuffledBlackjackShoe({
        shoeId: "shoe-needs-replacement",
        createdAtMs: 10,
      }),
      reshufflePending: true,
    });

    expect(() =>
      prepareBlackjackShoeBeforeRound({
        currentShoe: current,
        minimumCardsRequired: 1,
        createFreshShoe: () =>
          createUnshuffledBlackjackShoe({
            shoeId: current.shoeId,
            createdAtMs: 11,
          }),
      }),
    ).toThrow(/new shoeId/);

    expect(() =>
      shouldReshuffleBlackjackBeforeRound(current, 0),
    ).toThrow(/positive safe integer/);

    expect(() =>
      markBlackjackReshuffleAfterRound(current, 1),
    ).toThrow(/penetration target/);
  });
});
