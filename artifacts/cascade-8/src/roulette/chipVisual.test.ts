// @vitest-environment happy-dom

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  ROULETTE_CHIP_VALUES,
} from "./betState";
import {
  ROULETTE_CHIP_PALETTES,
  getRouletteChipPalette,
  getRouletteChipStackDepth,
  getRouletteChipTier,
  syncRoulettePlacedChipVisual,
} from "./chipVisual";

describe("roulette casino chip visuals", () => {
  it("uses the approved selectable chip values", () => {
    expect(ROULETTE_CHIP_VALUES).toEqual([
      10,
      50,
      100,
      500,
      2_000,
      5_000,
    ]);
  });

  it("maps exact range boundaries and aggregate wagers to the approved colors", () => {
    expect(getRouletteChipTier(10)).toBe("white");
    expect(getRouletteChipTier(49)).toBe("white");
    expect(getRouletteChipTier(50)).toBe("blue");
    expect(getRouletteChipTier(99)).toBe("blue");
    expect(getRouletteChipTier(100)).toBe("green");
    expect(getRouletteChipTier(200)).toBe("green");
    expect(getRouletteChipTier(499)).toBe("green");
    expect(getRouletteChipTier(500)).toBe("red");
    expect(getRouletteChipTier(1_999)).toBe("red");
    expect(getRouletteChipTier(2_000)).toBe("black");
    expect(getRouletteChipTier(4_999)).toBe("black");
    expect(getRouletteChipTier(5_000)).toBe("purple");
    expect(getRouletteChipTier(50_000)).toBe("purple");
  });

  it("allows every tier to vary only the base color", () => {
    expect(ROULETTE_CHIP_PALETTES).toEqual({
      white: { base: "#F1F1EE" },
      blue: { base: "#2F78C8" },
      green: { base: "#2D9B61" },
      red: { base: "#C73B36" },
      black: { base: "#1E1F22" },
      purple: { base: "#5B2A86" },
    });
    expect(getRouletteChipPalette(5_000)).toBe(
      ROULETTE_CHIP_PALETTES.purple,
    );
  });

  it("uses one physical chip face for denominations and aggregate amounts", () => {
    [10, 20, 40, 50, 60, 100, 150, 1_500, 5_000]
      .forEach((amount) => {
        expect(getRouletteChipStackDepth(amount)).toBe(1);
      });
  });

  it("changes only --casino-chip-base when aggregate amount crosses tiers", () => {
    const chip = document.createElement("span");
    const cell = document.createElement("div");
    chip.className = "roulette-placed-chip chip-10";
    chip.dataset.betAmount = "20";
    chip.dataset.chipFaceSourceValue = "10";
    chip.dataset.stackDepth = "3";
    chip.style.setProperty("--chip-fill", "#3b8ce0");
    chip.style.setProperty("--casino-chip-inner", "#123456");
    chip.style.setProperty("background-color", "rgb(47, 120, 200)", "important");
    cell.append(chip);

    expect(syncRoulettePlacedChipVisual(chip, 20)).toBe(true);
    expect(chip.classList.contains("chip-10")).toBe(false);
    expect(chip.style.getPropertyValue("--chip-fill")).toBe("");
    expect(chip.style.getPropertyValue("--casino-chip-inner")).toBe("");
    expect(chip.style.getPropertyValue("background-color")).toBe("");
    expect(chip.dataset.chipFaceSourceValue).toBeUndefined();
    expect(chip.dataset.stackDepth).toBeUndefined();
    expect(chip.dataset.chipTier).toBe("white");
    expect(chip.style.getPropertyValue("--casino-chip-base")).toBe(
      ROULETTE_CHIP_PALETTES.white.base,
    );

    expect(syncRoulettePlacedChipVisual(chip, 80)).toBe(true);
    expect(chip.dataset.chipTier).toBe("blue");
    expect(chip.style.getPropertyValue("--casino-chip-base")).toBe(
      ROULETTE_CHIP_PALETTES.blue.base,
    );

    expect(syncRoulettePlacedChipVisual(chip, 160)).toBe(true);
    expect(chip.dataset.chipTier).toBe("green");
    expect(chip.style.getPropertyValue("--casino-chip-base")).toBe(
      ROULETTE_CHIP_PALETTES.green.base,
    );

    for (const forbidden of [
      "--casino-chip-main",
      "--casino-chip-inner",
      "--casino-chip-ink",
      "--casino-chip-accent",
      "--casino-chip-highlight",
    ]) {
      expect(chip.style.getPropertyValue(forbidden)).toBe("");
    }
  });

  it("keeps twelve doubled ten-dollar cells white at a $240 board total", () => {
    const chips = Array.from({ length: 12 }, () => {
      const cell = document.createElement("div");
      const chip = document.createElement("span");
      chip.className = "roulette-placed-chip chip-10";
      chip.dataset.betAmount = "20";
      cell.append(chip);
      syncRoulettePlacedChipVisual(chip, 20);
      return chip;
    });

    expect(chips).toHaveLength(12);
    expect(12 * 20).toBe(240);
    chips.forEach((chip) => {
      expect(chip.dataset.chipTier).toBe("white");
      expect(chip.dataset.stackDepth).toBeUndefined();
      expect(chip.classList.contains("chip-10")).toBe(false);
      expect(chip.style.getPropertyValue("--casino-chip-base")).toBe(
        ROULETTE_CHIP_PALETTES.white.base,
      );
    });
  });
});
