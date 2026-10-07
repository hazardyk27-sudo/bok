import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const indexSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);

describe("roulette placed-chip aggregate visual wiring", () => {
  it("uses aggregate chip visuals without selected-chip source mirroring", () => {
    expect(indexSource).toContain(
      'import { installRouletteChipVisuals } from "./chipVisual";',
    );
    expect(indexSource).toContain(
      "installRouletteChipVisuals(app);",
    );
    expect(indexSource).not.toContain(
      "installRoulettePlacedChipSourceMirror",
    );
  });

  it("installs deadline-safe x2 ingress", () => {
    expect(indexSource).toContain(
      'import { installRouletteFastDouble } from "./fastDouble";',
    );
    expect(indexSource).toContain(
      "installRouletteFastDouble(app);",
    );
  });
});
