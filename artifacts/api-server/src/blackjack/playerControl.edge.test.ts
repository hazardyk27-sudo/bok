import { describe, expect, it } from "vitest";
import type {
  BlackjackCard,
  BlackjackRank,
  BlackjackSuit,
} from "../../../cascade-8/src/blackjack/blackjackCore";
import type {
  BlackjackDealSeat,
  BlackjackServerActionName,
  BlackjackServerActionRequest,
} from "../../../cascade-8/src/blackjack/serverContract";
import type { BlackjackShoe } from "../../../cascade-8/src/blackjack/shoe";
import { BlackjackServerTableStore } from "./serverTable";

function card(
  rank: BlackjackRank,
  index: number,
  suit: BlackjackSuit = "spades",
): BlackjackCard {
  return {
    id: `player-control:${index}:${rank}:${suit}`,
    rank,
    suit,
    deck: 1,
  };
}

function shoeWith(cards: BlackjackCard[]): BlackjackShoe {
  return {
    cards,
    nextIndex: 0,
    cutIndex: Math.max(1, cards.length - 1),
    deckCount: 6,
    shufflePending: false,
  };
}

let key = 0;
function action(
  expectedRevision: number,
  actionName: BlackjackServerActionName,
  seats?: BlackjackDealSeat[],
): BlackjackServerActionRequest {
  key += 1;
  return {
    expectedRevision,
    idempotencyKey: `player-control-${key}`,
    action: actionName,
    seats,
  };
}

describe("Blackjack player decision control", () => {
  it("keeps a two-card 17 in playerTurns with dealer hole card hidden", () => {
    const store = new BlackjackServerTableStore({
      createShoe: () => shoeWith([
        card("10", 0),
        card("6", 1, "hearts"),
        card("7", 2, "clubs"),
        card("10", 3, "diamonds"),
        card("2", 4),
      ]),
    });

    const dealt = store.applyAction(
      "session-17",
      action(0, "deal", [{ seatId: 1, wager: 50 }]),
    );

    expect(dealt.round?.phase).toBe("playerTurns");
    expect(dealt.round?.hands[0]?.cards.map((candidate) => candidate.rank)).toEqual(["10", "7"]);
    expect(dealt.round?.dealer.cards[1]).toBeNull();
    expect(dealt.allowedActions).toContain("hit");
    expect(dealt.allowedActions).toContain("stand");
  });

  it("keeps a two-card 20 under player control and still offers SPLIT for equal-value tens", () => {
    const store = new BlackjackServerTableStore({
      createShoe: () => shoeWith([
        card("10", 0),
        card("6", 1, "hearts"),
        card("K", 2, "clubs"),
        card("10", 3, "diamonds"),
        card("2", 4),
        card("3", 5),
      ]),
    });

    const dealt = store.applyAction(
      "session-20",
      action(0, "deal", [{ seatId: 1, wager: 50 }]),
    );

    expect(dealt.round?.phase).toBe("playerTurns");
    expect(dealt.round?.hands[0]?.cards.map((candidate) => candidate.rank)).toEqual(["10", "K"]);
    expect(dealt.round?.dealer.cards[1]).toBeNull();
    expect(dealt.allowedActions).toEqual(expect.arrayContaining(["hit", "stand", "split"]));
  });

  it("starts dealer resolution only after STAND and stops when dealer already has hard 17", () => {
    const store = new BlackjackServerTableStore({
      createShoe: () => shoeWith([
        card("10", 0),
        card("10", 1, "hearts"),
        card("K", 2, "clubs"),
        card("7", 3, "diamonds"),
        card("2", 4),
      ]),
    });

    const dealt = store.applyAction(
      "session-stand",
      action(0, "deal", [{ seatId: 1, wager: 50 }]),
    );
    expect(dealt.round?.phase).toBe("playerTurns");
    expect(dealt.round?.dealer.cards[1]).toBeNull();

    const stood = store.applyAction("session-stand", action(1, "stand"));
    expect(stood.round?.phase).toBe("complete");
    expect(stood.round?.dealer.cards.map((candidate) => candidate?.rank)).toEqual(["10", "7"]);
    expect(stood.round?.hands[0]?.result).toBe("win");
  });

  it("settles player A+8 as soft 19, not 9", () => {
    const store = new BlackjackServerTableStore({
      createShoe: () => shoeWith([
        card("A", 0),
        card("10", 1, "hearts"),
        card("8", 2, "clubs"),
        card("8", 3, "diamonds"),
      ]),
    });

    const dealt = store.applyAction(
      "session-player-soft-19",
      action(0, "deal", [{ seatId: 1, wager: 50 }]),
    );
    expect(dealt.round?.phase).toBe("playerTurns");
    expect(dealt.allowedActions).toEqual(expect.arrayContaining(["hit", "stand"]));

    const stood = store.applyAction("session-player-soft-19", action(1, "stand"));
    expect(stood.round?.phase).toBe("complete");
    expect(stood.round?.hands[0]?.result).toBe("win");
    expect(stood.round?.hands[0]?.returnAmount).toBe(100);
  });

  it("stands dealer on soft 19 using Ace as 11", () => {
    const store = new BlackjackServerTableStore({
      createShoe: () => shoeWith([
        card("10", 0),
        card("8", 1, "hearts"),
        card("8", 2, "clubs"),
        card("A", 3, "diamonds"),
      ]),
    });

    store.applyAction(
      "session-dealer-soft-19",
      action(0, "deal", [{ seatId: 1, wager: 50 }]),
    );
    const stood = store.applyAction("session-dealer-soft-19", action(1, "stand"));

    expect(stood.round?.dealer.cards.map((candidate) => candidate?.rank)).toEqual(["8", "A"]);
    expect(stood.round?.hands[0]?.result).toBe("lose");
  });

  it("hits dealer soft 17 under H17 and then stands on soft 19", () => {
    const store = new BlackjackServerTableStore({
      createShoe: () => shoeWith([
        card("10", 0),
        card("6", 1, "hearts"),
        card("8", 2, "clubs"),
        card("A", 3, "diamonds"),
        card("2", 4, "clubs"),
      ]),
    });

    store.applyAction(
      "session-dealer-soft-17",
      action(0, "deal", [{ seatId: 1, wager: 50 }]),
    );
    const stood = store.applyAction("session-dealer-soft-17", action(1, "stand"));

    expect(stood.round?.dealer.cards.map((candidate) => candidate?.rank)).toEqual(["6", "A", "2"]);
    expect(stood.round?.hands[0]?.result).toBe("lose");
  });
});
