import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  NORMAL_SYMBOLS,
  type NormalSymbolId,
  getPaytableMultiplier,
} from "../config/GameConfig";
import {
  generateRefillCells,
  generateVisibleAwareRefillCell,
  type ColumnStreams,
  type CoreBudget,
} from "./BoardGenerator";
import { getNormalSymbol, isMultiplierCore, type Board, type BoardCell, type Cell, type RandomSource } from "./types";

export type WinEvaluation = {
  winningSymbols: NormalSymbolId[];
  winningCells: Cell[];
  payouts: Record<NormalSymbolId, number>;
  rawPayoutMultiplier: number;
};

export type VisibleUnpairedRefillEvent = {
  column: number;
  topSymbol: NormalSymbolId;
  belowSymbol: NormalSymbolId | null;
  copyRoll: number;
  incomingSymbol: NormalSymbolId;
  copiedFromVisibleTop: boolean;
};

export type RefillDiagnostics = {
  onVisibleUnpairedRefill?: (event: VisibleUnpairedRefillEvent) => void;
};

export function evaluateBoard(board: Board): WinEvaluation {
  const counts = new Map<NormalSymbolId, number>();
  for (const row of board) {
    for (const symbol of row) {
      const normalSymbol = getNormalSymbol(symbol);
      if (normalSymbol) counts.set(normalSymbol, (counts.get(normalSymbol) ?? 0) + 1);
    }
  }
  const normalIds = NORMAL_SYMBOLS.map((symbol) => symbol.id as NormalSymbolId);
  const winningSymbols = normalIds.filter((id) => (counts.get(id) ?? 0) >= 8);
  const winningCells: Cell[] = [];
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLUMNS; col += 1) {
       const normalSymbol = getNormalSymbol(board[row][col]);
       if (normalSymbol && winningSymbols.includes(normalSymbol as NormalSymbolId)) winningCells.push({ row, col });
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
  diagnostics?: RefillDiagnostics,
  coreBudget?: CoreBudget,
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
    const generated: BoardCell[] = [];
    const refillContext = allowCores && mode === "bonus" ? "BONUS_REFILL" : "BASE_REFILL";
    while (generated.length < BOARD_ROWS - survivors.length) {
      const visibleColumn = [...generated, ...survivors];
      const topCell = visibleColumn.at(-1);
      const belowCell = visibleColumn.at(-2);
      const topSymbol = topCell ? getNormalSymbol(topCell) : null;
      const belowSymbol = belowCell ? getNormalSymbol(belowCell) : null;
      const isVisuallyUnpaired = Boolean(topSymbol && belowSymbol !== topSymbol);
      const emission = streams
        ? streams[col].nextVisibleAware(
          refillContext,
          allowCores,
          isVisuallyUnpaired && topSymbol ? topSymbol : null,
          coreBudget,
        )
        : generateVisibleAwareRefillCell(
          source,
          allowCores,
          mode,
          col,
          isVisuallyUnpaired && topSymbol ? topSymbol : null,
          coreBudget,
        );
      const incoming = emission.cell;
      const incomingSymbol = getNormalSymbol(incoming);

      if (isVisuallyUnpaired && topSymbol && incomingSymbol && emission.copyRoll !== undefined) {
        diagnostics?.onVisibleUnpairedRefill?.({
          column: col,
          topSymbol,
          belowSymbol,
          copyRoll: emission.copyRoll,
          incomingSymbol,
          copiedFromVisibleTop: emission.copiedFromVisibleTop === true,
        });
      }
      generated.push(incoming);
    }
    const column = [...generated, ...survivors];
    for (let row = 0; row < BOARD_ROWS; row += 1) next[row][col] = column[row];
    newSymbols.push(...generated);
  }
  return { boardAfterGravity: next, newSymbols };
}