import { createHash } from "node:crypto";
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
  BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_DEVELOPMENT,
  BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_PRODUCTION,
  BlackjackRuntimeLeaseConflictError,
  BlackjackSnapshotRepository,
  type BlackjackSnapshotDatabase,
} from "./snapshotRepository";

function runtime(stateVersion = 0): BlackjackDurableRuntimeState {
  const table = createBlackjackTableFoundation({
    tableId: "priority-table",
    shoe: createUnshuffledBlackjackShoe({
      shoeId: "priority-shoe",
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
    priority?: number;
    checksum: string;
  };
};

function createMemoryDatabase(initial: StoredSnapshot | null = null): Readonly<{
  database: BlackjackSnapshotDatabase;
  current: () => StoredSnapshot | null;
}> {
  let row: StoredSnapshot | null = initial;

  const database: BlackjackSnapshotDatabase = {
    query: async (sql, params = []) => {
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

        const expectedStateVersion = Number(params[8]);
        const ownerId = String(params[9]);
        const nowMs = Number(params[10]);
        const fencingToken = String(params[11]);
        const candidatePriority = Number(params[12]);
        const authority = row._runtimeAuthority;
        const currentPriority = authority?.priority ?? 0;

        const leaseAllowsWrite =
          authority === undefined ||
          (
            authority.ownerId === ownerId &&
            authority.fencingToken === fencingToken
          ) ||
          authority.leaseUntilMs <= nowMs ||
          currentPriority < candidatePriority;

        if (
          row.stateVersion !== expectedStateVersion ||
          !leaseAllowsWrite
        ) {
          return { rows: [] };
        }

        row = JSON.parse(String(params[5])) as StoredSnapshot;
        return { rows: [{ snapshot: row }] };
      }

      throw new Error("Unexpected SQL in authority priority test: " + sql);
    },
  };

  return Object.freeze({
    database,
    current: () => row,
  });
}

function legacyLeaseChecksum(input: {
  tableId: string;
  ownerId: string;
  fencingToken: string;
  leaseUntilMs: number;
}): string {
  return createHash("sha256")
    .update(JSON.stringify([
      input.tableId,
      input.ownerId,
      input.fencingToken,
      input.leaseUntilMs,
    ]))
    .digest("hex");
}

describe("blackjack runtime authority priority", () => {
  it("lets production preempt a live development fallback without waiting for lease expiry", async () => {
    let nowMs = 1_000;
    const memory = createMemoryDatabase();
    const development = new BlackjackSnapshotRepository(memory.database, {
      ownerId: "blackjack-runtime:development:1741:dev",
      leaseDurationMs: 6_000,
      authorityPriority: BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_DEVELOPMENT,
      nowMs: () => nowMs,
    });
    const production = new BlackjackSnapshotRepository(memory.database, {
      ownerId: "blackjack-runtime:production:9001:prod",
      leaseDurationMs: 6_000,
      authorityPriority: BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_PRODUCTION,
      nowMs: () => nowMs,
    });

    await development.save(
      createBlackjackDurableSnapshot(runtime(0), 1_000),
      null,
    );
    expect(memory.current()?._runtimeAuthority).toMatchObject({
      ownerId: "blackjack-runtime:development:1741:dev",
      priority: BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_DEVELOPMENT,
      leaseUntilMs: 7_000,
    });

    nowMs = 2_000;
    await production.save(
      createBlackjackDurableSnapshot(runtime(0), 2_000),
      0,
    );

    expect(memory.current()?._runtimeAuthority).toMatchObject({
      ownerId: "blackjack-runtime:production:9001:prod",
      priority: BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_PRODUCTION,
      leaseUntilMs: 8_000,
    });

    nowMs = 2_500;
    await expect(
      development.save(
        createBlackjackDurableSnapshot(runtime(0), 2_500),
        0,
      ),
    ).rejects.toMatchObject({
      code: "BLACKJACK_RUNTIME_LEASE_CONFLICT",
      ownerId: "blackjack-runtime:production:9001:prod",
      ownerPriority: BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_PRODUCTION,
    });
  });

  it("does not let an equal-priority production runtime steal a live production lease", async () => {
    let nowMs = 1_000;
    const memory = createMemoryDatabase();
    const first = new BlackjackSnapshotRepository(memory.database, {
      ownerId: "blackjack-runtime:production:1:first",
      leaseDurationMs: 6_000,
      authorityPriority: BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_PRODUCTION,
      nowMs: () => nowMs,
    });
    const second = new BlackjackSnapshotRepository(memory.database, {
      ownerId: "blackjack-runtime:production:2:second",
      leaseDurationMs: 6_000,
      authorityPriority: BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_PRODUCTION,
      nowMs: () => nowMs,
    });

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
    ).rejects.toBeInstanceOf(BlackjackRuntimeLeaseConflictError);

    expect(memory.current()?._runtimeAuthority).toMatchObject({
      ownerId: "blackjack-runtime:production:1:first",
      priority: BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_PRODUCTION,
    });
  });

  it("reads a pre-priority lease and upgrades it without waiting for expiry", async () => {
    const tableId = "priority-table";
    const snapshot = createBlackjackDurableSnapshot(runtime(0), 1_000);
    const legacyOwner = "blackjack-runtime:1741:legacy";
    const legacyToken = "legacy-fencing-token";
    const legacyLeaseUntilMs = 9_000;
    const legacyStored = {
      ...snapshot,
      _runtimeAuthority: {
        ownerId: legacyOwner,
        fencingToken: legacyToken,
        leaseUntilMs: legacyLeaseUntilMs,
        checksum: legacyLeaseChecksum({
          tableId,
          ownerId: legacyOwner,
          fencingToken: legacyToken,
          leaseUntilMs: legacyLeaseUntilMs,
        }),
      },
    } as StoredSnapshot;
    const memory = createMemoryDatabase(legacyStored);
    const production = new BlackjackSnapshotRepository(memory.database, {
      ownerId: "blackjack-runtime:production:9002:upgrade",
      leaseDurationMs: 6_000,
      authorityPriority: BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_PRODUCTION,
      nowMs: () => 2_000,
    });

    await expect(production.load(tableId)).resolves.toMatchObject(snapshot);
    expect(memory.current()?._runtimeAuthority).toMatchObject({
      ownerId: legacyOwner,
      fencingToken: legacyToken,
      leaseUntilMs: legacyLeaseUntilMs,
    });

    await production.save(
      createBlackjackDurableSnapshot(runtime(0), 2_000),
      0,
    );

    expect(memory.current()?._runtimeAuthority).toMatchObject({
      ownerId: "blackjack-runtime:production:9002:upgrade",
      priority: BLACKJACK_RUNTIME_AUTHORITY_PRIORITY_PRODUCTION,
      leaseUntilMs: 8_000,
    });
  });
});
