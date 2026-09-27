import { describe, expect, it } from "vitest";
import type { BlackjackCard, BlackjackHand } from "./domain";
import {
  BLACKJACK_RULES_V1,
  calculateHandValue,
  calculateSettlementReturnCents,
  canDouble,
  canHit,
  canSplit,
  dealerShouldHit,
  isNaturalBlackjack,
  resolveHandResult,
} from "./rules";

let serial = 0;

function card(rank: BlackjackCard["rank"], suit: BlackjackCard["suit"] = "SPADES"): BlackjackCard {
  serial += 1;
  return {
    cardId: `test-card-${serial}`,
    deckIndex: 0,
    rank,
    suit,
  };
}

function hand(
  cards: readonly BlackjackCard[],
  overrides: Partial<BlackjackHand> = {},
): BlackjackHand {
  return {
    handId: "hand-1",
    playerId: "player-1",
    seatNumber: 1,
    cards,
    betCents: 10_000,
    status: "ACTIVE",
    origin: "INITIAL",
    splitDepth: 0,
    isSplitAce: false,
    isDoubled: false,
    result: null,
    payoutCents: 0,
    ...overrides,
  };
}

describe("blackjack rule engine", () => {
  it("evaluates hard and soft Ace totals correctly", () => {
    expect(calculateHandValue([card("A"), card("6")])).toEqual({
      total: 17,
      isSoft: true,
      aceCount: 1,
    });

    expect(calculateHandValue([card("A"), card("6"), card("10")])).toEqual({
      total: 17,
      isSoft: false,
      aceCount: 1,
    });

    expect(calculateHandValue([card("A"), card("A"), card("9")])).toEqual({
      total: 21,
      isSoft: true,
      aceCount: 2,
    });

    expect(calculateHandValue([card("A"), card("A"), card("9"), card("K")])).toEqual({
      total: 21,
      isSoft: false,
      aceCount: 2,
    });
  });

  it("treats only an initial two-card 21 as natural Blackjack", () => {
    expect(isNaturalBlackjack(hand([card("A"), card("K")]))).toBe(true);
    expect(
      isNaturalBlackjack(
        hand([card("A"), card("K")], { origin: "SPLIT", splitDepth: 1 }),
      ),
    ).toBe(false);
    expect(
      isNaturalBlackjack(hand([card("7"), card("7"), card("7")])),
    ).toBe(false);
  });

  it("stands on soft 17 under the locked V1 dealer rule", () => {
    expect(BLACKJACK_RULES_V1.dealerSoft17).toBe("STAND");
    expect(dealerShouldHit([card("A"), card("6")])).toBe(false);
    expect(dealerShouldHit([card("10"), card("6")])).toBe(true);
    expect(dealerShouldHit([card("10"), card("7")])).toBe(false);
  });

  it("allows Double only on an eligible two-card active hand", () => {
    expect(canDouble(hand([card("5"), card("6")]))).toBe(true);
    expect(canDouble(hand([card("5"), card("3"), card("2")]))).toBe(false);
    expect(
      canDouble(hand([card("5"), card("6")], { status: "STOOD" })),
    ).toBe(false);
    expect(
      canDouble(hand([card("5"), card("6")], { isDoubled: true })),
    ).toBe(false);
  });

  it("supports Double After Split but blocks locked split-Ace hits in V1", () => {
    const splitHand = hand([card("5"), card("6")], {
      origin: "SPLIT",
      splitDepth: 1,
    });
    expect(BLACKJACK_RULES_V1.doubleAfterSplit).toBe(true);
    expect(canDouble(splitHand)).toBe(true);

    const splitAceHand = hand([card("A"), card("9")], {
      origin: "SPLIT",
      splitDepth: 1,
      isSplitAce: true,
    });
    expect(canDouble(splitAceHand)).toBe(false);
    expect(canHit(splitAceHand)).toBe(false);
  });

  it("splits only equal ranks and respects hand-count / Ace rules", () => {
    expect(
      canSplit(hand([card("8"), card("8")]), { currentPlayerHandCount: 1 }),
    ).toBe(true);

    expect(
      canSplit(hand([card("K"), card("Q")]), { currentPlayerHandCount: 1 }),
    ).toBe(false);

    expect(
      canSplit(hand([card("8"), card("8")]), {
        currentPlayerHandCount: BLACKJACK_RULES_V1.maxSplitHands,
      }),
    ).toBe(false);

    expect(
      canSplit(
        hand([card("A"), card("A")], {
          origin: "SPLIT",
          splitDepth: 1,
          isSplitAce: true,
        }),
        { currentPlayerHandCount: 2 },
      ),
    ).toBe(false);
  });

  it("resolves natural Blackjack before ordinary 21", () => {
    expect(
      resolveHandResult(
        hand([card("A"), card("K")]),
        [card("10"), card("9")],
      ),
    ).toBe("BLACKJACK_WIN");

    expect(
      resolveHandResult(
        hand([card("7"), card("7"), card("7")]),
        [card("10"), card("9")],
      ),
    ).toBe("WIN");

    expect(
      resolveHandResult(
        hand([card("A"), card("K")]),
        [card("A"), card("Q")],
      ),
    ).toBe("PUSH");
  });

  it("returns settlement amounts including the reserved stake", () => {
    expect(calculateSettlementReturnCents("LOSS", 10_000)).toBe(0);
    expect(calculateSettlementReturnCents("PUSH", 10_000)).toBe(10_000);
    expect(calculateSettlementReturnCents("WIN", 10_000)).toBe(20_000);
    expect(calculateSettlementReturnCents("BLACKJACK_WIN", 10_000)).toBe(25_000);
  });

  it("rejects non-exact or unsafe payout math instead of rounding money", () => {
    expect(() =>
      calculateSettlementReturnCents("BLACKJACK_WIN", 1),
    ).toThrow(/exactly/);

    expect(() =>
      calculateSettlementReturnCents("WIN", Number.MAX_SAFE_INTEGER),
    ).toThrow(/safe integer/);
  });
});
