import { describe, expect, it } from "vitest";
import {
  EUROPEAN_WHEEL_SEQUENCE,
  RED_NUMBERS,
  SEGMENT_COUNT,
  WHEEL_GEOMETRY,
} from "./config";

describe("roulette 2d part 1 geometry", () => {
  it("uses the canonical European single-zero wheel order", () => {
    expect(EUROPEAN_WHEEL_SEQUENCE).toEqual([
      0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
      5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
    ]);
    expect(SEGMENT_COUNT).toBe(37);
    expect(new Set(EUROPEAN_WHEEL_SEQUENCE).size).toBe(37);
  });

  it("uses the canonical European red-number set", () => {
    expect([...RED_NUMBERS].sort((a, b) => a - b)).toEqual([
      1, 3, 5, 7, 9, 12, 14, 16, 18,
      19, 21, 23, 25, 27, 30, 32, 34, 36,
    ]);
  });

  it("keeps reference-led rings strictly nested", () => {
    expect(WHEEL_GEOMETRY.outerRadius).toBeGreaterThan(WHEEL_GEOMETRY.outerWoodInnerRadius);
    expect(WHEEL_GEOMETRY.outerWoodInnerRadius).toBeGreaterThan(WHEEL_GEOMETRY.numberOuterRadius);
    expect(WHEEL_GEOMETRY.numberOuterRadius).toBeGreaterThan(WHEEL_GEOMETRY.numberInnerRadius);
    expect(WHEEL_GEOMETRY.numberInnerRadius).toBe(WHEEL_GEOMETRY.pocketOuterRadius);
    expect(WHEEL_GEOMETRY.pocketOuterRadius).toBeGreaterThan(WHEEL_GEOMETRY.pocketInnerRadius);
    expect(WHEEL_GEOMETRY.pocketInnerRadius).toBeGreaterThan(WHEEL_GEOMETRY.centerDiscRadius);
  });
});
