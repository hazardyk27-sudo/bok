import { describe, expect, it } from "vitest";
import { evaluateBoard } from "../engine/WinEvaluator";
import type { Board } from "../engine/types";
import { buildWinLabelEvents, calculateWinLabelPositions } from "./WinLabel";

const boardWith = (values: string[]): Board =>
  Array.from({ length: 5 }, (_, row) => values.slice(row * 6, row * 6 + 6)) as Board;

describe("on-board win labels", () => {
  it("creates one exact raw payout event per winning symbol", () => {
    const board = boardWith([
      ...Array(8).fill("S1"),
      ...Array(8).fill("S6"),
      ...Array.from({ length: 14 }, (_, index) => index % 2 === 0 ? "S2" : "S3"),
    ]);
    const evaluation = evaluateBoard(board);
    const events = buildWinLabelEvents(
      board,
      evaluation.winningSymbols,
      evaluation.winningCells,
      evaluation.payouts,
      100,
      (cents) => (cents / 100).toFixed(2),
    );

    expect(events.map((event) => event.amountCents)).toEqual(
      evaluation.winningSymbols.map((symbol) => Math.round(evaluation.payouts[symbol] * 100)),
    );
    expect(events.map((event) => event.cells)).toHaveLength(2);
    expect(Math.round(evaluation.rawPayoutMultiplier * 100)).toBe(events.reduce((sum, event) => sum + event.amountCents, 0));
  });

  it("anchors labels to cell bounds and separates colliding centers", () => {
    const events = [
      { amountCents: 100, text: "1.00", cells: [{ row: 1, col: 1 }] },
      { amountCents: 200, text: "2.00", cells: [{ row: 1, col: 1 }] },
    ];
    const placements = calculateWinLabelPositions(events);

    expect(placements[0]).toMatchObject({ x: 166, y: 138 });
    expect(placements[1].y).toBeLessThan(placements[0].y);
  });

  it("returns no label events when the board has no win", () => {
    const normalSymbols = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];
    const board = boardWith(Array.from({ length: 30 }, (_, index) => normalSymbols[index % normalSymbols.length]));
    const evaluation = evaluateBoard(board);
    const events = buildWinLabelEvents(board, evaluation.winningSymbols, evaluation.winningCells, evaluation.payouts, 100, String);

    expect(evaluation.winningSymbols).toEqual([]);
    expect(events).toHaveLength(0);
  });
});