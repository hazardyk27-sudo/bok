import { describe, expect, it } from "vitest";
import { createBlackjackActionProtocolState } from "./actionProtocol";
import {
  createBlackjackJournalRecord,
  verifyBlackjackJournalRecord,
} from "./journal";
import { createBlackjackReconnectRegistry } from "./reconnect";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import type { BlackjackDurableRuntimeState } from "./snapshotState";

function runtime(eventSequence = 1, stateVersion = 1): BlackjackDurableRuntimeState {
  const table = createBlackjackTableFoundation({
    tableId: "main-blackjack",
    shoe: createUnshuffledBlackjackShoe({
      shoeId: "journal-shoe",
      createdAtMs: 1,
    }),
  });

  return {
    table: {
      ...table,
      eventSequence,
      stateVersion,
    },
    actionProtocol: createBlackjackActionProtocolState(),
    reconnectRegistry: createBlackjackReconnectRegistry(),
    wallets: [],
    reservationBooks: [],
    bettingPositions: [],
  };
}

describe("blackjack durable event journal codec", () => {
  it("creates a deterministic event ID bound to runtime eventSequence", () => {
    const source = runtime(7, 4);
    const record = createBlackjackJournalRecord({
      runtimeAfter: source,
      eventType: "TABLE_STATE_COMMITTED",
      actionId: "action-7",
      details: { reason: "test", cardCount: 3 },
      createdAtMs: 1_000,
    });

    expect(record).toMatchObject({
      eventId: "main-blackjack:7",
      tableId: "main-blackjack",
      eventSequence: 7,
      stateVersion: 4,
      actionId: "action-7",
      eventType: "TABLE_STATE_COMMITTED",
      createdAtMs: 1_000,
    });
    expect(record.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyBlackjackJournalRecord(record)).toEqual(source);
  });

  it("rejects metadata or checksum tampering", () => {
    const record = createBlackjackJournalRecord({
      runtimeAfter: runtime(),
      eventType: "ROUND_STARTED",
      actionId: null,
      createdAtMs: 1_000,
    });

    expect(() =>
      verifyBlackjackJournalRecord({
        ...record,
        eventSequence: 2,
      }),
    ).toThrow(/metadata does not match/);

    expect(() =>
      verifyBlackjackJournalRecord({
        ...record,
        checksum: "0".repeat(64),
      }),
    ).toThrow(/checksum mismatch/);
  });

  it("rejects non-JSON details instead of silently dropping data", () => {
    expect(() =>
      createBlackjackJournalRecord({
        runtimeAfter: runtime(),
        eventType: "ROUND_STARTED",
        actionId: null,
        details: {
          invalid: Number.NaN,
        },
        createdAtMs: 1_000,
      }),
    ).toThrow(/non-finite/);
  });

  it("requires eventSequence to have advanced before journaling", () => {
    expect(() =>
      createBlackjackJournalRecord({
        runtimeAfter: runtime(0, 0),
        eventType: "TABLE_STATE_COMMITTED",
        actionId: null,
        createdAtMs: 1_000,
      }),
    ).toThrow(/eventSequence >= 1/);
  });
});
