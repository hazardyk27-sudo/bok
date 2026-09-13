import { describe, expect, it } from "vitest";
import { generateRefillCells, generateInitialBoard } from "./BoardGenerator";
import { removeAndRefill } from "./WinEvaluator";
import type { BoardCell, RandomSource } from "./types";

const first: RandomSource = { nextFloat: () => 0 };
const last: RandomSource = { nextFloat: () => 0.999999 };

describe("physical Multiplier Cores", () => {
  it("never spawns in the Base initial board", () => {
    expect(generateInitialBoard(first, "base").every((row) =>
      row.every((cell) => typeof cell === "string"),
    )).toBe(true);
  });
  it("can spawn in Base refills using the independent 0.20% config", () => {
    const cells = generateRefillCells(first, 3, true, "base");
    expect(cells.every((cell) => typeof cell !== "string" && cell.kind === "MULTIPLIER_CORE")).toBe(true);
    expect((cells[0] as Exclude<BoardCell, string>).value).toBe(2);
  });
  it("spawns in Free Spin refills and carries a 2x–500x value", () => {
    const cells = generateRefillCells(first, 3, true);
    expect(cells.every((cell) => typeof cell !== "string" && cell.kind === "MULTIPLIER_CORE")).toBe(true);
    expect((cells[0] as Exclude<BoardCell, string>).value).toBe(2);
  });
  it("removes discharged Cores before the next refill", () => {
    const board = Array.from({ length: 5 }, () =>
      Array.from({ length: 6 }, () => "S2" as BoardCell),
    );
    board[0][0] = { kind: "MULTIPLIER_CORE", value: 100 };
    const result = removeAndRefill(board, [{ row: 0, col: 0 }], last, true);
    expect(result.boardAfterGravity.flat().some((cell) => typeof cell !== "string" && cell.value === 100)).toBe(false);
  });
});