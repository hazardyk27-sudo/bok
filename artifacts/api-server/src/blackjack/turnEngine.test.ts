import { describe, expect, it } from "vitest";
import type {
  BlackjackCard,
  BlackjackHand,
  BlackjackRound,
  BlackjackSeatNumber,
} from "./domain";
import {
  advanceBlackjackTurnAfterHandResolution,
  applyBlackjackTurnTimeout,
  getBlackjackOrderedHandIds,
  getBlackjackTurnRemainingMs,
  startBlackjackPlayerTurns,
} from "./turnEngine";

let cardSequence = 0;
function card(rank: BlackjackCard["rank"]): BlackjackCard {
  cardSequence += 1;
  return {
    cardId: `turn-card-${cardSequence}`,
    deckIndex: 0,
    suit: "SPADES",
    rank,
  };
}

function hand(
  handId: string,
  seatNumber: BlackjackSeatNumber,
  status: BlackjackHand["status"] = "WAITING",
): BlackjackHand {
  return {
    handId,
    playerId: `player-${seatNumber}`,
    seatNumber,
    cards: [card("10"), card("6")],
    betCents: 1_000,
    status,
    origin: "INITIAL",
    splitDepth: 0,
    isSplitAce: false,
    isDoubled: false,
    result: null,
    payoutCents: 0,
  };
}

function round(
  hands: readonly BlackjackHand[],
  activeSeatOrder: readonly BlackjackSeatNumber[],
): BlackjackRound {
  return {
    roundId: "round-turns",
    roundNumber: 1,
    phase: "INITIAL_DEAL",
    activeSeatOrder,
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
}

describe("blackjack turn engine", () => {
  it("starts with the lowest active seat and uses a 15 second server timer", () => {
    const source = round(
      [hand("h5", 5), hand("h1", 1), hand("h3", 3)],
      [1, 3, 5],
    );

    const started = startBlackjackPlayerTurns(source, 1_000);

    expect(started.phase).toBe("PLAYER_TURNS");
    expect(started.currentTurn).toEqual({
      seatNumber: 1,
      handId: "h1",
      startedAtMs: 1_000,
      endsAtMs: 16_000,
    });
    expect(
      started.hands.find((candidate) => candidate.handId === "h1")?.status,
    ).toBe("ACTIVE");
    expect(getBlackjackTurnRemainingMs(started, 2_500)).toBe(13_500);
  });

  it("skips natural Blackjack and other non-WAITING hands", () => {
    const source = round(
      [
        hand("blackjack", 1, "BLACKJACK"),
        hand("waiting", 2),
        hand("stood", 3, "STOOD"),
      ],
      [1, 2, 3],
    );

    const started = startBlackjackPlayerTurns(source, 100);

    expect(started.currentTurn?.handId).toBe("waiting");
    expect(started.currentTurn?.seatNumber).toBe(2);
  });

  it("preserves per-seat hand order for future split hands", () => {
    const source = round(
      [
        hand("seat-2-hand-a", 2),
        hand("seat-1-hand-a", 1),
        hand("seat-1-hand-b", 1),
        hand("seat-3-hand-a", 3),
      ],
      [1, 2, 3],
    );

    expect(getBlackjackOrderedHandIds(source)).toEqual([
      "seat-1-hand-a",
      "seat-1-hand-b",
      "seat-2-hand-a",
      "seat-3-hand-a",
    ]);
  });

  it("does nothing before the deadline and Auto Stands exactly at timeout", () => {
    const started = startBlackjackPlayerTurns(
      round([hand("h1", 1), hand("h2", 2)], [1, 2]),
      1_000,
    );

    expect(applyBlackjackTurnTimeout(started, 15_999)).toBe(started);

    const timedOut = applyBlackjackTurnTimeout(started, 16_000);
    expect(
      timedOut.hands.find((candidate) => candidate.handId === "h1")?.status,
    ).toBe("STOOD");
    expect(timedOut.currentTurn).toEqual({
      seatNumber: 2,
      handId: "h2",
      startedAtMs: 16_000,
      endsAtMs: 31_000,
    });
  });

  it("moves directly to DEALER_TURN after the final player hand times out", () => {
    const started = startBlackjackPlayerTurns(
      round([hand("only-hand", 4)], [4]),
      10,
    );

    const timedOut = applyBlackjackTurnTimeout(started, 15_010);

    expect(timedOut.phase).toBe("DEALER_TURN");
    expect(timedOut.currentTurn).toBeNull();
    expect(timedOut.hands[0].status).toBe("STOOD");
  });

  it("advances only after the current hand is actually resolved", () => {
    const started = startBlackjackPlayerTurns(
      round([hand("h1", 1), hand("h2", 2)], [1, 2]),
      100,
    );

    expect(() =>
      advanceBlackjackTurnAfterHandResolution(started, 200),
    ).toThrow(/must be resolved/);

    const resolved: BlackjackRound = {
      ...started,
      hands: started.hands.map((candidate) =>
        candidate.handId === "h1"
          ? { ...candidate, status: "STOOD" }
          : candidate,
      ),
    };
    const advanced = advanceBlackjackTurnAfterHandResolution(resolved, 200);

    expect(advanced.currentTurn?.handId).toBe("h2");
    expect(advanced.currentTurn?.startedAtMs).toBe(200);
  });

  it("skips player phase entirely when every hand is already terminal", () => {
    const source = round(
      [hand("bj", 1, "BLACKJACK"), hand("bust", 2, "BUST")],
      [1, 2],
    );

    const started = startBlackjackPlayerTurns(source, 100);

    expect(started.phase).toBe("DEALER_TURN");
    expect(started.currentTurn).toBeNull();
  });

  it("rejects malformed turn order or seat ownership instead of guessing", () => {
    const duplicateSeatOrder = round([hand("h1", 1)], [1, 1]);
    expect(() => getBlackjackOrderedHandIds(duplicateSeatOrder)).toThrow(
      /duplicate seats/,
    );

    const missingSeat = round([hand("h5", 5)], [1]);
    expect(() => getBlackjackOrderedHandIds(missingSeat)).toThrow(
      /active seat 1 has no hand/,
    );

    const activeBeforeStart = round([hand("active", 1, "ACTIVE")], [1]);
    expect(() => startBlackjackPlayerTurns(activeBeforeStart, 100)).toThrow(
      /cannot contain an ACTIVE hand/,
    );

    const started = startBlackjackPlayerTurns(
      round([hand("h1", 1)], [1]),
      100,
    );
    const corrupt: BlackjackRound = {
      ...started,
      currentTurn: {
        ...started.currentTurn!,
        seatNumber: 2,
      },
    };

    expect(() => applyBlackjackTurnTimeout(corrupt, 15_100)).toThrow(
      /does not match hand owner/,
    );
  });
});
