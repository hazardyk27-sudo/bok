import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  STADIUM_ACTION_RECEIPT_CLEANUP_BATCH_SIZE,
  STADIUM_ACTION_RECEIPT_CLEANUP_INTERVAL_MS,
  STADIUM_ACTION_RECEIPT_CLEANUP_MAX_BATCHES,
  STADIUM_ACTION_RECEIPT_RETENTION_MS,
  getStadiumActionReceiptRetentionCutoff,
} from "./stadiumActionReceiptRetention";

const source = readFileSync(
  fileURLToPath(
    new URL(
      "./stadiumActionReceiptRetention.ts",
      import.meta.url,
    ),
  ),
  "utf8",
);

const indexSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);

const schemaSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../../../lib/db/src/schema/idle.ts",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("Stadium action receipt retention", () => {
  it("keeps receipts for exactly 72 hours", () => {
    expect(
      STADIUM_ACTION_RECEIPT_RETENTION_MS,
    ).toBe(72 * 60 * 60 * 1_000);

    const now =
      new Date("2026-09-30T12:00:00.000Z");

    expect(
      getStadiumActionReceiptRetentionCutoff(
        now,
      ).toISOString(),
    ).toBe("2026-09-27T12:00:00.000Z");
  });

  it("runs every six hours with bounded 5k batches", () => {
    expect(
      STADIUM_ACTION_RECEIPT_CLEANUP_INTERVAL_MS,
    ).toBe(6 * 60 * 60 * 1_000);
    expect(
      STADIUM_ACTION_RECEIPT_CLEANUP_BATCH_SIZE,
    ).toBe(5_000);
    expect(
      STADIUM_ACTION_RECEIPT_CLEANUP_MAX_BATCHES,
    ).toBe(20);
  });

  it("uses skip-locked ordered cleanup so active replay rows are not taken", () => {
    expect(source).toContain(
      "WHERE created_at < $1",
    );
    expect(source).toContain(
      "ORDER BY created_at ASC",
    );
    expect(source).toContain("LIMIT $2");
    expect(source).toContain(
      "FOR UPDATE SKIP LOCKED",
    );
    expect(source).toContain("RETURNING r.id");
  });

  it("starts and stops the cleanup with the Idle runtime", () => {
    expect(indexSource).toContain(
      "new StadiumActionReceiptCleanupRuntime",
    );
    expect(indexSource).toContain(
      "stadiumActionReceiptCleanupRuntime.start()",
    );
    expect(indexSource).toContain(
      "stadiumActionReceiptCleanupRuntime.stop()",
    );
    expect(indexSource).toContain(
      "Idle Stadium action-receipt cleanup failed",
    );
  });

  it("indexes created_at for retention cleanup", () => {
    expect(schemaSource).toContain(
      'index("idle_stadium_action_receipts_retention_idx").on(table.createdAt)',
    );
  });
});
