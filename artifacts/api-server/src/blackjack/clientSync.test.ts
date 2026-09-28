import { describe, expect, it } from "vitest";
import {
  applyBlackjackFullSnapshotToClientCursor,
  applyBlackjackServerEventToClientCursor,
  buildBlackjackClientSyncRequest,
  createBlackjackClientSyncCursor,
} from "./clientSync";
import type { BlackjackServerEvent } from "./eventStream";
import type { BlackjackPublicSnapshot } from "./publicSnapshot";
import { evaluateBlackjackSyncRequest } from "./syncProtocol";

function event(
  eventSequence: number,
  stateVersion: number,
): BlackjackServerEvent {
  return {
    eventSequence,
    stateVersion,
    type: "TABLE_STATE_COMMITTED",
    actionId: "action-" + eventSequence,
    createdAtMs: eventSequence,
  };
}

function snapshot(
  eventSequence: number,
  stateVersion: number,
): BlackjackPublicSnapshot {
  return {
    serverTimeMs: 1_000,
    tableId: "main-blackjack",
    phase: "TABLE_IDLE",
    maxSeats: 5,
    seats: [
      { seatNumber: 1, playerId: null },
      { seatNumber: 2, playerId: null },
      { seatNumber: 3, playerId: null },
      { seatNumber: 4, playerId: null },
      { seatNumber: 5, playerId: null },
    ],
    players: [],
    shoe: {
      shoeId: "sync-shoe",
      cardsRemaining: 312,
      reshufflePending: false,
    },
    round: null,
    stateVersion,
    eventSequence,
  };
}

