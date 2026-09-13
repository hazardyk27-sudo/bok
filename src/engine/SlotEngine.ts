import { MAX_WIN_MULTIPLIER } from "../config/GameConfig";
import { generateInitialBoard, countScatter } from "./BoardGenerator";
import { applyCrystalMultiplier, baseFreeSpins, drawCrystalMultipliers, retriggerFreeSpins } from "./BonusEngine";
import { removeAndRefill, evaluateBoard } from "./WinEvaluator";
import type { Board, RandomSource, SpinResult, TumbleResult, FreeSpinResult } from "./types";

const cloneBoard = (board: Board): Board => board.map((row) => [...row]);

type PlayContext = {
  betCents: number;
  source: RandomSource;
  mode: "base" | "free";
  maxRemainingMultiplier: () => number;
  consumeMultiplier: (value: number) => number;
};

function playTumbles(initialBoard: Board, context: PlayContext): TumbleResult[] {
  const tumbles: TumbleResult[] = [];
  let board = cloneBoard(initialBoard);
  while (true) {
    const evaluation = evaluateBoard(board);
    if (!evaluation.winningCells.length || context.maxRemainingMultiplier() <= 0) break;
    const crystals = context.mode === "free" ? drawCrystalMultipliers(context.source) : [];
    const crystalTotalMultiplier = crystals.length ? crystals.reduce((sum, value) => sum + value, 0) : 1;
    const available = context.maxRemainingMultiplier();
    const finalPayoutMultiplier = Math.min(applyCrystalMultiplier(evaluation.rawPayoutMultiplier, crystals), available);
    context.consumeMultiplier(finalPayoutMultiplier);
    const gravity = removeAndRefill(board, evaluation.winningCells, context.source);
    const tumble: TumbleResult = {
      boardBefore: cloneBoard(board),
      winningSymbols: evaluation.winningSymbols,
      winningCells: evaluation.winningCells,
      rawPayoutMultiplier: evaluation.rawPayoutMultiplier,
      crystals,
      crystalTotalMultiplier,
      finalPayoutMultiplier,
      removedCells: evaluation.winningCells,
      boardAfterGravity: cloneBoard(gravity.boardAfterGravity),
      newSymbols: [...gravity.newSymbols],
      boardAfterRefill: cloneBoard(gravity.boardAfterGravity),
    };
    tumbles.push(tumble);
    board = gravity.boardAfterGravity;
  }
  return tumbles;
}

export function playSpin(betCents: number, source: RandomSource): SpinResult {
  let usedMultiplier = 0;
  const consume = (value: number) => {
    const accepted = Math.min(value, MAX_WIN_MULTIPLIER - usedMultiplier);
    usedMultiplier += accepted;
    return accepted;
  };
  const initialBoard = generateInitialBoard(source);
  const scatterCount = countScatter(initialBoard);
  const baseTumbles = playTumbles(initialBoard, {
    betCents,
    source,
    mode: "base",
    maxRemainingMultiplier: () => MAX_WIN_MULTIPLIER - usedMultiplier,
    consumeMultiplier: consume,
  });
  const baseWinMultiplier = baseTumbles.reduce((sum, tumble) => sum + tumble.finalPayoutMultiplier, 0);
  let bonusWinMultiplier = 0;
  const freeSpins: FreeSpinResult[] = [];
  let awarded = baseFreeSpins(scatterCount);
  const totalMultiplierEvents = baseTumbles.map((tumble) => tumble.finalPayoutMultiplier);
  let maxWinReached = usedMultiplier >= MAX_WIN_MULTIPLIER;
  let spinIndex = 0;
  while (awarded > 0 && spinIndex < awarded && !maxWinReached) {
    const freeInitialBoard = generateInitialBoard(source);
    const freeScatterCount = countScatter(freeInitialBoard);
    const freeTumbles = playTumbles(freeInitialBoard, {
      betCents,
      source,
      mode: "free",
      maxRemainingMultiplier: () => MAX_WIN_MULTIPLIER - usedMultiplier,
      consumeMultiplier: consume,
    });
    const win = freeTumbles.reduce((sum, tumble) => sum + tumble.finalPayoutMultiplier, 0);
    const retriggered = retriggerFreeSpins(freeScatterCount);
    awarded += retriggered;
    freeSpins.push({
      index: spinIndex + 1,
      initialBoard: freeInitialBoard,
      scatterCount: freeScatterCount,
      retriggered,
      tumbles: freeTumbles,
      win: Math.round(win * betCents),
    });
    totalMultiplierEvents.push(...freeTumbles.map((tumble) => tumble.finalPayoutMultiplier));
    spinIndex += 1;
    maxWinReached = usedMultiplier >= MAX_WIN_MULTIPLIER;
  }
  const totalWinCents = Math.round(usedMultiplier * betCents);
  const baseWinCents = Math.round(baseWinMultiplier * betCents);
  bonusWinMultiplier = Math.max(0, usedMultiplier - baseWinMultiplier);
  const bonusWinCents = Math.max(0, totalWinCents - baseWinCents);
  return {
    betCents,
    initialBoard,
    scatterCount,
    bonusTriggered: awarded > 0,
    freeSpinsAwarded: baseFreeSpins(scatterCount),
    tumbles: baseTumbles,
    freeSpins,
    baseWinCents,
    bonusWinCents,
    totalWinCents,
    totalMultiplier: usedMultiplier,
    maxWinReached,
    totalMultiplierEvents,
  };
}