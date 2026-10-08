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
  canTakeBlackjackInsurance,
  declineBlackjackInsurance,
  doubleBlackjackHand,
  getBlackjackInsuranceMaxWager,
  getBlackjackRoundReadiness,
  hitBlackjackHand,
  splitBlackjackHand,
  standBlackjackHand,
  startBlackjackRound,
  takeBlackjackInsurance,
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
  it("allows zero-bet seated positions to sit out and blocks below-minimum wagers", () => {
    let state = sitAtSeat(createInitialSeatState(), 2);
    expect(getBlackjackRoundReadiness(state, 10)).toMatchObject({
      canDeal: true,
      participatingSeatIds: [1, 3, 5],
      blockingSeatIds: [],
    });

    state = addSeatChip(state, 2, 5, 10);
    expect(getBlackjackRoundReadiness(state, 10)).toMatchObject({
      canDeal: false,
      participatingSeatIds: [1, 3, 5],
      blockingSeatIds: [2],
    });
  });

  it("requires at least one bet-ready seat", () => {
    let state = createInitialSeatState();
    state = clearSeatBet(state, 1);
    state = clearSeatBet(state, 3);
    state = clearSeatBet(state, 5);

    expect(() => startBlackjackRound(state, shoeWith([]), 10)).toThrow(
      /at least one bet-ready seat/,
    );
  });
});

describe("blackjack initial deal", () => {
  it("deals seats 1 -> 5 and skips a natural blackjack for first player action", () => {
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
    const result = startBlackjackRound(createInitialSeatState(), shoeWith(cards), 10);

    expect(result.round.hands.map((hand) => hand.seatId)).toEqual([1, 3, 5]);
    expect(result.round.hands[0]).toMatchObject({
      seatId: 1,
      wager: 50,
      status: "blackjack",
      insuranceDecision: "notOffered",
    });
    expect(result.round.activeHandId).toBe("seat-3-hand-0");
    expect(result.round.activeSeatId).toBe(3);
    expect(result.round.phase).toBe("playerTurns");
    expect(result.shoe.nextIndex).toBe(8);
  });

  it("still resolves a dealer natural immediately when the upcard is not Ace", () => {
    const cards = [
      card("9", 0),
      card("8", 1),
      card("7", 2),
      card("K", 3),
      card("9", 4, "clubs"),
      card("8", 5, "clubs"),
      card("7", 6, "clubs"),
      card("A", 7, "hearts"),
    ];
    const result = startBlackjackRound(createInitialSeatState(), shoeWith(cards), 10);

    expect(result.round.dealer.blackjack).toBe(true);
    expect(result.round.phase).toBe("complete");
    expect(result.round.hands.every((hand) => hand.result === "lose")).toBe(true);
  });
});

