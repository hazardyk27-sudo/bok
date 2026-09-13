import { describe, expect, it } from "vitest";
import { countScatter, generateInitialBoard, generateRefillSymbols } from "./BoardGenerator";
import { SeededRNG } from "./RNG";
import type { RandomSource } from "./types";

const alwaysLast: RandomSource = { nextFloat: () => 0.999999 };
const alwaysFirst: RandomSource = { nextFloat: () => 0 };

describe("board generation", () => {
  it("generates exactly 30 initial cells", () => {
    expect(generateInitialBoard(alwaysFirst).flat()).toHaveLength(30);
  });
  it("can generate scatter on an initial board", () => {
    expect(countScatter(generateInitialBoard({ nextFloat: () => 0 }))).toBeGreaterThan(0);
  });
  it("never generates scatter on a refill", () => {
    expect(generateRefillSymbols(alwaysLast, 30).every((symbol) => symbol !== "SCATTER")).toBe(true);
  });
  it("generates exactly the requested refill count", () => {
    expect(generateRefillSymbols(alwaysFirst, 7)).toHaveLength(7);
  });
  it("keeps Base initial Scatter close to the configured per-cell marginal", () => {
    const boards = 20_000;
    const source = new SeededRNG("base-scatter-marginal");
    let scatterCount = 0;
    for (let index = 0; index < boards; index += 1) {
      scatterCount += countScatter(generateInitialBoard(source, "base"));
    }
    const marginal = scatterCount / (boards * 30);
    expect(marginal).toBeGreaterThan(0.023);
    expect(marginal).toBeLessThan(0.027);
  });
});