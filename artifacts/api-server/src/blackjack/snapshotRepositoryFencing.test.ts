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
  BlackjackSnapshotRepository,
  releaseBlackjackRuntimeLeaseEpoch,
  type BlackjackSnapshotDatabase,
} from "./snapshotRepository";

function runtime(stateVersion = 0): BlackjackDurableRuntimeState {
  const table = createBlackjackTableFoundation({
    tableId: "main-blackjack",
    shoe: createUnshuffledBlackjackShoe({
      shoeId: "fencing-shoe",
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

function memoryDatabase(input: {
  nowMs: () => number;
}): Readonly<{
  database: BlackjackSnapshotDatabase;
  current: () => StoredSnapshot | null;
  clockReads: () => number;
}> {
  let row: StoredSnapshot | null = null;
  let clockReadCount = 0;

  const database: BlackjackSnapshotDatabase = {
    query: async (sql, params = []) => {
      if (sql.includes("clock_timestamp()")) {
        clockReadCount += 1;
        return { rows: [{ now_ms: String(input.nowMs()) }] };
      }

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
        const authority = row._runtimeAuthority;
        const leaseAllowsWrite =
          authority === undefined ||
          (
            authority.ownerId === ownerId &&
            authority.fencingToken === fencingToken
          ) ||
          authority.leaseUntilMs <= nowMs;

        if (
          row.stateVersion !== expectedStateVersion ||
          !leaseAllowsWrite
        ) {
          return { rows: [] };
        }

        row = JSON.parse(String(params[5])) as StoredSnapshot;
        return { rows: [{ snapshot: row }] };
      }

      throw new Error("Unexpected SQL in fencing test: " + sql);
    },
  };

  return Object.freeze({
    database,
    current: () => row,
    clockReads: () => clockReadCount,
  });
}

describe("blackjack runtime snapshot fencing", () => {
  it("rejects a restarted runtime with the same owner until the prior fencing epoch expires", async () => {
    let nowMs = 1_000;
    const memory = memoryDatabase({ nowMs: () => nowMs });
    const first = new BlackjackSnapshotRepository(memory.database, {
      ownerId: "same-process-owner",
      leaseDurationMs: 6_000,
      nowMs: () => nowMs,
    });

    await first.save(
      createBlackjackDurableSnapshot(runtime(0), 1_000),
      null,
    );
    const firstToken = memory.current()?._runtimeAuthority?.fencingToken;
    expect(firstToken).toBeTruthy();

    releaseBlackjackRuntimeLeaseEpoch(
      "main-blackjack",
      "same-process-owner",
    );

    nowMs = 2_000;
    const restarted = new BlackjackSnapshotRepository(memory.database, {
      ownerId: "same-process-owner",
      leaseDurationMs: 6_000,
      nowMs: () => nowMs,
    });

    await expect(
      restarted.save(
        createBlackjackDurableSnapshot(runtime(0), 2_000),
        0,
      ),
    ).rejects.toBeInstanceOf(BlackjackRuntimeLeaseConflictError);
    expect(memory.current()?._runtimeAuthority?.fencingToken).toBe(firstToken);

    nowMs = 8_000;
    await restarted.save(
      createBlackjackDurableSnapshot(runtime(0), 8_000),
      0,
    );
    expect(memory.current()?._runtimeAuthority?.fencingToken)
      .not.toBe(firstToken);
  });

  it("uses PostgreSQL time for production lease decisions when no test clock is injected", async () => {
    let nowMs = 12_345;
    const memory = memoryDatabase({ nowMs: () => nowMs });
    const repository = new BlackjackSnapshotRepository(memory.database, {
      ownerId: "db-clock-owner",
      leaseDurationMs: 6_000,
    });

    await repository.save(
      createBlackjackDurableSnapshot(runtime(0), 99),
      null,
    );

    expect(memory.clockReads()).toBe(1);
    expect(memory.current()?._runtimeAuthority?.leaseUntilMs).toBe(18_345);

    nowMs = 13_000;
    await repository.save(
      createBlackjackDurableSnapshot(runtime(1), 100),
      0,
    );

    expect(memory.clockReads()).toBe(2);
    expect(memory.current()?._runtimeAuthority?.leaseUntilMs).toBe(19_000);
  });
});
