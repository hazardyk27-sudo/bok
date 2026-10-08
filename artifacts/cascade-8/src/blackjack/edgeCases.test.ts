import { describe, expect, it } from "vitest";
import type {
  BlackjackCard,
  BlackjackRank,
  BlackjackSuit,
} from "./blackjackCore";
import {
  hitBlackjackHand,
  splitBlackjackHand,
  standBlackjackHand,
  startBlackjackRound,
} from "./roundState";
import {
  clearSeatBet,
  createInitialSeatState,
  type BlackjackSeatState,
} from "./seatState";
import {
  reshuffleBlackjackShoeAtRoundBoundary,
  type BlackjackShoe,
} from "./shoe";

function card(
  rank: BlackjackRank,
  index: number,
  suit: BlackjackSuit = "spades",
): BlackjackCard {
  return {
    id: `edge:${index}:${rank}:${suit}`,
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

function onlySeatOne(): BlackjackSeatState {
  let state = createInitialSeatState();
  state = clearSeatBet(state, 3);
  state = clearSeatBet(state, 5);
  return state;
}

describe("Blackjack gameplay edge cases", () => {
  it("pays split-Ace 21 as a normal 1:1 win, never as a natural 3:2 blackjack", () => {
    const started = startBlackjackRound(
      onlySeatOne(),
      shoeWith([
        card("A", 0),
        card("10", 1),
        card("A", 2, "hearts"),
        card("7", 3),
        card("K", 4),
        card("Q", 5),
      ]),
      10,
    );

    const split = splitBlackjackHand(started.round, started.shoe);

    expect(split.round.phase).toBe("complete");
    expect(split.round.hands).toHaveLength(2);
    expect(split.round.hands.every((hand) => hand.splitFromAces)).toBe(true);
    expect(split.round.hands.every((hand) => hand.status === "stood")).toBe(true);
    expect(split.round.hands.every((hand) => hand.result === "win")).toBe(true);
    expect(split.round.hands.map((hand) => hand.returnAmount)).toEqual([100, 100]);
    expect(split.round.hands.every((hand) => hand.result !== "blackjack")).toBe(true);
  });

  it("does not waste dealer cards when every comparable player hand has busted", () => {
    const started = startBlackjackRound(
      onlySeatOne(),
      shoeWith([
        card("10", 0),
        card("5", 1),
        card("6", 2),
        card("10", 3),
        card("10", 4),
        card("6", 5),
      ]),
      10,
    );

    const busted = hitBlackjackHand(started.round, started.shoe);

    expect(busted.round.phase).toBe("complete");
    expect(busted.round.hands[0]).toMatchObject({
      status: "bust",
      result: "lose",
      returnAmount: 0,
    });
    expect(busted.round.dealer.cards).toHaveLength(2);
    expect(busted.shoe.nextIndex).toBe(5);
  });

  it("marks a crossed cut card during the round and reshuffles only at the boundary", () => {
    const started = startBlackjackRound(
      onlySeatOne(),
      shoeWith([
        card("10", 0),
        card("9", 1),
        card("7", 2),
        card("8", 3),
        card("2", 4),
        card("3", 5),
      ], 4),
      10,
    );

    expect(started.shoe.nextIndex).toBe(4);
    expect(started.shoe.shufflePending).toBe(true);

    const complete = standBlackjackHand(started.round, started.shoe);
    expect(complete.round.phase).toBe("complete");
    expect(complete.shoe.shufflePending).toBe(true);
    expect(complete.shoe.nextIndex).toBe(4);

    const reshuffled = reshuffleBlackjackShoeAtRoundBoundary(
      complete.shoe,
      () => 0.5,
    );
    expect(reshuffled).not.toBe(complete.shoe);
    expect(reshuffled.cards).toHaveLength(312);
    expect(reshuffled.nextIndex).toBe(0);
    expect(reshuffled.shufflePending).toBe(false);
  });
});
