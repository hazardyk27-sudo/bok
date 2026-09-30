import { pool } from "@workspace/db";

export const STADIUM_ACTION_RECEIPT_RETENTION_MS =
  72 * 60 * 60 * 1_000;
export const STADIUM_ACTION_RECEIPT_CLEANUP_INTERVAL_MS =
  6 * 60 * 60 * 1_000;
export const STADIUM_ACTION_RECEIPT_CLEANUP_BATCH_SIZE =
  5_000;
export const STADIUM_ACTION_RECEIPT_CLEANUP_MAX_BATCHES =
  20;

export function getStadiumActionReceiptRetentionCutoff(
  now = new Date(),
) {
  const nowMs = now.getTime();

  if (!Number.isFinite(nowMs)) {
    throw new Error(
      "INVALID_IDLE_STADIUM_RECEIPT_RETENTION_CLOCK",
    );
  }

  return new Date(
    nowMs - STADIUM_ACTION_RECEIPT_RETENTION_MS,
  );
}

export async function deleteExpiredStadiumActionReceiptBatch(
  cutoff: Date,
  batchSize =
    STADIUM_ACTION_RECEIPT_CLEANUP_BATCH_SIZE,
) {
  if (
    !Number.isFinite(cutoff.getTime())
    || !Number.isSafeInteger(batchSize)
    || batchSize <= 0
  ) {
    throw new Error(
      "INVALID_IDLE_STADIUM_RECEIPT_CLEANUP_INPUT",
    );
  }

  const result = await pool.query<{ id: string }>(
    `WITH candidates AS (
       SELECT id
         FROM idle_stadium_action_receipts
        WHERE created_at < $1
        ORDER BY created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
     )
     DELETE FROM idle_stadium_action_receipts AS r
     USING candidates AS c
     WHERE r.id = c.id
     RETURNING r.id`,
    [cutoff, batchSize],
  );

  return result.rowCount ?? result.rows.length;
}

export async function cleanupExpiredStadiumActionReceipts(
  now = new Date(),
) {
  const cutoff =
    getStadiumActionReceiptRetentionCutoff(now);

  let deletedRows = 0;

  for (
    let batch = 0;
    batch < STADIUM_ACTION_RECEIPT_CLEANUP_MAX_BATCHES;
    batch += 1
  ) {
    const deleted =
      await deleteExpiredStadiumActionReceiptBatch(
        cutoff,
      );

    deletedRows += deleted;

    if (
      deleted
      < STADIUM_ACTION_RECEIPT_CLEANUP_BATCH_SIZE
    ) {
      break;
    }
  }

  return deletedRows;
}

type CleanupRuntimeOptions = {
  now?: () => Date;
  cleanup?: (now?: Date) => Promise<number>;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  onError?: (error: unknown) => void;
};

export class StadiumActionReceiptCleanupRuntime {
  private readonly now: () => Date;
  private readonly cleanup:
    NonNullable<CleanupRuntimeOptions["cleanup"]>;
  private readonly setIntervalFn:
    NonNullable<CleanupRuntimeOptions["setIntervalFn"]>;
  private readonly clearIntervalFn:
    NonNullable<CleanupRuntimeOptions["clearIntervalFn"]>;
  private readonly onError?: (error: unknown) => void;

  private timer:
    ReturnType<typeof setInterval> | null = null;
  private sweepInFlight:
    Promise<number> | null = null;

  constructor(options: CleanupRuntimeOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.cleanup =
      options.cleanup
      ?? cleanupExpiredStadiumActionReceipts;
    this.setIntervalFn =
      options.setIntervalFn ?? setInterval;
    this.clearIntervalFn =
      options.clearIntervalFn ?? clearInterval;
    this.onError = options.onError;
  }

  start() {
    if (this.timer !== null) return;

    this.triggerSweep();

    this.timer = this.setIntervalFn(
      () => this.triggerSweep(),
      STADIUM_ACTION_RECEIPT_CLEANUP_INTERVAL_MS,
    );

    this.timer.unref?.();
  }

  stop() {
    if (this.timer !== null) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }
  }

  private triggerSweep() {
    if (this.sweepInFlight) return;

    const sweep = this.cleanup(this.now());
    this.sweepInFlight = sweep;

    void sweep.catch((error) => {
      this.onError?.(error);
    }).finally(() => {
      if (this.sweepInFlight === sweep) {
        this.sweepInFlight = null;
      }
    });
  }
}

export const stadiumActionReceiptCleanupRuntime =
  new StadiumActionReceiptCleanupRuntime();
