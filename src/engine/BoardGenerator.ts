import {
  BASE_REEL_CONFIG,
  BOARD_COLUMNS,
  BOARD_ROWS,
  BONUS_REEL_CONFIG,
  NORMAL_SYMBOLS,
  type NormalSymbolId,
  type ReelConfig,
  type SymbolId,
} from "../config/GameConfig";
import type { Board, BoardCell, RandomSource } from "./types";
import { drawMultiplierCore } from "./BonusEngine";
import { weightedChoice } from "./RNG";

function drawRunLength(source: RandomSource, config: ReelConfig) {
  return weightedChoice(source, config.runLengthWeights);
}

function drawCell(source: RandomSource, config: ReelConfig, columnIndex = 0): SymbolId {
  if (source.nextFloat() * 100 < config.scatterChance) return "SCATTER";
  return weightedChoice(source, config.symbolWeightsByColumn?.[columnIndex] ?? config.symbolWeights);
}

function generateStream(source: RandomSource, count: number, config: ReelConfig, allowCores: boolean, columnIndex = 0): BoardCell[] {
  const cells: BoardCell[] = [];
  while (cells.length < count) {
    const runSymbol = drawCell(source, config, columnIndex);
    const runLength = runSymbol === "SCATTER" ? 1 : Math.min(drawRunLength(source, config), count - cells.length);
    for (let index = 0; index < runLength; index += 1) {
      if (allowCores) {
        const core = drawMultiplierCore(source);
        if (core) {
          cells.push(core);
          continue;
        }
      }
      cells.push(runSymbol);
    }
  }
  return cells;
}

export function generateInitialBoard(source: RandomSource, mode: "base" | "bonus" = "base"): Board {
  const config = mode === "bonus" ? BONUS_REEL_CONFIG : BASE_REEL_CONFIG;
  const columns = Array.from({ length: BOARD_COLUMNS }, (_, columnIndex) =>
    generateStream(source, BOARD_ROWS, config, false, columnIndex),
  );
  return Array.from({ length: BOARD_ROWS }, (_, row) => columns.map((column) => column[row]));
}

export function generateRefillSymbols(source: RandomSource, count: number, mode: "base" | "bonus" = "base"): NormalSymbolId[] {
  const config = mode === "bonus" ? BONUS_REEL_CONFIG : BASE_REEL_CONFIG;
  return generateStream(source, count, { ...config, scatterChance: 0 }, false) as NormalSymbolId[];
}

export function generateRefillCells(
  source: RandomSource,
  count: number,
  allowCores = false,
  mode: "base" | "bonus" = "base",
  columnIndex = 0,
): BoardCell[] {
  const config = mode === "bonus" ? BONUS_REEL_CONFIG : BASE_REEL_CONFIG;
  return generateStream(source, count, { ...config, scatterChance: 0 }, allowCores, columnIndex);
}

export function countScatter(board: Board): number {
  return board.flat().filter((cell) => cell === "SCATTER").length;
}