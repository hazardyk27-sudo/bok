import { describe, expect, it } from "vitest";
import { getPaytableMultiplier, NORMAL_SYMBOLS } from "../config/GameConfig";
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
    expect(result.payouts.S1).toBe(1.8);
  });
  it("uses exact payout values for every normal symbol count", () => {
    const expected = [
      [0.45, 0.68, 0.9, 1.35, 1.8],
      [0.55, 0.83, 1.1, 1.65, 2.2],
      [0.75, 1.13, 1.5, 2.25, 3],
      [0.95, 1.43, 1.9, 2.83, 3.75],
      [1.4, 2.1, 2.8, 4.15, 5.5],
      [1.9, 3.3, 4.7, 7.1, 9.5],
      [2.8, 5.15, 7.5, 11.25, 15],
      [3.75, 6.56, 9.38, 14.06, 18.75],
      [4.7, 7.98, 11.25, 16.88, 22.5],
    ];
    NORMAL_SYMBOLS.forEach((symbol, index) => {
      [8, 9, 10, 11, 12].forEach((count, tierIndex) => {
        expect(getPaytableMultiplier(symbol.id, count)).toBe(expected[index][tierIndex]);
      });
    });
  });
  it("counts non-adjacent symbols together", () => {
    const values = Array(30).fill("S2");
    values[0] = "S1"; values[5] = "S1"; values[11] = "S1"; values[17] = "S1";
    values[23] = "S1"; values[29] = "S1"; values[2] = "S1"; values[27] = "S1";
    expect(evaluateBoard(boardWith(values)).winningSymbols).toContain("S1");
  });
  it("removes simultaneous winners and refills from the stream", () => {
    const board = boardWith([...Array(8).fill("S1"), ...Array(8).fill("S6"), ...Array(14).fill("S3")]);
    const evaluation = evaluateBoard(board);
    expect(evaluation.winningSymbols).toEqual(["S1", "S3", "S6"]);
    const result = removeAndRefill(board, evaluation.winningCells, new SeededRNG(9));
    expect(result.newSymbols).toHaveLength(evaluation.winningCells.length);
    expect(result.boardAfterGravity.flat()).toHaveLength(30);
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

  it("copies the current visible unpaired top symbol in the production refill path", () => {
    const board: Board = [
      ["S1", "S2", "S3", "S4", "S5", "S6"],
      ["S2", "S3", "S4", "S5", "S6", "S7"],
      ["S3", "S4", "S5", "S6", "S7", "S8"],
      ["S4", "S5", "S6", "S7", "S8", "S1"],
      ["S5", "S6", "S7", "S8", "S1", "S2"],
    ];
    const observations: Array<{ topSymbol: string; belowSymbol: string | null; incomingSymbol: string }> = [];
    const result = removeAndRefill(
      board,
      [{ row: 0, col: 0 }],
      { nextFloat: (() => {
        const values = [0.99, 0.0, 0.1];
        return () => values.shift() ?? 0.1;
      })() },
      false,
      "base",
      undefined,
      { onVisibleUnpairedRefill: (event) => observations.push(event) },
    );

    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      topSymbol: "S2",
      belowSymbol: "S3",
      incomingSymbol: "S2",
      copiedFromVisibleTop: true,
    });
    expect(result.boardAfterGravity[0][0]).toMatchObject({ kind: "NORMAL_SYMBOL", symbol: "S2" });
    expect(result.boardAfterGravity[1][0]).toBe("S2");
  });
});