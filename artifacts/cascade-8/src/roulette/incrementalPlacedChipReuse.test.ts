import {
  readFileSync,
} from "node:fs";
import {
  describe,
  expect,
  it,
} from "vitest";
import {
  getRouletteChipTier,
} from "./chipVisual";

const canonicalSource =
  readFileSync(
    new URL(
      "./canonicalPlacedChip.ts",
      import.meta.url,
    ),
    "utf8",
  );
const chipVisualSource =
  readFileSync(
    new URL(
      "./chipVisual.ts",
      import.meta.url,
    ),
    "utf8",
  );
const indexSource =
  readFileSync(
    new URL(
      "./index.ts",
      import.meta.url,
    ),
    "utf8",
  );

describe("roulette canonical placed chip", () => {
  it("routes placed-chip faces through one aggregate visual sync", () => {
    expect(getRouletteChipTier(10)).toBe("white");
    expect(getRouletteChipTier(20)).toBe("white");
    expect(getRouletteChipTier(80)).toBe("blue");
    expect(getRouletteChipTier(160)).toBe("green");
    expect(canonicalSource).toContain(
      "syncRoulettePlacedChipVisual",
    );
    expect(canonicalSource).not.toContain(
      "applyRouletteChipVisualState",
    );
    expect(chipVisualSource).toContain(
      'className.startsWith("chip-")',
    );
    expect(chipVisualSource).toContain(
      '"--chip-fill"',
    );
    expect(chipVisualSource).toContain(
      '"--chip-edge"',
    );
  });

  it("keeps the legacy Element prototype reuse layer out of the runtime mount path", () => {
    expect(indexSource).not.toContain(
      "installRouletteIncrementalPlacedChipReuse",
    );
    expect(indexSource).toContain(
      "mountRouletteRuntime(app)",
    );
  });
});
