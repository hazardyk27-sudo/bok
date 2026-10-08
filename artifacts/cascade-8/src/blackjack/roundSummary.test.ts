import { describe, expect, it } from "vitest";
import type { BlackjackPublicRound } from "./serverContract";
import { summarizeBlackjackRound } from "./roundSummary";

function round(hands: BlackjackPublicRound["hands"]): BlackjackPublicRound {
  return {
    phase: "complete",
    hands,
    dealer: { cards: [], blackjack: false },
    activeHandId: null,
    activeSeatId: null,
  };
}

function hand(
  handId: string,
  seatId: 1 | 2 | 3 | 4 | 5,
  wager: number,
  returnAmount: number,
  insuranceWager = 0,
  insuranceReturnAmount = 0,
): BlackjackPublicRound["hands"][number] {
  return {
    handId,
    seatId,
    handIndex: 0,
    splitDepth: 0,
    splitFromAces: false,
    wager,
    cards: [],
    status: "stood",
    doubled: false,
    insuranceDecision: insuranceWager > 0 ? "taken" : "notOffered",
    insuranceWager,
    insuranceReturnAmount,
    insuranceNetAmount: insuranceReturnAmount - insuranceWager,
    result: returnAmount > wager ? "win" : returnAmount === wager ? "push" : "lose",
    returnAmount,
    netAmount: returnAmount - wager,
  };
}

describe("summarizeBlackjackRound", () => {
  it("aggregates one seat into a single net result", () => {
    const summary = summarizeBlackjackRound(round([
      hand("seat-5", 5, 2_000, 5_000),
    ]));

    expect(summary).toEqual({
      seatCount: 1,
      handCount: 1,
      totalStake: 2_000,
      totalReturn: 5_000,
      net: 3_000,
    });
  });

  it("aggregates five seats, split hands, doubles and insurance into one table result", () => {
    const summary = summarizeBlackjackRound(round([
      hand("s1", 1, 100, 200),
      hand("s2", 2, 200, 0),
      hand("s3a", 3, 100, 100, 50, 150),
      hand("s3b", 3, 100, 200),
      hand("s4", 4, 400, 800),
      hand("s5", 5, 100, 0),
    ]));

    expect(summary.seatCount).toBe(5);
    expect(summary.handCount).toBe(6);
    expect(summary.totalStake).toBe(1_050);
    expect(summary.totalReturn).toBe(1_450);
    expect(summary.net).toBe(400);
  });
});
