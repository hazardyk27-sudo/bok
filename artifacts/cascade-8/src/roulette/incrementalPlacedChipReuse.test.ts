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
const indexSource =
  readFileSync(
    new URL(
      "./index.ts",
      import.meta.url,
    ),
    "utf8",
  );

describe("roulette canonical placed chip", () => {
  it("keeps the selected 10 chip and placed 10 chip on the same white casino tier", () => {
    expect(getRouletteChipTier(10)).toBe("white");
    expect(canonicalSource).toContain(
      "applyRouletteChipVisualState",
    );
    expect(canonicalSource).toContain(
      '"roulette-placed-chip"',
    );
    expect(canonicalSource).toContain(
      'className.startsWith("chip-")',
    );
    expect(canonicalSource).toContain(
      '"--chip-fill"',
    );
    expect(canonicalSource).toContain(
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
