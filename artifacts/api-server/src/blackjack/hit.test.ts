import { describe, expect, it } from "vitest";
import type {
  BlackjackCard,
  BlackjackHand,
  BlackjackRound,
  BlackjackShoe,
} from "./domain";
import { hitBlackjackCurrentHand } from "./hit";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { startBlackjackPlayerTurns } from "./turnEngine";

let sequence = 0;

function card(rank: BlackjackCard["rank"]): BlackjackCard {
  sequence += 1;
  return {
    cardId: `hit-hand-card-${sequence}`,
    deckIndex: 0,
    suit: "HEARTS",
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
    roundId: "round-hit",
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

function shoeWithNextRank(
  rank: BlackjackCard["rank"],
  shoeId: string,
): BlackjackShoe {
  const source = createUnshuffledBlackjackShoe({
    shoeId,
    createdAtMs: 1,
  });
  const cards = [...source.cards];
  const targetIndex = cards.findIndex((candidate) => candidate.rank === rank);
  [cards[0], cards[targetIndex]] = [cards[targetIndex], cards[0]];

  return {
    ...source,
    cards,
  };
}

describe("blackjack HIT engine", () => {
  it("draws exactly one authoritative shoe card and refreshes timer under 21", () => {
    const round = startedRound(hand("h1", 1, ["10", "5"]));
    const sourceShoe = shoeWithNextRank("A", "hit-under-21");

    const result = hitBlackjackCurrentHand(round, sourceShoe, {
      expectedHandId: "h1",
      expectedSeatNumber: 1,
      nowMs: 5_000,
    });

    expect(result.card.rank).toBe("A");
    expect(result.handTotal).toBe(16);
    expect(result.turnAdvanced).toBe(false);
    expect(result.shoe.nextIndex).toBe(sourceShoe.nextIndex + 1);
    expect(sourceShoe.nextIndex).toBe(0);
    expect(result.round.currentTurn).toEqual({
      seatNumber: 1,
      handId: "h1",
      startedAtMs: 5_000,
      endsAtMs: 20_000,
    });
    expect(result.round.hands[0].cards).toHaveLength(3);
    expect(result.round.hands[0].status).toBe("ACTIVE");
  });

  it("auto-stands on 21 and advances to the next player", () => {
    const round = startedRound(
      hand("h1", 1, ["10", "5"]),
      hand("h2", 2, ["9", "7"]),
    );
    const sourceShoe = shoeWithNextRank("6", "hit-21");

    const result = hitBlackjackCurrentHand(round, sourceShoe, {
      expectedHandId: "h1",
      expectedSeatNumber: 1,
      nowMs: 3_000,
    });

    expect(result.handTotal).toBe(21);
    expect(result.turnAdvanced).toBe(true);
    expect(result.round.hands[0].status).toBe("STOOD");
    expect(result.round.currentTurn).toEqual({
      seatNumber: 2,
      handId: "h2",
      startedAtMs: 3_000,
      endsAtMs: 18_000,
    });
  });

  it("marks BUST and advances after a busting card", () => {
    const round = startedRound(
      hand("h1", 1, ["10", "6"]),
      hand("h2", 2, ["9", "7"]),
    );
    const sourceShoe = shoeWithNextRank("K", "hit-bust");

    const result = hitBlackjackCurrentHand(round, sourceShoe, {
      expectedHandId: "h1",
      expectedSeatNumber: 1,
      nowMs: 2_000,
    });

    expect(result.handTotal).toBe(26);
    expect(result.round.hands[0].status).toBe("BUST");
    expect(result.round.currentTurn?.handId).toBe("h2");
  });

  it("moves to DEALER_TURN when HIT resolves the final player hand", () => {
    const round = startedRound(hand("h1", 1, ["10", "5"]));
    const sourceShoe = shoeWithNextRank("6", "hit-final-21");

    const result = hitBlackjackCurrentHand(round, sourceShoe, {
      expectedHandId: "h1",
      expectedSeatNumber: 1,
      nowMs: 2_000,
    });

    expect(result.round.phase).toBe("DEALER_TURN");
    expect(result.round.currentTurn).toBeNull();
  });

  it("rejects stale, foreign or late HIT without consuming a card", () => {
    const round = startedRound(hand("h1", 1, ["10", "5"]));
    const sourceShoe = shoeWithNextRank("A", "hit-reject");

    expect(() =>
      hitBlackjackCurrentHand(round, sourceShoe, {
        expectedHandId: "old-hand",
        expectedSeatNumber: 1,
        nowMs: 2_000,
      }),
    ).toThrow(/stale or foreign/);

    expect(() =>
      hitBlackjackCurrentHand(round, sourceShoe, {
        expectedHandId: "h1",
        expectedSeatNumber: 2,
        nowMs: 2_000,
      }),
    ).toThrow(/stale or foreign/);

    expect(() =>
      hitBlackjackCurrentHand(round, sourceShoe, {
        expectedHandId: "h1",
        expectedSeatNumber: 1,
        nowMs: 16_000,
      }),
    ).toThrow(/after the turn deadline/);

    expect(sourceShoe.nextIndex).toBe(0);
  });

  it("rejects illegal HIT states before touching the shoe", () => {
    const round = startedRound(hand("h1", 1, ["10", "5"]));
    const sourceShoe = shoeWithNextRank("A", "hit-illegal");
    const splitAceRound: BlackjackRound = {
      ...round,
      hands: [
        {
          ...round.hands[0],
          origin: "SPLIT",
          splitDepth: 1,
          isSplitAce: true,
        },
      ],
    };

    expect(() =>
      hitBlackjackCurrentHand(splitAceRound, sourceShoe, {
        expectedHandId: "h1",
        expectedSeatNumber: 1,
        nowMs: 2_000,
      }),
    ).toThrow(/not legal/);

    expect(sourceShoe.nextIndex).toBe(0);
  });
});