describe("blackjack insurance", () => {
  it("enters insurance phase on dealer Ace and pays the side bet 2:1 after a dealer blackjack peek", () => {
    const cards = [
      card("9", 0),
      card("A", 1),
      card("7", 2),
      card("K", 3),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);

    expect(started.round.phase).toBe("insurance");
    expect(started.round.activeSeatId).toBe(1);
    expect(started.round.dealer.blackjack).toBe(true);
    expect(canTakeBlackjackInsurance(started.round)).toBe(true);
    expect(getBlackjackInsuranceMaxWager(started.round.hands[0]!)).toBe(25);

    const insured = takeBlackjackInsurance(started.round, started.shoe);
    expect(insured.round.phase).toBe("complete");
    expect(insured.round.hands[0]).toMatchObject({
      result: "lose",
      insuranceDecision: "taken",
      insuranceWager: 25,
      insuranceReturnAmount: 75,
      insuranceNetAmount: 50,
    });
  });

  it("loses accepted insurance when dealer peek is not blackjack, then continues player action", () => {
    const cards = [
      card("9", 0),
      card("A", 1),
      card("7", 2),
      card("6", 3),
      card("10", 4),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);
    const insured = takeBlackjackInsurance(started.round, started.shoe);

    expect(insured.round.phase).toBe("playerTurns");
    expect(insured.round.activeSeatId).toBe(1);
    expect(insured.round.hands[0]).toMatchObject({
      insuranceDecision: "taken",
      insuranceWager: 25,
      insuranceReturnAmount: 0,
      insuranceNetAmount: -25,
    });
  });

  it("moves insurance decisions through all participating seats before the dealer peek resolves", () => {
    const cards = [
      card("9", 0),
      card("8", 1),
      card("7", 2),
      card("A", 3),
      card("7", 4),
      card("7", 5),
      card("7", 6),
      card("6", 7),
    ];
    const started = startBlackjackRound(createInitialSeatState(), shoeWith(cards), 10);
    expect(started.round.activeSeatId).toBe(1);

    const seat1 = takeBlackjackInsurance(started.round, started.shoe);
    expect(seat1.round.phase).toBe("insurance");
    expect(seat1.round.activeSeatId).toBe(3);

    const seat3 = declineBlackjackInsurance(seat1.round, seat1.shoe);
    expect(seat3.round.activeSeatId).toBe(5);

    const seat5 = takeBlackjackInsurance(seat3.round, seat3.shoe);
    expect(seat5.round.phase).toBe("playerTurns");
    expect(seat5.round.activeSeatId).toBe(1);
    expect(seat5.round.hands.map((hand) => hand.insuranceWager)).toEqual([25, 0, 62.5]);
    expect(seat5.round.hands.map((hand) => hand.insuranceNetAmount)).toEqual([-25, 0, -62.5]);
  });

  it("declining insurance records no side-bet loss", () => {
    const cards = [
      card("10", 0),
      card("A", 1),
      card("8", 2),
      card("6", 3),
      card("10", 4),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);
    const declined = declineBlackjackInsurance(started.round, started.shoe);

    expect(declined.round.phase).toBe("playerTurns");
    expect(declined.round.hands[0]).toMatchObject({
      insuranceDecision: "declined",
      insuranceWager: 0,
      insuranceReturnAmount: 0,
      insuranceNetAmount: 0,
    });
  });

  it("does not duplicate an already-settled insurance side bet when the main hand later splits", () => {
    const cards = [
      card("8", 0),
      card("A", 1),
      card("8", 2),
      card("6", 3),
      card("2", 4),
      card("3", 5),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);
    const insured = takeBlackjackInsurance(started.round, started.shoe);
    const split = splitBlackjackHand(insured.round, insured.shoe);

    expect(split.round.hands).toHaveLength(2);
    expect(split.round.hands.reduce((sum, hand) => sum + hand.insuranceWager, 0)).toBe(25);
    expect(split.round.hands[0]?.insuranceDecision).toBe("taken");
    expect(split.round.hands[1]?.insuranceDecision).toBe("notOffered");
  });
});

describe("blackjack player actions and settlement", () => {
  it("HIT below 21 keeps the same hand active and 21 auto-stands", () => {
    const belowCards = [
      card("5", 0),
      card("10", 1),
      card("6", 2),
      card("7", 3),
      card("4", 4),
    ];
    const below = startBlackjackRound(onlySeatOne(), shoeWith(belowCards), 10);
    const hit = hitBlackjackHand(below.round, below.shoe);
    expect(hit.round.phase).toBe("playerTurns");
    expect(hit.round.activeSeatId).toBe(1);
    expect(hit.round.hands[0]?.cards).toHaveLength(3);

    const twentyOneCards = [
      card("10", 0),
      card("8", 1),
      card("6", 2),
      card("7", 3),
      card("5", 4),
    ];
    const twentyOne = startBlackjackRound(onlySeatOne(), shoeWith(twentyOneCards), 10);
    const finished = hitBlackjackHand(twentyOne.round, twentyOne.shoe);
    expect(finished.round.hands[0]?.status).toBe("stood");
  });

  it("dealer hits soft 17 and normal win/push/blackjack payouts remain correct", () => {
    const soft17Cards = [
      card("10", 0),
      card("6", 1),
      card("8", 2),
      card("A", 3),
      card("4", 4),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(soft17Cards), 10);
    const settled = standBlackjackHand(started.round, started.shoe);
    expect(settled.round.dealer.cards).toHaveLength(3);
    expect(settled.round.hands[0]).toMatchObject({ result: "lose", returnAmount: 0 });

    const pushCards = [card("10", 0), card("10", 1), card("8", 2), card("8", 3)];
    const pushed = standBlackjackHand(
      startBlackjackRound(onlySeatOne(), shoeWith(pushCards), 10).round,
      startBlackjackRound(onlySeatOne(), shoeWith(pushCards), 10).shoe,
    );
    expect(pushed.round.hands[0]).toMatchObject({ result: "push", returnAmount: 50 });

    const blackjackCards = [card("A", 0), card("9", 1), card("K", 2), card("7", 3)];
    const blackjack = startBlackjackRound(onlySeatOne(), shoeWith(blackjackCards), 10);
    expect(blackjack.round.hands[0]).toMatchObject({
      result: "blackjack",
      returnAmount: 125,
      netAmount: 75,
    });
  });

  it("pushes player blackjack against dealer blackjack without an insurance offer when dealer shows ten", () => {
    const cards = [
      card("A", 0),
      card("K", 1),
      card("K", 2),
      card("A", 3),
    ];
    const settled = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);

    expect(settled.round.phase).toBe("complete");
    expect(settled.round.hands[0]).toMatchObject({
      result: "push",
      returnAmount: 50,
      insuranceDecision: "notOffered",
    });
  });
});

