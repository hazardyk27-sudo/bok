import { BOARD_COLUMNS, BOARD_ROWS, NORMAL_SYMBOLS, SYMBOLS, type SymbolId } from "../config/GameConfig";
import type { Board, RandomSource } from "./types";
import { weightedChoice } from "./RNG";

const initialChoices = SYMBOLS.map((symbol) => ({ value: symbol.id, weight: symbol.weight }));
const refillChoices = NORMAL_SYMBOLS.map((symbol) => ({ value: symbol.id, weight: symbol.weight }));

export function generateInitialBoard(source: RandomSource): Board {
  return Array.from({ length: BOARD_ROWS }, () =>
    Array.from({ length: BOARD_COLUMNS }, () => weightedChoice(source, initialChoices)),
  );
}

export function generateRefillSymbols(source: RandomSource, count: number): SymbolId[] {
  return Array.from({ length: count }, () => weightedChoice(source, refillChoices));
}

export function countScatter(board: Board): number {
  return board.flat().filter((symbol) => symbol === "SCATTER").length;
}