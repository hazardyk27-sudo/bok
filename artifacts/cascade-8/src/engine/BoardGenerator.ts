import {
  BASE_REEL_CONFIG,
  BASE_INITIAL_SCATTER_CHANCE,
  BASE_REFILL_CORE_CHANCE,
  BASE_REFILL_SCATTER_CHANCE,
  BONUS_INITIAL_CORE_CHANCE,
  BONUS_INITIAL_SCATTER_CHANCE,
  BONUS_REFILL_CORE_CHANCE,
  BONUS_REFILL_SCATTER_CHANCE,
  BOARD_COLUMNS,
  BOARD_ROWS,
  BONUS_REEL_CONFIG,
  NORMAL_SYMBOLS,
  type NormalSymbolId,
  type ReelConfig,
  type SymbolId,
} from "../config/GameConfig";
import type { Board, BoardCell, NormalSymbolCell, RandomSource, StackSize } from "./types";
import { drawMultiplierCoreValue } from "./BonusEngine";
import { weightedChoice } from "./RNG";

export type GenerationContext = "BASE_INITIAL" | "BASE_REFILL" | "BONUS_INITIAL" | "BONUS_REFILL";
export type ColumnStreamStats = {
  runLengths: Record<"1" | "2", number>;
  packetLengths: Record<"1" | "2", number>;
  emittedNormal: number;
  pairCount: number;
  singlePacketCount: number;
  doublePacketCount: number;
};

const normalIds = NORMAL_SYMBOLS.map((symbol) => symbol.id as NormalSymbolId);
const softFactor = (history: NormalSymbolId[], candidate: NormalSymbolId) => {
  const occurrences = history.filter((value) => value === candidate).length;
  return occurrences === 0 ? 1 : occurrences === 1 ? 0.8 : occurrences === 2 ? 0.55 : 0.3;
};

const normalSymbolOf = (cell: BoardCell): NormalSymbolId | null =>
  typeof cell === "string" && cell !== "SCATTER"
    ? cell as NormalSymbolId
    : typeof cell !== "string" && cell.kind === "NORMAL_SYMBOL"
      ? cell.symbol
      : null;

export const createNormalSymbolCell = (
  symbol: NormalSymbolId,
  stackId: number,
  stackIndex: number,
  stackSize: StackSize,
): NormalSymbolCell => ({
  kind: "NORMAL_SYMBOL",
  symbol,
  stackId,
  stackIndex,
  stackSize,
});

export class ColumnStream {
  private readonly queue: BoardCell[] = [];
  private readonly recent: NormalSymbolId[] = [];
  private lastNormalPacketSymbol: NormalSymbolId | null = null;
  private nextStackSequence = 1;
  readonly stats: ColumnStreamStats = {
    runLengths: { "1": 0, "2": 0 },
    packetLengths: { "1": 0, "2": 0 },
    emittedNormal: 0,
    pairCount: 0,
    singlePacketCount: 0,
    doublePacketCount: 0,
  };

  constructor(
    private readonly source: RandomSource,
    private readonly config: ReelConfig,
    private readonly columnIndex: number,
  ) {}

  next(count: number, context: GenerationContext, allowCores = true): BoardCell[] {
    while (this.queue.length < count) this.appendPacket(context, allowCores);
    return this.queue.splice(0, count);
  }

