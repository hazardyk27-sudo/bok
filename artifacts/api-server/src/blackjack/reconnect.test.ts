import { describe, expect, it } from "vitest";
import type { BlackjackRound, BlackjackTable } from "./domain";
import {
  applyBlackjackDisconnectedTurnPolicy,
  BLACKJACK_RECONNECT_GRACE_MS,
  createBlackjackReconnectRegistry,
  disconnectBlackjackPlayerForReconnect,
  reconnectBlackjackPlayer,
} from "./reconnect";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";

function seatedTable(
  status: "BETTING" | "READY" | "PLAYING" = "PLAYING",
): BlackjackTable {
  const foundation = createBlackjackTableFoundation({
    tableId: "main-blackjack",
    shoe: createUnshuffledBlackjackShoe({
      shoeId: "reconnect-shoe",
      createdAtMs: 1,
    }),
  });

  return {
    ...foundation,
    phase: status === "PLAYING" ? "PLAYER_TURNS" : "BETTING",
    seats: foundation.seats.map((seat) =>
      seat.seatNumber === 3
        ? { ...seat, playerId: "player-1" }
        : seat,
    ),
    players: [
      {
        playerId: "player-1",
        userId: "user-1",
        sessionId: "session-1",
        seatNumber: 3,
        status,
        connected: true,
        disconnectedAtMs: null,
        handIds: status === "PLAYING" ? ["hand-1"] : [],
      },
    ],
  };
}

