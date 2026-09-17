import { mkdir, writeFile } from "node:fs/promises";
import { playSpin } from "../engine/SlotEngine";
import { SeededRNG } from "../engine/RNG";
import { evaluateBoard } from "../engine/WinEvaluator";
import {
  BASE_INITIAL_CORE_CHANCE,
  BASE_INITIAL_SCATTER_CHANCE,
  BASE_REEL_CONFIG,
  BASE_REFILL_CORE_CHANCE,
  BASE_REFILL_SCATTER_CHANCE,
  BOARD_COLUMNS,
  BOARD_ROWS,
  BONUS_INITIAL_CORE_CHANCE,
  BONUS_INITIAL_SCATTER_CHANCE,
  BONUS_REFILL_CORE_CHANCE,
  BONUS_REFILL_SCATTER_CHANCE,
  MAX_WIN_MULTIPLIER,
  NORMAL_PAIR_COPY_CHANCE,
  NORMAL_SYMBOLS,
  SYMBOLS,
} from "../config/GameConfig";
import { ColumnStream } from "../engine/BoardGenerator";
import { getNormalSymbol, getStackMetadata, isMultiplierCore } from "../engine/types";
import type { Board, BoardCell } from "../engine/types";

export const HISTOGRAM_BUCKETS = [
  "0x", "0-1x", "1-2x", "2-5x", "5-10x", "10-25x", "25-50x",
  "50-100x", "100-250x", "250-500x", "500-1000x", "1000-2500x",
  "2500-5000x", "5000x",
] as const;

function bucket(multiplier: number) {
  if (multiplier === 0) return "0x";
  if (multiplier < 1) return "0-1x";
  if (multiplier < 2) return "1-2x";
  if (multiplier < 5) return "2-5x";
  if (multiplier < 10) return "5-10x";
  if (multiplier < 25) return "10-25x";
  if (multiplier < 50) return "25-50x";
  if (multiplier < 100) return "50-100x";
  if (multiplier < 250) return "100-250x";
  if (multiplier < 500) return "250-500x";
  if (multiplier < 1000) return "500-1000x";
  if (multiplier < 2500) return "1000-2500x";
  if (multiplier < 5000) return "2500-5000x";
  return "5000x";
}

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const OBSERVED_SYMBOL_KEYS = [
  ...NORMAL_SYMBOLS.map(({ id }) => id),
  "SCATTER",
  "MULTIPLIER_CORE",
] as const;
type ObservedSymbolKey = (typeof OBSERVED_SYMBOL_KEYS)[number];
const GS_EXPLOSION_BUCKETS = ["8", "9", "10", "11", "12+"] as const;
type GsExplosionBucket = (typeof GS_EXPLOSION_BUCKETS)[number];

const createSymbolCounts = (): Record<ObservedSymbolKey, number> =>
  Object.fromEntries(OBSERVED_SYMBOL_KEYS.map((key) => [key, 0])) as Record<ObservedSymbolKey, number>;

const observedSymbolKey = (cell: BoardCell): ObservedSymbolKey => {
  if (isMultiplierCore(cell)) return "MULTIPLIER_CORE";
  if (typeof cell === "string") return cell as ObservedSymbolKey;
  return cell.symbol;
};

const recordCells = (cells: BoardCell[], counts: Record<ObservedSymbolKey, number>) => {
  for (const cell of cells) {
    const key = observedSymbolKey(cell);
    counts[key] += 1;
  }
};

const recordBoardCells = (board: Board, counts: Record<ObservedSymbolKey, number>) => {
  recordCells(board.flat(), counts);
};

const gsExplosionBucket = (count: number): GsExplosionBucket =>
  count >= 12 ? "12+" : String(count) as GsExplosionBucket;

const percentageByDenominator = (counts: Record<string, number>, denominator: number) =>
  Object.fromEntries(
    Object.entries(counts).map(([key, value]) => [key, Number(((value / Math.max(1, denominator)) * 100).toFixed(4))]),
  );

function recordRuns(board: Board, distribution: Record<string, number>, metrics?: RunMetrics) {
  for (let col = 0; col < board[0].length; col += 1) {
    const unique = new Set<string>();
    let columnMaximum = 0;
    let columnHasPair = false;
    let runLength = 1;
    for (let row = 1; row <= board.length; row += 1) {
      const previous = board[row - 1][col];
      const current = row < board.length ? board[row][col] : undefined;
      const previousSymbol = getNormalSymbol(previous);
      const currentSymbol = current ? getNormalSymbol(current) : null;
      if (previousSymbol) unique.add(previousSymbol);
      if (currentSymbol && currentSymbol === previousSymbol) {
        runLength += 1;
      } else {
        if (previousSymbol) {
          columnMaximum = Math.max(columnMaximum, runLength);
          columnHasPair ||= runLength >= 2;
          const key = String(Math.min(runLength, 2));
          distribution[key] = (distribution[key] ?? 0) + 1;
        }
        runLength = 1;
      }
    }
    if (metrics) {
      metrics.visibleColumns += 1;
      metrics.uniqueNormalTotal += unique.size;
      metrics.maximumContiguousNormal = Math.max(metrics.maximumContiguousNormal, columnMaximum);
      if (columnHasPair) metrics.visiblePairColumns += 1;
      if (columnMaximum >= 3) metrics.columnsWithThree += 1;
      if (columnMaximum >= 4) metrics.columnsWithFour += 1;
      if (columnMaximum >= 5) metrics.columnsWithFive += 1;
    }
  }
}

