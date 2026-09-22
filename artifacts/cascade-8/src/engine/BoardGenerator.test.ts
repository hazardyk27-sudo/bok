import { describe, expect, it } from "vitest";
import {
  countScatter,
  generateInitialBoard,
  generateInitialBoardWithStreams,
  generateRefillSymbols,
} from "./BoardGenerator";
import { SeededRNG } from "./RNG";
import { getNormalSymbol, getStackMetadata, isMultiplierCore } from "./types";
import type { RandomSource } from "./types";
import { BASE_INITIAL_CORE_CHANCE, BASE_INITIAL_SCATTER_CHANCE } from "../config/GameConfig";

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
  it("starts visible columns at the bottom of a pair and consumes a hidden continuation", () => {
    const { board, streams } = generateInitialBoardWithStreams(alwaysLast, "base");
    const firstColumn = board.map((row) => row[0]);

    expect(firstColumn.map((cell) => getStackMetadata(cell)?.stackIndex)).toEqual([0, 1, 0, 1, 0]);
    expect(getStackMetadata(board.hiddenPairRow?.[0] ?? "SCATTER")).toMatchObject({
      stackId: getStackMetadata(firstColumn[4])?.stackId,
      stackIndex: 1,
      stackSize: 2,
    });
    expect(streams[0].stats.pairCount).toBe(3);

    const nextVisibleCell = streams[0].next(1, "BASE_REFILL", false)[0];
    expect(getStackMetadata(nextVisibleCell)).toMatchObject({
      stackIndex: 0,
      stackSize: 2,
    });
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
