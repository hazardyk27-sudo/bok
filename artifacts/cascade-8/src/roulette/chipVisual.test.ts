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

  it("maps exact range boundaries and the aggregate 200 wager to the approved colors", () => {
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

  it("keeps the approved noble purple palette", () => {
    expect(ROULETTE_CHIP_PALETTES.purple).toMatchObject({
      main: "#5B2A86",
      inner: "#3E1C5D",
      highlight: "#7B43B6",
      ink: "#FFFFFF",
    });
    expect(getRouletteChipPalette(5_000)).toBe(
      ROULETTE_CHIP_PALETTES.purple,
    );
  });

  it("keeps a single denomination flat and stacks aggregate wagers", () => {
    expect(getRouletteChipStackDepth(10)).toBe(1);
    expect(getRouletteChipStackDepth(50)).toBe(1);
    expect(getRouletteChipStackDepth(5_000)).toBe(1);
    expect(getRouletteChipStackDepth(20)).toBe(2);
    expect(getRouletteChipStackDepth(150)).toBe(2);
    expect(getRouletteChipStackDepth(1_500)).toBe(3);
  });

  it("strips the historic blue $10 face before applying aggregate amount color", () => {
    const chip = document.createElement("span");
    const cell = document.createElement("div");
    chip.className = "roulette-placed-chip chip-10";
    chip.dataset.betAmount = "20";
    chip.dataset.chipFaceSourceValue = "10";
    chip.style.setProperty("--chip-fill", "#3b8ce0");
    chip.style.setProperty("--chip-ink", "#ffffff");
    chip.style.setProperty("background-color", "rgb(47, 120, 200)", "important");
    cell.append(chip);

    expect(syncRoulettePlacedChipVisual(chip, 20)).toBe(true);
    expect(chip.classList.contains("chip-10")).toBe(false);
    expect(chip.style.getPropertyValue("--chip-fill")).toBe("");
    expect(chip.style.getPropertyValue("background-color")).toBe("");
    expect(chip.dataset.chipFaceSourceValue).toBeUndefined();
    expect(chip.dataset.chipTier).toBe("white");
    expect(chip.style.getPropertyValue("--casino-chip-main")).toBe(
      ROULETTE_CHIP_PALETTES.white.main,
    );

    expect(syncRoulettePlacedChipVisual(chip, 80)).toBe(true);
    expect(chip.dataset.chipTier).toBe("blue");
    expect(chip.style.getPropertyValue("--casino-chip-main")).toBe(
      ROULETTE_CHIP_PALETTES.blue.main,
    );

    expect(syncRoulettePlacedChipVisual(chip, 160)).toBe(true);
    expect(chip.dataset.chipTier).toBe("green");
    expect(chip.style.getPropertyValue("--casino-chip-main")).toBe(
      ROULETTE_CHIP_PALETTES.green.main,
    );
  });

  it("keeps twelve doubled ten-dollar cells white at a $240 board total", () => {
    const chips = Array.from({ length: 12 }, () => {
      const cell = document.createElement("div");
      const chip = document.createElement("span");
      chip.className = "roulette-placed-chip chip-10";
      chip.dataset.betAmount = "20";
      chip.style.setProperty("--chip-fill", "#3b8ce0");
      cell.append(chip);
      syncRoulettePlacedChipVisual(chip, 20);
      return chip;
    });

    expect(chips).toHaveLength(12);
    expect(12 * 20).toBe(240);
    chips.forEach((chip) => {
      expect(chip.dataset.chipTier).toBe("white");
      expect(chip.classList.contains("chip-10")).toBe(false);
      expect(chip.style.getPropertyValue("--casino-chip-main")).toBe(
        ROULETTE_CHIP_PALETTES.white.main,
      );
    });
  });
});
