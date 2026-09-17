import {
  BASE_REEL_CONFIG,
  BASE_INITIAL_CORE_CHANCE,
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
  NORMAL_PAIR_COPY_CHANCE,
  type NormalSymbolId,
  type ReelConfig,
  type SymbolId,
} from "../config/GameConfig";
import type { Board, BoardCell, NormalSymbolCell, RandomSource, StackSize } from "./types";
import { drawMultiplierCoreValue } from "./BonusEngine";
import { weightedChoice } from "./RNG";

export type GenerationContext = "BASE_INITIAL" | "BASE_REFILL" | "BONUS_INITIAL" | "BONUS_REFILL";
export type ColumnStreamStats = {
  pairCount: number;
  copyBranchCount: number;
  freshSecondCount: number;
  actualSamePairCount: number;
  emittedNormal: number;
  emittedSpecial: number;
};

export type VisibleAwareEmission = {
  cell: BoardCell;
  copyRoll?: number;
  copiedFromVisibleTop?: boolean;
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

const weightedChoiceFromRoll = <T>(
  roll: number,
  choices: readonly { value: T; weight: number }[],
): T => {
  const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
  let pick = roll * total;
  for (const choice of choices) {
    pick -= choice.weight;
    if (pick < 0) return choice.value;
  }
  return choices[choices.length - 1].value;
};

export class ColumnStream {
  private readonly queue: BoardCell[] = [];

  private pairPhase: "FIRST" | "SECOND" = "FIRST";

  private pairBaseSymbol: NormalSymbolId | null = null;

  private activePairId: number | null = null;

  private nextStackSequence = 1;

  readonly stats: ColumnStreamStats = {
    pairCount: 0,
    copyBranchCount: 0,
    freshSecondCount: 0,
    actualSamePairCount: 0,
    emittedNormal: 0,
    emittedSpecial: 0,
  };

  constructor(
    private readonly source: RandomSource,
    private readonly config: ReelConfig,
    private readonly columnIndex: number,
  ) {}

  next(count: number, context: GenerationContext, allowCores = true): BoardCell[] {
    while (this.queue.length < count) this.appendPosition(context, allowCores);
    return this.queue.splice(0, count);
  }

  nextVisibleAware(
    context: GenerationContext,
    allowCores: boolean,
    visibleTopSymbol: NormalSymbolId | null,
  ): VisibleAwareEmission {
    const emission = this.queue.length === 0
      ? this.appendPosition(context, allowCores, visibleTopSymbol)
      : undefined;
    const cell = this.queue.splice(0, 1)[0];
    return {
      cell: cell ?? "SCATTER",
      copyRoll: emission?.copyRoll,
      copiedFromVisibleTop: emission?.copiedFromVisibleTop,
    };
  }

  private appendPosition(
    context: GenerationContext,
    allowCores: boolean,
    visibleTopSymbol: NormalSymbolId | null = null,
  ): VisibleAwareEmission {
    const scatterChance = context === "BASE_INITIAL"
      ? BASE_INITIAL_SCATTER_CHANCE
      : context === "BASE_REFILL"
        ? BASE_REFILL_SCATTER_CHANCE
        : context === "BONUS_INITIAL"
          ? BONUS_INITIAL_SCATTER_CHANCE
          : BONUS_REFILL_SCATTER_CHANCE;
    const coreMode = allowCores && (context === "BASE_INITIAL" || context === "BASE_REFILL"
      ? "base"
      : context === "BONUS_INITIAL" || context === "BONUS_REFILL"
        ? "bonus"
        : null);
    const coreChance = context === "BASE_INITIAL"
      ? BASE_INITIAL_CORE_CHANCE
      : context === "BASE_REFILL"
        ? BASE_REFILL_CORE_CHANCE
        : context === "BONUS_INITIAL"
          ? BONUS_INITIAL_CORE_CHANCE
          : context === "BONUS_REFILL"
            ? BONUS_REFILL_CORE_CHANCE
            : 0;

    // Once a normal group has emitted its first member, the second member
    // is the next physical stream position. Specials can begin a position,
    // but they must never split an already-started pair.
    if (this.pairPhase === "FIRST") {
      const specialRoll = this.source.nextFloat();
      if (specialRoll < scatterChance) {
        this.queue.push("SCATTER");
        this.stats.emittedSpecial += 1;
        return { cell: "SCATTER" };
      }
      if (coreMode && specialRoll < scatterChance + coreChance) {
        const cell = drawMultiplierCoreValue(this.source, coreMode);
        this.queue.push(cell);
        this.stats.emittedSpecial += 1;
        return { cell };
      }
    }

    const isFirst = this.pairPhase === "FIRST";
    const baseSymbol = this.pairBaseSymbol;
    const stackId = isFirst
      ? (this.columnIndex + 1) * 1_000_000 + this.nextStackSequence++
      : this.activePairId!;
    let symbol: NormalSymbolId;
    let stackIndex: 0 | 1;
    let copyRoll: number | undefined;
    let copiedFromVisibleTop: boolean | undefined;

    if (isFirst) {
      const symbolRoll = this.source.nextFloat();
      if (visibleTopSymbol) {
        copyRoll = symbolRoll;
        copiedFromVisibleTop = symbolRoll < NORMAL_PAIR_COPY_CHANCE;
        symbol = copiedFromVisibleTop
          ? visibleTopSymbol
          : weightedChoiceFromRoll(
            (symbolRoll - NORMAL_PAIR_COPY_CHANCE) / (1 - NORMAL_PAIR_COPY_CHANCE),
            this.config.symbolWeights,
          );
      } else {
        symbol = weightedChoiceFromRoll(symbolRoll, this.config.symbolWeights);
      }
      this.pairBaseSymbol = symbol;
      this.activePairId = stackId;
      this.pairPhase = "SECOND";
      stackIndex = 0;
    } else {
      const pairRoll = this.source.nextFloat();
      const copied = pairRoll < NORMAL_PAIR_COPY_CHANCE;
      if (visibleTopSymbol) {
        copyRoll = pairRoll;
        copiedFromVisibleTop = copied;
        symbol = copied
          ? visibleTopSymbol
          : weightedChoiceFromRoll(
            (pairRoll - NORMAL_PAIR_COPY_CHANCE) / (1 - NORMAL_PAIR_COPY_CHANCE),
            this.config.symbolWeights,
          );
      } else {
        symbol = copied ? baseSymbol! : weightedChoice(this.source, this.config.symbolWeights);
      }
      this.stats.pairCount += 1;
      if (copied) this.stats.copyBranchCount += 1;
      else this.stats.freshSecondCount += 1;
      if (symbol === baseSymbol) this.stats.actualSamePairCount += 1;
      this.pairBaseSymbol = null;
      this.activePairId = null;
      this.pairPhase = "FIRST";
      stackIndex = 1;
    }

    this.queue.push(createNormalSymbolCell(symbol, stackId, stackIndex, 2));
    this.stats.emittedNormal += 1;
    return {
      cell: this.queue.at(-1)!,
      copyRoll,
      copiedFromVisibleTop,
    };
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

export function generateVisibleAwareRefillCell(
  source: RandomSource,
  allowCores = false,
  mode: "base" | "bonus" = "base",
  columnIndex = 0,
  visibleTopSymbol: NormalSymbolId | null = null,
): VisibleAwareEmission {
  const stream = new ColumnStream(
    source,
    mode === "bonus" ? BONUS_REEL_CONFIG : BASE_REEL_CONFIG,
    columnIndex,
  );
  return stream.nextVisibleAware(
    mode === "bonus" ? "BONUS_REFILL" : "BASE_REFILL",
    allowCores,
    visibleTopSymbol,
  );
}

export function countScatter(board: Board): number {
  return board.flat().filter((cell) => cell === "SCATTER").length;
}

export function isNormalSymbol(cell: BoardCell): cell is NormalSymbolId | NormalSymbolCell {
  return normalSymbolOf(cell) !== null;
}
