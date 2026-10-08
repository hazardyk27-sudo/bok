import { describe, expect, it } from "vitest";
import {
  type BlackjackCard,
  type BlackjackRank,
  type BlackjackSuit,
} from "./blackjackCore";
import {
  BLACKJACK_MAX_HANDS_PER_SEAT,
  canDoubleBlackjackHand,
  canSplitBlackjackHand,
  doubleBlackjackHand,
  getBlackjackRoundReadiness,
  hitBlackjackHand,
  splitBlackjackHand,
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
      handId: "seat-1-hand-0",
      seatId: 1,
      wager: 50,
      status: "blackjack",
      doubled: false,
      splitFromAces: false,
      result: null,
    });
    expect(result.round.hands[1]).toMatchObject({
      handId: "seat-3-hand-0",
      seatId: 3,
      wager: 100,
      status: "playing",
      doubled: false,
    });
    expect(result.round.activeHandId).toBe("seat-3-hand-0");
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
    expect(result.round.activeHandId).toBeNull();
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
  it("is available only while the active hand still has two cards", () => {
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

describe("blackjack split", () => {
  it("allows equal blackjack values such as 10 + K and creates two independent hands", () => {
    const cards = [
      card("10", 0),
      card("6", 1, "hearts"),
      card("K", 2, "clubs"),
      card("10", 3, "diamonds"),
      card("2", 4, "hearts"),
      card("3", 5, "clubs"),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);

    expect(canSplitBlackjackHand(started.round)).toBe(true);

    const split = splitBlackjackHand(started.round, started.shoe);
    expect(split.round.hands).toHaveLength(2);
    expect(split.round.hands[0]).toMatchObject({
      handId: "seat-1-hand-0-L",
      seatId: 1,
      handIndex: 0,
      splitDepth: 1,
      splitFromAces: false,
      wager: 50,
      status: "playing",
    });
    expect(split.round.hands[1]).toMatchObject({
      handId: "seat-1-hand-0-R",
      seatId: 1,
      handIndex: 1,
      splitDepth: 1,
      splitFromAces: false,
      wager: 50,
      status: "playing",
    });
    expect(split.round.hands[0]?.cards.map((candidate) => candidate.rank)).toEqual(["10", "2"]);
    expect(split.round.hands[1]?.cards.map((candidate) => candidate.rank)).toEqual(["K", "3"]);
    expect(split.round.activeHandId).toBe("seat-1-hand-0-L");
    expect(split.round.activeSeatId).toBe(1);
    expect(split.shoe.nextIndex).toBe(6);
  });

  it("moves from hand 1 to hand 2 within the same seat before leaving that seat", () => {
    const cards = [
      card("8", 0),
      card("10", 1),
      card("8", 2, "hearts"),
      card("7", 3),
      card("2", 4),
      card("3", 5),
      card("10", 6),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);
    const split = splitBlackjackHand(started.round, started.shoe);
    const firstStand = standBlackjackHand(split.round, split.shoe);

    expect(firstStand.round.phase).toBe("playerTurns");
    expect(firstStand.round.activeSeatId).toBe(1);
    expect(firstStand.round.activeHandId).toBe("seat-1-hand-0-R");
    expect(firstStand.round.hands[0]?.status).toBe("stood");
    expect(firstStand.round.hands[1]?.status).toBe("playing");

    const secondStand = standBlackjackHand(firstStand.round, firstStand.shoe);
    expect(secondStand.round.phase).toBe("complete");
    expect(secondStand.round.activeHandId).toBeNull();
  });

  it("does not treat a split two-card 21 as natural blackjack", () => {
    const cards = [
      card("10", 0),
      card("9", 1),
      card("K", 2, "hearts"),
      card("7", 3),
      card("A", 4),
      card("A", 5, "hearts"),
      card("10", 6, "clubs"),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);
    const split = splitBlackjackHand(started.round, started.shoe);

    expect(split.round.phase).toBe("complete");
    expect(split.round.hands).toHaveLength(2);
    expect(split.round.hands.every((hand) => hand.status === "stood")).toBe(true);
    expect(split.round.hands.every((hand) => hand.result === "win")).toBe(true);
    expect(split.round.hands.every((hand) => hand.returnAmount === 100)).toBe(true);
  });

  it("allows double after split for normal split hands", () => {
    const cards = [
      card("8", 0),
      card("10", 1),
      card("8", 2, "hearts"),
      card("7", 3),
      card("3", 4),
      card("2", 5),
      card("10", 6),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);
    const split = splitBlackjackHand(started.round, started.shoe);

    expect(canDoubleBlackjackHand(split.round)).toBe(true);

    const doubled = doubleBlackjackHand(split.round, split.shoe);
    expect(doubled.round.hands[0]).toMatchObject({
      handIndex: 0,
      wager: 100,
      doubled: true,
      status: "stood",
    });
    expect(doubled.round.activeHandId).toBe("seat-1-hand-0-R");
  });

  it("resplits normal pairs up to four total hands and blocks a fifth", () => {
    const cards = [
      card("8", 0),
      card("10", 1),
      card("8", 2, "hearts"),
      card("7", 3),
      card("8", 4, "clubs"),
      card("3", 5),
      card("8", 6, "diamonds"),
      card("4", 7),
      card("2", 8),
      card("5", 9),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);
    const split1 = splitBlackjackHand(started.round, started.shoe);
    expect(split1.round.hands).toHaveLength(2);
    expect(canSplitBlackjackHand(split1.round)).toBe(true);

    const split2 = splitBlackjackHand(split1.round, split1.shoe);
    expect(split2.round.hands).toHaveLength(3);
    expect(split2.round.hands.map((hand) => hand.handIndex)).toEqual([0, 1, 2]);
    expect(canSplitBlackjackHand(split2.round)).toBe(true);

    const split3 = splitBlackjackHand(split2.round, split2.shoe);
    expect(split3.round.hands).toHaveLength(BLACKJACK_MAX_HANDS_PER_SEAT);
    expect(split3.round.hands.map((hand) => hand.handIndex)).toEqual([0, 1, 2, 3]);
    expect(canSplitBlackjackHand(split3.round)).toBe(false);
    expect(split3.round.hands.reduce((total, hand) => total + hand.wager, 0)).toBe(200);
  });

  it("gives split aces one card per hand, auto-stands them and forbids DAS/resplit", () => {
    const cards = [
      card("A", 0),
      card("10", 1),
      card("A", 2, "hearts"),
      card("7", 3),
      card("A", 4, "clubs"),
      card("K", 5, "diamonds"),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);
    const split = splitBlackjackHand(started.round, started.shoe);

    expect(split.shoe.nextIndex).toBe(6);
    expect(split.round.phase).toBe("complete");
    expect(split.round.hands).toHaveLength(2);
    expect(split.round.hands.every((hand) => hand.splitFromAces)).toBe(true);
    expect(split.round.hands.every((hand) => hand.cards.length === 2)).toBe(true);
    expect(split.round.hands.every((hand) => hand.status === "stood")).toBe(true);
    expect(split.round.hands.every((hand) => hand.result !== "blackjack")).toBe(true);
    expect(canDoubleBlackjackHand(split.round)).toBe(false);
    expect(canSplitBlackjackHand(split.round)).toBe(false);
  });

  it("does not allow split after HIT or for unequal values", () => {
    const unequalCards = [
      card("8", 0),
      card("10", 1),
      card("7", 2),
      card("7", 3),
      card("2", 4),
    ];
    const unequal = startBlackjackRound(onlySeatOne(), shoeWith(unequalCards), 10);
    expect(canSplitBlackjackHand(unequal.round)).toBe(false);

    const pairCards = [
      card("5", 0),
      card("10", 1),
      card("5", 2),
      card("7", 3),
      card("2", 4),
    ];
    const pair = startBlackjackRound(onlySeatOne(), shoeWith(pairCards), 10);
    expect(canSplitBlackjackHand(pair.round)).toBe(true);
    const hit = hitBlackjackHand(pair.round, pair.shoe);
    expect(canSplitBlackjackHand(hit.round)).toBe(false);
  });
});
