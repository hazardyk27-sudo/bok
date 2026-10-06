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
  BlackjackRuntimeLeaseConflictError,
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

type StoredSnapshot = Record<string, unknown> & {
  stateVersion: number;
  _runtimeAuthority?: {
    ownerId: string;
    fencingToken: string;
    leaseUntilMs: number;
    checksum: string;
  };
};

function createMemoryDatabase(initial: StoredSnapshot | null = null): {
  database: BlackjackSnapshotDatabase;
  current: () => StoredSnapshot | null;
  queries: readonly { sql: string; params: readonly unknown[] }[];
} {
  let row: StoredSnapshot | null = initial;
  const queries: { sql: string; params: readonly unknown[] }[] = [];

  const database: BlackjackSnapshotDatabase = {
    query: async (sql, params = []) => {
      queries.push({ sql, params });

      if (sql.includes("SELECT snapshot")) {
        return { rows: row === null ? [] : [{ snapshot: row }] };
      }

      if (sql.includes("INSERT INTO blackjack_table_snapshots")) {
        if (row !== null) return { rows: [] };
        row = JSON.parse(String(params[5])) as StoredSnapshot;
        return { rows: [{ snapshot: row }] };
      }

      if (sql.includes("UPDATE blackjack_table_snapshots")) {
        if (row === null) return { rows: [] };
        const expectedStateVersion = params[8];
        const ownerId = params[9];
        const nowMs = params[10];
        const authority = row._runtimeAuthority;
        const leaseAllowsWrite =
          authority === undefined ||
          authority.ownerId === ownerId ||
          authority.leaseUntilMs <= Number(nowMs);

        if (
          row.stateVersion !== expectedStateVersion ||
          !leaseAllowsWrite
        ) {
          return { rows: [] };
        }

        row = JSON.parse(String(params[5])) as StoredSnapshot;
        return { rows: [{ snapshot: row }] };
      }

      throw new Error("Unexpected snapshot repository SQL: " + sql);
    },
  };

  return {
    database,
    current: () => row,
    queries,
  };
}

function repository(
  database: BlackjackSnapshotDatabase,
  ownerId: string,
  nowMs: () => number = () => 1_000,
): BlackjackSnapshotRepository {
  return new BlackjackSnapshotRepository(database, {
    ownerId,
    leaseDurationMs: 6_000,
    nowMs,
  });
}

