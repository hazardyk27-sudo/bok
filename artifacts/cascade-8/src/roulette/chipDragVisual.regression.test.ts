import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getRouletteChipPalette,
  getRouletteChipTier,
} from "./chipVisual";

const css = readFileSync(
  fileURLToPath(new URL("./chipDrag.css", import.meta.url)),
  "utf8",
);

function cssBlock(selector: string) {
  const start = css.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = css.indexOf("{", start);
  const end = css.indexOf("}", bodyStart);
  expect(bodyStart).toBeGreaterThan(start);
  expect(end).toBeGreaterThan(bodyStart);
  return css.slice(bodyStart + 1, end);
}

describe("roulette drag chip visual regression", () => {
  it("keeps the $10 denomination on the white casino-chip base color", () => {
    expect(getRouletteChipTier(10)).toBe("white");
    expect(getRouletteChipPalette(10)).toEqual({
      base: "#F1F1EE",
    });
  });

  it("re-applies the same canonical casino-chip face to the body-mounted drag clone", () => {
    const block = cssBlock(
      ".roulette-chip-drag-ghost.roulette-casino-chip {",
    );

    expect(block).toContain(
      "background-color: var(--casino-chip-base) !important",
    );
    expect(block).toContain(
      "background-image: var(--casino-chip-face) !important",
    );
    expect(block).toContain(
      "color: var(--casino-chip-ink-fixed) !important",
    );
    expect(block).toContain("mix-blend-mode: normal !important");
    expect(block).not.toContain("--casino-chip-main");
    expect(block).not.toContain("--casino-chip-inner");
    expect(block).not.toContain("--casino-chip-accent");
    expect(block).not.toContain("--casino-chip-highlight");
    expect(block).not.toContain("--casino-chip-ink)");
    expect(block.toLowerCase()).not.toContain("#2f78c8");
    expect(block.toLowerCase()).not.toContain("#1f5ea3");
    expect(block.toLowerCase()).not.toContain("hue-rotate");
  });

  it("restores the casino-chip ring layers on the drag clone", () => {
    expect(css).toContain(
      ".roulette-chip-drag-ghost.roulette-casino-chip::before",
    );
    expect(css).toContain(
      ".roulette-chip-drag-ghost.roulette-casino-chip::after",
    );
  });
});