type RunMetrics = {
  maximumContiguousNormal: number;
  visiblePairColumns: number;
  visibleColumns: number;
  columnsWithThree: number;
  columnsWithFour: number;
  columnsWithFive: number;
  uniqueNormalTotal: number;
};

type PairMetrics = {
  pairGroups: number;
  initialBoards: number;
  initialBoardsWithPair: number;
  refillEvents: number;
  refillEventsWithPair: number;
};

function recordPairGroups(
  cells: BoardCell[],
  source: "initial" | "refill",
  context: string,
  seen: Set<string>,
  metrics: PairMetrics,
) {
  if (source === "initial") metrics.initialBoards += 1;
  if (source === "refill") metrics.refillEvents += 1;
  let hasDouble = false;
  cells.forEach((cell) => {
    if (typeof cell === "string" || cell.kind !== "NORMAL_SYMBOL" || cell.stackSize !== 2) return;
    const pairKey = `${context}:${cell.stackId}`;
    if (seen.has(pairKey)) return;
    seen.add(pairKey);
    metrics.pairGroups += 1;
    hasDouble = true;
  });
  if (source === "initial" && hasDouble) metrics.initialBoardsWithPair += 1;
  if (source === "refill" && hasDouble) metrics.refillEventsWithPair += 1;
}

function measureNormalPairBranches(seed: string, targetPairs = 1_000_000) {
  const stream = new ColumnStream(new SeededRNG(`${seed}:normal-pair-statistics`), BASE_REEL_CONFIG, 0);
  let previousPairSecond: string | null = null;
  let thirdPositionSamples = 0;
  let thirdMatchesPreviousSecond = 0;
  while (stream.stats.pairCount < targetPairs) {
    const cell = stream.next(1, "BASE_REFILL", false)[0];
    const normal = getNormalSymbol(cell);
    const metadata = getStackMetadata(cell);
    if (!normal || !metadata) continue;
    if (metadata.stackIndex === 0) {
      if (previousPairSecond !== null) {
        thirdPositionSamples += 1;
        if (normal === previousPairSecond) thirdMatchesPreviousSecond += 1;
      }
    } else if (metadata.stackIndex === 1) {
      previousPairSecond = normal;
    }
  }
  return {
    sampledPairs: stream.stats.pairCount,
    copyBranchRate: Number(((stream.stats.copyBranchCount / stream.stats.pairCount) * 100).toFixed(4)),
    actualSecondSameRate: Number(((stream.stats.actualSamePairCount / stream.stats.pairCount) * 100).toFixed(4)),
    thirdPositionSamples,
    thirdMatchesPreviousSecondRate: Number(((thirdMatchesPreviousSecond / Math.max(1, thirdPositionSamples)) * 100).toFixed(4)),
    freshSecondCount: stream.stats.freshSecondCount,
  };
}

