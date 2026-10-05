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
const reuseSource =
  readFileSync(
    new URL(
      "./incrementalPlacedChipReuse.ts",
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

describe("roulette canonical placed chip + incremental reuse", () => {
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

  it("reuses a pending placed-chip node instead of detach + append churn", () => {
    expect(reuseSource).toContain(
      "roulettePendingRuntimeRemoval",
    );
    expect(reuseSource).toContain(
      "directPlacedChip(this)",
    );
    expect(reuseSource).toContain(
      "syncRouletteCanonicalChipFace(\n        existing",
    );
    expect(reuseSource).toContain(
      "queueMicrotask(\n    flushPendingRemovals",
    );
  });

  it("installs reuse before rouletteRuntime mounts", () => {
    const reuseInstall =
      indexSource.indexOf(
        "installRouletteIncrementalPlacedChipReuse(app)",
      );
    const runtimeMount =
      indexSource.indexOf(
        "mountRouletteRuntime(app)",
      );

    expect(reuseInstall).toBeGreaterThan(-1);
    expect(runtimeMount).toBeGreaterThan(-1);
    expect(reuseInstall).toBeLessThan(runtimeMount);
  });
});
