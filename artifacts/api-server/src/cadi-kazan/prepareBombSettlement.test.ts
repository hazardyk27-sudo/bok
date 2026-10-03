import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const routesSource = readFileSync(
  fileURLToPath(new URL("./routes.ts", import.meta.url)),
  "utf8",
);

describe("prepare-reveal bomb settlement", () => {
  it("settles a prepared bomb on the server before returning it to the browser", () => {
    const bombBranch = routesSource.indexOf('if (prepared.kind === "BOMB")');
    const revealCall = routesSource.indexOf("cadiKazanRepository.revealCell", bombBranch);
    const responseCall = routesSource.indexOf("res.json({ ...prepared, settlement })", bombBranch);

    expect(bombBranch).toBeGreaterThan(-1);
    expect(revealCall).toBeGreaterThan(bombBranch);
    expect(responseCall).toBeGreaterThan(revealCall);
    expect(routesSource).toContain("prepare-bust-${roundId}-${cellIndex}");
  });

  it("returns the authoritative BUST state on a retried prepare request", () => {
    expect(routesSource).toContain('error.message !== "CADI_KAZAN_ROUND_NOT_ACTIVE"');
    expect(routesSource).toContain('round.status !== "BUST"');
    expect(routesSource).toContain("round.revealedBombCells.includes(cellIndex)");
    expect(routesSource).toContain('settlement: { outcome: "NOOP", state }');
  });
});
