import { describe, expect, it } from "vitest";
import { ColumnStream, countScatter, generateInitialBoard, generateRefillSymbols } from "./BoardGenerator";
import { SeededRNG } from "./RNG";
import { getNormalSymbol, getStackMetadata, isMultiplierCore } from "./types";
import type { RandomSource } from "./types";
import {
  BASE_INITIAL_CORE_CHANCE,
  BASE_INITIAL_SCATTER_CHANCE,
  BASE_REEL_CONFIG,
  NORMAL_PAIR_COPY_CHANCE,
  NORMAL_THIRD_REPEAT_WEIGHT_FACTOR,
} from "../config/GameConfig";

const alwaysLast: RandomSource = { nextFloat: () => 0.999999 };
const alwaysFirst: RandomSource = { nextFloat: () => 0 };

describe("board generation", () => {
  it("generates exactly 30 initial cells", () => {
    expect(generateInitialBoard(alwaysFirst).flat()).toHaveLength(30);
  });
  it("can generate scatter on an initial board", () => {
    expect(countScatter(generateInitialBoard({ nextFloat: () => 0 }))).toBeGreaterThan(0);
  });
  it("can generate a Core on a Base initial board", () => {
    const roll = BASE_INITIAL_SCATTER_CHANCE + (BASE_INITIAL_CORE_CHANCE / 2);
    expect(generateInitialBoard({ nextFloat: () => roll }).flat().some(isMultiplierCore)).toBe(true);
  });
  it("can generate scatter on a refill", () => {
    expect(countScatter([generateRefillSymbols(alwaysFirst, 30)])).toBeGreaterThan(0);
  });
  it("generates exactly the requested refill count", () => {
    expect(generateRefillSymbols(alwaysFirst, 7)).toHaveLength(7);
  });
  it("keeps packet metadata on generated normal symbols", () => {
    const cells = generateRefillSymbols(alwaysLast, 12);
    const normalCells = cells.filter((cell) => getNormalSymbol(cell) !== null);
    expect(normalCells.every((cell) => {
      const metadata = getStackMetadata(cell);
      return metadata && metadata.stackSize <= 2 && metadata.stackIndex < metadata.stackSize;
    })).toBe(true);
  });
  it("builds initial column pairs upward from row 0", () => {
    const board = generateInitialBoard(alwaysLast);
    for (let col = 0; col < 6; col += 1) {
      const row4 = getStackMetadata(board[0][col]);
      const row3 = getStackMetadata(board[1][col]);
      const row2 = getStackMetadata(board[2][col]);
      const row1 = getStackMetadata(board[3][col]);
      const row0 = getStackMetadata(board[4][col]);
      expect(row0).toMatchObject({ stackIndex: 0, stackSize: 2 });
      expect(row1).toMatchObject({ stackId: row0?.stackId, stackIndex: 1, stackSize: 2 });
      expect(row2).toMatchObject({ stackIndex: 0, stackSize: 2 });
      expect(row3).toMatchObject({ stackId: row2?.stackId, stackIndex: 1, stackSize: 2 });
      expect(row4).toMatchObject({ stackIndex: 0, stackSize: 2 });
    }
  });
  it("uses a 75% copy branch for the symbol above a pending pair member", () => {
    const samples = 1_000;
    let copied = 0;
    for (let index = 0; index < samples; index += 1) {
      const rolls = [0.99, 0.5, (index + 0.5) / samples];
      const source: RandomSource = { nextFloat: () => rolls.shift() ?? 0.5 };
      const stream = new ColumnStream(source, BASE_REEL_CONFIG, 0);
      stream.nextVisibleAware("BASE_REFILL", false, "S4");
      const second = stream.nextVisibleAware("BASE_REFILL", false, "S4");
      if (second.copiedFromVisibleTop) copied += 1;
    }
    expect(copied / samples).toBe(NORMAL_PAIR_COPY_CHANCE);
  });
  it("halves the previous row symbol weight at a new pair start", () => {
    const samples = 10_000;
    const repeatedSymbol = "S4";
    let repeated = 0;
    for (let index = 0; index < samples; index += 1) {
      const rolls = [0.99, (index + 0.5) / samples];
      const source: RandomSource = { nextFloat: () => rolls.shift() ?? 0.5 };
      const stream = new ColumnStream(source, BASE_REEL_CONFIG, 0);
      const first = stream.nextVisibleAware("BASE_INITIAL", false, repeatedSymbol);
      if (getNormalSymbol(first.cell) === repeatedSymbol) repeated += 1;
    }
    const totalWeight = BASE_REEL_CONFIG.symbolWeights.reduce((sum, choice) => sum + choice.weight, 0);
    const repeatedWeight = BASE_REEL_CONFIG.symbolWeights.find((choice) => choice.value === repeatedSymbol)!.weight;
    const expected = repeatedWeight / totalWeight * NORMAL_THIRD_REPEAT_WEIGHT_FACTOR;
    expect(repeated / samples).toBeCloseTo(expected, 3);
  });
  it("keeps Base initial Scatter close to its pair-start marginal", () => {
    const boards = 20_000;
    const source = new SeededRNG("base-scatter-marginal");
    let scatterCount = 0;
    for (let index = 0; index < boards; index += 1) {
      scatterCount += countScatter(generateInitialBoard(source, "base"));
    }
    const marginal = scatterCount / (boards * 30);
    expect(marginal).toBeGreaterThan(0.016);
    expect(marginal).toBeLessThan(0.021);
  });
});
