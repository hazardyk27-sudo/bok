import { describe, expect, it, vi } from "vitest";
import type {
  BlackjackHand,
  BlackjackRound,
  BlackjackTable,
} from "./domain";
import {
  applyBlackjackEmptyTableLifecycle,
  BLACKJACK_EMPTY_TABLE_WARM_MS,
  createBlackjackEmptyTableLifecycle,
  reconcileBlackjackEmptyTableLifecycle,
} from "./emptyTableLifecycle";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";

function freshShoe(id: string) {
  return createUnshuffledBlackjackShoe({
    shoeId: id,
    createdAtMs: 1,
  });
}

function emptyTable(): BlackjackTable {
  return createBlackjackTableFoundation({
    tableId: "main-blackjack",
    shoe: freshShoe("shoe-original"),
  });
}

function occupiedTable(): BlackjackTable {
  const table = emptyTable();
  return {
    ...table,
    seats: table.seats.map((seat) =>
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
        status: "SEATED_WAITING",
        connected: true,
        disconnectedAtMs: null,
        handIds: [],
      },
    ],
  };
}

function completedHand(): BlackjackHand {
  return {
    handId: "hand-1",
    playerId: "ghost-player",
    seatNumber: 1,
    cards: [],
    betCents: 1_000,
    status: "COMPLETE",
    origin: "INITIAL",
    splitDepth: 0,
    isSplitAce: false,
    isDoubled: false,
    result: "LOSS",
    payoutCents: 0,
  };
}

function roundEndTable(): BlackjackTable {
  const table = emptyTable();
  const round: BlackjackRound = {
    roundId: "round-ended",
    roundNumber: 1,
    phase: "ROUND_END",
    activeSeatOrder: [1],
    hands: [completedHand()],
    dealer: {
      cards: [],
      holeCardRevealed: true,
    },
    currentTurn: null,
    startedAtMs: 0,
    bettingClosesAtMs: 0,
    finishedAtMs: 1,
  };

  return {
    ...table,
    phase: "ROUND_END",
    round,
  };
}

