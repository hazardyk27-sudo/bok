import { describe, expect, it } from "vitest";
import { countScatter, generateInitialBoard, generateRefillSymbols } from "./BoardGenerator";
import type { RandomSource } from "./types";

const alwaysLast: RandomSource = { nextFloat: () => 0.999999 };
const alwaysFirst: RandomSource = { nextFloat: () => 0 };

describe("board generation", () => {
  it("generates exactly 30 initial cells", () => {
    expect(generateInitialBoard(alwaysFirst).flat()).toHaveLength(30);
  });
  it("can generate scatter on an initial board", () => {
    expect(countScatter(generateInitialBoard({ nextFloat: () => 0.02 }))).toBeGreaterThan(0);
  });
  it("never generates scatter on a refill", () => {
    expect(generateRefillSymbols(alwaysLast, 30).every((symbol) => symbol !== "SCATTER")).toBe(true);
  });
  it("generates exactly the requested refill count", () => {
    expect(generateRefillSymbols(alwaysFirst, 7)).toHaveLength(7);
  });
});