import { BOARD_COLUMNS, BOARD_ROWS, NORMAL_SYMBOLS, type NormalSymbolId, getPaytableMultiplier } from "../config/GameConfig";
import { generateRefillCells, type ColumnStreams } from "./BoardGenerator";
import { isMultiplierCore, type Board, type BoardCell, type Cell, type RandomSource } from "./types";

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
      if (typeof symbol === "string" && symbol !== "SCATTER") counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    }
  }
  const normalIds = NORMAL_SYMBOLS.map((symbol) => symbol.id as NormalSymbolId);
  const winningSymbols = normalIds.filter((id) => (counts.get(id) ?? 0) >= 8);
  const winningCells: Cell[] = [];
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLUMNS; col += 1) {
       if (typeof board[row][col] === "string" && winningSymbols.includes(board[row][col] as NormalSymbolId)) winningCells.push({ row, col });
    }
  }
  const payouts = {} as Record<NormalSymbolId, number>;
  let rawPayoutMultiplier = 0;
  for (const symbol of winningSymbols) {
    const count = counts.get(symbol) ?? 0;
    const payout = getPaytableMultiplier(symbol, count);
    payouts[symbol] = payout;
    rawPayoutMultiplier += payout;
  }
  return { winningSymbols, winningCells, payouts, rawPayoutMultiplier };
}

export function removeAndRefill(
  board: Board,
  winningCells: Cell[],
  source: RandomSource,
  allowCores = false,
  mode: "base" | "bonus" = allowCores ? "bonus" : "base",
  streams?: ColumnStreams,
) {
  const winning = new Set(winningCells.map((cell) => `${cell.row}:${cell.col}`));
  const next: Board = Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLUMNS }, () => "SCATTER" as BoardCell));
  const newSymbols: BoardCell[] = [];
  for (let col = 0; col < BOARD_COLUMNS; col += 1) {
    const survivors: Board[number] = [];
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      const cell = board[row][col];
      // Cores are physical bonus cells. They remain anchored for the full
      // sequence and are never discharged by a normal symbol win.
      if (isMultiplierCore(cell) || !winning.has(`${row}:${col}`)) survivors.push(cell);
    }
    const generated = streams
      ? streams[col].next(BOARD_ROWS - survivors.length, allowCores && mode === "bonus" ? "BONUS_REFILL" : "BASE_REFILL")
      : generateRefillCells(source, BOARD_ROWS - survivors.length, allowCores, mode, col);
    const column = [...generated, ...survivors];
    for (let row = 0; row < BOARD_ROWS; row += 1) next[row][col] = column[row];
    newSymbols.push(...generated);
  }
  return { boardAfterGravity: next, newSymbols };
}