describe("blackjack double and split", () => {
  it("DOUBLE is two-card only, doubles wager, draws one card and auto-closes", () => {
    const cards = [
      card("5", 0),
      card("10", 1),
      card("6", 2),
      card("7", 3),
      card("10", 4),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);
    expect(canDoubleBlackjackHand(started.round)).toBe(true);

    const doubled = doubleBlackjackHand(started.round, started.shoe);
    expect(doubled.round.hands[0]).toMatchObject({
      wager: 100,
      doubled: true,
      status: "stood",
      result: "win",
      returnAmount: 200,
    });
  });

  it("supports equal-value split, DAS and up to four hands", () => {
    const dasCards = [
      card("8", 0),
      card("10", 1),
      card("8", 2),
      card("7", 3),
      card("3", 4),
      card("2", 5),
      card("10", 6),
    ];
    const dasStart = startBlackjackRound(onlySeatOne(), shoeWith(dasCards), 10);
    const dasSplit = splitBlackjackHand(dasStart.round, dasStart.shoe);
    expect(canDoubleBlackjackHand(dasSplit.round)).toBe(true);

    const cards = [
      card("8", 0),
      card("10", 1),
      card("8", 2),
      card("7", 3),
      card("8", 4),
      card("3", 5),
      card("8", 6),
      card("4", 7),
      card("2", 8),
      card("5", 9),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);
    const split1 = splitBlackjackHand(started.round, started.shoe);
    const split2 = splitBlackjackHand(split1.round, split1.shoe);
    const split3 = splitBlackjackHand(split2.round, split2.shoe);

    expect(split3.round.hands).toHaveLength(BLACKJACK_MAX_HANDS_PER_SEAT);
    expect(split3.round.hands.map((hand) => hand.handIndex)).toEqual([0, 1, 2, 3]);
    expect(canSplitBlackjackHand(split3.round)).toBe(false);
  });

  it("split Aces receive one card each, auto-stand and cannot DAS/resplit", () => {
    const cards = [
      card("A", 0),
      card("10", 1),
      card("A", 2),
      card("7", 3),
      card("A", 4),
      card("K", 5),
    ];
    const started = startBlackjackRound(onlySeatOne(), shoeWith(cards), 10);
    const split = splitBlackjackHand(started.round, started.shoe);

    expect(split.round.hands.every((hand) => hand.splitFromAces)).toBe(true);
    expect(split.round.hands.every((hand) => hand.cards.length === 2)).toBe(true);
    expect(split.round.hands.every((hand) => hand.status === "stood")).toBe(true);
    expect(split.round.hands.every((hand) => hand.result !== "blackjack")).toBe(true);
    expect(canDoubleBlackjackHand(split.round)).toBe(false);
    expect(canSplitBlackjackHand(split.round)).toBe(false);
  });
});
