import { describe, expect, it } from "vitest";
import {
  type BlackjackCard,
  type BlackjackRank,
  type BlackjackSuit,
} from "./blackjackCore";
import {
  canDoubleBlackjackHand,
  doubleBlackjackHand,
  getBlackjackRoundReadiness,
  hitBlackjackHand,
  standBlackjackHand,
  startBlackjackRound,
} from "./roundState";
import {
  addSeatChip,
  clearSeatBet,
  createInitialSeatState,
  sitAtSeat,
  type BlackjackSeatState,
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

function onlySeatOne(): BlackjackSeatState {
  let state = createInitialSeatState();
  state = clearSeatBet(state, 3);
  state = clearSeatBet(state, 5);
  return state;
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
  it("deals seats 1 -> 5 around the table and skips natural blackjack for first action", () => {
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
      doubled: false,
      result: null,
    });
    expect(result.round.hands[1]).toMatchObject({
      seatId: 3,
      wager: 100,
      status: "playing",
      doubled: false,
    });
    expect(result.round.activeSeatId).toBe(3);
    expect(result.round.phase).toBe("playerTurns");
    expect(result.round.dealer.blackjack).toBe(false);
    expect(result.shoe.nextIndex).toBe(8);
  });

  it("settles immediately when the dealer has natural blackjack", () => {
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
    expect(result.round.phase).toBe("complete");
    expect(result.round.hands.every((hand) => hand.result === "lose")).toBe(true);
  });
});

describe("blackjack player actions and dealer resolution", () => {
  it("HIT draws exactly one card and keeps the same seat active below 21", () => {
    const cards = [
      card("5", 0),
      card("10", 1),
      card("6", 2),
      card("7", 3),
      card("4", 4),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);
    const hit = hitBlackjackHand(started.round, started.shoe);

    expect(hit.round.phase).toBe("playerTurns");
    expect(hit.round.activeSeatId).toBe(1);
    expect(hit.round.hands[0]).toMatchObject({ status: "playing", result: null });
    expect(hit.round.hands[0]?.cards).toHaveLength(3);
    expect(hit.round.hands[0]?.cards[2]?.id).toBe(cards[4]?.id);
    expect(hit.shoe.nextIndex).toBe(5);
  });

  it("HIT busts the active hand and advances to the next playable seat", () => {
    const state = createInitialSeatState();
    const cards = [
      card("10", 0),
      card("8", 1),
      card("7", 2),
      card("6", 3),
      card("9", 4),
      card("8", 5),
      card("7", 6),
      card("10", 7),
      card("5", 8),
    ];
    const started = startBlackjackRound(state, shoeWith(cards), 10);
    const hit = hitBlackjackHand(started.round, started.shoe);

    expect(started.round.activeSeatId).toBe(1);
    expect(hit.round.hands[0]?.status).toBe("bust");
    expect(hit.round.activeSeatId).toBe(3);
    expect(hit.round.phase).toBe("playerTurns");
  });

  it("HIT to exactly 21 auto-stands and advances", () => {
    const state = createInitialSeatState();
    const cards = [
      card("10", 0),
      card("8", 1),
      card("7", 2),
      card("6", 3),
      card("6", 4),
      card("8", 5),
      card("7", 6),
      card("10", 7),
      card("5", 8),
    ];
    const started = startBlackjackRound(state, shoeWith(cards), 10);
    const hit = hitBlackjackHand(started.round, started.shoe);

    expect(hit.round.hands[0]?.status).toBe("stood");
    expect(hit.round.activeSeatId).toBe(3);
  });

  it("STAND on the final hand makes dealer hit soft 17 and settles a loss", () => {
    const cards = [
      card("10", 0),
      card("A", 1),
      card("8", 2),
      card("6", 3),
      card("4", 4),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);
    const settled = standBlackjackHand(started.round, started.shoe);

    expect(settled.round.phase).toBe("complete");
    expect(settled.round.activeSeatId).toBeNull();
    expect(settled.round.dealer.cards).toHaveLength(3);
    expect(settled.round.dealer.cards[2]?.id).toBe(cards[4]?.id);
    expect(settled.round.hands[0]).toMatchObject({
      status: "stood",
      result: "lose",
      returnAmount: 0,
      netAmount: -50,
    });
  });

  it("pays a normal win 1:1 when the dealer busts", () => {
    const cards = [
      card("10", 0),
      card("10", 1),
      card("8", 2),
      card("6", 3),
      card("K", 4),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);
    const settled = standBlackjackHand(started.round, started.shoe);

    expect(settled.round.hands[0]).toMatchObject({
      result: "win",
      returnAmount: 100,
      netAmount: 50,
    });
  });

  it("returns the wager on a push", () => {
    const cards = [
      card("10", 0),
      card("10", 1),
      card("8", 2),
      card("8", 3),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);
    const settled = standBlackjackHand(started.round, started.shoe);

    expect(settled.round.hands[0]).toMatchObject({
      result: "push",
      returnAmount: 50,
      netAmount: 0,
    });
  });

  it("pays a natural blackjack at 3:2", () => {
    const cards = [
      card("A", 0),
      card("9", 1),
      card("K", 2),
      card("7", 3),
    ];
    const settled = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);

    expect(settled.round.phase).toBe("complete");
    expect(settled.round.hands[0]).toMatchObject({
      status: "blackjack",
      result: "blackjack",
      returnAmount: 125,
      netAmount: 75,
    });
  });

  it("pushes player blackjack against dealer blackjack", () => {
    const cards = [
      card("A", 0),
      card("A", 1, "hearts"),
      card("K", 2),
      card("K", 3, "hearts"),
    ];
    const settled = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);

    expect(settled.round.phase).toBe("complete");
    expect(settled.round.dealer.blackjack).toBe(true);
    expect(settled.round.hands[0]).toMatchObject({
      status: "blackjack",
      result: "push",
      returnAmount: 50,
      netAmount: 0,
    });
  });
});

