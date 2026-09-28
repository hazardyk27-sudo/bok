import {
  parseBlackjackJournalRecord,
  verifyBlackjackJournalRecord,
  type BlackjackJournalRecord,
} from "./journal";

export type BlackjackJournalDatabase = Readonly<{
  query: (
    sql: string,
    params?: readonly unknown[],
  ) => Promise<Readonly<{ rows: readonly Record<string, unknown>[] }>>;
}>;

export class BlackjackJournalConflictError extends Error {
  readonly code = "BLACKJACK_JOURNAL_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "BlackjackJournalConflictError";
  }
}

type JournalRow = Readonly<{
  event_id: string;
  table_id: string;
  event_sequence: number;
  state_version: number;
  action_id: string | null;
  event_type: string;
  payload: unknown;
  checksum: string;
  created_at: Date | string;
}>;

function rowToRecord(row: JournalRow): BlackjackJournalRecord {
  const createdAtMs =
    row.created_at instanceof Date
      ? row.created_at.getTime()
      : new Date(row.created_at).getTime();

  return parseBlackjackJournalRecord({
    eventId: row.event_id,
    tableId: row.table_id,
    eventSequence: Number(row.event_sequence),
    stateVersion: Number(row.state_version),
    actionId: row.action_id,
    eventType: row.event_type,
    payload: row.payload,
    checksum: row.checksum,
    createdAtMs,
  });
}

function sameRecord(
  left: BlackjackJournalRecord,
  right: BlackjackJournalRecord,
): boolean {
  return left.checksum === right.checksum;
}

function assertSequence(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      "Blackjack journal sequence must be a non-negative safe integer",
    );
  }
}

const RETURNING_COLUMNS = `
  event_id, table_id, event_sequence, state_version, action_id,
  event_type, payload, checksum, created_at
`;

export type BlackjackJournalAppendResult = Readonly<{
  record: BlackjackJournalRecord;
  replayed: boolean;
}>;

export class BlackjackJournalRepository {
  constructor(private readonly database: BlackjackJournalDatabase) {}

  async append(
    record: BlackjackJournalRecord,
    expectedPreviousEventSequence: number,
  ): Promise<BlackjackJournalAppendResult> {
    verifyBlackjackJournalRecord(record);
    assertSequence(expectedPreviousEventSequence);

    if (record.eventSequence !== expectedPreviousEventSequence + 1) {
      throw new RangeError(
        "Blackjack journal append must advance eventSequence by exactly one",
      );
    }

    const inserted = await this.database.query(
      `INSERT INTO blackjack_event_journal
         (event_id, table_id, event_sequence, state_version, action_id,
          event_type, payload, checksum, created_at)
       SELECT $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9
        WHERE COALESCE(
          (SELECT MAX(event_sequence)
             FROM blackjack_event_journal
            WHERE table_id = $2),
          0
        ) = $10
       ON CONFLICT DO NOTHING
       RETURNING ${RETURNING_COLUMNS}`,
      [
        record.eventId,
        record.tableId,
        record.eventSequence,
        record.stateVersion,
        record.actionId,
        record.eventType,
        JSON.stringify(record.payload),
        record.checksum,
        new Date(record.createdAtMs),
        expectedPreviousEventSequence,
      ],
    );

    if (inserted.rows[0]) {
      return Object.freeze({
        record: rowToRecord(inserted.rows[0] as JournalRow),
        replayed: false,
      });
    }

    const existing = await this.database.query(
      `SELECT ${RETURNING_COLUMNS}
         FROM blackjack_event_journal
        WHERE table_id = $1
          AND event_sequence = $2
        LIMIT 1`,
      [record.tableId, record.eventSequence],
    );

    if (existing.rows[0]) {
      const stored = rowToRecord(existing.rows[0] as JournalRow);
      if (sameRecord(stored, record)) {
        return Object.freeze({
          record: stored,
          replayed: true,
        });
      }

      throw new BlackjackJournalConflictError(
        "Blackjack journal sequence already contains different event data",
      );
    }

    throw new BlackjackJournalConflictError(
      "Blackjack journal append expected previous eventSequence is stale or missing",
    );
  }

  async loadAfter(
    tableId: string,
    afterEventSequence: number,
  ): Promise<readonly BlackjackJournalRecord[]> {
    if (!tableId.trim()) {
      throw new RangeError("Blackjack journal tableId must be non-empty");
    }
    assertSequence(afterEventSequence);

    const result = await this.database.query(
      `SELECT ${RETURNING_COLUMNS}
         FROM blackjack_event_journal
        WHERE table_id = $1
          AND event_sequence > $2
        ORDER BY event_sequence ASC`,
      [tableId, afterEventSequence],
    );

    const records = result.rows.map((row) =>
      rowToRecord(row as JournalRow),
    );

    let expected = afterEventSequence + 1;
    for (const record of records) {
      if (record.tableId !== tableId || record.eventSequence !== expected) {
        throw new BlackjackJournalConflictError(
          "Blackjack journal contains a sequence gap or foreign event",
        );
      }
      expected += 1;
      if (!Number.isSafeInteger(expected)) {
        throw new RangeError(
          "Blackjack journal recovery sequence exceeds safe integer range",
        );
      }
    }

    return Object.freeze(records);
  }
}
