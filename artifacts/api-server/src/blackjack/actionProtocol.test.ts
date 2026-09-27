import { describe, expect, it, vi } from "vitest";
import type { BlackjackRound, BlackjackTable } from "./domain";
import {
  BlackjackStaleActionError,
  applyBlackjackVersionedAction,
  createBlackjackActionProtocolState,
  type BlackjackActionEnvelope,
} from "./actionProtocol";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";

function table(): BlackjackTable {
  const foundation = createBlackjackTableFoundation({
    tableId: "main-blackjack",
    shoe: createUnshuffledBlackjackShoe({
      shoeId: "protocol-shoe",
      createdAtMs: 1,
    }),
  });

  return {
    ...foundation,
    seats: foundation.seats.map((seat) =>
      seat.seatNumber === 1
        ? { ...seat, playerId: "player-1" }
        : seat,
    ),
    players: [
      {
        playerId: "player-1",
        userId: "user-1",
        sessionId: "session-1",
        seatNumber: 1,
        status: "SEATED_WAITING",
        connected: true,
        disconnectedAtMs: null,
        handIds: [],
      },
    ],
  };
}

function envelope(
  overrides: Partial<BlackjackActionEnvelope> = {},
): BlackjackActionEnvelope {
  return {
    actionId: "action-1",
    actorPlayerId: "player-1",
    type: "LEAVE_SEAT",
    tableId: "main-blackjack",
    expectedStateVersion: 0,
    roundId: null,
    handId: null,
    seatNumber: 1,
    payloadFingerprint: "leave-seat:v1",
    ...overrides,
  };
}

