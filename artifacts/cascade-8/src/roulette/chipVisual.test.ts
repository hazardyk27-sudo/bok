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
});
