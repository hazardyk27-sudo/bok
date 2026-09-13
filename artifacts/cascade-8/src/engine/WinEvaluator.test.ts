import { describe, expect, it } from "vitest";
import { evaluateBoard, removeAndRefill } from "./WinEvaluator";
import { SeededRNG } from "./RNG";
import type { Board } from "./types";

const boardWith = (symbols: string[]): Board => {
  const flattened = [...symbols, ...Array(30 - symbols.length).fill("S2")];
  return Array.from({ length: 5 }, (_, row) => flattened.slice(row * 6, row * 6 + 6)) as Board;
};

describe("win evaluation and cascades", () => {
  it("does not win at seven and wins at eight", () => {
    expect(evaluateBoard(boardWith(Array(7).fill("S1"))).winningSymbols).toEqual(["S2"]);
    expect(evaluateBoard(boardWith([...Array(8).fill("S1"), ...Array(22).fill("S3")])).winningSymbols).toContain("S1");
  });
  it("uses the 12+ payout tier", () => {
    const result = evaluateBoard(boardWith([...Array(12).fill("S1"), ...Array(18).fill("S3")]));
    expect(result.payouts.S1).toBe(3.6);
  });
  it("counts non-adjacent symbols together", () => {
    const values = Array(30).fill("S2");
    values[0] = "S1"; values[5] = "S1"; values[11] = "S1"; values[17] = "S1";
    values[23] = "S1"; values[29] = "S1"; values[2] = "S1"; values[27] = "S1";
    expect(evaluateBoard(boardWith(values)).winningSymbols).toContain("S1");
  });
  it("removes simultaneous winners and refills without scatter", () => {
    const board = boardWith([...Array(8).fill("S1"), ...Array(8).fill("S6"), ...Array(14).fill("S3")]);
    const evaluation = evaluateBoard(board);
    expect(evaluation.winningSymbols).toEqual(["S1", "S3", "S6"]);
    const result = removeAndRefill(board, evaluation.winningCells, new SeededRNG(9));
    expect(result.newSymbols).toHaveLength(evaluation.winningCells.length);
    expect(result.boardAfterGravity.flat().every((symbol) => symbol !== "SCATTER")).toBe(true);
  });
  it("keeps every column compact after gravity", () => {
    const board = boardWith(Array(8).fill("S1"));
    const result = removeAndRefill(board, evaluateBoard(board).winningCells, new SeededRNG(3));
    for (let col = 0; col < 6; col += 1) {
      expect(result.boardAfterGravity.map((row) => row[col]).every(Boolean)).toBe(true);
    }
  });
  it("keeps survivors ordered while new symbols enter from above", () => {
    const board: Board = [
      ["S1", "S1", "S1", "S1", "S1", "S1"],
      ["S1", "S1", "S2", "S3", "S4", "S5"],
      ["S2", "S3", "S4", "S5", "S6", "S7"],
      ["S3", "S4", "S5", "S6", "S7", "S8"],
      ["S4", "S5", "S6", "S7", "S8", "SCATTER"],
    ];
    const result = removeAndRefill(board, evaluateBoard(board).winningCells, new SeededRNG(3));
    expect(result.boardAfterGravity[2][0]).toBe("S2");
    expect(result.boardAfterGravity[3][0]).toBe("S3");
    expect(result.boardAfterGravity[4][0]).toBe("S4");
  });
});