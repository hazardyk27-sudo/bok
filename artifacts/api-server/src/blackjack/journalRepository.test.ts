import { describe, expect, it } from "vitest";
import { createBlackjackActionProtocolState } from "./actionProtocol";
import {
  createBlackjackJournalRecord,
  type BlackjackJournalRecord,
} from "./journal";
import {
  BlackjackJournalConflictError,
  BlackjackJournalRepository,
  type BlackjackJournalDatabase,
} from "./journalRepository";
import { createBlackjackReconnectRegistry } from "./reconnect";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import type { BlackjackDurableRuntimeState } from "./snapshotState";

function runtime(
  eventSequence: number,
  stateVersion = eventSequence,
): BlackjackDurableRuntimeState {
  const table = createBlackjackTableFoundation({
    tableId: "main-blackjack",
    shoe: createUnshuffledBlackjackShoe({
      shoeId: "journal-repo-shoe",
      createdAtMs: 1,
    }),
  });

  return {
    table: { ...table, eventSequence, stateVersion },
    actionProtocol: createBlackjackActionProtocolState(),
    reconnectRegistry: createBlackjackReconnectRegistry(),
    wallets: [],
    reservationBooks: [],
    bettingPositions: [],
  };
}

function record(sequence: number): BlackjackJournalRecord {
  return createBlackjackJournalRecord({
    runtimeAfter: runtime(sequence),
    eventType: "TABLE_STATE_COMMITTED",
    actionId: "action-" + sequence,
    details: { sequence },
    createdAtMs: 1_000 + sequence,
  });
}

function row(record: BlackjackJournalRecord) {
  return {
    event_id: record.eventId,
    table_id: record.tableId,
    event_sequence: record.eventSequence,
    state_version: record.stateVersion,
    action_id: record.actionId,
    event_type: record.eventType,
    payload: record.payload,
    checksum: record.checksum,
    created_at: new Date(record.createdAtMs),
  };
}

function db(
  query: BlackjackJournalDatabase["query"],
): BlackjackJournalDatabase {
  return { query };
}

describe("blackjack journal repository", () => {
  it("appends only the exact next event sequence", async () => {
    const event = record(3);
    let params: readonly unknown[] = [];
    const repository = new BlackjackJournalRepository(
      db(async (_sql, input = []) => {
        params = input;
        return { rows: [row(event)] };
      }),
    );

    const result = await repository.append(event, 2);

    expect(result.replayed).toBe(false);
    expect(result.record).toEqual(event);
    expect(params[9]).toBe(2);
  });

  it("allows a sparse checkpoint as long as eventSequence advances", async () => {
    const event = record(5);
    let params: readonly unknown[] = [];
    const repository = new BlackjackJournalRepository(
      db(async (_sql, input = []) => {
        params = input;
        return { rows: [row(event)] };
      }),
    );

    await expect(repository.append(event, 2)).resolves.toMatchObject({
      replayed: false,
      record: event,
    });
    expect(params[9]).toBe(2);
  });

  it("rejects a checkpoint that does not advance eventSequence", async () => {
    const repository = new BlackjackJournalRepository(
      db(async () => ({ rows: [] })),
    );

    await expect(repository.append(record(2), 2)).rejects.toThrow(
      /advance eventSequence monotonically/,
    );
  });

  it("treats an exact existing sequence as an idempotent replay", async () => {
    const event = record(2);
    let call = 0;
    const repository = new BlackjackJournalRepository(
      db(async () => {
        call += 1;
        return call === 1
          ? { rows: [] }
          : { rows: [row(event)] };
      }),
    );

    const result = await repository.append(event, 1);

    expect(result.replayed).toBe(true);
    expect(result.record).toEqual(event);
  });

  it("rejects same sequence with different event data", async () => {
    const event = record(2);
    const different = createBlackjackJournalRecord({
      runtimeAfter: runtime(2),
      eventType: "PLAYER_STAND",
      actionId: "other",
      details: { changed: true },
      createdAtMs: 2_000,
    });

    let call = 0;
    const repository = new BlackjackJournalRepository(
      db(async () => {
        call += 1;
        return call === 1
          ? { rows: [] }
          : { rows: [row(different)] };
      }),
    );

    await expect(repository.append(event, 1)).rejects.toBeInstanceOf(
      BlackjackJournalConflictError,
    );
  });

  it("rejects stale/gapped append when no matching replay row exists", async () => {
    const repository = new BlackjackJournalRepository(
      db(async () => ({ rows: [] })),
    );

    await expect(repository.append(record(2), 1)).rejects.toThrow(
      /eventSequence is stale/,
    );
  });

  it("loads monotonic sparse checkpoints after a snapshot cursor", async () => {
    const third = record(3);
    const seventh = record(7);
    const repository = new BlackjackJournalRepository(
      db(async () => ({ rows: [row(third), row(seventh)] })),
    );

    const loaded = await repository.loadAfter("main-blackjack", 1);

    expect(loaded.map((entry) => entry.eventSequence)).toEqual([3, 7]);
  });

  it("rejects a non-monotonic recovery stream", async () => {
    const fourth = record(4);
    const third = record(3);
    const repository = new BlackjackJournalRepository(
      db(async () => ({ rows: [row(fourth), row(third)] })),
    );

    await expect(
      repository.loadAfter("main-blackjack", 1),
    ).rejects.toThrow(/non-monotonic/);
  });
});
