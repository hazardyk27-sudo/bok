import { MAX_WIN_MULTIPLIER } from "../config/GameConfig";
import { generateInitialBoardWithStreams, countScatter, type ColumnStreams } from "./BoardGenerator";
import { baseFreeSpins, retriggerFreeSpins } from "./BonusEngine";
import { removeAndRefill, evaluateBoard } from "./WinEvaluator";
import {
  isMultiplierCore,
  type Board,
  type CoreCell,
  type FreeSpinAccounting,
  type FreeSpinResult,
  type RandomSource,
  type SpinResult,
  type TumbleResult,
} from "./types";

const cloneBoard = (board: Board): Board => board.map((row) => [...row]);

type PlayContext = {
  source: RandomSource;
  mode: "base" | "free";
  streams: ColumnStreams;
};

type TumbleSequence = {
  tumbles: TumbleResult[];
  finalBoard: Board;
  multiplierCores: CoreCell[];
  rawWinMultiplier: number;
  bonusPending: boolean;
  bonusScatterCount: number;
  retriggerScatterCount: number;
  retriggered: number;
  retriggerBoard: Board | null;
};

export function calculateSequenceSettlement(rawWinMultiplier: number, coreValues: readonly number[]) {
  const combinedCoreMultiplier = coreValues.length
    ? coreValues.reduce((sum, value) => sum + value, 0)
    : 1;
  return {
    combinedCoreMultiplier,
    finalWinMultiplier: rawWinMultiplier * combinedCoreMultiplier,
  };
}

export function createFreeSpinAccounting(cumulativeBonusWinCents = 0): FreeSpinAccounting {
  return {
    rawSymbolWinCents: 0,
    combinedCoreMultiplier: 1,
    currentSpinWinCents: 0,
    cumulativeBonusWinCents,
  };
}

export function beginFreeSpinAccounting(accounting: FreeSpinAccounting): FreeSpinAccounting {
  return {
    ...accounting,
    rawSymbolWinCents: 0,
    combinedCoreMultiplier: 1,
    currentSpinWinCents: 0,
  };
}

export function addFreeSpinSymbolWin(accounting: FreeSpinAccounting, symbolWinCents: number): FreeSpinAccounting {
  return {
    ...accounting,
    rawSymbolWinCents: accounting.rawSymbolWinCents + symbolWinCents,
  };
}

export function resolveFreeSpinAccounting(
  accounting: FreeSpinAccounting,
  rawWinMultiplier: number,
  combinedCoreMultiplier: number,
  currentSpinWinCents: number,
  betCents: number,
): FreeSpinAccounting {
  return {
    ...accounting,
    rawSymbolWinCents: Math.round(rawWinMultiplier * betCents),
    combinedCoreMultiplier,
    currentSpinWinCents,
  };
}

export function settleFreeSpinAccounting(accounting: FreeSpinAccounting): FreeSpinAccounting {
  return {
    ...accounting,
    cumulativeBonusWinCents: accounting.cumulativeBonusWinCents + accounting.currentSpinWinCents,
  };
}

