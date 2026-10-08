import { describe, expect, it } from "vitest";
import type {
  BlackjackCard,
  BlackjackRank,
  BlackjackSuit,
} from "../../../cascade-8/src/blackjack/blackjackCore";
import type {
  BlackjackServerActionName,
  BlackjackServerActionRequest,
} from "../../../cascade-8/src/blackjack/serverContract";
import type { BlackjackShoe } from "../../../cascade-8/src/blackjack/shoe";
import {
  createBlackjackServerSession,
  transitionBlackjackServerSession,
} from "./serverTable";
import { planBlackjackWalletMutation } from "./walletAccounting";

function card(
  rank: BlackjackRank,
  index: number,
  suit: BlackjackSuit = "spades",
): BlackjackCard {
  return {
    id: `wallet-test:${index}:${rank}:${suit}`,
    rank,
    suit,
    deck: 1,
  };
}

function shoeWith(cards: BlackjackCard[]): BlackjackShoe {
  return {
    cards,
    nextIndex: 0,
    cutIndex: cards.length,
    deckCount: 6,
    shufflePending: false,
  };
}

let keyCounter = 0;
function action(
  expectedRevision: number,
  name: BlackjackServerActionName,
  seats?: BlackjackServerActionRequest["seats"],
): BlackjackServerActionRequest {
  keyCounter += 1;
  return {
    expectedRevision,
    idempotencyKey: `wallet-test-key-${keyCounter}`,
    action: name,
    seats,
  };
}

describe("Blackjack wallet accounting", () => {
  it("debits the full multi-seat DEAL stake", () => {
    const current = createBlackjackServerSession({
      createShoe: () => shoeWith([
        card("10", 0), card("9", 1), card("8", 2), card("7", 3),
        card("6", 4), card("5", 5), card("4", 6), card("3", 7),
      ]),
    });
    const request = action(0, "deal", [
      { seatId: 1, wager: 50 },
      { seatId: 3, wager: 100 },
    ]);
    const next = transitionBlackjackServerSession(current, request, {
      createRoundId: () => "round-deal",
    });

    expect(planBlackjackWalletMutation(current, next, request)).toMatchObject({
      debitCents: 15_000,
      debitKind: "INITIAL_STAKE_DEBIT",
    });
  });

  it("requires the extra DOUBLE stake before crediting a same-action win", () => {
    const current = createBlackjackServerSession({
      createShoe: () => shoeWith([
        card("5", 0),
        card("10", 1),
        card("6", 2),
        card("7", 3),
        card("10", 4),
      ]),
    });
    const deal = action(0, "deal", [{ seatId: 1, wager: 50 }]);
    const started = transitionBlackjackServerSession(current, deal, {
      createRoundId: () => "round-double",
    });
    const double = action(1, "double");
    const completed = transitionBlackjackServerSession(started, double);
    const plan = planBlackjackWalletMutation(started, completed, double);

    expect(plan).toEqual({
      debitCents: 5_000,
      debitKind: "DOUBLE_DEBIT",
      payoutCreditCents: 20_000,
      netDeltaCents: 15_000,
    });
  });

  it("debits one matching wager for SPLIT", () => {
    const current = createBlackjackServerSession({
      createShoe: () => shoeWith([
        card("8", 0),
        card("10", 1),
        card("8", 2, "hearts"),
        card("7", 3),
        card("2", 4),
        card("3", 5),
      ]),
    });
    const deal = action(0, "deal", [{ seatId: 1, wager: 50 }]);
    const started = transitionBlackjackServerSession(current, deal, {
      createRoundId: () => "round-split",
    });
    const split = action(1, "split");
    const next = transitionBlackjackServerSession(started, split);

    expect(planBlackjackWalletMutation(started, next, split)).toEqual({
      debitCents: 5_000,
      debitKind: "SPLIT_DEBIT",
      payoutCreditCents: 0,
      netDeltaCents: -5_000,
    });
  });

  it("debits half the main wager for insurance and credits its 2:1 return", () => {
    const current = createBlackjackServerSession({
      createShoe: () => shoeWith([
        card("10", 0),
        card("A", 1),
        card("7", 2),
        card("K", 3),
      ]),
    });
    const deal = action(0, "deal", [{ seatId: 1, wager: 50 }]);
    const started = transitionBlackjackServerSession(current, deal, {
      createRoundId: () => "round-insurance",
    });
    const insurance = action(1, "insurance");
    const completed = transitionBlackjackServerSession(started, insurance);

    expect(planBlackjackWalletMutation(started, completed, insurance)).toEqual({
      debitCents: 2_500,
      debitKind: "INSURANCE_DEBIT",
      payoutCreditCents: 7_500,
      netDeltaCents: 5_000,
    });
  });

  it("credits natural blackjack return on the same DEAL transaction", () => {
    const current = createBlackjackServerSession({
      createShoe: () => shoeWith([
        card("A", 0),
        card("9", 1),
        card("K", 2),
        card("7", 3),
      ]),
    });
    const deal = action(0, "deal", [{ seatId: 1, wager: 50 }]);
    const completed = transitionBlackjackServerSession(current, deal, {
      createRoundId: () => "round-natural",
    });

    expect(planBlackjackWalletMutation(current, completed, deal)).toEqual({
      debitCents: 5_000,
      debitKind: "INITIAL_STAKE_DEBIT",
      payoutCreditCents: 12_500,
      netDeltaCents: 7_500,
    });
  });
});
