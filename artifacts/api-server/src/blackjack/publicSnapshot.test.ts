import { describe, expect, it } from "vitest";
import type { BlackjackRound, BlackjackTable } from "./domain";
import { buildBlackjackPublicSnapshot } from "./publicSnapshot";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";

function tableWithRound(holeCardRevealed: boolean): BlackjackTable {
  const shoe = createUnshuffledBlackjackShoe({
    shoeId: "public-shoe",
    createdAtMs: 1,
  });
  const foundation = createBlackjackTableFoundation({
    tableId: "main-blackjack",
    shoe: { ...shoe, nextIndex: 5 },
  });

  const playerCards = [shoe.cards[0], shoe.cards[1]];
  const dealerCards = [shoe.cards[2], shoe.cards[3]];
  const round: BlackjackRound = {
    roundId: "round-public",
    roundNumber: 1,
    phase: "PLAYER_TURNS",
    activeSeatOrder: [3],
    hands: [
      {
        handId: "hand-public",
        playerId: "player-public",
        seatNumber: 3,
        cards: playerCards,
        betCents: 4_000,
        status: "ACTIVE",
        origin: "INITIAL",
        splitDepth: 0,
        isSplitAce: false,
        isDoubled: false,
        result: null,
        payoutCents: 0,
      },
    ],
    dealer: {
      cards: dealerCards,
      holeCardRevealed,
    },
    currentTurn: {
      seatNumber: 3,
      handId: "hand-public",
      startedAtMs: 1_000,
      endsAtMs: 16_000,
    },
    startedAtMs: 500,
    bettingClosesAtMs: 900,
    finishedAtMs: null,
  };

  return {
    ...foundation,
    phase: "PLAYER_TURNS",
    seats: foundation.seats.map((seat) =>
      seat.seatNumber === 3
        ? { ...seat, playerId: "player-public" }
        : seat,
    ),
    players: [
      {
        playerId: "player-public",
        userId: "SECRET-USER-ID",
        sessionId: "SECRET-SESSION-ID",
        seatNumber: 3,
        status: "PLAYING",
        connected: true,
        disconnectedAtMs: null,
        handIds: ["hand-public"],
      },
    ],
    round,
    stateVersion: 7,
    eventSequence: 11,
  };
}

describe("blackjack public snapshot", () => {
  it("never exposes shoe order, card IDs, user IDs or session IDs", () => {
    const table = tableWithRound(false);
    const snapshot = buildBlackjackPublicSnapshot(table, 2_000);
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.shoe).toEqual({
      shoeId: "public-shoe",
      cardsRemaining: 307,
      reshufflePending: false,
    });
    expect("cards" in snapshot.shoe).toBe(false);
    expect("userId" in snapshot.players[0]).toBe(false);
    expect("sessionId" in snapshot.players[0]).toBe(false);
    expect(serialized).not.toContain("SECRET-USER-ID");
    expect(serialized).not.toContain("SECRET-SESSION-ID");
    expect(serialized).not.toContain(table.shoe.cards[0].cardId);
    expect(serialized).not.toContain(table.shoe.cards[100].cardId);
  });

  it("hides the dealer hole card until it is revealed", () => {
    const hidden = buildBlackjackPublicSnapshot(tableWithRound(false), 2_000);
    const visible = buildBlackjackPublicSnapshot(tableWithRound(true), 2_000);

    expect(hidden.round?.dealer.cards).toHaveLength(2);
    expect(hidden.round?.dealer.cards[0]).not.toBeNull();
    expect(hidden.round?.dealer.cards[1]).toBeNull();

    expect(visible.round?.dealer.cards[0]).not.toBeNull();
    expect(visible.round?.dealer.cards[1]).not.toBeNull();
  });

  it("exposes face-up player cards without internal physical card IDs", () => {
    const table = tableWithRound(false);
    const snapshot = buildBlackjackPublicSnapshot(table, 2_000);

    expect(snapshot.round?.hands[0].cards).toEqual([
      {
        suit: table.round?.hands[0].cards[0].suit,
        rank: table.round?.hands[0].cards[0].rank,
      },
      {
        suit: table.round?.hands[0].cards[1].suit,
        rank: table.round?.hands[0].cards[1].rank,
      },
    ]);
    expect(
      "cardId" in (snapshot.round?.hands[0].cards[0] ?? {}),
    ).toBe(false);
  });

  it("carries authoritative versions and server timestamps only", () => {
    const snapshot = buildBlackjackPublicSnapshot(tableWithRound(false), 9_999);

    expect(snapshot.serverTimeMs).toBe(9_999);
    expect(snapshot.stateVersion).toBe(7);
    expect(snapshot.eventSequence).toBe(11);
    expect(snapshot.round?.currentTurn?.endsAtMs).toBe(16_000);
  });

  it("rejects invalid server time metadata", () => {
    expect(() =>
      buildBlackjackPublicSnapshot(tableWithRound(false), -1),
    ).toThrow(/serverTimeMs/);
  });
});
