import {
  BASE_REEL_CONFIG,
  BOARD_COLUMNS,
  BOARD_ROWS,
  BONUS_REEL_CONFIG,
  NORMAL_SYMBOLS,
  BONUS_MAX_DISTINCT_NORMAL_SYMBOLS,
  type NormalSymbolId,
  type ReelConfig,
  type SymbolId,
} from "../config/GameConfig";
import type { Board, BoardCell, RandomSource } from "./types";
import { drawMultiplierCore } from "./BonusEngine";
import { weightedChoice } from "./RNG";

export type GenerationContext = "BASE_INITIAL" | "BASE_REFILL" | "BONUS_INITIAL" | "BONUS_REFILL";
export type ColumnStreamStats = { runLengths: Record<"1" | "2", number>; emittedNormal: number; pairCount: number };

const normalIds = NORMAL_SYMBOLS.map((symbol) => symbol.id as NormalSymbolId);
const softFactor = (history: NormalSymbolId[], candidate: NormalSymbolId) => {
  const occurrences = history.filter((value) => value === candidate).length;
  return occurrences === 0 ? 1 : occurrences === 1 ? 0.8 : occurrences === 2 ? 0.55 : 0.3;
};

export class ColumnStream {
  private readonly queue: BoardCell[] = [];
  private readonly recent: NormalSymbolId[] = [];
  private lastRunSymbol: NormalSymbolId | null = null;
  readonly stats: ColumnStreamStats = { runLengths: { "1": 0, "2": 0 }, emittedNormal: 0, pairCount: 0 };

  constructor(
    private readonly source: RandomSource,
    private readonly config: ReelConfig,
    private readonly columnIndex: number,
  ) {}

  next(count: number, context: GenerationContext, allowCores = true, visibleNormalSymbols?: Set<NormalSymbolId>): BoardCell[] {
    const output: BoardCell[] = [];
    while (output.length < count) {
      this.normalizeQueuedRun(context, visibleNormalSymbols);
      const cell = this.queue.shift();
      if (cell === undefined) {
        this.appendRun(context, allowCores, visibleNormalSymbols);
        continue;
      }
      output.push(cell);
      if (visibleNormalSymbols && typeof cell === "string" && cell !== "SCATTER") {
        visibleNormalSymbols.add(cell);
      }
    }
    return output;
  }

  private selectSymbol(visibleNormalSymbols?: Set<NormalSymbolId>) {
    const candidates = this.config.symbolWeights
      .filter(({ value }) => value !== this.lastRunSymbol)
      .filter(({ value }) =>
        this.config.name !== "BONUS" ||
        !visibleNormalSymbols ||
        visibleNormalSymbols.size < BONUS_MAX_DISTINCT_NORMAL_SYMBOLS ||
        visibleNormalSymbols.has(value),
      )
      .map(({ value, weight }) => ({ value, weight: weight * softFactor(this.recent, value) }));
    const available = candidates.length ? candidates : this.config.symbolWeights
      .filter(({ value }) =>
        this.config.name !== "BONUS" ||
        !visibleNormalSymbols ||
        visibleNormalSymbols.size < BONUS_MAX_DISTINCT_NORMAL_SYMBOLS ||
        visibleNormalSymbols.has(value),
      )
      .map(({ value, weight }) => ({ value, weight: weight * softFactor(this.recent, value) }));
    return weightedChoice(this.source, available);
  }

  private normalizeQueuedRun(
    context: GenerationContext,
    visibleNormalSymbols?: Set<NormalSymbolId>,
  ) {
    if (
      context !== "BONUS_INITIAL" &&
      context !== "BONUS_REFILL" ||
      !visibleNormalSymbols ||
      visibleNormalSymbols.size < BONUS_MAX_DISTINCT_NORMAL_SYMBOLS
    ) return;

    const queued = this.queue[0];
    if (typeof queued !== "string" || queued === "SCATTER" || visibleNormalSymbols.has(queued)) return;

    const replacement = this.selectSymbol(visibleNormalSymbols);
    for (let index = 0; index < this.queue.length && this.queue[index] === queued; index += 1) {
      this.queue[index] = replacement;
    }
  }

