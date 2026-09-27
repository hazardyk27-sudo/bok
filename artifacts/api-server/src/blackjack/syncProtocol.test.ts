import { describe, expect, it } from "vitest";
import type { BlackjackPublicSnapshot } from "./publicSnapshot";
import {
  buildBlackjackInitialSyncResponse,
  evaluateBlackjackSyncRequest,
  parseBlackjackSyncRequest,
} from "./syncProtocol";

function snapshot(
  eventSequence = 12,
  stateVersion = 7,
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
      shoeId: "shoe-sync",
      cardsRemaining: 312,
      reshufflePending: false,
    },
    round: null,
    stateVersion,
    eventSequence,
  };
}

describe("blackjack full snapshot / resync protocol", () => {
  it("always gives a connecting client an authoritative full snapshot baseline", () => {
    const source = snapshot();

    expect(buildBlackjackInitialSyncResponse(source)).toEqual({
      type: "FULL_TABLE_SNAPSHOT",
      reason: "INITIAL_CONNECT",
      snapshot: source,
      resetEventSequenceTo: 12,
      resetStateVersionTo: 7,
    });
  });

  it("treats legacy explicit sync without cursors as a full snapshot request", () => {
    const source = snapshot();

    expect(
      evaluateBlackjackSyncRequest(source, { type: "sync" }),
    ).toEqual({
      type: "FULL_TABLE_SNAPSHOT",
      reason: "EXPLICIT_SYNC",
      snapshot: source,
      resetEventSequenceTo: 12,
      resetStateVersionTo: 7,
    });
  });

  it("returns SYNC_OK only when supplied cursors match the server exactly", () => {
    expect(
      evaluateBlackjackSyncRequest(snapshot(), {
        type: "sync",
        lastEventSequence: 12,
        lastStateVersion: 7,
      }),
    ).toEqual({
      type: "SYNC_OK",
      eventSequence: 12,
      stateVersion: 7,
    });
  });

  it("forces a full snapshot when the client missed one or more events", () => {
    const source = snapshot(12, 7);

    expect(
      evaluateBlackjackSyncRequest(source, {
        type: "sync",
        lastEventSequence: 9,
        lastStateVersion: 7,
      }),
    ).toEqual({
      type: "FULL_TABLE_SNAPSHOT",
      reason: "EVENT_GAP",
      snapshot: source,
      resetEventSequenceTo: 12,
      resetStateVersionTo: 7,
    });
  });

  it("forces a full snapshot when the client claims to be ahead or has wrong stateVersion", () => {
    const source = snapshot(12, 7);

    expect(
      evaluateBlackjackSyncRequest(source, {
        type: "sync",
        lastEventSequence: 13,
        lastStateVersion: 7,
      }),
    ).toMatchObject({
      type: "FULL_TABLE_SNAPSHOT",
      reason: "STATE_MISMATCH",
      resetEventSequenceTo: 12,
      resetStateVersionTo: 7,
    });

    expect(
      evaluateBlackjackSyncRequest(source, {
        type: "sync",
        lastEventSequence: 12,
        lastStateVersion: 6,
      }),
    ).toMatchObject({
      type: "FULL_TABLE_SNAPSHOT",
      reason: "STATE_MISMATCH",
    });
  });

  it("parses string and JSON sync requests while rejecting invalid cursors", () => {
    expect(parseBlackjackSyncRequest("sync")).toEqual({ type: "sync" });
    expect(
      parseBlackjackSyncRequest({
        type: "sync",
        lastEventSequence: 4,
        lastStateVersion: 3,
      }),
    ).toEqual({
      type: "sync",
      lastEventSequence: 4,
      lastStateVersion: 3,
    });
    expect(parseBlackjackSyncRequest({ type: "HIT" })).toBeNull();

    expect(() =>
      parseBlackjackSyncRequest({
        type: "sync",
        lastEventSequence: -1,
      }),
    ).toThrow(/lastEventSequence/);

    expect(() =>
      parseBlackjackSyncRequest({
        type: "sync",
        lastStateVersion: 1.5,
      }),
    ).toThrow(/lastStateVersion/);
  });
});
