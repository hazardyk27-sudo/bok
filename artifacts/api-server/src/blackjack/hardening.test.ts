import { describe, expect, it } from "vitest";
import type {
  BlackjackCard,
  BlackjackRank,
  BlackjackSuit,
} from "../../../cascade-8/src/blackjack/blackjackCore";
import type {
  BlackjackServerActionRequest,
} from "../../../cascade-8/src/blackjack/serverContract";
import type { BlackjackShoe } from "../../../cascade-8/src/blackjack/shoe";
import { parseBlackjackActionRequest } from "./routes";
import {
  createBlackjackServerSession,
  transitionBlackjackServerSession,
} from "./serverTable";
import {
  BLACKJACK_MAX_NUMERIC_SAFE_WAGER,
  planBlackjackWalletMutation,
} from "./walletAccounting";

function card(
  rank: BlackjackRank,
  index: number,
  suit: BlackjackSuit = "spades",
): BlackjackCard {
  return {
    id: `hardening:${index}:${rank}:${suit}`,
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
function request(
  expectedRevision: number,
  action: BlackjackServerActionRequest["action"],
  seats?: BlackjackServerActionRequest["seats"],
): BlackjackServerActionRequest {
  keyCounter += 1;
  return {
    expectedRevision,
    idempotencyKey: `hardening-key-${keyCounter}`,
    action,
    seats,
  };
}

describe("Blackjack HTTP payload hardening", () => {
  it("accepts numeric DEAL fields without coercion", () => {
    expect(parseBlackjackActionRequest({
      expectedRevision: 0,
      idempotencyKey: "strict-input-key-0001",
      action: "deal",
      seats: [{ seatId: 1, wager: 50 }],
    })).toMatchObject({
      action: "deal",
      seats: [{ seatId: 1, wager: 50 }],
    });
  });

  it("rejects string/boolean seat fields instead of Number-coercing them", () => {
    expect(() => parseBlackjackActionRequest({
      expectedRevision: 0,
      idempotencyKey: "strict-input-key-0002",
      action: "deal",
      seats: [{ seatId: "1", wager: 50 }],
    })).toThrow("BLACKJACK_ACTION_INPUT_REQUIRED");

    expect(() => parseBlackjackActionRequest({
      expectedRevision: 0,
      idempotencyKey: "strict-input-key-0003",
      action: "deal",
      seats: [{ seatId: 1, wager: "50" }],
    })).toThrow("BLACKJACK_ACTION_INPUT_REQUIRED");

    expect(() => parseBlackjackActionRequest({
      expectedRevision: 0,
      idempotencyKey: "strict-input-key-0004",
      action: "deal",
      seats: [{ seatId: true, wager: 50 }],
    })).toThrow("BLACKJACK_ACTION_INPUT_REQUIRED");
  });

  it("rejects seat payload on non-DEAL actions", () => {
    expect(() => parseBlackjackActionRequest({
      expectedRevision: 4,
      idempotencyKey: "strict-input-key-0005",
      action: "hit",
      seats: [{ seatId: 1, wager: 50 }],
    })).toThrow("BLACKJACK_ACTION_SEATS_NOT_ALLOWED");
  });
});

describe("Blackjack numeric and shoe-boundary hardening", () => {
  it("keeps the existing trillion-dollar stress wager inside worst-case safe arithmetic", () => {
    expect(BLACKJACK_MAX_NUMERIC_SAFE_WAGER).toBeGreaterThanOrEqual(1_000_000_000_000);

    const current = createBlackjackServerSession({
      createShoe: () => shoeWith([
        card("10", 0),
        card("9", 1),
        card("7", 2),
        card("8", 3),
      ]),
    });
    const deal = request(0, "deal", [{ seatId: 1, wager: 1_000_000_000_000 }]);
    const next = transitionBlackjackServerSession(current, deal, {
      createRoundId: () => "safe-stress-round",
    });

    expect(planBlackjackWalletMutation(current, next, deal).debitCents)
      .toBe(100_000_000_000_000);
  });

  it("rejects a wager that could overflow the supported worst-case round payout", () => {
    const unsafeWager = BLACKJACK_MAX_NUMERIC_SAFE_WAGER + 1;
    const current = createBlackjackServerSession({
      createShoe: () => shoeWith([
        card("10", 0),
        card("9", 1),
        card("7", 2),
        card("8", 3),
      ]),
    });
    const deal = request(0, "deal", [{ seatId: 1, wager: unsafeWager }]);
    const next = transitionBlackjackServerSession(current, deal, {
      createRoundId: () => "unsafe-stress-round",
    });

    expect(() => planBlackjackWalletMutation(current, next, deal))
      .toThrow("BLACKJACK_AMOUNT_OUT_OF_RANGE");
  });

  it("reshuffles a cut-crossed shoe on NEXT and never in the middle of the active round", () => {
    const current = createBlackjackServerSession({
      createShoe: () => shoeWith([
        card("10", 0),
        card("9", 1),
        card("7", 2),
        card("8", 3),
        card("2", 4),
        card("3", 5),
      ], 4),
    });
    const dealt = transitionBlackjackServerSession(
      current,
      request(0, "deal", [{ seatId: 1, wager: 50 }]),
      { createRoundId: () => "cut-round" },
    );

    expect(dealt.shoe.shufflePending).toBe(true);
    expect(dealt.shoe.nextIndex).toBe(4);

    const completed = transitionBlackjackServerSession(
      dealt,
      request(1, "stand"),
    );
    expect(completed.round?.phase).toBe("complete");
    expect(completed.shoe.nextIndex).toBe(4);
    expect(completed.shoe.shufflePending).toBe(true);

    const next = transitionBlackjackServerSession(
      completed,
      request(2, "next"),
      { random: () => 0.5 },
    );
    expect(next.round).toBeNull();
    expect(next.roundId).toBeNull();
    expect(next.shoe.cards).toHaveLength(312);
    expect(next.shoe.nextIndex).toBe(0);
    expect(next.shoe.shufflePending).toBe(false);
  });
});