export type SimulationReport = {
  seed: string;
  totalSpins: number;
  betCents: number;
  configSnapshot: {
    boardColumns: number;
    boardRows: number;
    maxWinMultiplier: number;
    normalPairCopyChance: number;
    symbols: { id: string; weight: number }[];
    baseInitialScatterChance: number;
    baseInitialCoreChance: number;
    baseRefillScatterChance: number;
    baseRefillCoreChance: number;
    bonusInitialScatterChance: number;
    bonusRefillScatterChance: number;
    bonusInitialCoreChance: number;
    bonusRefillCoreChance: number;
  };
  totalBetCents: number;
  totalReturnCents: number;
  overallRtp: number;
  baseGameRtp: number;
  bonusRtp: number;
  hitRate: number;
  zeroWinRate: number;
  bonusTriggerCount: number;
  bonusFrequency: string;
  averageBonusWinMultiplier: number;
  medianBonusWinMultiplier: number;
  averageTumblesPerPaidSpin: number;
  maximumTumblesSeen: number;
  averageWinningTumbles: number;
  averageWinMultiplier: number;
  medianWinMultiplier: number;
  maxObservedWinMultiplier: number;
  frequency100x: number;
  frequency250x: number;
  frequency500x: number;
  frequency1000x: number;
  frequency2500x: number;
  frequency5000x: number;
  freeSpinRetriggerRate: number;
  averageFreeSpinsPerBonus: number;
  multiplierCoreFrequency: number;
  averageCoreCellsPerFreeRefill: number;
  baseCoreSpawnFrequency: number;
  baseCorePaidSpinFrequency: number;
  baseCoreAverageValue: number;
  baseCore50xFrequency: number;
  baseCore100xFrequency: number;
  baseCore250xFrequency: number;
  baseCore500xFrequency: number;
  bonusCoreSpawnFrequency: number;
  bonusInitialCoreSpawnFrequency: number;
  bonusCoreAverageValue: number;
  bonusRefillCoreAverageValue: number;
  bonusInitialCoreAverageValue: number;
  bonusCore50xFrequency: number;
  bonusCore100xFrequency: number;
  bonusCore250xFrequency: number;
  bonusCore500xFrequency: number;
  averageCombinedCoreMultiplier: number;
  highestCoreTotalObserved: number;
  coreRtpContribution: number;
  returnDecompositionDifferenceCents: number;
  averageRawSequenceMultiplier: number;
  averageFinalSequenceMultiplier: number;
  averageCoreUpliftMultiplier: number;
  chainRate: number;
  runLengthDistribution: Record<string, number>;
  symbolHitCounts: Record<string, number>;
  initialEightPlusFrequency: number;
  twoTumbleFrequency: number;
  threeTumbleFrequency: number;
  fourTumbleFrequency: number;
  exactTwoTumbleFrequency: number;
  exactThreeTumbleFrequency: number;
  exactFourTumbleFrequency: number;
  totalTumbleEvents: number;
  bonusRetriggerRate: number;
  configuredCopyBranchProbability: number;
  observedCopyBranchProbability: number;
  observedSecondSameProbability: number;
  sampledNormalPairs: number;
  thirdPositionSamples: number;
  thirdMatchesPreviousSecondProbability: number;
  initialBoardPairFrequency: number;
  refillPairFrequency: number;
  observedSingleProbability: number;
  observedPairProbability: number;
  maximumContiguousNormal: number;
  averageUniqueNormalSymbolsPerColumn: number;
  visiblePairFrequency: number;
  columnThreeSameFrequency: number;
  columnFourSameFrequency: number;
  columnFiveSameFrequency: number;
  symbolAppearanceCounts: {
    initialBoard: Record<ObservedSymbolKey, number>;
    refill: Record<ObservedSymbolKey, number>;
    visible: Record<ObservedSymbolKey, number>;
  };
  symbolAppearanceDenominators: {
    initialBoardCells: number;
    refillCells: number;
    visibleCells: number;
  };
  symbolAppearanceRates: {
    initialBoard: Record<string, number>;
    refill: Record<string, number>;
    visible: Record<string, number>;
  };
  galatasarayExplosionCount: number;
  galatasarayExplosionRate: number;
  galatasarayExplosionPerPaidSpinRate: number;
  galatasarayExplosionCounts: Record<GsExplosionBucket, number>;
  galatasarayExplosionRates: Record<GsExplosionBucket, number>;
  sequenceCorePercentage: number;
  averageActiveCoresAtSettlement: number;
  coreValueDistribution: Record<string, number>;
  histogram: Record<(typeof HISTOGRAM_BUCKETS)[number], number>;
};

