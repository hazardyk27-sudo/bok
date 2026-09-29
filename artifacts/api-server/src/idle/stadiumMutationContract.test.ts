import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./stadiumMutation.ts", import.meta.url)),
  "utf8",
);

describe("checkpoint-before-mutation transaction contract", () => {
  it("settles old production before action-specific work and persistence", () => {
    const beginIndex = source.indexOf('client.query("BEGIN")');
    const checkpointIndex = source.indexOf(
      "const checkpoint = await checkpointStadiumProduction(",
    );
    const decideIndex = source.indexOf("const decision = await decide(");
    const persistIndex = source.indexOf(
      "const state = await persistStadiumEconomyMutation(",
    );
    const commitIndex = source.indexOf('client.query("COMMIT")');

    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(checkpointIndex).toBeGreaterThan(beginIndex);
    expect(decideIndex).toBeGreaterThan(checkpointIndex);
    expect(persistIndex).toBeGreaterThan(decideIndex);
    expect(commitIndex).toBeGreaterThan(persistIndex);
  });

  it("does not rewrite the production checkpoint during post-settlement mutation", () => {
    const persistStart = source.indexOf(
      "export async function persistStadiumEconomyMutation",
    );
    const runnerStart = source.indexOf(
      "export async function runCheckpointedStadiumMutation",
    );
    const persistBody = source.slice(persistStart, runnerStart);

    expect(persistBody).not.toContain("production_checkpoint_at =");
    expect(persistBody).toContain("updated_at = $8");
    expect(source).toContain(
      "production_checkpoint_at is deliberately NOT changed here",
    );
  });

  it("rolls back the whole action when decision or persistence fails", () => {
    expect(source).toContain('client.query("ROLLBACK")');
    expect(source).toContain("client.release()");
  });

  it("poisons the DB client when rollback itself fails", () => {
    expect(source).toContain("IDLE_STADIUM_ROLLBACK_FAILED");
    expect(source).toContain("if (!released)");
  });

  it("requires exactly one Stadium row to be updated", () => {
    expect(source).toContain(
      'throw new Error("IDLE_STADIUM_STATE_UPDATE_CONFLICT")',
    );
    expect(source).toContain("(updateResult.rowCount ?? 0) !== 1");
  });
});