describe("blackjack snapshot repository", () => {
  it("loads and verifies a stored snapshot", async () => {
    const snapshot = createBlackjackDurableSnapshot(runtime(3), 1_000);
    const memory = createMemoryDatabase(snapshot as StoredSnapshot);

    await expect(
      repository(memory.database, "load-writer").load("main-blackjack"),
    ).resolves.toEqual(snapshot);
  });

  it("returns null when no durable state exists", async () => {
    const memory = createMemoryDatabase();
    await expect(
      repository(memory.database, "null-writer").load("main-blackjack"),
    ).resolves.toBeNull();
  });

  it("claims a durable writer lease on the first snapshot insert", async () => {
    const snapshot = createBlackjackDurableSnapshot(runtime(0), 1_000);
    const memory = createMemoryDatabase();
    const saved = await repository(
      memory.database,
      "writer-first",
    ).save(snapshot, null);

    expect(saved).toMatchObject(snapshot);
    const stored = memory.current();
    expect(stored?._runtimeAuthority).toMatchObject({
      ownerId: "writer-first",
      leaseUntilMs: 7_000,
    });
    expect(stored?._runtimeAuthority?.fencingToken).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(stored?._runtimeAuthority?.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(memory.queries[0]?.sql).toContain(
      "ON CONFLICT (table_id) DO NOTHING",
    );
    expect(memory.queries[0]?.params).toHaveLength(8);
  });

  it("keeps stateVersion CAS and the same-owner lease on updates", async () => {
    let nowMs = 1_000;
    const memory = createMemoryDatabase();
    const repo = repository(memory.database, "writer-cas", () => nowMs);
    await repo.save(
      createBlackjackDurableSnapshot(runtime(0), 1_000),
      null,
    );
    const firstToken = memory.current()?._runtimeAuthority?.fencingToken;

    nowMs = 2_000;
    const saved = await repo.save(
      createBlackjackDurableSnapshot(runtime(1), 2_000),
      0,
    );

    expect(saved.stateVersion).toBe(1);
    expect(memory.current()?._runtimeAuthority?.fencingToken).toBe(firstToken);
    expect(memory.current()?._runtimeAuthority?.leaseUntilMs).toBe(8_000);
    const update = memory.queries.find((entry) =>
      entry.sql.includes("UPDATE blackjack_table_snapshots"),
    );
    expect(update?.sql).toContain("AND state_version = $9");
    expect(update?.sql).toContain("_runtimeAuthority");
    expect(update?.params[8]).toBe(0);
    expect(update?.params[9]).toBe("writer-cas");
  });

  it("rejects a second live runtime before it can change the snapshot", async () => {
    let nowMs = 1_000;
    const memory = createMemoryDatabase();
    const first = repository(memory.database, "runtime-a", () => nowMs);
    const second = repository(memory.database, "runtime-b", () => nowMs);

    await first.save(
      createBlackjackDurableSnapshot(runtime(0), 1_000),
      null,
    );

    nowMs = 2_000;
    await expect(
      second.save(
        createBlackjackDurableSnapshot(runtime(0), 2_000),
        0,
      ),
    ).rejects.toMatchObject({
      code: "BLACKJACK_RUNTIME_LEASE_CONFLICT",
      ownerId: "runtime-a",
      leaseUntilMs: 7_000,
    });

    expect(memory.current()?._runtimeAuthority?.ownerId).toBe("runtime-a");
  });

  it("allows takeover only after expiry and fences the old runtime afterwards", async () => {
    let nowMs = 1_000;
    const memory = createMemoryDatabase();
    const first = repository(memory.database, "runtime-old", () => nowMs);
    const second = repository(memory.database, "runtime-new", () => nowMs);

    await first.save(
      createBlackjackDurableSnapshot(runtime(0), 1_000),
      null,
    );
    const oldToken = memory.current()?._runtimeAuthority?.fencingToken;

    nowMs = 8_000;
    await second.save(
      createBlackjackDurableSnapshot(runtime(0), 8_000),
      0,
    );
    const newAuthority = memory.current()?._runtimeAuthority;
    expect(newAuthority?.ownerId).toBe("runtime-new");
    expect(newAuthority?.fencingToken).not.toBe(oldToken);
    expect(newAuthority?.leaseUntilMs).toBe(14_000);

    nowMs = 8_500;
    await expect(
      first.save(
        createBlackjackDurableSnapshot(runtime(0), 8_500),
        0,
      ),
    ).rejects.toBeInstanceOf(BlackjackRuntimeLeaseConflictError);
    expect(memory.current()?._runtimeAuthority?.ownerId).toBe("runtime-new");
  });

  it("still reports stale stateVersion writers as snapshot conflicts", async () => {
    let nowMs = 1_000;
    const memory = createMemoryDatabase();
    const repo = repository(memory.database, "runtime-stale", () => nowMs);

    await repo.save(
      createBlackjackDurableSnapshot(runtime(0), 1_000),
      null,
    );
    nowMs = 2_000;
    await repo.save(
      createBlackjackDurableSnapshot(runtime(1), 2_000),
      0,
    );

    nowMs = 3_000;
    await expect(
      repo.save(
        createBlackjackDurableSnapshot(runtime(2), 3_000),
        0,
      ),
    ).rejects.toBeInstanceOf(BlackjackSnapshotConflictError);
  });

  it("rejects corrupt database payloads and corrupt lease metadata", async () => {
    const snapshot = createBlackjackDurableSnapshot(runtime(1), 1_000);
    const corruptSnapshot = {
      ...snapshot,
      checksum: "bad",
    } as StoredSnapshot;
    const corruptMemory = createMemoryDatabase(corruptSnapshot);
    await expect(
      repository(corruptMemory.database, "corrupt-writer").load(
        "main-blackjack",
      ),
    ).rejects.toThrow(/checksum mismatch/);

    const memory = createMemoryDatabase();
    await repository(memory.database, "lease-checksum-writer").save(
      createBlackjackDurableSnapshot(runtime(0), 1_000),
      null,
    );
    const stored = memory.current();
    if (!stored?._runtimeAuthority) {
      throw new Error("expected runtime authority metadata");
    }
    stored._runtimeAuthority.checksum = "bad";

    await expect(
      repository(memory.database, "lease-reader").load("main-blackjack"),
    ).rejects.toThrow(/authority lease checksum mismatch/);
  });

  it("never permits a backwards snapshot version", async () => {
    const memory = createMemoryDatabase();
    const repo = repository(memory.database, "backwards-writer");
    await repo.save(
      createBlackjackDurableSnapshot(runtime(3), 1_000),
      null,
    );

    await expect(
      repo.save(
        createBlackjackDurableSnapshot(runtime(2), 2_000),
        3,
      ),
    ).rejects.toThrow(/cannot move backwards/);
  });
});