describe("blackjack client event cursor under packet chaos", () => {
  it("applies a clean ordered stream monotonically", () => {
    let cursor = createBlackjackClientSyncCursor();

    for (let sequence = 1; sequence <= 100; sequence += 1) {
      const result = applyBlackjackServerEventToClientCursor(
        cursor,
        event(sequence, sequence),
      );
      expect(result.status).toBe("APPLIED");
      cursor = result.cursor;
    }

    expect(cursor).toEqual({
      eventSequence: 100,
      stateVersion: 100,
      resyncRequired: false,
    });
  });

  it("ignores duplicate and reordered old packets without rewinding state", () => {
    let cursor = createBlackjackClientSyncCursor({
      eventSequence: 20,
      stateVersion: 12,
    });

    for (const sequence of [20, 19, 4, 20, 1]) {
      const result = applyBlackjackServerEventToClientCursor(
        cursor,
        event(sequence, 10),
      );
      expect(result.status).toBe("IGNORED_DUPLICATE_OR_OLD");
      expect(result.cursor).toBe(cursor);
      cursor = result.cursor;
    }

    expect(cursor.eventSequence).toBe(20);
    expect(cursor.stateVersion).toBe(12);
  });

  it("detects a dropped event gap and blocks later live events until snapshot", () => {
    const start = createBlackjackClientSyncCursor({
      eventSequence: 10,
      stateVersion: 5,
    });

    const gap = applyBlackjackServerEventToClientCursor(
      start,
      event(12, 6),
    );
    expect(gap.status).toBe("RESYNC_REQUIRED");
    expect(gap.cursor.resyncRequired).toBe(true);
    expect(gap.cursor.eventSequence).toBe(10);

    const later = applyBlackjackServerEventToClientCursor(
      gap.cursor,
      event(13, 7),
    );
    expect(later.status).toBe("WAITING_FOR_SNAPSHOT");
    expect(later.cursor).toBe(gap.cursor);
  });

  it("detects a next-sequence packet whose stateVersion moves backwards", () => {
    const start = createBlackjackClientSyncCursor({
      eventSequence: 10,
      stateVersion: 9,
    });

    const result = applyBlackjackServerEventToClientCursor(
      start,
      event(11, 8),
    );

    expect(result.status).toBe("RESYNC_REQUIRED");
    expect(result.cursor).toEqual({
      eventSequence: 10,
      stateVersion: 9,
      resyncRequired: true,
    });
  });

  it("accepts multiple ordered events sharing one authoritative stateVersion", () => {
    let cursor = createBlackjackClientSyncCursor({
      eventSequence: 5,
      stateVersion: 3,
    });

    for (const sequence of [6, 7, 8]) {
      const result = applyBlackjackServerEventToClientCursor(
        cursor,
        event(sequence, 3),
      );
      expect(result.status).toBe("APPLIED");
      cursor = result.cursor;
    }

    expect(cursor).toEqual({
      eventSequence: 8,
      stateVersion: 3,
      resyncRequired: false,
    });
  });

  it("uses authoritative full snapshot to recover exactly after a gap", () => {
    const gap = applyBlackjackServerEventToClientCursor(
      createBlackjackClientSyncCursor({
        eventSequence: 40,
        stateVersion: 20,
      }),
      event(42, 21),
    );
    expect(gap.cursor.resyncRequired).toBe(true);

    const request = buildBlackjackClientSyncRequest(gap.cursor);
    const authoritative = snapshot(45, 23);
    const response = evaluateBlackjackSyncRequest(
      authoritative,
      request,
    );

    expect(response.type).toBe("FULL_TABLE_SNAPSHOT");
    if (response.type !== "FULL_TABLE_SNAPSHOT") {
      throw new Error("expected full snapshot");
    }

    const recovered = applyBlackjackFullSnapshotToClientCursor(
      response.snapshot,
    );
    expect(recovered).toEqual({
      eventSequence: 45,
      stateVersion: 23,
      resyncRequired: false,
    });

    const next = applyBlackjackServerEventToClientCursor(
      recovered,
      event(46, 24),
    );
    expect(next.status).toBe("APPLIED");
    expect(next.cursor.eventSequence).toBe(46);
  });

  it("trusts server snapshot even when a corrupt client cursor claimed to be ahead", () => {
    const corruptClient = createBlackjackClientSyncCursor({
      eventSequence: 999,
      stateVersion: 999,
    });
    const authoritative = snapshot(50, 30);
    const response = evaluateBlackjackSyncRequest(
      authoritative,
      buildBlackjackClientSyncRequest(corruptClient),
    );

    expect(response).toMatchObject({
      type: "FULL_TABLE_SNAPSHOT",
      reason: "STATE_MISMATCH",
    });
    if (response.type !== "FULL_TABLE_SNAPSHOT") {
      throw new Error("expected authoritative reset");
    }

    expect(
      applyBlackjackFullSnapshotToClientCursor(response.snapshot),
    ).toEqual({
      eventSequence: 50,
      stateVersion: 30,
      resyncRequired: false,
    });
  });

  it("survives 1,000 deterministic drop/reorder/duplicate chaos cycles", () => {
    for (let cycle = 1; cycle <= 1_000; cycle += 1) {
      const baseSequence = cycle * 10;
      const baseVersion = cycle * 3;
      let cursor = createBlackjackClientSyncCursor({
        eventSequence: baseSequence,
        stateVersion: baseVersion,
      });

      const next = applyBlackjackServerEventToClientCursor(
        cursor,
        event(baseSequence + 1, baseVersion + 1),
      );
      expect(next.status).toBe("APPLIED");
      cursor = next.cursor;

      const duplicate = applyBlackjackServerEventToClientCursor(
        cursor,
        event(baseSequence + 1, baseVersion + 1),
      );
      expect(duplicate.status).toBe("IGNORED_DUPLICATE_OR_OLD");

      const gap = applyBlackjackServerEventToClientCursor(
        cursor,
        event(baseSequence + 3, baseVersion + 2),
      );
      expect(gap.status).toBe("RESYNC_REQUIRED");

      const blocked = applyBlackjackServerEventToClientCursor(
        gap.cursor,
        event(baseSequence + 2, baseVersion + 2),
      );
      expect(blocked.status).toBe("WAITING_FOR_SNAPSHOT");

      cursor = applyBlackjackFullSnapshotToClientCursor(
        snapshot(baseSequence + 3, baseVersion + 2),
      );

      const final = applyBlackjackServerEventToClientCursor(
        cursor,
        event(baseSequence + 4, baseVersion + 3),
      );
      expect(final.status).toBe("APPLIED");
      expect(final.cursor).toEqual({
        eventSequence: baseSequence + 4,
        stateVersion: baseVersion + 3,
        resyncRequired: false,
      });
    }
  });
});
