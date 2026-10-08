import { describe, expect, it } from "vitest";
import type {
  BlackjackCard,
  BlackjackRank,
  BlackjackSuit,
} from "./blackjackCore";
import type {
  BlackjackRoundHand,
  BlackjackRoundState,
} from "./roundState";
import { buildBlackjackCardAnimationPlan } from "./cardAnimation";

function card(
  id: string,
  rank: BlackjackRank = "8",
  suit: BlackjackSuit = "spades",
): BlackjackCard {
  return { id, rank, suit, deck: 1 };
}

function hand(
  handId: string,
  seatId: 1 | 2 | 3 | 4 | 5,
  cards: BlackjackCard[],
  handIndex = 0,
): BlackjackRoundHand {
  return {
    handId,
    seatId,
    handIndex,
    splitDepth: 0,
    splitFromAces: false,
    wager: 50,
    cards,
    status: "playing",
    doubled: false,
    insuranceDecision: "notOffered",
    insuranceWager: 0,
    insuranceReturnAmount: null,
    insuranceNetAmount: null,
    result: null,
    returnAmount: null,
    netAmount: null,
  };
}

function round(
  hands: BlackjackRoundHand[],
  dealerCards: BlackjackCard[],
  phase: BlackjackRoundState["phase"] = "playerTurns",
): BlackjackRoundState {
  return {
    phase,
    hands,
    dealer: { cards: dealerCards, blackjack: false },
    activeHandId: hands.find((candidate) => candidate.status === "playing")?.handId ?? null,
    activeSeatId: hands.find((candidate) => candidate.status === "playing")?.seatId ?? null,
  };
}

describe("buildBlackjackCardAnimationPlan", () => {
  it("orders the initial deal by seat pass, dealer upcard, second seat pass, dealer hole", () => {
    const next = round(
      [
        hand("1:0", 1, [card("s1a"), card("s1b")]),
        hand("3:0", 3, [card("s3a"), card("s3b")]),
      ],
      [card("dealer-up", "A"), card("dealer-hole", "10")],
    );

    const plan = buildBlackjackCardAnimationPlan(null, next, "deal");
    expect(plan.steps.map((step) => step.cardId)).toEqual([
      "s1a",
      "s3a",
      "dealer-up",
      "s1b",
      "s3b",
      "dealer-hole",
    ]);
    expect(plan.steps.every((step) => step.kind === "deal")).toBe(true);
    expect(plan.totalDurationMs).toBeGreaterThan(0);
  });

  it("animates only the newly drawn HIT card", () => {
    const first = card("first", "10");
    const second = card("second", "5");
    const drawn = card("drawn", "4");
    const dealer = [card("dealer-up", "9"), card("dealer-hole", "7")];
    const previous = round([hand("1:0", 1, [first, second])], dealer);
    const next = round([hand("1:0", 1, [first, second, drawn])], dealer);

    const plan = buildBlackjackCardAnimationPlan(previous, next, "hit");
    expect(plan.steps).toEqual([
      expect.objectContaining({ cardId: "drawn", kind: "playerDraw", order: 0 }),
    ]);
  });

  it("animates both new split cards in hand order", () => {
    const left = card("pair-left", "8");
    const right = card("pair-right", "8", "hearts");
    const splitOne = card("split-one", "3");
    const splitTwo = card("split-two", "K");
    const dealer = [card("dealer-up", "6"), card("dealer-hole", "10")];
    const previous = round([hand("1:0", 1, [left, right])], dealer);
    const next = round([
      { ...hand("1:0:L", 1, [left, splitOne], 0), splitDepth: 1 },
      { ...hand("1:0:R", 1, [right, splitTwo], 1), splitDepth: 1 },
    ], dealer);

    const plan = buildBlackjackCardAnimationPlan(previous, next, "split");
    expect(plan.steps.map((step) => [step.cardId, step.kind])).toEqual([
      ["split-one", "splitDraw"],
      ["split-two", "splitDraw"],
    ]);
  });

  it("reveals the existing hole card before newly drawn dealer cards", () => {
    const playerCards = [card("p1", "10"), card("p2", "7")];
    const dealerUp = card("dealer-up", "6");
    const dealerHole = card("dealer-hole", "5");
    const dealerDraw = card("dealer-draw", "9");
    const stood = { ...hand("1:0", 1, playerCards), status: "stood" as const };
    const previous = round([stood], [dealerUp, dealerHole], "playerTurns");
    const next = round([stood], [dealerUp, dealerHole, dealerDraw], "complete");

    const plan = buildBlackjackCardAnimationPlan(previous, next, "stand");
    expect(plan.steps.map((step) => [step.cardId, step.kind])).toEqual([
      ["dealer-hole", "holeReveal"],
      ["dealer-draw", "dealerDraw"],
    ]);
  });

  it("shows a finishing player draw before dealer reveal and dealer draws", () => {
    const first = card("p1", "10");
    const second = card("p2", "5");
    const finishing = card("p3", "6");
    const dealerUp = card("d1", "6");
    const dealerHole = card("d2", "5");
    const dealerDraw = card("d3", "10");
    const previous = round(
      [hand("1:0", 1, [first, second])],
      [dealerUp, dealerHole],
      "playerTurns",
    );
    const finishedHand = {
      ...hand("1:0", 1, [first, second, finishing]),
      status: "stood" as const,
    };
    const next = round(
      [finishedHand],
      [dealerUp, dealerHole, dealerDraw],
      "complete",
    );

    const plan = buildBlackjackCardAnimationPlan(previous, next, "hit");
    expect(plan.steps.map((step) => [step.cardId, step.kind])).toEqual([
      ["p3", "playerDraw"],
      ["d2", "holeReveal"],
      ["d3", "dealerDraw"],
    ]);
  });

  it("does not animate persisted cards on a no-card action", () => {
    const existing = round(
      [hand("1:0", 1, [card("p1"), card("p2")])],
      [card("d1"), card("d2")],
      "insurance",
    );
    const next = { ...existing, activeHandId: null, activeSeatId: null };

    const plan = buildBlackjackCardAnimationPlan(existing, next, "declineInsurance");
    expect(plan.steps).toEqual([]);
    expect(plan.totalDurationMs).toBe(0);
  });
});