  private appendRun(
    context: GenerationContext,
    allowCores: boolean,
    visibleNormalSymbols?: Set<NormalSymbolId>,
  ) {
    const isInitial = context === "BASE_INITIAL" || context === "BONUS_INITIAL";
    const allowScatter = isInitial;
    const coreMode = allowCores && context === "BASE_REFILL" ? "base" : allowCores && context === "BONUS_REFILL" ? "bonus" : null;
    const candidates = this.config.symbolWeights
      .filter(({ value }) => value !== this.lastRunSymbol)
      .filter(({ value }) => !isInitial || this.queue.filter((cell) => cell === value).length < 3)
      .filter(({ value }) =>
        this.config.name !== "BONUS" ||
        !visibleNormalSymbols ||
        visibleNormalSymbols.size < BONUS_MAX_DISTINCT_NORMAL_SYMBOLS ||
        visibleNormalSymbols.has(value),
      )
      .map(({ value, weight }) => ({ value, weight: weight * softFactor(this.recent, value) }));
    const available = candidates.length ? candidates : this.config.symbolWeights
      .filter(({ value }) =>
        this.config.name !== "BONUS" ||
        !visibleNormalSymbols ||
        visibleNormalSymbols.size < BONUS_MAX_DISTINCT_NORMAL_SYMBOLS ||
        visibleNormalSymbols.has(value),
      )
      .map(({ value, weight }) => ({ value, weight: weight * softFactor(this.recent, value) }));
    const symbol = weightedChoice(this.source, available);
    const requestedLength = weightedChoice(this.source, this.config.runLengthWeights);
    const maxInitialCount = isInitial
      ? 3 - this.queue.filter((cell) => cell === symbol).length
      : 2;
    const runLength = Math.max(1, Math.min(requestedLength, maxInitialCount, 2));
    let endedWithBoundary = false;
    for (let index = 0; index < runLength; index += 1) {
      if (allowScatter && this.source.nextFloat() * 100 < this.config.scatterChance) {
        this.queue.push("SCATTER");
        this.lastRunSymbol = null;
        endedWithBoundary = true;
        continue;
      }
      if (coreMode) {
        const core = drawMultiplierCore(this.source, coreMode);
        if (core) {
          this.queue.push(core);
          this.lastRunSymbol = null;
          endedWithBoundary = true;
          continue;
        }
      }
      this.queue.push(symbol);
      if (visibleNormalSymbols) visibleNormalSymbols.add(symbol);
      endedWithBoundary = false;
      this.recent.push(symbol);
      if (this.recent.length > 4) this.recent.shift();
      this.stats.emittedNormal += 1;
    }
    this.lastRunSymbol = endedWithBoundary ? null : symbol;
    const key = String(runLength) as "1" | "2";
    this.stats.runLengths[key] += 1;
    if (runLength === 2) this.stats.pairCount += 1;
  }
}

export type ColumnStreams = [ColumnStream, ColumnStream, ColumnStream, ColumnStream, ColumnStream, ColumnStream];

export function createColumnStreams(source: RandomSource, mode: "base" | "bonus"): ColumnStreams {
  const config = mode === "bonus" ? BONUS_REEL_CONFIG : BASE_REEL_CONFIG;
  return Array.from({ length: BOARD_COLUMNS }, (_, columnIndex) => new ColumnStream(source, config, columnIndex)) as ColumnStreams;
}

export function boardFromStreams(streams: ColumnStreams, context: "BASE_INITIAL" | "BONUS_INITIAL"): Board {
  const visibleNormalSymbols = context === "BONUS_INITIAL" ? new Set<NormalSymbolId>() : undefined;
  const columns = streams.map((stream) => stream.next(BOARD_ROWS, context, true, visibleNormalSymbols));
  return Array.from({ length: BOARD_ROWS }, (_, row) => columns.map((column) => column[row]));
}

export function generateInitialBoardWithStreams(source: RandomSource, mode: "base" | "bonus" = "base") {
  const streams = createColumnStreams(source, mode);
  const board = boardFromStreams(streams, mode === "bonus" ? "BONUS_INITIAL" : "BASE_INITIAL");
  return { board, streams };
}

export function generateInitialBoard(source: RandomSource, mode: "base" | "bonus" = "base"): Board {
  return generateInitialBoardWithStreams(source, mode).board;
}

export function generateRefillSymbols(source: RandomSource, count: number, mode: "base" | "bonus" = "base"): BoardCell[] {
  const stream = new ColumnStream(source, mode === "bonus" ? BONUS_REEL_CONFIG : BASE_REEL_CONFIG, 0);
  const visibleNormalSymbols = mode === "bonus" ? new Set<NormalSymbolId>() : undefined;
  return stream.next(count, mode === "bonus" ? "BONUS_REFILL" : "BASE_REFILL", false, visibleNormalSymbols);
}

export function generateRefillCells(
  source: RandomSource,
  count: number,
  allowCores = false,
  mode: "base" | "bonus" = "base",
  columnIndex = 0,
  visibleNormalSymbols?: Set<NormalSymbolId>,
): BoardCell[] {
  const stream = new ColumnStream(source, mode === "bonus" ? BONUS_REEL_CONFIG : BASE_REEL_CONFIG, columnIndex);
  return stream.next(
    count,
    mode === "bonus" ? "BONUS_REFILL" : "BASE_REFILL",
    allowCores,
    visibleNormalSymbols ?? (mode === "bonus" ? new Set<NormalSymbolId>() : undefined),
  );
}

export function countScatter(board: Board): number {
  return board.flat().filter((cell) => cell === "SCATTER").length;
}

export function isNormalSymbol(cell: BoardCell): cell is SymbolId & NormalSymbolId {
  return typeof cell === "string" && cell !== "SCATTER" && normalIds.includes(cell as NormalSymbolId);
}