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

describe("Advanced 25 BUST reveal guard", () => {
  it("is installed only from the Cadi Kazan route", () => {
    expect(routeSource).toContain('import { installAdvancedBustRevealGuard } from "./advancedBustRevealGuard"');
    expect(routeSource).toContain("installAdvancedBustRevealGuard();");
  });

  it("auto-settles only a prepared Advanced bomb", () => {
    expect(guardSource).toContain('prepared.mode === "ADVANCED" && prepared.kind === "BOMB"');
    expect(guardSource).toContain("settlePreparedAdvancedBomb(nativeFetch");
    expect(guardSource).not.toContain('prepared.mode === "STANDARD" && prepared.kind === "BOMB"');
    expect(guardSource).not.toContain('prepared.mode === "OFFICE_MATCH_6"');
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
