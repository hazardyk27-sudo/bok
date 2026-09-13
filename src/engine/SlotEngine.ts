import { MAX_WIN_MULTIPLIER } from "../config/GameConfig";
import { generateInitialBoardWithStreams, countScatter, type ColumnStreams } from "./BoardGenerator";
import { baseFreeSpins, retriggerFreeSpins } from "./BonusEngine";
import { removeAndRefill, evaluateBoard } from "./WinEvaluator";
import { isMultiplierCore, type Board, type CoreCell, type FreeSpinResult, type RandomSource, type SpinResult, type TumbleResult } from "./types";

const cloneBoard = (board: Board): Board => board.map((row) => [...row]);
type PlayContext = { source: RandomSource; mode: "base" | "free"; streams: ColumnStreams };
type TumbleSequence = { tumbles: TumbleResult[]; finalBoard: Board; multiplierCores: CoreCell[]; rawWinMultiplier: number };

export function calculateSequenceSettlement(rawWinMultiplier: number, coreValues: readonly number[]) {
  const combinedCoreMultiplier = coreValues.length ? coreValues.reduce((sum, value) => sum + value, 0) : 1;
  return { combinedCoreMultiplier, finalWinMultiplier: rawWinMultiplier * combinedCoreMultiplier };
}

function playTumbles(initialBoard: Board, context: PlayContext): TumbleSequence {
  const tumbles: TumbleResult[] = [];
  let board = cloneBoard(initialBoard);
  let rawWinPool = 0;
  while (true) {
    const evaluation = evaluateBoard(board);
    if (!evaluation.winningCells.length) break;
    const multiplierCoreCells = board.flatMap((row, rowIndex) => row.flatMap((cell, col) => isMultiplierCore(cell) ? [{ row: rowIndex, col, value: cell.value }] : []));
    const multiplierCores = multiplierCoreCells.map(({ value }) => ({ kind: "MULTIPLIER_CORE" as const, value }));
    const coreTotalMultiplier = multiplierCores.length ? multiplierCores.reduce((sum, core) => sum + core.value, 0) : 1;
    rawWinPool += evaluation.rawPayoutMultiplier;
    const removedCells = [...evaluation.winningCells];
    const gravity = removeAndRefill(
      board,
      removedCells,
      context.source,
      context.mode === "free",
      context.mode === "free" ? "bonus" : "base",
      context.streams,
    );
    tumbles.push({
      boardBefore: cloneBoard(board),
      winningSymbols: evaluation.winningSymbols,
      winningCells: evaluation.winningCells,
      rawPayoutMultiplier: evaluation.rawPayoutMultiplier,
      rawWinPoolAfter: rawWinPool,
      multiplierCores,
      multiplierCoreCells,
      coreTotalMultiplier,
      finalPayoutMultiplier: 0,
      settlement: "deferred",
      removedCells,
      boardAfterGravity: cloneBoard(gravity.boardAfterGravity),
      newSymbols: [...gravity.newSymbols],
      boardAfterRefill: cloneBoard(gravity.boardAfterGravity),
    });
    board = gravity.boardAfterGravity;
  }
  const finalCoreCells = board.flatMap((row, rowIndex) => row.flatMap((cell, col) => isMultiplierCore(cell) ? [{ row: rowIndex, col, value: cell.value }] : []));
  return { tumbles, finalBoard: cloneBoard(board), multiplierCores: finalCoreCells, rawWinMultiplier: rawWinPool };
}

function settleSequence(sequence: TumbleSequence, consumeMultiplier: (value: number) => number) {
  const settlement = calculateSequenceSettlement(sequence.rawWinMultiplier, sequence.multiplierCores.map((core) => core.value));
  const finalWinMultiplier = consumeMultiplier(settlement.finalWinMultiplier);
  sequence.tumbles.forEach((tumble, index) => {
    const isSettlementTumble = index === sequence.tumbles.length - 1;
    tumble.finalPayoutMultiplier = isSettlementTumble ? finalWinMultiplier : 0;
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
  return { consume, get usedMultiplier() { return usedMultiplier; } };
}

export function playBaseSpin(betCents: number, source: RandomSource): SpinResult {
  const consumer = createConsumer();
  const { board: initialBoard, streams } = generateInitialBoardWithStreams(source, "base");
  const scatterCount = countScatter(initialBoard);
  const sequence = playTumbles(initialBoard, { source, mode: "base", streams });
  const settlement = settleSequence(sequence, consumer.consume);
  const freeSpinsAwarded = baseFreeSpins(scatterCount);
  return {
    betCents, initialBoard, scatterCount, bonusTriggered: freeSpinsAwarded > 0, freeSpinsAwarded,
    tumbles: sequence.tumbles, freeSpins: [],
    baseWinCents: Math.round(settlement.finalWinMultiplier * betCents), bonusWinCents: 0,
    baseRawWinMultiplier: sequence.rawWinMultiplier, bonusRawWinMultiplier: 0,
    totalWinCents: Math.round(consumer.usedMultiplier * betCents), totalMultiplier: consumer.usedMultiplier,
    maxWinReached: consumer.usedMultiplier >= MAX_WIN_MULTIPLIER,
    totalMultiplierEvents: sequence.tumbles.map((tumble) => tumble.finalPayoutMultiplier),
  };
}

export function playFreeSpin(index: number, betCents: number, source: RandomSource, maxRemainingMultiplier = MAX_WIN_MULTIPLIER): FreeSpinResult {
  const { board: initialBoard, streams } = generateInitialBoardWithStreams(source, "bonus");
  const scatterCount = countScatter(initialBoard);
  const sequence = playTumbles(initialBoard, { source, mode: "free", streams });
  const consumer = createConsumer(MAX_WIN_MULTIPLIER - maxRemainingMultiplier);
  const settlement = settleSequence(sequence, consumer.consume);
  return {
    index, initialBoard, scatterCount, retriggered: retriggerFreeSpins(scatterCount), tumbles: sequence.tumbles,
    rawWinMultiplier: sequence.rawWinMultiplier, combinedCoreMultiplier: settlement.combinedCoreMultiplier,
    finalWinMultiplier: settlement.finalWinMultiplier, multiplierCores: sequence.multiplierCores,
    settlementApplied: true, win: Math.round(settlement.finalWinMultiplier * betCents),
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