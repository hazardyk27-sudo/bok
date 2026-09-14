import type { NormalSymbolId, SymbolId } from "../config/GameConfig";

export type Board = BoardCell[][];
export type Cell = { row: number; col: number };
export type RandomSource = { nextFloat: () => number };
export type MultiplierCore = {
  kind: "MULTIPLIER_CORE";
  value: number;
  id?: string;
  arrivalSequence?: number;
};
export type StackSize = 1 | 2;
export type NormalSymbolCell = {
  kind: "NORMAL_SYMBOL";
  symbol: NormalSymbolId;
  stackId: number;
  stackIndex: number;
  stackSize: StackSize;
};
export type BoardCell = SymbolId | NormalSymbolCell | MultiplierCore;
export type CoreCell = Cell & {
  value: number;
  id?: string;
  arrivalSequence?: number;
};

export type MultiplierCoreState = CoreCell & {
  collected: boolean;
};

export const isMultiplierCore = (cell: BoardCell): cell is MultiplierCore =>
  typeof cell !== "string" && cell.kind === "MULTIPLIER_CORE";

export const isNormalSymbolCell = (cell: BoardCell): cell is NormalSymbolCell =>
  typeof cell !== "string" && cell.kind === "NORMAL_SYMBOL";

export const getNormalSymbol = (cell: BoardCell): NormalSymbolId | null => {
  if (isNormalSymbolCell(cell)) return cell.symbol;
  return typeof cell === "string" && cell !== "SCATTER" ? cell as NormalSymbolId : null;
};

export const getStackMetadata = (cell: BoardCell) =>
  isNormalSymbolCell(cell)
    ? { stackId: cell.stackId, stackIndex: cell.stackIndex, stackSize: cell.stackSize }
    : null;

export type TumbleResult = {
  boardBefore: Board;
  winningSymbols: NormalSymbolId[];
  payouts: Record<NormalSymbolId, number>;
  winningCells: Cell[];
  rawPayoutMultiplier: number;
  rawWinPoolAfter: number;
  multiplierCores: MultiplierCore[];
  multiplierCoreCells: CoreCell[];
  coreTotalMultiplier: number;
  finalPayoutMultiplier: number;
  settlementCores: MultiplierCoreState[];
  settlement: "deferred" | "sequence";
  removedCells: Cell[];
  boardAfterGravity: Board;
  newSymbols: BoardCell[];
  boardAfterRefill: Board;
};

export type FreeSpinResult = {
  index: number;
  initialBoard: Board;
  scatterCount: number;
  retriggerScatterCount: number;
  retriggered: number;
  retriggerBoard: Board | null;
  tumbles: TumbleResult[];
  rawWinMultiplier: number;
  combinedCoreMultiplier: number;
  finalWinMultiplier: number;
  multiplierCores: CoreCell[];
  settlementApplied: boolean;
  win: number;
};

export type FreeSpinAccounting = {
  rawSymbolWinCents: number;
  combinedCoreMultiplier: number;
  currentSpinWinCents: number;
  cumulativeBonusWinCents: number;
};

export type SpinResult = {
  betCents: number;
  initialBoard: Board;
  scatterCount: number;
  bonusTriggerScatterCount: number;
  bonusTriggered: boolean;
  freeSpinsAwarded: number;
  tumbles: TumbleResult[];
  freeSpins: FreeSpinResult[];
  baseWinCents: number;
  bonusWinCents: number;
  baseRawWinMultiplier: number;
  bonusRawWinMultiplier: number;
  totalWinCents: number;
  totalMultiplier: number;
  maxWinReached: boolean;
  totalMultiplierEvents: number[];
};
