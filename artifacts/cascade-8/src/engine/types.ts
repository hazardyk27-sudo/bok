import type { NormalSymbolId, SymbolId } from "../config/GameConfig";

export type Board = SymbolId[][];
export type Cell = { row: number; col: number };
export type RandomSource = { nextFloat: () => number };

export type TumbleResult = {
  boardBefore: Board;
  winningSymbols: NormalSymbolId[];
  winningCells: Cell[];
  rawPayoutMultiplier: number;
  crystals: number[];
  crystalTotalMultiplier: number;
  finalPayoutMultiplier: number;
  removedCells: Cell[];
  boardAfterGravity: Board;
  newSymbols: SymbolId[];
  boardAfterRefill: Board;
};

export type FreeSpinResult = {
  index: number;
  initialBoard: Board;
  scatterCount: number;
  retriggered: number;
  tumbles: TumbleResult[];
  win: number;
};

export type SpinResult = {
  betCents: number;
  initialBoard: Board;
  scatterCount: number;
  bonusTriggered: boolean;
  freeSpinsAwarded: number;
  tumbles: TumbleResult[];
  freeSpins: FreeSpinResult[];
  baseWinCents: number;
  bonusWinCents: number;
  totalWinCents: number;
  totalMultiplier: number;
  maxWinReached: boolean;
  totalMultiplierEvents: number[];
};