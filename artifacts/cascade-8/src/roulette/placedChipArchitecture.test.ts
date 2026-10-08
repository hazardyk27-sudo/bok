import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeSource = readFileSync(
  new URL("./rouletteRuntime.ts", import.meta.url),
  "utf8",
);
const tierSource = readFileSync(
  new URL("./chipTier.ts", import.meta.url),
  "utf8",
);

describe("roulette placed-chip architecture", () => {
  it("keeps the runtime on the canonical placed-chip renderer", () => {
    expect(runtimeSource).toContain(
      "createRouletteCanonicalPlacedChip",
    );
    expect(runtimeSource).not.toContain(
      "ROULETTE_PLACED_CHIP_PALETTE",
    );
    expect(runtimeSource).not.toContain(
      "getRouletteDisplayChipValue",
    );
    expect(runtimeSource).not.toContain("--chip-fill");
    expect(runtimeSource).not.toContain("--chip-ink");
    expect(runtimeSource).not.toContain("--chip-edge");
    expect(runtimeSource).not.toContain("chip-${displayChip}");
  });

  it("does not keep a legacy palette-slot translator after canonical rendering", () => {
    expect(tierSource).not.toContain(
      "getRouletteLegacyPaletteSlot",
    );
  });
});
