// @vitest-environment happy-dom

import {
  describe,
  expect,
  it,
} from "vitest";
import {
  createRouletteCanonicalPlacedChip,
  syncRouletteCanonicalChipFace,
} from "./canonicalPlacedChip";

const cases = [
  [20, "white"],
  [40, "white"],
  [50, "blue"],
  [60, "blue"],
  [100, "green"],
] as const;

describe("roulette single chip face regression", () => {
  it.each(cases)(
    "renders %i as one canonical %s chip with a dynamic center value",
    (amount, tier) => {
      const chip =
        createRouletteCanonicalPlacedChip(amount);

      expect(chip.classList.contains("roulette-casino-chip")).toBe(true);
      expect(chip.classList.contains("roulette-placed-chip")).toBe(true);
      expect(chip.dataset.chipTier).toBe(tier);
      expect(chip.dataset.betAmount).toBe(String(amount));
      expect(chip.dataset.stackDepth).toBeUndefined();

      const value = chip.querySelector<HTMLElement>(
        ":scope > .roulette-chip-face-value",
      );
      expect(value?.textContent).toBe(String(amount));
    },
  );

  it("reuses the same chip node while only amount/tier changes", () => {
    const chip = createRouletteCanonicalPlacedChip(20);

    for (const [amount, tier] of cases.slice(1)) {
      expect(
        syncRouletteCanonicalChipFace(chip, amount),
      ).toBe(true);
      expect(chip.dataset.chipTier).toBe(tier);
      expect(chip.dataset.stackDepth).toBeUndefined();
      expect(
        chip.querySelector<HTMLElement>(
          ":scope > .roulette-chip-face-value",
        )?.textContent,
      ).toBe(String(amount));
    }
  });
});
