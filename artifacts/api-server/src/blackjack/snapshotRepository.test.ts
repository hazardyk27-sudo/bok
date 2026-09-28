import { describe, expect, it } from "vitest";
import { createBlackjackActionProtocolState } from "./actionProtocol";
import { createBlackjackReconnectRegistry } from "./reconnect";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import {
  createBlackjackDurableSnapshot,
  type BlackjackDurableRuntimeState,
} from "./snapshotState";
import {
  BlackjackSnapshotConflictError,
  BlackjackSnapshotRepository,
  type BlackjackSnapshotDatabase,
} from "./snapshotRepository";

function runtime(stateVersion = 0): BlackjackDurableRuntimeState {
  const table = createBlackjackTableFoundation({
    tableId: "main-blackjack",
    shoe: createUnshuffledBlackjackShoe({
      shoeId: "repo-shoe",
      createdAtMs: 1,
    }),
  });

  return {
    table: { ...table, stateVersion },
    actionProtocol: createBlackjackActionProtocolState(),
    reconnectRegistry: createBlackjackReconnectRegistry(),
    wallets: [],
    reservationBooks: [],
    bettingPositions: [],
  };
}

function database(
  handler: BlackjackSnapshotDatabase["query"],
): BlackjackSnapshotDatabase {
  return { query: handler };
}

describe("blackjack snapshot repository", () => {
  it("loads and verifies a stored snapshot", async () => {
    const snapshot = createBlackjackDurableSnapshot(runtime(3), 1_000);
    const db = database(async () => ({
      rows: [{ snapshot }],
    }));

    const repository = new BlackjackSnapshotRepository(db);
    await expect(repository.load("main-blackjack")).resolves.toEqual(snapshot);
  });

  it("returns null when no durable state exists", async () => {
    const repository = new BlackjackSnapshotRepository(
      database(async () => ({ rows: [] })),
    );

    await expect(repository.load("main-blackjack")).resolves.toBeNull();
  });

  it("uses insert-only semantics for the first snapshot", async () => {
    const snapshot = createBlackjackDurableSnapshot(runtime(0), 1_000);
    let seenSql = "";
    let seenParams: readonly unknown[] = [];

    const repository = new BlackjackSnapshotRepository(
      database(async (sql, params = []) => {
        seenSql = sql;
        seenParams = params;
        return { rows: [{ snapshot }] };
      }),
    );

    await expect(repository.save(snapshot, null)).resolves.toEqual(snapshot);
    expect(seenSql).toContain("ON CONFLICT (table_id) DO NOTHING");
    expect(seenParams).toHaveLength(8);
  });

  it("uses stateVersion compare-and-swap for updates", async () => {
    const snapshot = createBlackjackDurableSnapshot(runtime(4), 2_000);
    let seenSql = "";
    let seenParams: readonly unknown[] = [];

    const repository = new BlackjackSnapshotRepository(
      database(async (sql, params = []) => {
        seenSql = sql;
        seenParams = params;
        return { rows: [{ snapshot }] };
      }),
    );

    await expect(repository.save(snapshot, 3)).resolves.toEqual(snapshot);
    expect(seenSql).toContain("AND state_version = $9");
    expect(seenParams[8]).toBe(3);
  });

  it("rejects stale writers when compare-and-swap affects no row", async () => {
    const snapshot = createBlackjackDurableSnapshot(runtime(4), 2_000);
    const repository = new BlackjackSnapshotRepository(
      database(async () => ({ rows: [] })),
    );

    await expect(repository.save(snapshot, 3)).rejects.toBeInstanceOf(
      BlackjackSnapshotConflictError,
    );
  });

  it("rejects corrupt database payloads on load", async () => {
    const snapshot = createBlackjackDurableSnapshot(runtime(1), 1_000);
    const corrupt = { ...snapshot, checksum: "bad" };

    const repository = new BlackjackSnapshotRepository(
      database(async () => ({
        rows: [{ snapshot: corrupt }],
      })),
    );

    await expect(repository.load("main-blackjack")).rejects.toThrow(
      /checksum mismatch/,
    );
  });

  it("never permits a backwards snapshot version", async () => {
    const snapshot = createBlackjackDurableSnapshot(runtime(2), 1_000);
    const repository = new BlackjackSnapshotRepository(
      database(async () => ({ rows: [{ snapshot }] })),
    );

    await expect(repository.save(snapshot, 3)).rejects.toThrow(
      /cannot move backwards/,
    );
  });
});