export function simulate(spins: number, seed: string, betCents = 100, onProgress?: (completed: number) => void): SimulationReport {
  const source = new SeededRNG(seed);
  const wins: number[] = [];
  const bonuses: number[] = [];
  const histogram = Object.fromEntries(HISTOGRAM_BUCKETS.map((key) => [key, 0])) as SimulationReport["histogram"];
  let totalReturnCents = 0;
  let totalBaseCents = 0;
  let totalBonusCents = 0;
  let hitCount = 0;
  let bonusTriggerCount = 0;
  let bonusSessionsWithRetrigger = 0;
  let tumbleCount = 0;
  let winningTumbleCount = 0;
  let totalTumbleEvents = 0;
  let retriggeredFreeSpins = 0;
  let freeSpinCount = 0;
  let coreTumbles = 0;
  let coreCells = 0;
  let freeRefills = 0;
  let freeRefillCells = 0;
  let baseRefillCells = 0;
  let baseCoreCells = 0;
  let baseCorePaidSpinCount = 0;
  const baseCoreValues: number[] = [];
  const bonusCoreValues: number[] = [];
  const bonusRefillCoreValues: number[] = [];
  const bonusInitialCoreValues: number[] = [];
  let bonusInitialCoreCells = 0;
  let bonusInitialBoardCells = 0;
  let coreContributionCents = 0;
  let coreTotal = 0;
  let rawSequenceTotal = 0;
  let finalSequenceTotal = 0;
  let sequenceCount = 0;
  let chainedSpinCount = 0;
  let initialEightPlusCount = 0;
  let twoTumbleCount = 0;
  let threeTumbleCount = 0;
  let fourTumbleCount = 0;
  let exactTwoTumbleCount = 0;
  let exactThreeTumbleCount = 0;
  let exactFourTumbleCount = 0;
  let activeCoreCountTotal = 0;
  let coreSequenceCount = 0;
  let highestCoreTotalObserved = 0;
  const runLengthDistribution: Record<string, number> = {};
  const symbolHitCounts: Record<string, number> = {};
  const runMetrics: RunMetrics = {
    maximumContiguousNormal: 0, visiblePairColumns: 0, visibleColumns: 0,
    columnsWithThree: 0, columnsWithFour: 0, columnsWithFive: 0, uniqueNormalTotal: 0,
  };
  const pairMetrics: PairMetrics = {
    pairGroups: 0,
    initialBoards: 0,
    initialBoardsWithPair: 0,
    refillEvents: 0,
    refillEventsWithPair: 0,
  };
  const pairBranches = measureNormalPairBranches(seed);
  const coreValueDistribution: Record<string, number> = {};
  const symbolAppearanceCounts = {
    initialBoard: createSymbolCounts(),
    refill: createSymbolCounts(),
    visible: createSymbolCounts(),
  };
  let initialBoardCells = 0;
  let refillCells = 0;
  let visibleCells = 0;
  let galatasarayExplosionCount = 0;
  const galatasarayExplosionCounts = Object.fromEntries(
    GS_EXPLOSION_BUCKETS.map((key) => [key, 0]),
  ) as Record<GsExplosionBucket, number>;
  let maxObservedWinMultiplier = 0;
  let maxTumbles = 0;
  for (let index = 0; index < spins; index += 1) {
    const result = playSpin(betCents, source);
    const seenPairs = new Set<string>();
    recordPairGroups(result.initialBoard.flat(), "initial", `base:${index}`, seenPairs, pairMetrics);
    recordRuns(result.initialBoard, runLengthDistribution, runMetrics);
    recordBoardCells(result.initialBoard, symbolAppearanceCounts.initialBoard);
    recordBoardCells(result.initialBoard, symbolAppearanceCounts.visible);
    initialBoardCells += result.initialBoard.flat().length;
    visibleCells += result.initialBoard.flat().length;
    if (evaluateBoard(result.initialBoard).winningCells.length) initialEightPlusCount += 1;
    result.freeSpins.forEach((freeSpin, freeSpinIndex) => {
      recordPairGroups(freeSpin.initialBoard.flat(), "initial", `bonus:${index}:${freeSpinIndex}`, seenPairs, pairMetrics);
      recordRuns(freeSpin.initialBoard, runLengthDistribution, runMetrics);
      recordBoardCells(freeSpin.initialBoard, symbolAppearanceCounts.initialBoard);
      recordBoardCells(freeSpin.initialBoard, symbolAppearanceCounts.visible);
      initialBoardCells += freeSpin.initialBoard.flat().length;
      visibleCells += freeSpin.initialBoard.flat().length;
      const initialCoreValues = freeSpin.initialBoard
        .flat()
        .filter((cell) => isMultiplierCore(cell))
        .map((cell) => cell.value);
      bonusInitialBoardCells += freeSpin.initialBoard.flat().length;
      bonusInitialCoreCells += initialCoreValues.length;
      bonusInitialCoreValues.push(...initialCoreValues);
      bonusCoreValues.push(...initialCoreValues);
    });
    const multiplier = result.totalMultiplier;
    maxObservedWinMultiplier = Math.max(maxObservedWinMultiplier, multiplier);
    wins.push(multiplier);
    totalReturnCents += result.totalWinCents;
    totalBaseCents += result.baseWinCents;
    totalBonusCents += result.bonusWinCents;
    if (result.totalWinCents > 0) hitCount += 1;
    if (result.bonusTriggered) {
      bonusTriggerCount += 1;
      bonuses.push(result.bonusWinCents / betCents);
      if (result.freeSpins.some((freeSpin) => freeSpin.retriggered > 0)) {
        bonusSessionsWithRetrigger += 1;
      }
    }
    const totalTumbles = result.tumbles.length + result.freeSpins.reduce((sum, spin) => sum + spin.tumbles.length, 0);
    tumbleCount += totalTumbles;
    winningTumbleCount += totalTumbles;
    totalTumbleEvents += totalTumbles;
    maxTumbles = Math.max(maxTumbles, totalTumbles);
    if (totalTumbles >= 2) twoTumbleCount += 1;
    if (totalTumbles >= 3) threeTumbleCount += 1;
    if (totalTumbles >= 4) fourTumbleCount += 1;
    if (totalTumbles === 2) exactTwoTumbleCount += 1;
    if (totalTumbles === 3) exactThreeTumbleCount += 1;
    if (totalTumbles === 4) exactFourTumbleCount += 1;
    freeSpinCount += result.freeSpins.length;
    for (const freeSpin of result.freeSpins) {
      if (freeSpin.retriggered > 0) retriggeredFreeSpins += freeSpin.retriggered;
    }
    const recordTumble = (tumble: (typeof result.tumbles)[number], isFree: boolean) => {
      const newCoreValues = tumble.newSymbols
        .filter((cell) => isMultiplierCore(cell))
        .map((cell) => cell.value);
      if (isFree) {
        freeRefills += 1;
        coreCells += newCoreValues.length;
        freeRefillCells += tumble.newSymbols.length;
        bonusRefillCoreValues.push(...newCoreValues);
      }
      refillCells += tumble.newSymbols.length;
      recordCells(tumble.newSymbols, symbolAppearanceCounts.refill);
      recordBoardCells(tumble.boardAfterRefill, symbolAppearanceCounts.visible);
      visibleCells += tumble.boardAfterRefill.flat().length;
      const context = isFree ? `bonus:${index}` : `base:${index}`;
      recordPairGroups(tumble.newSymbols, "refill", context, seenPairs, pairMetrics);
      tumble.winningSymbols.forEach((symbol) => {
        symbolHitCounts[symbol] = (symbolHitCounts[symbol] ?? 0) + 1;
      });
      const galatasarayCount = tumble.winningCells.reduce((count, cell) =>
        count + (getNormalSymbol(tumble.boardBefore[cell.row][cell.col]) === "S8" ? 1 : 0), 0);
      if (galatasarayCount >= 8) {
        galatasarayExplosionCount += 1;
        const bucketKey = gsExplosionBucket(galatasarayCount);
        galatasarayExplosionCounts[bucketKey] += 1;
      }
    };
    result.tumbles.forEach((tumble) => recordTumble(tumble, false));
    result.freeSpins.forEach((freeSpin) => freeSpin.tumbles.forEach((tumble) => recordTumble(tumble, true)));
    const baseCoreValuesThisSpin = result.tumbles.flatMap((tumble) =>
      tumble.newSymbols.filter((cell) => isMultiplierCore(cell)).map((cell) => cell.value),
    );
    baseRefillCells += result.tumbles.reduce((sum, tumble) => sum + tumble.newSymbols.length, 0);
    baseCoreCells += baseCoreValuesThisSpin.length;
    baseCoreValues.push(...baseCoreValuesThisSpin);
    if (baseCoreValuesThisSpin.length) baseCorePaidSpinCount += 1;
    const bonusCoreValuesThisSpin = result.freeSpins.flatMap((spin) =>
      spin.tumbles.flatMap((tumble) =>
        tumble.newSymbols.filter((cell) => isMultiplierCore(cell)).map((cell) => cell.value),
      ),
    );
    bonusCoreValues.push(...bonusCoreValuesThisSpin);
    for (const sequence of [
      {
        raw: result.baseRawWinMultiplier,
        final: result.baseWinCents / betCents,
        cores: result.tumbles.flatMap((tumble) =>
          tumble.newSymbols.filter((cell) => isMultiplierCore(cell)).map((cell) => cell.value),
        ),
      },
      ...result.freeSpins.map((freeSpin) => ({
        raw: freeSpin.rawWinMultiplier,
        final: freeSpin.finalWinMultiplier,
        cores: freeSpin.multiplierCores.map((core) => core.value),
      })),
    ]) {
      sequenceCount += 1;
      rawSequenceTotal += sequence.raw;
      finalSequenceTotal += sequence.final;
      if (sequence.cores.length) {
        coreTumbles += 1;
        coreSequenceCount += 1;
        activeCoreCountTotal += sequence.cores.length;
        const combined = sequence.cores.reduce((sum, value) => sum + value, 0);
        coreTotal += combined;
        highestCoreTotalObserved = Math.max(highestCoreTotalObserved, combined);
        coreContributionCents += Math.max(0, sequence.final - sequence.raw) * betCents;
        sequence.cores.forEach((value) => {
          coreValueDistribution[String(value)] = (coreValueDistribution[String(value)] ?? 0) + 1;
        });
      }
    }
    if (result.tumbles.length > 1 || result.freeSpins.some((freeSpin) => freeSpin.tumbles.length > 1)) {
      chainedSpinCount += 1;
    }
    histogram[bucket(multiplier)] += 1;
    if (onProgress && (index + 1) % 100_000 === 0) onProgress(index + 1);
  }
  const totalBetCents = spins * betCents;
  const percent = (value: number) => Number(((value / spins) * 100).toFixed(4));
  const galatasarayExplosionRates = Object.fromEntries(
    GS_EXPLOSION_BUCKETS.map((key) => [
      key,
      Number(((galatasarayExplosionCounts[key] / Math.max(1, totalTumbleEvents)) * 100).toFixed(4)),
    ]),
  ) as Record<GsExplosionBucket, number>;
  return {
    seed,
    totalSpins: spins,
    betCents,
    configSnapshot: {
      boardColumns: BOARD_COLUMNS,
      boardRows: BOARD_ROWS,
      maxWinMultiplier: MAX_WIN_MULTIPLIER,
      normalPairCopyChance: NORMAL_PAIR_COPY_CHANCE,
      symbols: SYMBOLS.map(({ id, weight }) => ({ id, weight })),
      baseInitialScatterChance: BASE_INITIAL_SCATTER_CHANCE,
      baseInitialCoreChance: BASE_INITIAL_CORE_CHANCE,
      baseRefillScatterChance: BASE_REFILL_SCATTER_CHANCE,
      baseRefillCoreChance: BASE_REFILL_CORE_CHANCE,
      bonusInitialScatterChance: BONUS_INITIAL_SCATTER_CHANCE,
      bonusRefillScatterChance: BONUS_REFILL_SCATTER_CHANCE,
      bonusInitialCoreChance: BONUS_INITIAL_CORE_CHANCE,
      bonusRefillCoreChance: BONUS_REFILL_CORE_CHANCE,
    },
    totalBetCents,
    totalReturnCents,
    overallRtp: Number(((totalReturnCents / totalBetCents) * 100).toFixed(4)),
    baseGameRtp: Number(((totalBaseCents / totalBetCents) * 100).toFixed(4)),
    bonusRtp: Number(((totalBonusCents / totalBetCents) * 100).toFixed(4)),
    hitRate: percent(hitCount),
    zeroWinRate: percent(spins - hitCount),
    bonusTriggerCount,
    bonusFrequency: bonusTriggerCount ? `1 in ${(spins / bonusTriggerCount).toFixed(2)}` : "none observed",
    averageBonusWinMultiplier: bonuses.length ? Number((bonuses.reduce((a, b) => a + b, 0) / bonuses.length).toFixed(4)) : 0,
    medianBonusWinMultiplier: Number(median(bonuses).toFixed(4)),
    averageTumblesPerPaidSpin: Number((tumbleCount / spins).toFixed(4)),
    maximumTumblesSeen: maxTumbles,
    averageWinningTumbles: Number((winningTumbleCount / spins).toFixed(4)),
    averageWinMultiplier: Number((wins.reduce((a, b) => a + b, 0) / spins).toFixed(4)),
    medianWinMultiplier: Number(median(wins).toFixed(4)),
    maxObservedWinMultiplier: Number(maxObservedWinMultiplier.toFixed(4)),
    frequency100x: percent(wins.filter((value) => value >= 100).length),
    frequency250x: percent(wins.filter((value) => value >= 250).length),
    frequency500x: percent(wins.filter((value) => value >= 500).length),
    frequency1000x: percent(wins.filter((value) => value >= 1000).length),
    frequency2500x: percent(wins.filter((value) => value >= 2500).length),
    frequency5000x: percent(wins.filter((value) => value >= 5000).length),
    freeSpinRetriggerRate: freeSpinCount ? Number(((retriggeredFreeSpins / freeSpinCount) * 100).toFixed(4)) : 0,
    averageFreeSpinsPerBonus: bonusTriggerCount ? Number((freeSpinCount / bonusTriggerCount).toFixed(4)) : 0,
    multiplierCoreFrequency: freeRefillCells ? Number(((coreCells / freeRefillCells) * 100).toFixed(4)) : 0,
    averageCoreCellsPerFreeRefill: freeRefills ? Number((coreCells / freeRefills).toFixed(4)) : 0,
    baseCoreSpawnFrequency: Number(((baseCoreCells / Math.max(1, baseRefillCells)) * 100).toFixed(4)),
    baseCorePaidSpinFrequency: percent(baseCorePaidSpinCount),
    baseCoreAverageValue: baseCoreValues.length ? Number((baseCoreValues.reduce((sum, value) => sum + value, 0) / baseCoreValues.length).toFixed(4)) : 0,
    baseCore50xFrequency: Number(((baseCoreValues.filter((value) => value === 50).length / spins) * 100).toFixed(4)),
    baseCore100xFrequency: Number(((baseCoreValues.filter((value) => value === 100).length / spins) * 100).toFixed(4)),
    baseCore250xFrequency: Number(((baseCoreValues.filter((value) => value === 250).length / spins) * 100).toFixed(4)),
    baseCore500xFrequency: Number(((baseCoreValues.filter((value) => value === 500).length / spins) * 100).toFixed(4)),
    bonusCoreSpawnFrequency: Number(((coreCells / Math.max(1, freeRefillCells)) * 100).toFixed(4)),
    bonusInitialCoreSpawnFrequency: Number(((bonusInitialCoreCells / Math.max(1, bonusInitialBoardCells)) * 100).toFixed(4)),
    bonusCoreAverageValue: bonusCoreValues.length ? Number((bonusCoreValues.reduce((sum, value) => sum + value, 0) / bonusCoreValues.length).toFixed(4)) : 0,
    bonusRefillCoreAverageValue: bonusRefillCoreValues.length ? Number((bonusRefillCoreValues.reduce((sum, value) => sum + value, 0) / bonusRefillCoreValues.length).toFixed(4)) : 0,
    bonusInitialCoreAverageValue: bonusInitialCoreValues.length ? Number((bonusInitialCoreValues.reduce((sum, value) => sum + value, 0) / bonusInitialCoreValues.length).toFixed(4)) : 0,
    bonusCore50xFrequency: Number(((bonusCoreValues.filter((value) => value === 50).length / spins) * 100).toFixed(4)),
    bonusCore100xFrequency: Number(((bonusCoreValues.filter((value) => value === 100).length / spins) * 100).toFixed(4)),
    bonusCore250xFrequency: Number(((bonusCoreValues.filter((value) => value === 250).length / spins) * 100).toFixed(4)),
    bonusCore500xFrequency: Number(((bonusCoreValues.filter((value) => value === 500).length / spins) * 100).toFixed(4)),
    averageCombinedCoreMultiplier: coreTumbles ? Number((coreTotal / coreTumbles).toFixed(4)) : 0,
    highestCoreTotalObserved,
    coreRtpContribution: Number(((coreContributionCents / totalBetCents) * 100).toFixed(4)),
    returnDecompositionDifferenceCents: totalReturnCents - totalBaseCents - totalBonusCents,
    averageRawSequenceMultiplier: sequenceCount ? Number((rawSequenceTotal / sequenceCount).toFixed(4)) : 0,
    averageFinalSequenceMultiplier: sequenceCount ? Number((finalSequenceTotal / sequenceCount).toFixed(4)) : 0,
    averageCoreUpliftMultiplier: sequenceCount ? Number(((finalSequenceTotal - rawSequenceTotal) / sequenceCount).toFixed(4)) : 0,
    chainRate: percent(chainedSpinCount),
    runLengthDistribution,
    symbolHitCounts,
    initialEightPlusFrequency: percent(initialEightPlusCount),
    twoTumbleFrequency: percent(twoTumbleCount),
    threeTumbleFrequency: percent(threeTumbleCount),
    fourTumbleFrequency: percent(fourTumbleCount),
    exactTwoTumbleFrequency: percent(exactTwoTumbleCount),
    exactThreeTumbleFrequency: percent(exactThreeTumbleCount),
    exactFourTumbleFrequency: percent(exactFourTumbleCount),
    totalTumbleEvents,
    bonusRetriggerRate: Number(((bonusSessionsWithRetrigger / Math.max(1, bonusTriggerCount)) * 100).toFixed(4)),
     configuredCopyBranchProbability: Number((NORMAL_PAIR_COPY_CHANCE * 100).toFixed(4)),
     observedCopyBranchProbability: pairBranches.copyBranchRate,
     observedSecondSameProbability: pairBranches.actualSecondSameRate,
     sampledNormalPairs: pairBranches.sampledPairs,
     thirdPositionSamples: pairBranches.thirdPositionSamples,
     thirdMatchesPreviousSecondProbability: pairBranches.thirdMatchesPreviousSecondRate,
     initialBoardPairFrequency: Number(((pairMetrics.initialBoardsWithPair / Math.max(1, pairMetrics.initialBoards)) * 100).toFixed(4)),
     refillPairFrequency: Number(((pairMetrics.refillEventsWithPair / Math.max(1, pairMetrics.refillEvents)) * 100).toFixed(4)),
    observedSingleProbability: (() => {
      const total = (runLengthDistribution["1"] ?? 0) + (runLengthDistribution["2"] ?? 0);
      return total ? Number((((runLengthDistribution["1"] ?? 0) / total) * 100).toFixed(4)) : 0;
    })(),
    observedPairProbability: (() => {
      const total = (runLengthDistribution["1"] ?? 0) + (runLengthDistribution["2"] ?? 0);
      return total ? Number((((runLengthDistribution["2"] ?? 0) / total) * 100).toFixed(4)) : 0;
    })(),
    maximumContiguousNormal: runMetrics.maximumContiguousNormal,
    averageUniqueNormalSymbolsPerColumn: Number((runMetrics.uniqueNormalTotal / Math.max(1, runMetrics.visibleColumns)).toFixed(4)),
    visiblePairFrequency: Number(((runMetrics.visiblePairColumns / Math.max(1, runMetrics.visibleColumns)) * 100).toFixed(4)),
    columnThreeSameFrequency: Number(((runMetrics.columnsWithThree / Math.max(1, runMetrics.visibleColumns)) * 100).toFixed(4)),
    columnFourSameFrequency: Number(((runMetrics.columnsWithFour / Math.max(1, runMetrics.visibleColumns)) * 100).toFixed(4)),
    columnFiveSameFrequency: Number(((runMetrics.columnsWithFive / Math.max(1, runMetrics.visibleColumns)) * 100).toFixed(4)),
    symbolAppearanceCounts,
    symbolAppearanceDenominators: {
      initialBoardCells,
      refillCells,
      visibleCells,
    },
    symbolAppearanceRates: {
      initialBoard: percentageByDenominator(symbolAppearanceCounts.initialBoard, initialBoardCells),
      refill: percentageByDenominator(symbolAppearanceCounts.refill, refillCells),
      visible: percentageByDenominator(symbolAppearanceCounts.visible, visibleCells),
    },
    galatasarayExplosionCount,
    galatasarayExplosionRate: Number(((galatasarayExplosionCount / Math.max(1, totalTumbleEvents)) * 100).toFixed(4)),
    galatasarayExplosionPerPaidSpinRate: percent(galatasarayExplosionCount),
    galatasarayExplosionCounts,
    galatasarayExplosionRates,
    sequenceCorePercentage: Number(((coreSequenceCount / Math.max(1, sequenceCount)) * 100).toFixed(4)),
    averageActiveCoresAtSettlement: Number((activeCoreCountTotal / Math.max(1, coreSequenceCount)).toFixed(4)),
    coreValueDistribution,
    histogram,
  };
}

