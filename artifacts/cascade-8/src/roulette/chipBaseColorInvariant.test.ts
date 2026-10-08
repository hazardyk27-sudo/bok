// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import {
  describe,
  expect,
  it,
} from "vitest";
import {
  applyRouletteChipVisualState,
} from "./chipVisual";

const css = readFileSync(
  new URL("./chipVisual.css", import.meta.url),
  "utf8",
);
const dragCss = readFileSync(
  new URL("./chipDrag.css", import.meta.url),
  "utf8",
);

describe("roulette fixed chip geometry invariant", () => {
  it("changes exactly one tier-dependent CSS custom property", () => {
    const chip = document.createElement("span");

    for (const amount of [10, 20, 40, 50, 60, 100, 500, 2_000, 5_000]) {
      expect(applyRouletteChipVisualState(chip, amount)).toBe(true);
      const casinoProperties = Array.from(chip.style)
        .filter((name) => name.startsWith("--casino-chip-"));
      expect(casinoProperties).toEqual([
        "--casino-chip-base",
      ]);
    }
  });

  it("keeps ring, segment, edge, highlight, shadow and typography fixed in CSS", () => {
    expect(css).toContain("--casino-chip-base");
    expect(css).toContain("--casino-chip-inner-fixed");
    expect(css).toContain("--casino-chip-accent-fixed");
    expect(css).toContain("--casino-chip-ink-fixed");

    for (const forbidden of [
      "var(--casino-chip-main)",
      "var(--casino-chip-inner)",
      "var(--casino-chip-accent)",
      "var(--casino-chip-highlight)",
      "var(--casino-chip-ink)",
    ]) {
      expect(css).not.toContain(forbidden);
      expect(dragCss).not.toContain(forbidden);
    }
  });
});
