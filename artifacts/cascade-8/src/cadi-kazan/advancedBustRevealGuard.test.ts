import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const guardSource = readFileSync(
  fileURLToPath(new URL("./advancedBustRevealGuard.ts", import.meta.url)),
  "utf8",
);
const routeSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);

describe("Bomb contact settlement guard", () => {
  it("is installed only from the Cadi Kazan route and feeds terminal state back to WitchClient", () => {
    expect(routeSource).toContain('import { installAdvancedBustRevealGuard } from "./advancedBustRevealGuard"');
    expect(routeSource).toContain("installAdvancedBustRevealGuard((state) => {");
    expect(routeSource).toContain("internalClient.applyState(state, false);");
  });

  it("treats both Standard and Advanced as bomb cards but never Office", () => {
    expect(guardSource).toContain('return mode === "STANDARD" || mode === "ADVANCED"');
    expect(guardSource).toContain('prepared.kind === "BOMB"');
    expect(guardSource).toContain("applyPreparedSettlement(bombPrepared.settlement)");
    expect(guardSource).toContain("await settlePreparedBomb(nativeFetch, bombPrepared)");
    expect(guardSource).not.toContain('mode === "OFFICE_MATCH_6" ||');
  });

  it("waits for bomb settlement before releasing the prepare response to the scratch surface", () => {
    expect(guardSource).toContain("const prepared = await response.clone().json()");
    expect(guardSource).toContain("consumeBombTerminalState?.(state)");
    expect(guardSource).toContain("before the original prepare response is released to WitchClient");
  });

  it("forces exactly 25 Advanced cells to the server-authoritative terminal results", () => {
    expect(guardSource).toContain('round.mode !== "ADVANCED" || round.status !== "BUST" || round.cellCount !== 25');
    expect(guardSource).toContain("if (cells.length !== 25) return false");
    expect(guardSource).toContain("const bombIndices = new Set(round.revealedBombCells)");
    expect(guardSource).toContain('cell.dataset.authoritativeResult = kind');
    expect(guardSource).toContain('candidate.dataset.witchResultActive = candidate.dataset.witchResultCandidate === kind ? "true" : "false"');
    expect(guardSource).toContain('layer.hidden = true');
  });
});
