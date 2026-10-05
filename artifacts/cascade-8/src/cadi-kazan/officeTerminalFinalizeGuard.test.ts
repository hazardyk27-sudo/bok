import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./officeTerminalFinalizeGuard.ts", import.meta.url)), "utf8");
const routeSource = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");

describe("Office terminal finalize guard", () => {
  it("does not accelerate until every Office cell crossed the existing commit gate", () => {
    expect(source).toContain("tracker.committedCells.add(cellIndex)");
    expect(source).toContain("tracker.committedCells.size < round.cellCount");
    expect(source).toContain("return originalQueueOfficeReveal(cellIndex)");
  });

  it("collapses only the remaining terminal reveal round-trips", () => {
    expect(source).toContain("Promise.allSettled");
    expect(source).toContain("pending.map((index) => revealOfficeCell(roundId, index))");
    expect(source).toContain("internal.applyState(authoritative.state, false)");
  });

  it("prevents an older ACTIVE Office response from downgrading terminal state", () => {
    expect(source).toContain("currentRound.status !== \"ACTIVE\"");
    expect(source).toContain("incomingRound.status === \"ACTIVE\"");
  });

  it("is installed only on the Cadı Kazan client", () => {
    expect(routeSource).toContain("installOfficeTerminalFinalizeGuard");
    expect(routeSource).toContain("installOfficeTerminalFinalizeGuard(client)");
  });

  it("does not change ScratchSurface timing or brush constants", () => {
    expect(source).not.toContain("RESULT_COMMIT_MIN_MS");
    expect(source).not.toContain("SCRATCH_BRUSH_RADIUS_PX");
    expect(source).not.toContain("persistentCoverageCommit");
  });
});