  private appendPacket(context: GenerationContext, allowCores: boolean) {
    const isInitial = context === "BASE_INITIAL" || context === "BONUS_INITIAL";
    const scatterChance = context === "BASE_INITIAL"
      ? BASE_INITIAL_SCATTER_CHANCE
      : context === "BASE_REFILL"
        ? BASE_REFILL_SCATTER_CHANCE
        : context === "BONUS_INITIAL"
          ? BONUS_INITIAL_SCATTER_CHANCE
          : BONUS_REFILL_SCATTER_CHANCE;
    const coreMode = allowCores && (context === "BASE_REFILL"
      ? "base"
      : context === "BONUS_INITIAL" || context === "BONUS_REFILL"
        ? "bonus"
        : null);
    const coreChance = context === "BASE_REFILL"
      ? BASE_REFILL_CORE_CHANCE
      : context === "BONUS_INITIAL"
        ? BONUS_INITIAL_CORE_CHANCE
        : context === "BONUS_REFILL"
          ? BONUS_REFILL_CORE_CHANCE
          : 0;

    const requestedSize = weightedChoice(this.source, this.config.packetWeights) as StackSize;
    const packetScale = requestedSize === 2 ? 1.8 : 1;

    // Specials are always single packets and never interrupt a normal packet.
    // Scaling the packet roll keeps the configured chance close to its
    // per-cell meaning while preserving atomic special packets.
    const specialRoll = this.source.nextFloat();
    if (specialRoll < scatterChance * packetScale) {
      this.queue.push("SCATTER");
      this.lastNormalPacketSymbol = null;
      return;
    }
    if (coreMode && specialRoll < (scatterChance + coreChance) * packetScale) {
      this.queue.push(drawMultiplierCoreValue(this.source, coreMode));
      this.lastNormalPacketSymbol = null;
      return;
    }

    const candidates = this.config.symbolWeights
      .filter(({ value }) => value !== this.lastNormalPacketSymbol)
      .filter(({ value }) => !isInitial || this.queue.filter((cell) => normalSymbolOf(cell) === value).length + requestedSize <= 3)
      .map(({ value, weight }) => ({ value, weight: weight * softFactor(this.recent, value) }));
    const available = candidates.length ? candidates : this.config.symbolWeights
      .map(({ value, weight }) => ({ value, weight: weight * softFactor(this.recent, value) }));
    const symbol = weightedChoice(this.source, available);
    const stackId = (this.columnIndex + 1) * 1_000_000 + this.nextStackSequence;
    this.nextStackSequence += 1;

    for (let stackIndex = 0; stackIndex < requestedSize; stackIndex += 1) {
      this.queue.push(createNormalSymbolCell(symbol, stackId, stackIndex, requestedSize));
      this.recent.push(symbol);
      if (this.recent.length > 4) this.recent.shift();
      this.stats.emittedNormal += 1;
    }
    this.lastNormalPacketSymbol = symbol;
    const key = String(requestedSize) as "1" | "2";
    this.stats.packetLengths[key] += 1;
    this.stats.runLengths[key] += 1;
    if (requestedSize === 2) {
      this.stats.pairCount += 1;
      this.stats.doublePacketCount += 1;
    } else {
      this.stats.singlePacketCount += 1;
    }
  }
}

export type ColumnStreams = [ColumnStream, ColumnStream, ColumnStream, ColumnStream, ColumnStream, ColumnStream];

export function createColumnStreams(source: RandomSource, mode: "base" | "bonus"): ColumnStreams {
  const config = mode === "bonus" ? BONUS_REEL_CONFIG : BASE_REEL_CONFIG;
  return Array.from({ length: BOARD_COLUMNS }, (_, columnIndex) => new ColumnStream(source, config, columnIndex)) as ColumnStreams;
}

export function boardFromStreams(streams: ColumnStreams, context: "BASE_INITIAL" | "BONUS_INITIAL"): Board {
  const columns = streams.map((stream) => stream.next(BOARD_ROWS, context));
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
  return stream.next(count, mode === "bonus" ? "BONUS_REFILL" : "BASE_REFILL", false);
}

export function generateRefillCells(
  source: RandomSource,
  count: number,
  allowCores = false,
  mode: "base" | "bonus" = "base",
  columnIndex = 0,
): BoardCell[] {
  const stream = new ColumnStream(source, mode === "bonus" ? BONUS_REEL_CONFIG : BASE_REEL_CONFIG, columnIndex);
  return stream.next(count, mode === "bonus" ? "BONUS_REFILL" : "BASE_REFILL", allowCores);
}

export function countScatter(board: Board): number {
  return board.flat().filter((cell) => cell === "SCATTER").length;
}

export function isNormalSymbol(cell: BoardCell): cell is NormalSymbolId | NormalSymbolCell {
  return normalSymbolOf(cell) !== null;
}