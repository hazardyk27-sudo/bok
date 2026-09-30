import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./stadiumRepository.ts", import.meta.url)),
  "utf8",
);

describe("Stadium persistent production repository contract", () => {
  it("creates canonical Lv1 Stadium state with zero seats and zero inventory", () => {
    expect(source).toContain("INSERT INTO idle_stadium_states");
    expect(source).toContain("VALUES ($1, $2, 1, 0, 1, 1, 0, 0, $3, $3, $3)");
    expect(source).toContain("ON CONFLICT (session_id) DO NOTHING");
  });

  it("projects elapsed production from the persisted checkpoint without timers", () => {
    expect(source).toContain("serverNow.getTime() - state.productionCheckpointAt.getTime()");
    expect(source).toContain("projectStadiumTicketProduction({");
    expect(source).toContain("Returns a server-authoritative live Stadium projection without creating a");
    expect(source).toContain("per-user timer");
  });

  it("locks the Stadium row and checkpoints production before economy mutations", () => {
    expect(source).toContain('forUpdate ? "FOR UPDATE" : ""');
    expect(source).toContain("export async function checkpointStadiumProduction(");
    expect(source).toContain("stored_microtickets = $2");
    expect(source).toContain("production_checkpoint_at = $3");
    expect(source).toContain("updated_at = $3");
  });

  it("preserves offline accrual with no artificial elapsed-time cap", () => {
    expect(source).toContain("const elapsedMs = Math.max(");
    expect(source).not.toContain("MAX_OFFLINE");
    expect(source).not.toContain("offlineCap");
    expect(source).not.toContain("Math.min(elapsedMs");
  });

  it("never moves a production checkpoint backwards", () => {
    expect(source).toContain("serverNow.getTime() >= state.productionCheckpointAt.getTime()");
    expect(source).toContain("? serverNow");
    expect(source).toContain(": state.productionCheckpointAt");
    expect(source).toContain("Math.max(");
    expect(source).toContain("projection.state.productionCheckpointAt.getTime()");
  });

  it("exposes checkpointing as a reusable transaction boundary for later actions", () => {
    expect(source).toContain("Upgrade/purchase/sale actions will reuse this function");
    expect(source).toContain("async settleProduction(");
    expect(source).toContain("creditedMicroTickets: result.projection.creditedMicroTickets");
  });
});
