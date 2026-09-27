import { describe, expect, it } from "vitest";
import type {
  BlackjackCard,
  BlackjackHand,
  BlackjackRound,
} from "./domain";
import { standBlackjackCurrentHand } from "./stand";
import { startBlackjackPlayerTurns } from "./turnEngine";

let sequence = 0;

function card(rank: BlackjackCard["rank"]): BlackjackCard {
  sequence += 1;
  return {
    cardId: `stand-card-${sequence}`,
    deckIndex: 0,
    suit: "CLUBS",
    rank,
  };
}

function hand(
  handId: string,
  seatNumber: 1 | 2,
  ranks: readonly BlackjackCard["rank"][],
): BlackjackHand {
  return {
    handId,
    playerId: `player-${seatNumber}`,
    seatNumber,
    cards: ranks.map(card),
    betCents: 1_000,
    status: "WAITING",
    origin: "INITIAL",
    splitDepth: 0,
    isSplitAce: false,
    isDoubled: false,
    result: null,
    payoutCents: 0,
  };
}

function startedRound(
  firstHand: BlackjackHand,
  secondHand?: BlackjackHand,
): BlackjackRound {
  const hands = secondHand ? [firstHand, secondHand] : [firstHand];
  const source: BlackjackRound = {
    roundId: "round-stand",
    roundNumber: 1,
    phase: "INITIAL_DEAL",
    activeSeatOrder: secondHand ? [1, 2] : [1],
    hands,
    dealer: {
      cards: [card("10"), card("7")],
      holeCardRevealed: false,
    },
    currentTurn: null,
    startedAtMs: 0,
    bettingClosesAtMs: 0,
    finishedAtMs: null,
  };

  return startBlackjackPlayerTurns(source, 1_000);
}

describe("blackjack STAND engine", () => {
  it("stands the current hand without changing its cards", () => {
    const round = startedRound(hand("h1", 1, ["10", "6"]));
    const beforeCards = round.hands[0].cards;

    const result = standBlackjackCurrentHand(round, {
      expectedHandId: "h1",
      expectedSeatNumber: 1,
      nowMs: 2_000,
    });

    expect(result.handId).toBe("h1");
    expect(result.turnAdvanced).toBe(true);
    expect(result.round.hands[0].status).toBe("STOOD");
    expect(result.round.hands[0].cards).toEqual(beforeCards);
  });

  it("advances deterministically to the next player", () => {
    const round = startedRound(
      hand("h1", 1, ["10", "6"]),
      hand("h2", 2, ["9", "7"]),
    );

    const result = standBlackjackCurrentHand(round, {
      expectedHandId: "h1",
      expectedSeatNumber: 1,
      nowMs: 3_000,
    });

    expect(result.round.currentTurn).toEqual({
      seatNumber: 2,
      handId: "h2",
      startedAtMs: 3_000,
      endsAtMs: 18_000,
    });
    expect(result.round.hands[0].status).toBe("STOOD");
    expect(result.round.hands[1].status).toBe("ACTIVE");
  });

  it("moves to DEALER_TURN after the final player stands", () => {
    const round = startedRound(hand("h1", 1, ["10", "6"]));

    const result = standBlackjackCurrentHand(round, {
      expectedHandId: "h1",
      expectedSeatNumber: 1,
      nowMs: 2_000,
    });

    expect(result.round.phase).toBe("DEALER_TURN");
    expect(result.round.currentTurn).toBeNull();
  });

  it("allows an ACTIVE split-Ace hand to stand", () => {
    const round = startedRound(
      {
        ...hand("h1", 1, ["A", "9"]),
        origin: "SPLIT",
        splitDepth: 1,
        isSplitAce: true,
      },
    );

    const result = standBlackjackCurrentHand(round, {
      expectedHandId: "h1",
      expectedSeatNumber: 1,
      nowMs: 2_000,
    });

    expect(result.round.hands[0].status).toBe("STOOD");
    expect(result.round.phase).toBe("DEALER_TURN");
  });

  it("rejects stale, foreign and late STAND commands", () => {
    const round = startedRound(hand("h1", 1, ["10", "6"]));

    expect(() =>
      standBlackjackCurrentHand(round, {
        expectedHandId: "old-hand",
        expectedSeatNumber: 1,
        nowMs: 2_000,
      }),
    ).toThrow(/stale or foreign/);

    expect(() =>
      standBlackjackCurrentHand(round, {
        expectedHandId: "h1",
        expectedSeatNumber: 2,
        nowMs: 2_000,
      }),
    ).toThrow(/stale or foreign/);

    expect(() =>
      standBlackjackCurrentHand(round, {
        expectedHandId: "h1",
        expectedSeatNumber: 1,
        nowMs: 16_000,
      }),
    ).toThrow(/after the turn deadline/);

    expect(round.hands[0].status).toBe("ACTIVE");
    expect(round.currentTurn?.handId).toBe("h1");
  });

  it("rejects non-ACTIVE hands", () => {
    const round = startedRound(hand("h1", 1, ["10", "6"]));
    const corrupt: BlackjackRound = {
      ...round,
      hands: [{ ...round.hands[0], status: "BUST" }],
    };

    expect(() =>
      standBlackjackCurrentHand(corrupt, {
        expectedHandId: "h1",
        expectedSeatNumber: 1,
        nowMs: 2_000,
      }),
    ).toThrow(/not legal/);
  });
});
