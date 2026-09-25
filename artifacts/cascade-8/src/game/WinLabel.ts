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
const LABEL_HALF_HEIGHT = 22;
const LABEL_VERTICAL_GAP = 48;
const LABEL_HORIZONTAL_CLEARANCE = 120;

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
      y: center.y / event.cells.length,
    };

    const minY = boardOrigin.y + LABEL_HALF_HEIGHT;
    const maxY = boardOrigin.y + 5 * cellSize.height - LABEL_HALF_HEIGHT;
    let y = candidate.y;
    let step = 0;
    while (placements.some((placement) =>
      Math.abs(placement.x - candidate.x) < LABEL_HORIZONTAL_CLEARANCE &&
      Math.abs(placement.y - y) < LABEL_VERTICAL_GAP,
    )) {
      step += 1;
      const above = candidate.y - step * LABEL_VERTICAL_GAP;
      const below = candidate.y + step * LABEL_VERTICAL_GAP;
      y = above >= minY ? above : below <= maxY ? below : above;
    }

    placements.push({
      ...event,
      x: candidate.x,
      y,
    });
  });

  return placements;
}