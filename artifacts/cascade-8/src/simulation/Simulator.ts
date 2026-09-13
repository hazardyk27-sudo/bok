import { mkdir, writeFile } from "node:fs/promises";
import { playSpin } from "../engine/SlotEngine";
import { SeededRNG } from "../engine/RNG";

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
  multiplierCrystalTriggerFrequency: number;
  averageCrystalMultiplier: number;
  highestCrystalTotalObserved: number;
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
  let crystalTumbles = 0;
  let crystalMultiplierTotal = 0;
  let highestCrystalTotalObserved = 0;
  let maxObservedWinMultiplier = 0;
  let maxTumbles = 0;
  for (let index = 0; index < spins; index += 1) {
    const result = playSpin(betCents, source);
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
    freeSpinCount += result.freeSpins.length;
    for (const freeSpin of result.freeSpins) {
      if (freeSpin.retriggered > 0) retriggeredFreeSpins += freeSpin.retriggered;
    }
    for (const tumble of [...result.tumbles, ...result.freeSpins.flatMap((spin) => spin.tumbles)]) {
      if (tumble.crystals.length) {
        crystalTumbles += 1;
        crystalMultiplierTotal += tumble.crystalTotalMultiplier;
        highestCrystalTotalObserved = Math.max(highestCrystalTotalObserved, tumble.crystalTotalMultiplier);
      }
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
    multiplierCrystalTriggerFrequency: winningTumbleCount ? Number(((crystalTumbles / winningTumbleCount) * 100).toFixed(4)) : 0,
    averageCrystalMultiplier: crystalTumbles ? Number((crystalMultiplierTotal / crystalTumbles).toFixed(4)) : 0,
    highestCrystalTotalObserved,
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