describe("blackjack double down", () => {
  it("is available only while the active hand still has its original two cards", () => {
    const cards = [
      card("5", 0),
      card("10", 1),
      card("6", 2),
      card("7", 3),
      card("4", 4),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);

    expect(canDoubleBlackjackHand(started.round)).toBe(true);

    const hit = hitBlackjackHand(started.round, started.shoe);
    expect(hit.round.activeSeatId).toBe(1);
    expect(hit.round.hands[0]?.cards).toHaveLength(3);
    expect(canDoubleBlackjackHand(hit.round)).toBe(false);
  });

  it("doubles the wager, draws exactly one card, auto-stands and settles using the doubled stake", () => {
    const cards = [
      card("5", 0),
      card("10", 1),
      card("6", 2),
      card("7", 3),
      card("10", 4),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);
    const doubled = doubleBlackjackHand(started.round, started.shoe);

    expect(doubled.shoe.nextIndex).toBe(5);
    expect(doubled.round.phase).toBe("complete");
    expect(doubled.round.hands[0]).toMatchObject({
      wager: 100,
      doubled: true,
      status: "stood",
      result: "win",
      returnAmount: 200,
      netAmount: 100,
    });
    expect(doubled.round.hands[0]?.cards).toHaveLength(3);
  });

  it("a doubled bust loses the full doubled wager", () => {
    const cards = [
      card("10", 0),
      card("10", 1),
      card("6", 2),
      card("7", 3),
      card("10", 4),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);
    const doubled = doubleBlackjackHand(started.round, started.shoe);

    expect(doubled.round.hands[0]).toMatchObject({
      wager: 100,
      doubled: true,
      status: "bust",
      result: "lose",
      returnAmount: 0,
      netAmount: -100,
    });
  });

  it("advances to the next seat immediately after a double", () => {
    const state = createInitialSeatState();
    const cards = [
      card("5", 0),
      card("8", 1),
      card("7", 2),
      card("10", 3),
      card("6", 4),
      card("8", 5),
      card("7", 6),
      card("7", 7),
      card("10", 8),
    ];
    const started = startBlackjackRound(state, shoeWith(cards), 10);
    const doubled = doubleBlackjackHand(started.round, started.shoe);

    expect(doubled.round.hands[0]).toMatchObject({
      seatId: 1,
      wager: 100,
      doubled: true,
      status: "stood",
      result: null,
    });
    expect(doubled.round.activeSeatId).toBe(3);
    expect(doubled.round.phase).toBe("playerTurns");
  });
});
