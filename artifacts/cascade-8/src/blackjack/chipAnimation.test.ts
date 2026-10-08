import { describe, expect, it } from "vitest";
import type { BlackjackCard } from "./blackjackCore";
import type { BlackjackRoundHand, BlackjackRoundState } from "./roundState";
import {
  buildBlackjackBetChipAnimationPlan,
  buildBlackjackRoundChipAnimationPlan,
} from "./chipAnimation";
import {
  addSeatChip,
  clearSeatBet,
  doubleSeatBet,
  sitAtSeat,
  undoSeatChip,
  type BlackjackSeatState,
} from "./seatState";

function emptyState(): BlackjackSeatState {
  return {
    selectedSeatId: null,
    seats: [1, 2, 3, 4, 5].map((id) => ({
      id: id as 1 | 2 | 3 | 4 | 5,
      status: "empty" as const,
      bet: 0,
      chips: [],
    })),
  };
}

function card(id: string): BlackjackCard {
  return { id, rank: "8", suit: "spades", deck: 1 };
}

function hand(
  handId: string,
  seatId: 1 | 2 | 3 | 4 | 5,
  wager: number,
): BlackjackRoundHand {
  return {
    handId,
    seatId,
    handIndex: 0,
    splitDepth: 0,
    splitFromAces: false,
    wager,
    cards: [card(`${handId}:a`), card(`${handId}:b`)],
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
  phase: BlackjackRoundState["phase"] = "playerTurns",
  activeHandId = hands[0]?.handId ?? null,
): BlackjackRoundState {
  const active = hands.find((candidate) => candidate.handId === activeHandId) ?? null;
  return {
    phase,
    hands,
    dealer: {
      cards: [card("dealer-up"), card("dealer-hole")],
      blackjack: false,
    },
    activeHandId,
    activeSeatId: active?.seatId ?? null,
  };
}

describe("buildBlackjackBetChipAnimationPlan", () => {
  it("animates the exact denomination placed on a seat", () => {
    const seated = sitAtSeat(emptyState(), 2);
    const placed = addSeatChip(seated, 2, 25, 10);
    const plan = buildBlackjackBetChipAnimationPlan(seated, placed, "place", 2);

    expect(plan.steps).toEqual([
      expect.objectContaining({
        kind: "betIn",
        seatId: 2,
        chipValue: 25,
        amount: 25,
      }),
    ]);
  });

  it("returns the exact last denomination on UNDO", () => {
    let state = sitAtSeat(emptyState(), 1);
    state = addSeatChip(state, 1, 5, 10);
    state = addSeatChip(state, 1, 25, 10);
    const next = undoSeatChip(state, 1, 10);
    const plan = buildBlackjackBetChipAnimationPlan(state, next, "undo", 1);

    expect(plan.steps.map((step) => [step.kind, step.chipValue])).toEqual([
      ["betOut", 25],
    ]);
  });

  it("returns all cleared denominations in reverse stack order", () => {
    let state = sitAtSeat(emptyState(), 3);
    state = addSeatChip(state, 3, 5, 10);
    state = addSeatChip(state, 3, 25, 10);
    state = addSeatChip(state, 3, 100, 10);
    const next = clearSeatBet(state, 3);
    const plan = buildBlackjackBetChipAnimationPlan(state, next, "clear", 3);

    expect(plan.steps.map((step) => step.chipValue)).toEqual([100, 25, 5]);
    expect(plan.steps.every((step) => step.kind === "betOut")).toBe(true);
  });

  it("animates only the duplicated composition for pre-deal X2", () => {
    let state = sitAtSeat(emptyState(), 4);
    state = addSeatChip(state, 4, 100, 10);
    state = addSeatChip(state, 4, 25, 10);
    const next = doubleSeatBet(state, 4, 10);
    const plan = buildBlackjackBetChipAnimationPlan(state, next, "x2", 4);

    expect(plan.steps.map((step) => step.chipValue)).toEqual([100, 25]);
  });
});

describe("buildBlackjackRoundChipAnimationPlan", () => {
  it("shows an additional stake equal to the active wager on DOUBLE", () => {
    const previous = round([hand("1:0", 1, 50)]);
    const doubledHand = { ...previous.hands[0]!, wager: 100, doubled: true, status: "stood" as const };
    const next = round([doubledHand], "playerTurns", null);
    const plan = buildBlackjackRoundChipAnimationPlan(previous, next, "double");

    expect(plan.steps[0]).toMatchObject({
      kind: "roundStake",
      seatId: 1,
      handId: "1:0",
      amount: 50,
    });
  });

  it("shows one matching additional wager on SPLIT", () => {
    const previous = round([hand("2:0", 2, 75)]);
    const left = { ...hand("2:0:L", 2, 75), splitDepth: 1 };
    const right = { ...hand("2:0:R", 2, 75), handIndex: 1, splitDepth: 1 };
    const next = round([left, right], "playerTurns", left.handId);
    const plan = buildBlackjackRoundChipAnimationPlan(previous, next, "split");

    expect(plan.steps[0]).toMatchObject({
      kind: "roundStake",
      seatId: 2,
      amount: 75,
    });
  });

  it("uses the exact half-wager side bet for INSURANCE", () => {
    const insured = hand("3:0", 3, 25);
    const previous = round([insured], "insurance", insured.handId);
    const afterHand = {
      ...insured,
      insuranceDecision: "taken" as const,
      insuranceWager: 12.5,
      insuranceReturnAmount: null,
      insuranceNetAmount: null,
    };
    const next = round([afterHand], "playerTurns", afterHand.handId);
    const plan = buildBlackjackRoundChipAnimationPlan(previous, next, "insurance");

    expect(plan.steps[0]).toMatchObject({
      kind: "roundStake",
      amount: 12.5,
      chipValue: null,
    });
  });

  it("returns main plus insurance proceeds per hand only after completion", () => {
    const first = hand("1:0", 1, 50);
    const second = hand("4:0", 4, 100);
    const previous = round([first, second], "playerTurns", first.handId);
    const settledFirst = {
      ...first,
      status: "stood" as const,
      result: "win" as const,
      returnAmount: 100,
      netAmount: 50,
      insuranceDecision: "taken" as const,
      insuranceWager: 25,
      insuranceReturnAmount: 75,
      insuranceNetAmount: 50,
    };
    const settledSecond = {
      ...second,
      status: "stood" as const,
      result: "push" as const,
      returnAmount: 100,
      netAmount: 0,
    };
    const next = round([settledFirst, settledSecond], "complete", null);
    const plan = buildBlackjackRoundChipAnimationPlan(previous, next, "stand", 700);
    const payouts = plan.steps.filter((step) => step.kind === "payout");

    expect(payouts.map((step) => [step.seatId, step.amount])).toEqual([
      [1, 175],
      [4, 100],
    ]);
    expect(payouts[0]?.delayMs).toBeGreaterThanOrEqual(790);
  });

  it("does not create payout motion before the round is complete", () => {
    const previous = round([hand("5:0", 5, 50)]);
    const next = round([hand("5:0", 5, 50)]);
    const plan = buildBlackjackRoundChipAnimationPlan(previous, next, "hit", 400);

    expect(plan.steps).toEqual([]);
  });
});
