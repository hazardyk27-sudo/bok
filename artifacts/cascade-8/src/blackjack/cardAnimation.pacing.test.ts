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
  cards: BlackjackCard[],
  status: BlackjackRoundHand["status"] = "playing",
): BlackjackRoundHand {
  return {
    handId,
    seatId: 1,
    handIndex: 0,
    splitDepth: 0,
    splitFromAces: false,
    wager: 50,
    cards,
    status,
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
  playerHand: BlackjackRoundHand,
  dealerCards: BlackjackCard[],
  phase: BlackjackRoundState["phase"] = "playerTurns",
): BlackjackRoundState {
  return {
    phase,
    hands: [playerHand],
    dealer: { cards: dealerCards, blackjack: false },
    activeHandId: phase === "playerTurns" && playerHand.status === "playing" ? playerHand.handId : null,
    activeSeatId: phase === "playerTurns" && playerHand.status === "playing" ? 1 : null,
  };
}

describe("Blackjack card animation pacing", () => {
  it("spaces initial deal cards at a readable physical-table cadence", () => {
    const next = round(
      hand("h1", [card("p1", "10"), card("p2", "7")]),
      [card("d1", "6"), card("d2", "10")],
    );

    const plan = buildBlackjackCardAnimationPlan(null, next, "deal");
    expect(plan.steps).toHaveLength(4);
    expect(plan.steps[1]!.delayMs - plan.steps[0]!.delayMs).toBeGreaterThanOrEqual(200);
    expect(plan.steps[2]!.delayMs - plan.steps[1]!.delayMs).toBeGreaterThanOrEqual(200);
    expect(plan.totalDurationMs).toBeGreaterThanOrEqual(1_200);
  });

  it("waits before revealing the dealer hole card after player STAND", () => {
    const playerCards = [card("p1", "10"), card("p2", "10")];
    const dealerUp = card("d1", "10");
    const dealerHole = card("d2", "7");
    const stood = hand("h1", playerCards, "stood");
    const previous = round(stood, [dealerUp, dealerHole], "playerTurns");
    const next = round(stood, [dealerUp, dealerHole], "complete");

    const plan = buildBlackjackCardAnimationPlan(previous, next, "stand");
    const reveal = plan.steps.find((step) => step.kind === "holeReveal");
    expect(reveal?.delayMs).toBeGreaterThanOrEqual(600);
  });

  it("finishes a player draw before dealer reveal begins", () => {
    const first = card("p1", "10");
    const second = card("p2", "5");
    const finishing = card("p3", "6");
    const dealerUp = card("d1", "6");
    const dealerHole = card("d2", "5");
    const dealerDraw = card("d3", "10");
    const previous = round(hand("h1", [first, second]), [dealerUp, dealerHole]);
    const next = round(
      hand("h1", [first, second, finishing], "stood"),
      [dealerUp, dealerHole, dealerDraw],
      "complete",
    );

    const plan = buildBlackjackCardAnimationPlan(previous, next, "hit");
    const playerDraw = plan.steps.find((step) => step.kind === "playerDraw");
    const reveal = plan.steps.find((step) => step.kind === "holeReveal");
    expect(playerDraw).toBeTruthy();
    expect(reveal).toBeTruthy();
    expect(reveal!.delayMs - playerDraw!.delayMs).toBeGreaterThanOrEqual(1_100);
  });
});