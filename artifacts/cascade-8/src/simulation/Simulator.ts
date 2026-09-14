import { mkdir, writeFile } from "node:fs/promises";
import { playSpin } from "../engine/SlotEngine";
import { SeededRNG } from "../engine/RNG";
import { evaluateBoard } from "../engine/WinEvaluator";
import { BASE_REEL_CONFIG } from "../config/GameConfig";
import { getNormalSymbol, isMultiplierCore } from "../engine/types";
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

type PacketMetrics = {
  packetSingles: number;
  packetDoubles: number;
  initialBoards: number;
  initialBoardsWithDouble: number;
  refillEvents: number;
  refillEventsWithDouble: number;
};

function recordPackets(
  cells: BoardCell[],
  source: "initial" | "refill",
  context: string,
  seen: Set<string>,
  metrics: PacketMetrics,
) {
  if (source === "initial") metrics.initialBoards += 1;
  if (source === "refill") metrics.refillEvents += 1;
  let hasDouble = false;
  cells.forEach((cell) => {
    if (typeof cell === "string" || cell.kind !== "NORMAL_SYMBOL") return;
    const packetKey = `${context}:${cell.stackId}`;
    if (seen.has(packetKey)) return;
    seen.add(packetKey);
    if (cell.stackSize === 2) {
      metrics.packetDoubles += 1;
      hasDouble = true;
    } else {
      metrics.packetSingles += 1;
    }
  });
  if (source === "initial" && hasDouble) metrics.initialBoardsWithDouble += 1;
  if (source === "refill" && hasDouble) metrics.refillEventsWithDouble += 1;
}

