import { BOARD_COLUMNS, BOARD_ROWS, NORMAL_SYMBOLS, type NormalSymbolId, getPaytableMultiplier } from "../config/GameConfig";
import { generateRefillSymbols } from "./BoardGenerator";
import type { Board, Cell, RandomSource } from "./types";

export type WinEvaluation = {
  winningSymbols: NormalSymbolId[];
  winningCells: Cell[];
  payouts: Record<NormalSymbolId, number>;
  rawPayoutMultiplier: number;
};

export function evaluateBoard(board: Board): WinEvaluation {
  const counts = new Map<NormalSymbolId, number>();
  for (const row of board) {
    for (const symbol of row) {
      if (symbol !== "SCATTER") counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    }
  }
  const winningSymbols = NORMAL_SYMBOLS.map((symbol) => symbol.id).filter((id) => (counts.get(id) ?? 0) >= 8);
  const winningCells: Cell[] = [];
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLUMNS; col += 1) {
      if (winningSymbols.includes(board[row][col] as NormalSymbolId)) winningCells.push({ row, col });
    }
  }
  const payouts = {} as Record<NormalSymbolId, number>;
  let rawPayoutMultiplier = 0;
  for (const symbol of winningSymbols) {
    const count = counts.get(symbol) ?? 0;
    const payout = count * getPaytableMultiplier(symbol, count);
    payouts[symbol] = payout;
    rawPayoutMultiplier += payout;
  }
  return { winningSymbols, winningCells, payouts, rawPayoutMultiplier };
}

export function removeAndRefill(board: Board, winningCells: Cell[], source: RandomSource) {
  const winning = new Set(winningCells.map((cell) => `${cell.row}:${cell.col}`));
  const next = Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLUMNS }, () => "SCATTER" as const));
  const newSymbols: Board[number] = [];
  for (let col = 0; col < BOARD_COLUMNS; col += 1) {
    const survivors: Board[number] = [];
    for (let row = BOARD_ROWS - 1; row >= 0; row -= 1) {
      if (!winning.has(`${row}:${col}`)) survivors.push(board[row][col]);
    }
    const generated = generateRefillSymbols(source, BOARD_ROWS - survivors.length);
    const column = [...generated, ...survivors];
    for (let row = 0; row < BOARD_ROWS; row += 1) next[row][col] = column[row];
    newSymbols.push(...generated);
  }
  return { boardAfterGravity: next, newSymbols };
}