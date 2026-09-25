import { describe, expect, it } from "vitest";
import {
  createCoreBudget,
  generateRefillCells,
  generateInitialBoard,
} from "./BoardGenerator";
import { BONUS_CONFIG } from "../config/GameConfig";
import { removeAndRefill } from "./WinEvaluator";
import { isMultiplierCore, type BoardCell, type RandomSource } from "./types";

const first: RandomSource = { nextFloat: () => 0 };
const baseCoreRoll: RandomSource = { nextFloat: () => 0.045 };
const bonusInitialCoreRoll: RandomSource = { nextFloat: () => 0.06 };
const bonusRefillCoreRoll: RandomSource = { nextFloat: () => 0.06 };
const last: RandomSource = { nextFloat: () => 0.999999 };

describe("physical Multiplier Cores", () => {
  it("never spawns in the Base initial board", () => {
    expect(generateInitialBoard(first, "base").flat().every((cell) => !isMultiplierCore(cell))).toBe(true);
  });
  it("can spawn in Base refills using the independent 1% config", () => {
    const cells = generateRefillCells(baseCoreRoll, 3, true, "base");
    expect(cells.every((cell) => isMultiplierCore(cell))).toBe(true);
    expect((cells[0] as Exclude<BoardCell, string>).value).toBe(2);
  });
  it("spawns in Free Spin initial boards and refills", () => {
    const initial = generateInitialBoard(bonusInitialCoreRoll, "bonus");
    const cells = generateRefillCells(bonusRefillCoreRoll, 3, true, "bonus");
    expect(initial.flat().some((cell) => isMultiplierCore(cell))).toBe(true);
    expect(cells.every((cell) => isMultiplierCore(cell))).toBe(true);
    expect((cells[0] as Exclude<BoardCell, string>).value).toBe(2);
  });
  it("stops bonus Core generation at seven cells", () => {
    const coreRoll: RandomSource = { nextFloat: () => 0.04 };
    const initial = generateInitialBoard(coreRoll, "bonus");
    const refill = generateRefillCells(coreRoll, 30, true, "bonus");

    expect(BONUS_CONFIG.maxMultiplierCoresPerFreeSpin).toBe(7);
    expect(initial.flat().filter(isMultiplierCore)).toHaveLength(7);
    expect(refill.filter(isMultiplierCore)).toHaveLength(7);
  });
  it("does not add an eighth Core when the active bonus budget is full", () => {
    const fullBudget = createCoreBudget("bonus")!;
    fullBudget.used = fullBudget.max;
    const refill = generateRefillCells(
      { nextFloat: () => 0.04 },
      30,
      true,
      "bonus",
      0,
      fullBudget,
    );

    expect(refill.some(isMultiplierCore)).toBe(false);
    expect(fullBudget.used).toBe(7);
  });
  it("keeps a physical Core anchored through gravity and refill", () => {
    const board = Array.from({ length: 5 }, () =>
      Array.from({ length: 6 }, () => "S2" as BoardCell),
    );
    board[0][0] = { kind: "MULTIPLIER_CORE", value: 100 };
    const result = removeAndRefill(board, [{ row: 0, col: 0 }], last, true);
    expect(result.boardAfterGravity.flat().some((cell) => isMultiplierCore(cell) && cell.value === 100)).toBe(true);
  });
});