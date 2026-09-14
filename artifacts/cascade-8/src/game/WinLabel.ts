import { getNormalSymbol, type Board, type Cell } from "../engine/types";
import type { NormalSymbolId } from "../config/GameConfig";

export type WinLabelEvent = {
  amountCents: number;
  cells: Cell[];
  text: string;
};

export type WinLabelPlacement = WinLabelEvent & {
  x: number;
  y: number;
};

type BoardLayout = {
  boardOrigin?: { x: number; y: number };
  cellSize?: { width: number; height: number };
};

const DEFAULT_BOARD_ORIGIN = { x: 22, y: 30 };
const DEFAULT_CELL_SIZE = { width: 96, height: 92 };

export function buildWinLabelEvents(
  board: Board,
  winningSymbols: readonly NormalSymbolId[],
  winningCells: readonly Cell[],
  payouts: Partial<Record<NormalSymbolId, number>>,
  betCents: number,
  formatAmount: (amountCents: number) => string,
): WinLabelEvent[] {
  return winningSymbols.flatMap((symbol) => {
    const cells = winningCells.filter((cell) => getNormalSymbol(board[cell.row]?.[cell.col]) === symbol);
    const amountCents = Math.round((payouts[symbol] ?? 0) * betCents);
    return cells.length > 0 && amountCents > 0
      ? [{ amountCents, cells, text: formatAmount(amountCents) }]
      : [];
  });
}

export function calculateWinLabelPositions(
  events: readonly WinLabelEvent[],
  layout: BoardLayout = {},
): WinLabelPlacement[] {
  const boardOrigin = layout.boardOrigin ?? DEFAULT_BOARD_ORIGIN;
  const cellSize = layout.cellSize ?? DEFAULT_CELL_SIZE;
  const placements: WinLabelPlacement[] = [];

  events.forEach((event) => {
    const center = event.cells.reduce(
      (sum, cell) => ({
        x: sum.x + boardOrigin.x + cell.col * cellSize.width + cellSize.width / 2,
        y: sum.y + boardOrigin.y + cell.row * cellSize.height + cellSize.height / 2,
      }),
      { x: 0, y: 0 },
    );
    const candidate = {
      x: center.x / event.cells.length,
      y: center.y / event.cells.length - 30,
    };

    let offset = 0;
    while (placements.some((placement) =>
      Math.abs(placement.x - candidate.x) < 112 &&
      Math.abs(placement.y - (candidate.y - offset)) < 42,
    )) {
      offset += 42;
    }

    placements.push({
      ...event,
      x: candidate.x,
      y: candidate.y - offset,
    });
  });

  return placements;
}