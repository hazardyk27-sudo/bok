import { describe, expect, it } from "vitest";
import { type BlackjackCard, type BlackjackRank, type BlackjackSuit } from "./blackjackCore";
import {
  getBlackjackRoundReadiness,
  startBlackjackRound,
} from "./roundState";
import {
  addSeatChip,
  clearSeatBet,
  createInitialSeatState,
  sitAtSeat,
} from "./seatState";
import { type BlackjackShoe } from "./shoe";

function card(
  rank: BlackjackRank,
  index: number,
  suit: BlackjackSuit = "spades",
): BlackjackCard {
  return {
    id: `round-test:${index}:${rank}:${suit}`,
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

describe("blackjack round readiness", () => {
  it("allows zero-bet seated positions to sit out", () => {
    const state = sitAtSeat(createInitialSeatState(), 2);
    const readiness = getBlackjackRoundReadiness(state, 10);

    expect(readiness.canDeal).toBe(true);
    expect(readiness.participatingSeatIds).toEqual([1, 3, 5]);
    expect(readiness.blockingSeatIds).toEqual([]);
  });

  it("blocks the deal when any occupied seat has a below-minimum wager", () => {
    let state = sitAtSeat(createInitialSeatState(), 2);
    state = addSeatChip(state, 2, 5, 10);

    const readiness = getBlackjackRoundReadiness(state, 10);

    expect(readiness.canDeal).toBe(false);
    expect(readiness.participatingSeatIds).toEqual([1, 3, 5]);
    expect(readiness.blockingSeatIds).toEqual([2]);
  });

  it("requires at least one bet-ready seat", () => {
    let state = createInitialSeatState();
    state = clearSeatBet(state, 1);
    state = clearSeatBet(state, 3);
    state = clearSeatBet(state, 5);

    expect(getBlackjackRoundReadiness(state, 10).canDeal).toBe(false);
    expect(() => startBlackjackRound(state, shoeWith([]), 10)).toThrow(
      /at least one bet-ready seat/,
    );
  });
});

describe("blackjack initial deal", () => {
  it("deals seats 1 -> 5 around the table, hides dealer logic separately, and skips natural blackjack for first action", () => {
    const state = createInitialSeatState();
    const cards = [
      card("A", 0),
      card("10", 1, "hearts"),
      card("9", 2, "clubs"),
      card("K", 3, "diamonds"),
      card("K", 4, "clubs"),
      card("7", 5, "clubs"),
      card("8", 6, "clubs"),
      card("6", 7, "hearts"),
    ];

    const result = startBlackjackRound(state, shoeWith(cards), 10);

    expect(result.round.hands.map((hand) => hand.seatId)).toEqual([1, 3, 5]);
    expect(result.round.hands[0]?.cards.map((candidate) => candidate.id)).toEqual([
      cards[0]?.id,
      cards[4]?.id,
    ]);
    expect(result.round.hands[1]?.cards.map((candidate) => candidate.id)).toEqual([
      cards[1]?.id,
      cards[5]?.id,
    ]);
    expect(result.round.hands[2]?.cards.map((candidate) => candidate.id)).toEqual([
      cards[2]?.id,
      cards[6]?.id,
    ]);
    expect(result.round.dealer.cards.map((candidate) => candidate.id)).toEqual([
      cards[3]?.id,
      cards[7]?.id,
    ]);

    expect(result.round.hands[0]).toMatchObject({
      seatId: 1,
      wager: 50,
      status: "blackjack",
    });
    expect(result.round.hands[1]).toMatchObject({
      seatId: 3,
      wager: 100,
      status: "playing",
    });
    expect(result.round.activeSeatId).toBe(3);
    expect(result.round.phase).toBe("playerTurns");
    expect(result.round.dealer.blackjack).toBe(false);
    expect(result.shoe.nextIndex).toBe(8);
  });

  it("moves directly to dealer resolution when the dealer has natural blackjack", () => {
    const state = createInitialSeatState();
    const cards = [
      card("9", 0),
      card("8", 1),
      card("7", 2),
      card("A", 3),
      card("9", 4, "clubs"),
      card("8", 5, "clubs"),
      card("7", 6, "clubs"),
      card("K", 7, "hearts"),
    ];

    const result = startBlackjackRound(state, shoeWith(cards), 10);

    expect(result.round.dealer.blackjack).toBe(true);
    expect(result.round.activeSeatId).toBeNull();
    expect(result.round.phase).toBe("dealerTurn");
  });
});
