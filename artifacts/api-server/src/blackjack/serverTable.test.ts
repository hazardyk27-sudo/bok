import { describe, expect, it } from "vitest";
import {
  type BlackjackCard,
  type BlackjackRank,
  type BlackjackSuit,
} from "../../../cascade-8/src/blackjack/blackjackCore";
import type {
  BlackjackDealSeat,
  BlackjackServerActionName,
  BlackjackServerActionRequest,
} from "../../../cascade-8/src/blackjack/serverContract";
import { BlackjackServerTableStore } from "./serverTable";
import type { BlackjackShoe } from "../../../cascade-8/src/blackjack/shoe";

function card(
  rank: BlackjackRank,
  index: number,
  suit: BlackjackSuit = "spades",
): BlackjackCard {
  return {
    id: `server-test:${index}:${rank}:${suit}`,
    rank,
    suit,
    deck: 1,
  };
}

function shoeWith(cards: BlackjackCard[], cutIndex = cards.length): BlackjackShoe {
  return {
    cards,
    nextIndex: 0,
    cutIndex,
    deckCount: 6,
    shufflePending: false,
  };
}

let keyCounter = 0;
function action(
  expectedRevision: number,
  name: BlackjackServerActionName,
  seats?: BlackjackDealSeat[],
): BlackjackServerActionRequest {
  keyCounter += 1;
  return {
    expectedRevision,
    idempotencyKey: `server-test-key-${keyCounter}`,
    action: name,
    seats,
  };
}

describe("BlackjackServerTableStore", () => {
  it("starts with only DEAL allowed and keeps independent session revisions", () => {
    const store = new BlackjackServerTableStore({ random: () => 0.5 });

    const first = store.getState("session-a");
    const second = store.getState("session-b");

    expect(first).toMatchObject({
      revision: 0,
      roundId: null,
      round: null,
      wallet: { balanceCents: 0 },
    });
    expect(first.allowedActions).toEqual(["deal"]);
    expect(first.shoe.cardsRemaining).toBe(312);
    expect(second.revision).toBe(0);
  });

  it("owns the deal and redacts the dealer hole card from the public snapshot", () => {
    const cards = [
      card("10", 0),
      card("9", 1, "hearts"),
      card("7", 2, "clubs"),
      card("8", 3, "diamonds"),
      card("4", 4),
    ];
    const store = new BlackjackServerTableStore({
      createShoe: () => shoeWith(cards),
      createRoundId: () => "round-1",
      now: () => 123,
    });

    const dealt = store.applyAction(
      "session-a",
      action(0, "deal", [{ seatId: 1, wager: 50 }]),
    );

    expect(dealt.revision).toBe(1);
    expect(dealt.roundId).toBe("round-1");
    expect(dealt.serverTimeMs).toBe(123);
    expect(dealt.round?.dealer.cards[0]?.rank).toBe("9");
    expect(dealt.round?.dealer.cards[1]).toBeNull();
    expect(dealt.round?.dealer.blackjack).toBeNull();
    expect(dealt.round?.hands[0]?.cards.map((candidate) => candidate.rank)).toEqual([
      "10",
      "7",
    ]);
    expect(dealt.allowedActions).toContain("hit");
    expect(dealt.allowedActions).toContain("stand");
  });

  it("rejects stale revisions instead of replaying an action", () => {
    const cards = [
      card("5", 0),
      card("10", 1),
      card("6", 2),
      card("7", 3),
      card("4", 4),
    ];
    const store = new BlackjackServerTableStore({ createShoe: () => shoeWith(cards) });

    store.applyAction(
      "session-a",
      action(0, "deal", [{ seatId: 1, wager: 50 }]),
    );

    expect(() => store.applyAction("session-a", action(0, "hit"))).toThrow(
      "BLACKJACK_STALE_REVISION",
    );
  });

  it("keeps dealer blackjack secret until the insurance decision is finished", () => {
    const cards = [
      card("10", 0),
      card("A", 1, "hearts"),
      card("7", 2, "clubs"),
      card("K", 3, "diamonds"),
    ];
    const store = new BlackjackServerTableStore({
      createShoe: () => shoeWith(cards),
      createRoundId: () => "insurance-round",
    });

    const dealt = store.applyAction(
      "session-a",
      action(0, "deal", [{ seatId: 1, wager: 50 }]),
    );

    expect(dealt.round?.phase).toBe("insurance");
    expect(dealt.round?.dealer.cards[1]).toBeNull();
    expect(dealt.round?.dealer.blackjack).toBeNull();
    expect(dealt.allowedActions).toEqual(["insurance", "declineInsurance"]);

    const insured = store.applyAction("session-a", action(1, "insurance"));

    expect(insured.round?.phase).toBe("complete");
    expect(insured.round?.dealer.cards[1]?.rank).toBe("K");
    expect(insured.round?.dealer.blackjack).toBe(true);
    expect(insured.round?.hands[0]).toMatchObject({
      insuranceWager: 25,
      insuranceReturnAmount: 75,
      insuranceNetAmount: 50,
      result: "lose",
    });
    expect(insured.allowedActions).toEqual(["next"]);
  });

  it("has no configured table maximum while preserving numeric safety", () => {
    const store = new BlackjackServerTableStore({ random: () => 0.5 });

    expect(() => store.applyAction(
      "session-a",
      action(0, "deal", [{ seatId: 1, wager: 9 }]),
    )).toThrow("BLACKJACK_INVALID_WAGER");

    expect(() => store.applyAction(
      "session-b",
      action(0, "deal", [
        { seatId: 1, wager: 10 },
        { seatId: 1, wager: 20 },
      ]),
    )).toThrow("BLACKJACK_DUPLICATE_SEAT");

    expect(() => store.applyAction(
      "session-c",
      action(0, "deal", [{ seatId: 5, wager: 1_000_000_000_000 }]),
    )).not.toThrow();
  });
});