function playTumbles(initialBoard: Board, context: PlayContext): TumbleSequence {
  const tumbles: TumbleResult[] = [];
  let board = cloneBoard(initialBoard);
  let rawWinPool = 0;
  let bonusPending = context.mode === "base" && countScatter(board) >= 4;
  let bonusScatterCount = context.mode === "base" ? countScatter(board) : 0;
  let retriggerScatterCount = 0;
  let retriggered = 0;
  let retriggerBoard: Board | null = null;
  let retriggerAwarded = false;

  while (true) {
    const evaluation = evaluateBoard(board);
    if (!evaluation.winningCells.length) break;

    const multiplierCoreCells = board.flatMap((row, rowIndex) =>
      row.flatMap((cell, col) => isMultiplierCore(cell) ? [{ row: rowIndex, col, value: cell.value }] : []),
    );
    const multiplierCores = multiplierCoreCells.map(({ value }) => ({ kind: "MULTIPLIER_CORE" as const, value }));
    const coreTotalMultiplier = multiplierCores.length
      ? multiplierCores.reduce((sum, core) => sum + core.value, 0)
      : 1;

    rawWinPool += evaluation.rawPayoutMultiplier;
    const removedCells = [...evaluation.winningCells];
    const gravity = removeAndRefill(
      board,
      removedCells,
      context.source,
      true,
      context.mode === "free" ? "bonus" : "base",
      context.streams,
    );
    tumbles.push({
      boardBefore: cloneBoard(board),
      winningSymbols: evaluation.winningSymbols,
      payouts: evaluation.payouts,
      winningCells: evaluation.winningCells,
      rawPayoutMultiplier: evaluation.rawPayoutMultiplier,
      rawWinPoolAfter: rawWinPool,
      multiplierCores,
      multiplierCoreCells,
      coreTotalMultiplier,
      finalPayoutMultiplier: 0,
      settlementCores: [],
      settlement: "deferred",
      removedCells,
      boardAfterGravity: cloneBoard(gravity.boardAfterGravity),
      newSymbols: [...gravity.newSymbols],
      boardAfterRefill: cloneBoard(gravity.boardAfterGravity),
    });
    board = gravity.boardAfterGravity;
    const scatterCount = countScatter(board);
    if (context.mode === "base" && scatterCount >= 4) {
      bonusPending = true;
      bonusScatterCount = Math.max(bonusScatterCount, scatterCount);
    }
    if (context.mode === "free" && !retriggerAwarded && scatterCount >= 3) {
      retriggerScatterCount = Math.min(scatterCount, 6);
      retriggered = retriggerFreeSpins(scatterCount);
      retriggerBoard = cloneBoard(board);
      retriggerAwarded = retriggered > 0;
    }
  }

  const finalCoreCells = board.flatMap((row, rowIndex) =>
    row.flatMap((cell, col) => isMultiplierCore(cell) ? [{ row: rowIndex, col, value: cell.value }] : []),
  );
  return {
    tumbles,
    finalBoard: cloneBoard(board),
    multiplierCores: finalCoreCells,
    rawWinMultiplier: rawWinPool,
    bonusPending,
    bonusScatterCount,
    retriggerScatterCount,
    retriggered,
    retriggerBoard,
  };
}

function settleSequence(sequence: TumbleSequence, consumeMultiplier: (value: number) => number) {
  const settlement = calculateSequenceSettlement(
    sequence.rawWinMultiplier,
    sequence.multiplierCores.map((core) => core.value),
  );
  const finalWinMultiplier = consumeMultiplier(settlement.finalWinMultiplier);
  sequence.tumbles.forEach((tumble, index) => {
    const isSettlementTumble = index === sequence.tumbles.length - 1;
    tumble.finalPayoutMultiplier = isSettlementTumble ? finalWinMultiplier : 0;
    tumble.coreTotalMultiplier = isSettlementTumble ? settlement.combinedCoreMultiplier : tumble.coreTotalMultiplier;
    tumble.settlementCores = isSettlementTumble
      ? sequence.multiplierCores.map(({ value }) => ({ kind: "MULTIPLIER_CORE" as const, value }))
      : [];
    tumble.settlement = isSettlementTumble ? "sequence" : "deferred";
  });
  return { ...settlement, finalWinMultiplier };
}

function createConsumer(initialUsed = 0) {
  let usedMultiplier = initialUsed;
  const consume = (value: number) => {
    const accepted = Math.min(value, MAX_WIN_MULTIPLIER - usedMultiplier);
    usedMultiplier += accepted;
    return accepted;
  };
  return {
    consume,
    get usedMultiplier() {
      return usedMultiplier;
    },
  };
}