function tableWithTurn(turnEndsAtMs: number): BlackjackTable {
  const foundation = seatedTable("PLAYING");
  const cards = foundation.shoe.cards;
  const round: BlackjackRound = {
    roundId: "round-reconnect",
    roundNumber: 1,
    phase: "PLAYER_TURNS",
    activeSeatOrder: [3],
    hands: [
      {
        handId: "hand-1",
        playerId: "player-1",
        seatNumber: 3,
        cards: [cards[0], cards[1]],
        betCents: 1_000,
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
      cards: [cards[2], cards[3]],
      holeCardRevealed: false,
    },
    currentTurn: {
      seatNumber: 3,
      handId: "hand-1",
      startedAtMs: 0,
      endsAtMs: turnEndsAtMs,
    },
    startedAtMs: 0,
    bettingClosesAtMs: 0,
    finishedAtMs: null,
  };

  return {
    ...foundation,
    phase: "PLAYER_TURNS",
    round,
  };
}

describe("blackjack reconnect grace", () => {
  it("records the exact previous player status for a 30-second grace window", () => {
    const table = seatedTable("READY");
    const result = disconnectBlackjackPlayerForReconnect(
      table,
      createBlackjackReconnectRegistry(),
      { playerId: "player-1", nowMs: 1_000 },
    );

    expect(BLACKJACK_RECONNECT_GRACE_MS).toBe(30_000);
    expect(result.table.players[0]).toMatchObject({
      status: "DISCONNECTED",
      connected: false,
      disconnectedAtMs: 1_000,
    });
    expect(result.registry.records[0]).toMatchObject({
      playerId: "player-1",
      userId: "user-1",
      sessionId: "session-1",
      previousStatus: "READY",
      disconnectedAtMs: 1_000,
      expiresAtMs: 31_000,
    });
  });

  it("reconnects within grace to the same seat and exact previous status", () => {
    const disconnected = disconnectBlackjackPlayerForReconnect(
      seatedTable("READY"),
      createBlackjackReconnectRegistry(),
      { playerId: "player-1", nowMs: 1_000 },
    );

    const reconnected = reconnectBlackjackPlayer(
      disconnected.table,
      disconnected.registry,
      {
        playerId: "player-1",
        userId: "user-1",
        sessionId: "session-1",
        nowMs: 20_000,
      },
    );

    expect(reconnected.table.seats[2]).toEqual({
      seatNumber: 3,
      playerId: "player-1",
    });
    expect(reconnected.table.players[0]).toMatchObject({
      status: "READY",
      connected: true,
      disconnectedAtMs: null,
    });
    expect(reconnected.registry.records).toHaveLength(0);
  });

  it("rejects wrong identity but lets the same seated player reconnect after grace expiry", () => {
    const disconnected = disconnectBlackjackPlayerForReconnect(
      seatedTable("READY"),
      createBlackjackReconnectRegistry(),
      { playerId: "player-1", nowMs: 1_000 },
    );

    expect(() =>
      reconnectBlackjackPlayer(disconnected.table, disconnected.registry, {
        playerId: "player-1",
        userId: "user-2",
        sessionId: "session-1",
        nowMs: 2_000,
      }),
    ).toThrow(/userId/);

    expect(() =>
      reconnectBlackjackPlayer(disconnected.table, disconnected.registry, {
        playerId: "player-1",
        userId: "user-1",
        sessionId: "session-2",
        nowMs: 2_000,
      }),
    ).toThrow(/sessionId/);

    const reconnected = reconnectBlackjackPlayer(
      disconnected.table,
      disconnected.registry,
      {
        playerId: "player-1",
        userId: "user-1",
        sessionId: "session-1",
        nowMs: 31_001,
      },
    );

    expect(reconnected.table.players[0]).toMatchObject({
      playerId: "player-1",
      status: "READY",
      connected: true,
      disconnectedAtMs: null,
    });
    expect(reconnected.registry.records).toHaveLength(0);
  });

  it("does not extend the action timer just because the socket disconnected", () => {
    const source = tableWithTurn(15_000);
    const disconnected = disconnectBlackjackPlayerForReconnect(
      source,
      createBlackjackReconnectRegistry(),
      { playerId: "player-1", nowMs: 1_000 },
    );

    const beforeDeadline = applyBlackjackDisconnectedTurnPolicy(
      disconnected.table,
      disconnected.registry,
      14_999,
    );
    expect(beforeDeadline.autoStood).toBe(false);
    expect(beforeDeadline.table.round?.hands[0].status).toBe("ACTIVE");

    const timedOut = applyBlackjackDisconnectedTurnPolicy(
      beforeDeadline.table,
      beforeDeadline.registry,
      15_000,
    );
    expect(timedOut.autoStood).toBe(true);
    expect(timedOut.reason).toBe("TURN_TIMEOUT");
    expect(timedOut.table.round?.hands[0].status).toBe("STOOD");
    expect(timedOut.table.phase).toBe("DEALER_TURN");
  });

  it("auto-stands when reconnect grace expires before a longer turn deadline", () => {
    const source = tableWithTurn(60_000);
    const disconnected = disconnectBlackjackPlayerForReconnect(
      source,
      createBlackjackReconnectRegistry(),
      { playerId: "player-1", nowMs: 1_000 },
    );

    const beforeGrace = applyBlackjackDisconnectedTurnPolicy(
      disconnected.table,
      disconnected.registry,
      30_999,
    );
    expect(beforeGrace.autoStood).toBe(false);

    const expired = applyBlackjackDisconnectedTurnPolicy(
      beforeGrace.table,
      beforeGrace.registry,
      31_000,
    );
    expect(expired.autoStood).toBe(true);
    expect(expired.reason).toBe("RECONNECT_GRACE_EXPIRED");
    expect(expired.table.round?.hands[0].status).toBe("STOOD");
    expect(expired.registry.records).toHaveLength(0);
  });

  it("does nothing when the current player is connected", () => {
    const source = tableWithTurn(15_000);
    const result = applyBlackjackDisconnectedTurnPolicy(
      source,
      createBlackjackReconnectRegistry(),
      15_000,
    );

    expect(result.autoStood).toBe(false);
    expect(result.reason).toBe("NONE");
    expect(result.table).toBe(source);
  });
});
