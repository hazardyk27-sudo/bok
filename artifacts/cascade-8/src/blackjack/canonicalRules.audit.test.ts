import { describe, expect, it } from "vitest";
import {
  dealerShouldHit,
  evaluateBlackjackHand,
  type BlackjackCard,
  type BlackjackRank,
} from "./blackjackCore";
import {
  BLACKJACK_CANONICAL_RULES,
  formatBlackjackHandTotal,
} from "./canonicalRules";
import {
  BLACKJACK_MAX_HANDS_PER_SEAT,
  canDoubleBlackjackHand,
  canSplitBlackjackHand,
  type BlackjackRoundHand,
  type BlackjackRoundState,
} from "./roundState";
import {
  BLACKJACK_CUT_CARD_PENETRATION,
  BLACKJACK_DECK_COUNT,
} from "./shoe";

function card(rank: BlackjackRank, id: string): BlackjackCard {
  return { id, rank, suit: "spades", deck: 1 };
}

function hand(overrides: Partial<BlackjackRoundHand> = {}): BlackjackRoundHand {
  return {
    handId: "seat-1-hand-0",
    seatId: 1,
    handIndex: 0,
    splitDepth: 0,
    splitFromAces: false,
    wager: 100,
    cards: [card("10", "p1"), card("K", "p2")],
    status: "playing",
    doubled: false,
    insuranceDecision: "notOffered",
    insuranceWager: 0,
    insuranceReturnAmount: null,
    insuranceNetAmount: null,
    result: null,
    returnAmount: null,
    netAmount: null,
    ...overrides,
  };
}

function round(active: BlackjackRoundHand): BlackjackRoundState {
  return {
    phase: "playerTurns",
    hands: [active],
    dealer: {
      cards: [card("6", "d1"), card("10", "d2")],
      blackjack: false,
    },
    activeHandId: active.handId,
    activeSeatId: active.seatId,
  };
}

describe("canonical 6-deck American H17 rules", () => {
  it("locks shoe and table-shape constants", () => {
    expect(BLACKJACK_DECK_COUNT).toBe(BLACKJACK_CANONICAL_RULES.deckCount);
    expect(BLACKJACK_CUT_CARD_PENETRATION).toBe(BLACKJACK_CANONICAL_RULES.cutCardPenetration);
    expect(BLACKJACK_MAX_HANDS_PER_SEAT).toBe(BLACKJACK_CANONICAL_RULES.maxHandsPerSeat);
  });

  it("uses the highest non-busting value as the hand total and labels soft hands", () => {
    const soft19 = [card("A", "a"), card("8", "8")];
    expect(evaluateBlackjackHand(soft19)).toMatchObject({ total: 19, soft: true, bust: false });
    expect(formatBlackjackHandTotal(soft19)).toBe("19 · SOFT");
    expect(formatBlackjackHandTotal([card("A", "a1"), card("A", "a2")])).toBe("12 · SOFT");
    expect(formatBlackjackHandTotal([card("A", "a3"), card("6", "6"), card("10", "10")])).toBe("17");
  });

  it("enforces H17 but stands on soft 18, soft 19, soft 20 and hard 17+", () => {
    expect(dealerShouldHit([card("A", "a17"), card("6", "6")], BLACKJACK_CANONICAL_RULES.dealerHitsSoft17)).toBe(true);
    expect(dealerShouldHit([card("A", "a18"), card("7", "7")], BLACKJACK_CANONICAL_RULES.dealerHitsSoft17)).toBe(false);
    expect(dealerShouldHit([card("A", "a19"), card("8", "8")], BLACKJACK_CANONICAL_RULES.dealerHitsSoft17)).toBe(false);
    expect(dealerShouldHit([card("A", "a20"), card("9", "9")], BLACKJACK_CANONICAL_RULES.dealerHitsSoft17)).toBe(false);
    expect(dealerShouldHit([card("10", "10h"), card("7", "7h")], BLACKJACK_CANONICAL_RULES.dealerHitsSoft17)).toBe(false);
  });

  it("allows equal-value ten cards to split and DAS on non-ace split hands", () => {
    const tenValuePair = hand({ cards: [card("10", "10"), card("K", "k")] });
    expect(canSplitBlackjackHand(round(tenValuePair))).toBe(BLACKJACK_CANONICAL_RULES.splitEqualValueCards);

    const postSplit = hand({
      handId: "seat-1-hand-0-L",
      splitDepth: 1,
      cards: [card("8", "8"), card("3", "3")],
    });
    expect(canDoubleBlackjackHand(round(postSplit))).toBe(BLACKJACK_CANONICAL_RULES.doubleAfterSplit);
  });

  it("forbids hit/double/resplit on split Aces under the canonical profile", () => {
    const splitAceHand = hand({
      handId: "seat-1-hand-0-L",
      splitDepth: 1,
      splitFromAces: true,
      cards: [card("A", "a"), card("9", "9")],
      status: "stood",
    });
    expect(canDoubleBlackjackHand(round(splitAceHand))).toBe(false);
    expect(canSplitBlackjackHand(round({ ...splitAceHand, status: "playing", cards: [card("A", "a1"), card("A", "a2")] }))).toBe(false);
    expect(BLACKJACK_CANONICAL_RULES.hitSplitAces).toBe(false);
    expect(BLACKJACK_CANONICAL_RULES.resplitAces).toBe(false);
  });
});
