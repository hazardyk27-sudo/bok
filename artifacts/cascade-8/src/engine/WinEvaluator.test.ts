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
  it("uses the requested nine-symbol rarity order and weights", () => {
    expect(NORMAL_SYMBOLS.map(({ name }) => name)).toEqual([
      "Real Madrid",
      "Liverpool",
      "Bayern",
      "PSG",
      "Roma",
      "Barcelona",
      "Chelsea",
      "Beşiktaş",
      "Galatasaray",
    ]);
    expect(NORMAL_SYMBOLS.map(({ weight }) => weight)).toEqual([15.5, 14, 13.5, 12.5, 11.5, 10.5, 10, 7.5, 5]);
    expect(NORMAL_SYMBOLS.reduce((total, { weight }) => total + weight, 0)).toBe(100);
  });
  it("does not win at seven and wins at eight", () => {
    expect(evaluateBoard(boardWith(Array(7).fill("S1"))).winningSymbols).toEqual(["S2"]);
    expect(evaluateBoard(boardWith([...Array(8).fill("S1"), ...Array(22).fill("S3")])).winningSymbols).toContain("S1");
  });
  it("uses the 12+ payout tier", () => {
    const result = evaluateBoard(boardWith([...Array(12).fill("S1"), ...Array(18).fill("S3")]));
    expect(result.payouts.S1).toBe(0.5);
  });
  it("uses exact payout values for every normal symbol count", () => {
    const expected = [
      [0.15, 0.2, 0.25, 0.35, 0.5],
      [0.25, 0.3, 0.4, 0.55, 0.75],
      [0.35, 0.45, 0.55, 0.75, 1.0],
      [0.45, 0.55, 0.7, 0.95, 1.3],
      [0.7, 0.85, 1.05, 1.4, 1.9],
      [1.0, 1.1, 1.3, 1.75, 2.4],
      [1.75, 2.1, 2.6, 3.5, 4.75],
      [4.0, 4.5, 5.5, 7.5, 10.5],
      [6.0, 6.5, 8.0, 11.0, 15.0],
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
    expect([...evaluation.winningSymbols].sort()).toEqual(["S1", "S3", "S6"]);
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