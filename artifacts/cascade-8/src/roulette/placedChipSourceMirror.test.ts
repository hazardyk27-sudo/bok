import {
  describe,
  expect,
  it,
} from "vitest";
import {
  getRoulettePlacedChipSourceValue,
} from "./placedChipSourceMirror";

describe("roulette placed-chip single visual source", () => {
  it("keeps the selected chip denomination as the face source", () => {
    expect(
      getRoulettePlacedChipSourceValue(
        10,
        10,
      ),
    ).toBe(10);
    expect(
      getRoulettePlacedChipSourceValue(
        20,
        10,
      ),
    ).toBe(10);
    expect(
      getRoulettePlacedChipSourceValue(
        100,
        50,
      ),
    ).toBe(50);
  });

  it("preserves the chip face source already stamped on a placed chip", () => {
    expect(
      getRoulettePlacedChipSourceValue(
        50,
        10,
        50,
      ),
    ).toBe(50);
    expect(
      getRoulettePlacedChipSourceValue(
        100,
        100,
        50,
      ),
    ).toBe(50);
  });

  it("falls back to an actual selectable denomination", () => {
    expect(
      getRoulettePlacedChipSourceValue(
        500,
        null,
      ),
    ).toBe(500);
    expect(
      getRoulettePlacedChipSourceValue(
        70,
        null,
      ),
    ).toBe(10);
  });
});
