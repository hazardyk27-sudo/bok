import { describe, expect, it } from "vitest";
import type { BlackjackCard } from "../../../cascade-8/src/blackjack/blackjackCore";
import type { BlackjackServerActionRequest } from "../../../cascade-8/src/blackjack/serverContract";
import type { BlackjackRoundState } from "../../../cascade-8/src/blackjack/roundState";
import type { BlackjackShoe } from "../../../cascade-8/src/blackjack/shoe";
import { BlackjackServerTableStore, type BlackjackServerTableSession } from "./serverTable";
import { planBlackjackWalletMutation } from "./walletAccounting";

function card(rank: BlackjackCard["rank"], id: string): BlackjackCard {
  return { id, rank, suit: "spades", deck: 1 };
}

function shoe(cards: BlackjackCard[]): BlackjackShoe {
  return {
    cards,
    nextIndex: 0,
    cutIndex: Math.max(1, cards.length - 1),
    deckCount: 6,
    shufflePending: false,
  };
}

describe("natural blackjack payout", () => {
  it("settles an initial two-card 21 at 2.5x total return", () => {
    const store = new BlackjackServerTableStore({
      createShoe: () => shoe([
        card("A", "player-a"),
        card("9", "dealer-up"),
        card("K", "player-k"),
        card("7", "dealer-hole"),
      ]),
      createRoundId: () => "natural-round",
    });

    const snapshot = store.applyAction("natural-session", {
      action: "deal",
      expectedRevision: 0,
      idempotencyKey: "natural-deal",
      seats: [{ seatId: 1, wager: 50 }],
    });

    expect(snapshot.round?.phase).toBe("complete");
    expect(snapshot.round?.hands[0]).toMatchObject({
      status: "blackjack",
      result: "blackjack",
      wager: 50,
      returnAmount: 125,
      netAmount: 75,
    });
  });

  it("credits the wallet with the full 2.5x return while debiting the original stake once", () => {
    const emptyShoe = shoe([]);
    const current: BlackjackServerTableSession = {
      revision: 0,
      roundId: null,
      round: null,
      shoe: emptyShoe,
    };
    const completedRound: BlackjackRoundState = {
      phase: "complete",
      activeHandId: null,
      activeSeatId: null,
      dealer: {
        cards: [card("9", "dealer-up"), card("7", "dealer-hole")],
        blackjack: false,
      },
      hands: [{
        handId: "seat-1-hand-0",
        seatId: 1,
        handIndex: 0,
        splitDepth: 0,
        splitFromAces: false,
        wager: 50,
        cards: [card("A", "player-a"), card("K", "player-k")],
        status: "blackjack",
        doubled: false,
        insuranceDecision: "notOffered",
        insuranceWager: 0,
        insuranceReturnAmount: null,
        insuranceNetAmount: null,
        result: "blackjack",
        returnAmount: 125,
        netAmount: 75,
      }],
    };
    const next: BlackjackServerTableSession = {
      revision: 1,
      roundId: "natural-round",
      round: completedRound,
      shoe: emptyShoe,
    };
    const request: BlackjackServerActionRequest = {
      action: "deal",
      expectedRevision: 0,
      idempotencyKey: "natural-wallet",
      seats: [{ seatId: 1, wager: 50 }],
    };

    expect(planBlackjackWalletMutation(current, next, request)).toMatchObject({
      debitCents: 5_000,
      payoutCreditCents: 12_500,
      netDeltaCents: 7_500,
    });
  });
});
