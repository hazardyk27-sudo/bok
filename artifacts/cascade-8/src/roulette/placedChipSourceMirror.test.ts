import {
  describe,
  expect,
  it,
} from "vitest";
import {
  getRoulettePlacedChipDisplayLabel,
  getRoulettePlacedChipSourceValue,
} from "./placedChipSourceMirror";

describe("roulette placed-chip single visual source", () => {
  it("uses the table wager tier as the chip face source", () => {
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
        80,
        10,
      ),
    ).toBe(50);
    expect(
      getRoulettePlacedChipSourceValue(
        100,
        50,
      ),
    ).toBe(100);
    expect(
      getRoulettePlacedChipSourceValue(
        200,
        10,
      ),
    ).toBe(100);
    expect(
      getRoulettePlacedChipSourceValue(
        640,
        10,
      ),
    ).toBe(500);
  });

  it("shows the real aggregate wager instead of the source denomination", () => {
    expect(
      getRoulettePlacedChipDisplayLabel(10),
    ).toBe("10");
    expect(
      getRoulettePlacedChipDisplayLabel(20),
    ).toBe("20");
    expect(
      getRoulettePlacedChipDisplayLabel(40),
    ).toBe("40");
    expect(
      getRoulettePlacedChipDisplayLabel(200),
    ).toBe("200");
    expect(
      getRoulettePlacedChipDisplayLabel(4_000),
    ).toBe("4K");
  });

  it("does not keep an old white chip face after x2 crosses a tier", () => {
    expect(
      getRoulettePlacedChipSourceValue(
        200,
        10,
        10,
      ),
    ).toBe(100);
    expect(
      getRoulettePlacedChipSourceValue(
        500,
        10,
        100,
      ),
    ).toBe(500);
  });

  it("always resolves to an actual selectable denomination", () => {
    expect(
      getRoulettePlacedChipSourceValue(
        5,
        null,
      ),
    ).toBe(10);
    expect(
      getRoulettePlacedChipSourceValue(
        70,
        null,
      ),
    ).toBe(50);
    expect(
      getRoulettePlacedChipSourceValue(
        2_500,
        null,
      ),
    ).toBe(2_000);
    expect(
      getRoulettePlacedChipSourceValue(
        8_000,
        null,
      ),
    ).toBe(5_000);
  });
});
