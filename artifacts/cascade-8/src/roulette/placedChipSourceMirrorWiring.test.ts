import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const indexSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);

describe("roulette placed-chip source mirror wiring", () => {
  it("installs source mirroring after generic chip visuals", () => {
    expect(indexSource).toContain(
      'import { installRoulettePlacedChipSourceMirror } from "./placedChipSourceMirror";',
    );

    const visuals = indexSource.indexOf(
      "installRouletteChipVisuals(app);",
    );
    const mirror = indexSource.indexOf(
      "installRoulettePlacedChipSourceMirror(app);",
    );

    expect(visuals).toBeGreaterThanOrEqual(0);
    expect(mirror).toBeGreaterThan(visuals);
  });
});
