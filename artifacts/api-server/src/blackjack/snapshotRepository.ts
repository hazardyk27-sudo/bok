import {
  parseBlackjackDurableSnapshot,
  verifyBlackjackDurableSnapshot,
  type BlackjackDurableSnapshot,
} from "./snapshotState";

export type BlackjackSnapshotQueryResult = Readonly<{
  rows: readonly Record<string, unknown>[];
}>;

export type BlackjackSnapshotDatabase = Readonly<{
  query: (
    sql: string,
    params?: readonly unknown[],
  ) => Promise<BlackjackSnapshotQueryResult>;
}>;

export class BlackjackSnapshotConflictError extends Error {
  readonly code = "BLACKJACK_SNAPSHOT_CONFLICT";

  constructor(tableId: string) {
    super("Blackjack snapshot compare-and-swap conflict for table " + tableId);
    this.name = "BlackjackSnapshotConflictError";
  }
}

function assertExpectedVersion(value: number | null): void {
  if (
    value !== null &&
    (!Number.isSafeInteger(value) || value < 0)
  ) {
    throw new RangeError(
      "Blackjack expectedPreviousStateVersion must be null or a non-negative safe integer",
    );
  }
}

export class BlackjackSnapshotRepository {
  constructor(private readonly database: BlackjackSnapshotDatabase) {}

  async load(tableId: string): Promise<BlackjackDurableSnapshot | null> {
    if (!tableId.trim()) {
      throw new RangeError("Blackjack tableId must be a non-empty string");
    }

    const result = await this.database.query(
      `SELECT snapshot
         FROM blackjack_table_snapshots
        WHERE table_id = $1
        LIMIT 1`,
      [tableId],
    );

    const row = result.rows[0];
    if (!row) return null;
    return parseBlackjackDurableSnapshot(row.snapshot);
  }

  async save(
    snapshot: BlackjackDurableSnapshot,
    expectedPreviousStateVersion: number | null,
  ): Promise<BlackjackDurableSnapshot> {
    verifyBlackjackDurableSnapshot(snapshot);
    assertExpectedVersion(expectedPreviousStateVersion);

    if (
      expectedPreviousStateVersion !== null &&
      snapshot.stateVersion < expectedPreviousStateVersion
    ) {
      throw new RangeError(
        "Blackjack snapshot stateVersion cannot move backwards",
      );
    }

    const commonParams = [
      snapshot.tableId,
      snapshot.schemaVersion,
      snapshot.stateVersion,
      snapshot.eventSequence,
      snapshot.payload.table.phase,
      JSON.stringify(snapshot),
      snapshot.checksum,
      new Date(snapshot.savedAtMs),
    ] as const;

    const result =
      expectedPreviousStateVersion === null
        ? await this.database.query(
            `INSERT INTO blackjack_table_snapshots
               (table_id, schema_version, state_version, event_sequence, phase,
                snapshot, checksum, saved_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, now())
             ON CONFLICT (table_id) DO NOTHING
             RETURNING snapshot`,
            commonParams,
          )
        : await this.database.query(
            `UPDATE blackjack_table_snapshots
                SET schema_version = $2,
                    state_version = $3,
                    event_sequence = $4,
                    phase = $5,
                    snapshot = $6::jsonb,
                    checksum = $7,
                    saved_at = $8,
                    updated_at = now()
              WHERE table_id = $1
                AND state_version = $9
              RETURNING snapshot`,
            [...commonParams, expectedPreviousStateVersion],
          );

    const row = result.rows[0];
    if (!row) {
      throw new BlackjackSnapshotConflictError(snapshot.tableId);
    }

    return parseBlackjackDurableSnapshot(row.snapshot);
  }
}