describe("blackjack empty-table shoe lifecycle", () => {
  it("arms a five-minute warm window when the table first becomes empty", () => {
    const lifecycle = reconcileBlackjackEmptyTableLifecycle(
      emptyTable(),
      createBlackjackEmptyTableLifecycle(),
      10_000,
    );

    expect(BLACKJACK_EMPTY_TABLE_WARM_MS).toBe(300_000);
    expect(lifecycle).toEqual({
      emptySinceMs: 10_000,
      resetDueAtMs: 310_000,
      resetCompletedForCurrentEmptyPeriod: false,
    });
  });

  it("preserves the exact same shoe before the five-minute deadline", () => {
    const table = emptyTable();
    const createFresh = vi.fn(() => freshShoe("shoe-fresh"));
    const armed = reconcileBlackjackEmptyTableLifecycle(
      table,
      createBlackjackEmptyTableLifecycle(),
      10_000,
    );

    const result = applyBlackjackEmptyTableLifecycle(table, armed, {
      nowMs: 309_999,
      createFreshShoe: createFresh,
    });

    expect(result.resetPerformed).toBe(false);
    expect(result.table.shoe).toBe(table.shoe);
    expect(createFresh).not.toHaveBeenCalled();
  });

  it("cancels the empty timer when a player returns before reset", () => {
    const lifecycle = {
      emptySinceMs: 10_000,
      resetDueAtMs: 310_000,
      resetCompletedForCurrentEmptyPeriod: false,
    };

    const result = applyBlackjackEmptyTableLifecycle(
      occupiedTable(),
      lifecycle,
      {
        nowMs: 200_000,
        createFreshShoe: () => freshShoe("unused"),
      },
    );

    expect(result.lifecycle).toEqual(
      createBlackjackEmptyTableLifecycle(),
    );
    expect(result.resetPerformed).toBe(false);
  });

  it("resets exactly once after five minutes at TABLE_IDLE", () => {
    const table = emptyTable();
    const lifecycle = reconcileBlackjackEmptyTableLifecycle(
      table,
      createBlackjackEmptyTableLifecycle(),
      10_000,
    );
    const createFresh = vi.fn(() => freshShoe("shoe-fresh"));

    const reset = applyBlackjackEmptyTableLifecycle(table, lifecycle, {
      nowMs: 310_000,
      createFreshShoe: createFresh,
    });

    expect(reset.resetPerformed).toBe(true);
    expect(reset.table.shoe.shoeId).toBe("shoe-fresh");
    expect(reset.table.shoe.nextIndex).toBe(0);
    expect(reset.table.stateVersion).toBe(table.stateVersion + 1);
    expect(reset.lifecycle.resetCompletedForCurrentEmptyPeriod).toBe(true);
    expect(createFresh).toHaveBeenCalledTimes(1);

    const repeated = applyBlackjackEmptyTableLifecycle(
      reset.table,
      reset.lifecycle,
      {
        nowMs: 900_000,
        createFreshShoe: createFresh,
      },
    );

    expect(repeated.resetPerformed).toBe(false);
    expect(repeated.table.shoe.shoeId).toBe("shoe-fresh");
    expect(createFresh).toHaveBeenCalledTimes(1);
  });

  it("allows reset at a fully completed ROUND_END boundary", () => {
    const table = roundEndTable();
    const lifecycle = reconcileBlackjackEmptyTableLifecycle(
      table,
      createBlackjackEmptyTableLifecycle(),
      0,
    );

    const result = applyBlackjackEmptyTableLifecycle(table, lifecycle, {
      nowMs: 300_000,
      createFreshShoe: () => freshShoe("shoe-after-round"),
    });

    expect(result.resetPerformed).toBe(true);
    expect(result.table.shoe.shoeId).toBe("shoe-after-round");
    expect(result.table.phase).toBe("ROUND_END");
    expect(result.table.round?.roundId).toBe("round-ended");
  });

  it("waits past the deadline if the table is not at a safe round boundary", () => {
    const table: BlackjackTable = {
      ...emptyTable(),
      phase: "PLAYER_TURNS",
      round: {
        roundId: "round-live",
        roundNumber: 1,
        phase: "PLAYER_TURNS",
        activeSeatOrder: [],
        hands: [],
        dealer: {
          cards: [],
          holeCardRevealed: false,
        },
        currentTurn: null,
        startedAtMs: 0,
        bettingClosesAtMs: 0,
        finishedAtMs: null,
      },
    };
    const createFresh = vi.fn(() => freshShoe("unsafe-reset"));
    const lifecycle = reconcileBlackjackEmptyTableLifecycle(
      table,
      createBlackjackEmptyTableLifecycle(),
      0,
    );

    const result = applyBlackjackEmptyTableLifecycle(table, lifecycle, {
      nowMs: 300_000,
      createFreshShoe: createFresh,
    });

    expect(result.resetPerformed).toBe(false);
    expect(result.waitingForSafeBoundary).toBe(true);
    expect(result.table.shoe.shoeId).toBe("shoe-original");
    expect(createFresh).not.toHaveBeenCalled();
  });

  it("rejects an invalid replacement shoe without mutating the source table", () => {
    const table = emptyTable();
    const lifecycle = reconcileBlackjackEmptyTableLifecycle(
      table,
      createBlackjackEmptyTableLifecycle(),
      0,
    );

    expect(() =>
      applyBlackjackEmptyTableLifecycle(table, lifecycle, {
        nowMs: 300_000,
        createFreshShoe: () => ({
          ...freshShoe("shoe-invalid"),
          nextIndex: 1,
        }),
      }),
    ).toThrow(/must start at nextIndex 0/);

    expect(table.shoe.shoeId).toBe("shoe-original");
    expect(table.stateVersion).toBe(0);
  });

  it("starts a brand-new warm period after players return and later leave again", () => {
    const firstEmpty = reconcileBlackjackEmptyTableLifecycle(
      emptyTable(),
      createBlackjackEmptyTableLifecycle(),
      10_000,
    );
    const occupied = reconcileBlackjackEmptyTableLifecycle(
      occupiedTable(),
      firstEmpty,
      50_000,
    );
    const secondEmpty = reconcileBlackjackEmptyTableLifecycle(
      emptyTable(),
      occupied,
      90_000,
    );

    expect(secondEmpty).toEqual({
      emptySinceMs: 90_000,
      resetDueAtMs: 390_000,
      resetCompletedForCurrentEmptyPeriod: false,
    });
  });
});
