import type { NormalSymbolId, SymbolId } from "../config/GameConfig";

export type Board = BoardCell[][];
export type Cell = { row: number; col: number };
export type RandomSource = { nextFloat: () => number };
export type MultiplierCore = { kind: "MULTIPLIER_CORE"; value: number };
export type BoardCell = SymbolId | MultiplierCore;
export type CoreCell = Cell & { value: number };

export const isMultiplierCore = (cell: BoardCell): cell is MultiplierCore =>
  typeof cell !== "string" && cell.kind === "MULTIPLIER_CORE";

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
  settlementCores: MultiplierCore[];
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
