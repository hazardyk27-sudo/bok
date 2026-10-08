import { describe, expect, it } from "vitest";
import type {
  BlackjackCard,
  BlackjackRank,
  BlackjackSuit,
} from "../../../cascade-8/src/blackjack/blackjackCore";
import type { BlackjackShoe } from "../../../cascade-8/src/blackjack/shoe";
import {
  BlackjackServerTableStore,
  allowedBlackjackServerActions,
} from "./serverTable";

function card(
  rank: BlackjackRank,
  index: number,
  suit: BlackjackSuit = "spades",
): BlackjackCard {
  return {
    id: `snapshot-edge:${index}:${rank}:${suit}`,
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

let key = 0;
function idem() {
  key += 1;
  return `snapshot-edge-key-${key}`;
}

describe("Blackjack public live snapshot", () => {
  it("redacts the hole card while active and exposes every dealer H17 draw after settlement", () => {
    const store = new BlackjackServerTableStore({
      createShoe: () => shoeWith([
        card("10", 0),
        card("6", 1),
        card("8", 2),
        card("A", 3),
        card("4", 4),
      ]),
    });

    const dealt = store.applyAction("session-a", {
      expectedRevision: 0,
      idempotencyKey: idem(),
      action: "deal",
      seats: [{ seatId: 1, wager: 50 }],
    });

    expect(dealt.round?.dealer.cards).toEqual([
      expect.objectContaining({ rank: "6" }),
      null,
    ]);

    const settled = store.applyAction("session-a", {
      expectedRevision: 1,
      idempotencyKey: idem(),
      action: "stand",
    });

    expect(settled.round?.phase).toBe("complete");
    expect(settled.round?.dealer.cards.map((candidate) => candidate?.rank ?? null))
      .toEqual(["6", "A", "4"]);
  });

  it("does not advertise HIT/STAND for a malformed player-turn snapshot with no active hand", () => {
    expect(allowedBlackjackServerActions({
      phase: "playerTurns",
      hands: [],
      dealer: { cards: [card("10", 0), card("7", 1)], blackjack: false },
      activeHandId: null,
      activeSeatId: null,
    })).toEqual([]);
  });
});