export async function saveSimulationReport(report: SimulationReport) {
  await mkdir("simulation-results", { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = `simulation-results/${timestamp}-${report.seed}.json`;
  const summaryPath = `simulation-results/${timestamp}-${report.seed}.md`;
  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  await writeFile(summaryPath, formatSimulationSummary(report));
  return { jsonPath, summaryPath };
}

export function formatSimulationSummary(report: SimulationReport) {
  const symbolRows = OBSERVED_SYMBOL_KEYS
    .map((symbol) => `| ${symbol} | ${report.symbolAppearanceCounts.initialBoard[symbol]} | ${report.symbolAppearanceCounts.refill[symbol]} | ${report.symbolAppearanceCounts.visible[symbol]} | ${report.symbolAppearanceRates.initialBoard[symbol]}% | ${report.symbolAppearanceRates.refill[symbol]}% | ${report.symbolAppearanceRates.visible[symbol]}% |`)
    .join("\n");
  const gsRows = GS_EXPLOSION_BUCKETS
    .map((bucketKey) => `| ${bucketKey} | ${report.galatasarayExplosionCounts[bucketKey]} | ${report.galatasarayExplosionRates[bucketKey]}% |`)
    .join("\n");

  return `# Cascade 8 — 10M RTP Analytics

## Run

| Metric | Value |
| --- | ---: |
| Seed | \`${report.seed}\` |
| Paid spins | ${report.totalSpins.toLocaleString("en-US")} |
| Bet | ${(report.betCents / 100).toFixed(2)} |
| Total bet | ${(report.totalBetCents / 100).toFixed(2)} |
| Total return | ${(report.totalReturnCents / 100).toFixed(2)} |
| Return decomposition delta | ${report.returnDecompositionDifferenceCents} cents |

## RTP and wins

| Metric | Value |
| --- | ---: |
| Overall RTP | ${report.overallRtp}% |
| Normal game RTP | ${report.baseGameRtp}% |
| Free Spin RTP | ${report.bonusRtp}% |
| Settlement Core RTP contribution | ${report.coreRtpContribution}% |
| Hit rate | ${report.hitRate}% |
| Initial board 8+ rate | ${report.initialEightPlusFrequency}% |
| 100x+ frequency | ${report.frequency100x}% |
| 500x+ frequency | ${report.frequency500x}% |
| 1000x+ frequency | ${report.frequency1000x}% |
| Maximum observed spin win | ${report.maxObservedWinMultiplier}x |

## Bonus

| Metric | Value |
| --- | ---: |
| Bonus trigger count | ${report.bonusTriggerCount.toLocaleString("en-US")} |
| Bonus frequency | ${report.bonusFrequency} |
| Average bonus win | ${report.averageBonusWinMultiplier}x |
| Bonus retrigger rate | ${report.bonusRetriggerRate}% |
| Free Spin retrigger rate | ${report.freeSpinRetriggerRate}% |
| Average Free Spins per bonus | ${report.averageFreeSpinsPerBonus} |

## Core

| Metric | Value |
| --- | ---: |
| Normal Core spawn rate / base refill cell | ${report.baseCoreSpawnFrequency}% |
| Paid spins with at least one Normal Core | ${report.baseCorePaidSpinFrequency}% |
| Normal Core average value | ${report.baseCoreAverageValue}x |
| Free Spin initial Core spawn rate / cell | ${report.bonusInitialCoreSpawnFrequency}% |
| Free Spin refill Core spawn rate / refill cell | ${report.bonusCoreSpawnFrequency}% |
| Free Spin Core average value, all | ${report.bonusCoreAverageValue}x |
| Free Spin initial Core average value | ${report.bonusInitialCoreAverageValue}x |
| Free Spin refill Core average value | ${report.bonusRefillCoreAverageValue}x |
| Free Spin refill average Core count | ${report.averageCoreCellsPerFreeRefill} |
| Average combined Core multiplier | ${report.averageCombinedCoreMultiplier}x |
| Highest observed total Core value | ${report.highestCoreTotalObserved}x |

## Tumbles and pairs

| Metric | Value |
| --- | ---: |
| Average tumbles per paid spin | ${report.averageTumblesPerPaidSpin} |
| Exact 2 tumble frequency | ${report.exactTwoTumbleFrequency}% |
| Exact 3 tumble frequency | ${report.exactThreeTumbleFrequency}% |
| Exact 4 tumble frequency | ${report.exactFourTumbleFrequency}% |
| Cumulative 2+ / 3+ / 4+ frequency | ${report.twoTumbleFrequency}% / ${report.threeTumbleFrequency}% / ${report.fourTumbleFrequency}% |
| Maximum tumble count | ${report.maximumTumblesSeen} |
| Initial board pair frequency | ${report.initialBoardPairFrequency}% |
| Refill pair frequency | ${report.refillPairFrequency}% |
| Visible pair frequency | ${report.visiblePairFrequency}% |
| 3 / 4 / 5 same-symbol column frequency | ${report.columnThreeSameFrequency}% / ${report.columnFourSameFrequency}% / ${report.columnFiveSameFrequency}% |

## Symbol observations

Rates are percentages of the corresponding cell denominator. Hit counts are winning-symbol events, not raw cell appearances.

| Symbol | Initial count | Refill count | Visible count | Initial rate | Refill rate | Visible rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${symbolRows}

## Galatasaray explosions

Definition: every tumble/screen event where Galatasaray has at least 8 winning cells. Explosion rate is per all tumble/screen events; paid-spin rate is reported separately.

| Metric | Value |
| --- | ---: |
| Total explosion events | ${report.galatasarayExplosionCount} |
| Explosion rate / tumble event | ${report.galatasarayExplosionRate}% |
| Explosion rate / paid spin | ${report.galatasarayExplosionPerPaidSpinRate}% |

| GS winning cells | Events | Rate / tumble event |
| --- | ---: | ---: |
${gsRows}

## Validation

| Check | Value |
| --- | ---: |
| Total return = base + bonus | ${report.returnDecompositionDifferenceCents === 0 ? "PASS" : "CHECK"} |
| Overall RTP - normal RTP - Free Spin RTP | ${(report.overallRtp - report.baseGameRtp - report.bonusRtp).toFixed(4)} percentage points |
`;
}