export function playBaseSpin(betCents: number, source: RandomSource): SpinResult {
  const consumer = createConsumer();
  const { board: initialBoard, streams } = generateInitialBoardWithStreams(source, "base");
  const scatterCount = countScatter(initialBoard);
  const sequence = playTumbles(initialBoard, { source, mode: "base", streams });
  const settlement = settleSequence(sequence, consumer.consume);
  const bonusTriggerScatterCount = sequence.bonusPending
    ? Math.max(scatterCount, sequence.bonusScatterCount)
    : 0;
  const freeSpinsAwarded = bonusTriggerScatterCount > 0
    ? baseFreeSpins(bonusTriggerScatterCount)
    : 0;

  return {
    betCents,
    initialBoard,
    scatterCount,
    bonusTriggerScatterCount,
    bonusTriggered: freeSpinsAwarded > 0,
    freeSpinsAwarded,
    tumbles: sequence.tumbles,
    freeSpins: [],
    baseWinCents: Math.round(settlement.finalWinMultiplier * betCents),
    bonusWinCents: 0,
    baseRawWinMultiplier: sequence.rawWinMultiplier,
    bonusRawWinMultiplier: 0,
    totalWinCents: Math.round(consumer.usedMultiplier * betCents),
    totalMultiplier: consumer.usedMultiplier,
    maxWinReached: consumer.usedMultiplier >= MAX_WIN_MULTIPLIER,
    totalMultiplierEvents: sequence.tumbles.map((tumble) => tumble.finalPayoutMultiplier),
  };
}

export function playFreeSpin(
  index: number,
  betCents: number,
  source: RandomSource,
  maxRemainingMultiplier = MAX_WIN_MULTIPLIER,
): FreeSpinResult {
  const { board: freeInitialBoard, streams } = generateInitialBoardWithStreams(source, "bonus");
  const freeScatterCount = countScatter(freeInitialBoard);
  const sequence = playTumbles(freeInitialBoard, { source, mode: "free", streams });
  const consumer = createConsumer(MAX_WIN_MULTIPLIER - maxRemainingMultiplier);
  const settlement = settleSequence(sequence, consumer.consume);
  return {
    index,
    initialBoard: freeInitialBoard,
    scatterCount: freeScatterCount,
    retriggered: sequence.retriggered || retriggerFreeSpins(freeScatterCount),
    retriggerScatterCount: sequence.retriggerScatterCount || (freeScatterCount >= 3 ? Math.min(freeScatterCount, 6) : 0),
    retriggerBoard: sequence.retriggerBoard ?? (freeScatterCount >= 3 ? cloneBoard(freeInitialBoard) : null),
    tumbles: sequence.tumbles,
    rawWinMultiplier: sequence.rawWinMultiplier,
    combinedCoreMultiplier: settlement.combinedCoreMultiplier,
    finalWinMultiplier: settlement.finalWinMultiplier,
    multiplierCores: sequence.multiplierCores,
    settlementApplied: true,
    win: Math.round(settlement.finalWinMultiplier * betCents),
  };
}

export function playSpin(betCents: number, source: RandomSource): SpinResult {
  const result = playBaseSpin(betCents, source);
  let usedMultiplier = result.totalMultiplier;
  let awarded = result.freeSpinsAwarded;
  let spinIndex = 0;

  while (awarded > 0 && spinIndex < awarded && usedMultiplier < MAX_WIN_MULTIPLIER) {
    const freeSpin = playFreeSpin(spinIndex + 1, betCents, source, MAX_WIN_MULTIPLIER - usedMultiplier);
    result.freeSpins.push(freeSpin);
    result.totalMultiplierEvents.push(...freeSpin.tumbles.map((tumble) => tumble.finalPayoutMultiplier));
    usedMultiplier += freeSpin.finalWinMultiplier;
    awarded += freeSpin.retriggered;
    spinIndex += 1;
  }

  result.bonusRawWinMultiplier = result.freeSpins.reduce((sum, freeSpin) => sum + freeSpin.rawWinMultiplier, 0);
  result.bonusWinCents = Math.max(0, Math.round((usedMultiplier - result.baseWinCents / betCents) * betCents));
  result.totalMultiplier = usedMultiplier;
  result.totalWinCents = Math.round(usedMultiplier * betCents);
  result.maxWinReached = usedMultiplier >= MAX_WIN_MULTIPLIER;
  return result;
}