describe("blackjack action stateVersion protocol", () => {
  it("commits a successful mutation with exactly one stateVersion increment", () => {
    const source = table();
    const protocol = createBlackjackActionProtocolState();

    const result = applyBlackjackVersionedAction(
      source,
      protocol,
      envelope(),
      (current) => ({
        ...current,
        phase: "BETTING",
      }),
    );

    expect(source.stateVersion).toBe(0);
    expect(result.table.stateVersion).toBe(1);
    expect(result.table.phase).toBe("BETTING");
    expect(result.receipt).toMatchObject({
      actionId: "action-1",
      expectedStateVersion: 0,
      resultingStateVersion: 1,
    });
    expect(result.protocol.receipts).toHaveLength(1);
    expect(result.replayed).toBe(false);
  });

  it("rejects stale state before the mutation executes", () => {
    const source = {
      ...table(),
      stateVersion: 4,
    };
    const mutate = vi.fn((current: BlackjackTable) => current);

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        createBlackjackActionProtocolState(),
        envelope({ expectedStateVersion: 3 }),
        mutate,
      ),
    ).toThrow(BlackjackStaleActionError);

    expect(mutate).not.toHaveBeenCalled();
  });

  it("replays the same actionId without executing the mutation twice", () => {
    const mutate = vi.fn((current: BlackjackTable) => ({
      ...current,
      phase: "BETTING" as const,
    }));

    const first = applyBlackjackVersionedAction(
      table(),
      createBlackjackActionProtocolState(),
      envelope(),
      mutate,
    );

    const replay = applyBlackjackVersionedAction(
      first.table,
      first.protocol,
      envelope(),
      mutate,
    );

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(replay.replayed).toBe(true);
    expect(replay.table).toBe(first.table);
    expect(replay.protocol).toBe(first.protocol);
    expect(replay.receipt.resultingStateVersion).toBe(1);
  });

  it("replays a scoped action even after the table has advanced beyond that round", () => {
    const foundation = table();
    const round: BlackjackRound = {
      roundId: "round-1",
      roundNumber: 1,
      phase: "PLAYER_TURNS",
      activeSeatOrder: [1],
      hands: [
        {
          handId: "hand-1",
          playerId: "player-1",
          seatNumber: 1,
          cards: [foundation.shoe.cards[0], foundation.shoe.cards[1]],
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
        cards: [foundation.shoe.cards[2], foundation.shoe.cards[3]],
        holeCardRevealed: false,
      },
      currentTurn: {
        seatNumber: 1,
        handId: "hand-1",
        startedAtMs: 0,
        endsAtMs: 15_000,
      },
      startedAtMs: 0,
      bettingClosesAtMs: 0,
      finishedAtMs: null,
    };
    const source: BlackjackTable = {
      ...foundation,
      phase: "PLAYER_TURNS",
      round,
    };
    const scopedEnvelope = envelope({
      actionId: "action-scoped",
      type: "HIT",
      roundId: "round-1",
      handId: "hand-1",
      seatNumber: 1,
      payloadFingerprint: "hit:hand-1",
    });

    const first = applyBlackjackVersionedAction(
      source,
      createBlackjackActionProtocolState(),
      scopedEnvelope,
      (current) => current,
    );

    const laterTable: BlackjackTable = {
      ...first.table,
      phase: "ROUND_END",
      round: null,
      stateVersion: 9,
    };

    const replay = applyBlackjackVersionedAction(
      laterTable,
      first.protocol,
      scopedEnvelope,
      () => {
        throw new Error("replayed mutation must not execute");
      },
    );

    expect(replay.replayed).toBe(true);
    expect(replay.table).toBe(laterTable);
    expect(replay.receipt.resultingStateVersion).toBe(1);
  });

  it("rejects actionId reuse with a different payload", () => {
    const first = applyBlackjackVersionedAction(
      table(),
      createBlackjackActionProtocolState(),
      envelope(),
      (current) => current,
    );

    expect(() =>
      applyBlackjackVersionedAction(
        first.table,
        first.protocol,
        envelope({ seatNumber: 2, payloadFingerprint: "leave-seat:v2" }),
        (current) => current,
      ),
    ).toThrow(/actionId conflict/);
  });

  it("treats payload fingerprint as part of actionId idempotency semantics", () => {
    const first = applyBlackjackVersionedAction(
      table(),
      createBlackjackActionProtocolState(),
      envelope({ payloadFingerprint: "bet:1000" }),
      (current) => current,
    );

    expect(() =>
      applyBlackjackVersionedAction(
        first.table,
        first.protocol,
        envelope({ payloadFingerprint: "bet:2000" }),
        (current) => current,
      ),
    ).toThrow(/actionId conflict/);
  });

  it("enforces runtime seat and action-specific round/hand/seat shapes", () => {
    const source = table();
    const protocol = createBlackjackActionProtocolState();

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        protocol,
        envelope({ seatNumber: 9 as never }),
        (current) => current,
      ),
    ).toThrow(/seatNumber must be between 1 and 5/);

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        protocol,
        envelope({
          type: "HIT",
          roundId: null,
          handId: null,
          seatNumber: 1,
          payloadFingerprint: "hit:h1",
        }),
        (current) => current,
      ),
    ).toThrow(/HIT requires roundId/);

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        protocol,
        envelope({
          type: "PLACE_BET",
          roundId: null,
          handId: null,
          seatNumber: 1,
          payloadFingerprint: "bet:1000",
        }),
        (current) => current,
      ),
    ).toThrow(/PLACE_BET requires roundId/);

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        protocol,
        envelope({
          type: "LEAVE_SEAT",
          roundId: null,
          handId: null,
          seatNumber: null,
          payloadFingerprint: "leave",
        }),
        (current) => current,
      ),
    ).toThrow(/LEAVE_SEAT requires seatNumber/);
  });

  it("rejects foreign tables, rounds, hands and seat ownership before mutation", () => {
    const source = table();
    const protocol = createBlackjackActionProtocolState();

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        protocol,
        envelope({ tableId: "other-table" }),
        (current) => current,
      ),
    ).toThrow(/another table/);

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        protocol,
        envelope({ roundId: "missing-round" }),
        (current) => current,
      ),
    ).toThrow(/stale or foreign round/);
  });

  it("rejects an unseated actor and another player's seat or hand", () => {
    const source = table();
    const protocol = createBlackjackActionProtocolState();

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        protocol,
        envelope({ actorPlayerId: "attacker" }),
        (current) => current,
      ),
    ).toThrow(/actor is not seated/);

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        protocol,
        envelope({ seatNumber: 2 }),
        (current) => current,
      ),
    ).toThrow(/actor does not own the target seat/);

    const round: BlackjackRound = {
      roundId: "round-owned",
      roundNumber: 1,
      phase: "PLAYER_TURNS",
      activeSeatOrder: [1],
      hands: [
        {
          handId: "owned-hand",
          playerId: "player-1",
          seatNumber: 1,
          cards: [source.shoe.cards[0], source.shoe.cards[1]],
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
        cards: [source.shoe.cards[2], source.shoe.cards[3]],
        holeCardRevealed: false,
      },
      currentTurn: {
        seatNumber: 1,
        handId: "owned-hand",
        startedAtMs: 0,
        endsAtMs: 15_000,
      },
      startedAtMs: 0,
      bettingClosesAtMs: 0,
      finishedAtMs: null,
    };
    const live: BlackjackTable = {
      ...source,
      phase: "PLAYER_TURNS",
      round,
    };

    expect(() =>
      applyBlackjackVersionedAction(
        live,
        protocol,
        envelope({
          actorPlayerId: "attacker",
          type: "HIT",
          roundId: "round-owned",
          handId: "owned-hand",
          seatNumber: 1,
          payloadFingerprint: "hit:owned-hand",
        }),
        (current) => current,
      ),
    ).toThrow(/actor is not seated/);
  });

  it("rejects mutation handlers that try to own stateVersion themselves", () => {
    const source = table();

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        createBlackjackActionProtocolState(),
        envelope(),
        (current) => ({
          ...current,
          stateVersion: current.stateVersion + 1,
        }),
      ),
    ).toThrow(/protocol owns version advancement/);
  });

  it("guards stateVersion safe integer exhaustion", () => {
    const source = {
      ...table(),
      stateVersion: Number.MAX_SAFE_INTEGER,
    };

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        createBlackjackActionProtocolState(),
        envelope({ expectedStateVersion: Number.MAX_SAFE_INTEGER }),
        (current) => current,
      ),
    ).toThrow(/cannot advance safely/);
  });
});