export type SimulationReport = {
  seed: string;
  totalSpins: number;
  betCents: number;
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
  bonusCoreAverageValue: number;
  bonusCore50xFrequency: number;
  bonusCore100xFrequency: number;
  bonusCore250xFrequency: number;
  bonusCore500xFrequency: number;
  averageCombinedCoreMultiplier: number;
  highestCoreTotalObserved: number;
  coreRtpContribution: number;
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
  configuredSingleProbability: number;
  configuredPairProbability: number;
  observedPacketSingleProbability: number;
  observedPacketDoubleProbability: number;
  initialBoardDoubleStackFrequency: number;
  refillDoubleStackFrequency: number;
  observedSingleProbability: number;
  observedPairProbability: number;
  maximumContiguousNormal: number;
  averageUniqueNormalSymbolsPerColumn: number;
  visiblePairFrequency: number;
  columnThreeSameFrequency: number;
  columnFourSameFrequency: number;
  columnFiveSameFrequency: number;
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
  let tumbleCount = 0;
  let winningTumbleCount = 0;
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
  let activeCoreCountTotal = 0;
  let coreSequenceCount = 0;
  let highestCoreTotalObserved = 0;
  const runLengthDistribution: Record<string, number> = {};
  const symbolHitCounts: Record<string, number> = {};
  const runMetrics: RunMetrics = {
    maximumContiguousNormal: 0, visiblePairColumns: 0, visibleColumns: 0,
    columnsWithThree: 0, columnsWithFour: 0, columnsWithFive: 0, uniqueNormalTotal: 0,
  };
  const packetMetrics: PacketMetrics = {
    packetSingles: 0,
    packetDoubles: 0,
    initialBoards: 0,
    initialBoardsWithDouble: 0,
    refillEvents: 0,
    refillEventsWithDouble: 0,
  };
  const coreValueDistribution: Record<string, number> = {};
  let maxObservedWinMultiplier = 0;
  let maxTumbles = 0;
  for (let index = 0; index < spins; index += 1) {
    const result = playSpin(betCents, source);
    const seenPackets = new Set<string>();
    recordPackets(result.initialBoard.flat(), "initial", `base:${index}`, seenPackets, packetMetrics);
    recordRuns(result.initialBoard, runLengthDistribution, runMetrics);
    if (evaluateBoard(result.initialBoard).winningCells.length) initialEightPlusCount += 1;
    result.freeSpins.forEach((freeSpin, freeSpinIndex) => {
      recordPackets(freeSpin.initialBoard.flat(), "initial", `bonus:${index}:${freeSpinIndex}`, seenPackets, packetMetrics);
      recordRuns(freeSpin.initialBoard, runLengthDistribution, runMetrics);
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
    }
    const totalTumbles = result.tumbles.length + result.freeSpins.reduce((sum, spin) => sum + spin.tumbles.length, 0);
    tumbleCount += totalTumbles;
    winningTumbleCount += totalTumbles;
    maxTumbles = Math.max(maxTumbles, totalTumbles);
    if (totalTumbles >= 2) twoTumbleCount += 1;
    if (totalTumbles >= 3) threeTumbleCount += 1;
    if (totalTumbles >= 4) fourTumbleCount += 1;
    freeSpinCount += result.freeSpins.length;
    for (const freeSpin of result.freeSpins) {
      if (freeSpin.retriggered > 0) retriggeredFreeSpins += freeSpin.retriggered;
    }
    for (const tumble of [...result.tumbles, ...result.freeSpins.flatMap((spin) => spin.tumbles)]) {
      const isFree = result.freeSpins.some((spin) => spin.tumbles.includes(tumble));
    if (isFree) {
        freeRefills += 1;
        coreCells += tumble.newSymbols.filter((cell) => isMultiplierCore(cell)).length;
        freeRefillCells += tumble.newSymbols.length;
      }
      const context = isFree ? `bonus:${index}` : `base:${index}`;
      recordPackets(tumble.newSymbols, "refill", context, seenPackets, packetMetrics);
      tumble.winningSymbols.forEach((symbol) => {
        symbolHitCounts[symbol] = (symbolHitCounts[symbol] ?? 0) + 1;
      });
    }
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
  return {
    seed,
    totalSpins: spins,
    betCents,
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
    bonusCoreAverageValue: bonusCoreValues.length ? Number((bonusCoreValues.reduce((sum, value) => sum + value, 0) / bonusCoreValues.length).toFixed(4)) : 0,
    bonusCore50xFrequency: Number(((bonusCoreValues.filter((value) => value === 50).length / spins) * 100).toFixed(4)),
    bonusCore100xFrequency: Number(((bonusCoreValues.filter((value) => value === 100).length / spins) * 100).toFixed(4)),
    bonusCore250xFrequency: Number(((bonusCoreValues.filter((value) => value === 250).length / spins) * 100).toFixed(4)),
    bonusCore500xFrequency: Number(((bonusCoreValues.filter((value) => value === 500).length / spins) * 100).toFixed(4)),
    averageCombinedCoreMultiplier: coreTumbles ? Number((coreTotal / coreTumbles).toFixed(4)) : 0,
    highestCoreTotalObserved,
    coreRtpContribution: Number(((coreContributionCents / totalBetCents) * 100).toFixed(4)),
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
    configuredSingleProbability: Number(((BASE_REEL_CONFIG.packetWeights.find((entry) => entry.value === 1)!.weight / BASE_REEL_CONFIG.packetWeights.reduce((sum, entry) => sum + entry.weight, 0)) * 100).toFixed(4)),
    configuredPairProbability: Number(((BASE_REEL_CONFIG.packetWeights.find((entry) => entry.value === 2)!.weight / BASE_REEL_CONFIG.packetWeights.reduce((sum, entry) => sum + entry.weight, 0)) * 100).toFixed(4)),
    observedPacketSingleProbability: Number(((packetMetrics.packetSingles / Math.max(1, packetMetrics.packetSingles + packetMetrics.packetDoubles)) * 100).toFixed(4)),
    observedPacketDoubleProbability: Number(((packetMetrics.packetDoubles / Math.max(1, packetMetrics.packetSingles + packetMetrics.packetDoubles)) * 100).toFixed(4)),
    initialBoardDoubleStackFrequency: Number(((packetMetrics.initialBoardsWithDouble / Math.max(1, packetMetrics.initialBoards)) * 100).toFixed(4)),
    refillDoubleStackFrequency: Number(((packetMetrics.refillEventsWithDouble / Math.max(1, packetMetrics.refillEvents)) * 100).toFixed(4)),
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
    sequenceCorePercentage: Number(((coreSequenceCount / Math.max(1, sequenceCount)) * 100).toFixed(4)),
    averageActiveCoresAtSettlement: Number((activeCoreCountTotal / Math.max(1, coreSequenceCount)).toFixed(4)),
    coreValueDistribution,
    histogram,
  };
}

export async function saveSimulationReport(report: SimulationReport) {
  await mkdir("simulation-results", { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `simulation-results/${timestamp}-${report.seed}.json`;
  await writeFile(path, JSON.stringify(report, null, 2));
  return path;
}