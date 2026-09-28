import {
  ADVANCED_ALARM_OPTIONS,
  ADVANCED_PAYOUT_TABLES,
  CADI_KAZAN_ADVANCED_CELL_COUNT,
  type AdvancedAlarmCount,
} from "./types";

export const ADVANCED_SIMULATION_SCENARIOS = [
  "1-safe",
  "3-safe",
  "5-safe",
  "random",
  "conservative",
  "aggressive",
] as const;

export type AdvancedSimulationScenario = (typeof ADVANCED_SIMULATION_SCENARIOS)[number];

export type AdvancedSimulationResult = {
  bombCount: AdvancedAlarmCount;
  scenario: AdvancedSimulationScenario;
  trials: number;
  rtp: number;
  bustRate: number;
  averagePayoutMultiplier: number;
  maxPayoutFrequency: number;
};

type RandomSource = () => number;

function createRandomSource(seed: number): RandomSource {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}

function targetSafeCount(
  scenario: AdvancedSimulationScenario,
  safeCellCount: number,
  random: RandomSource,
) {
  if (scenario === "aggressive") return safeCellCount;
  if (scenario === "conservative" || scenario === "1-safe") return 1;
  if (scenario === "3-safe") return Math.min(3, safeCellCount);
  if (scenario === "5-safe") return Math.min(5, safeCellCount);
  return 1 + Math.floor(random() * safeCellCount);
}

function runTrial(
  bombCount: AdvancedAlarmCount,
  scenario: AdvancedSimulationScenario,
  random: RandomSource,
) {
  const table = ADVANCED_PAYOUT_TABLES[bombCount];
  const safeCellCount = CADI_KAZAN_ADVANCED_CELL_COUNT - bombCount;
  const target = targetSafeCount(scenario, safeCellCount, random);
  let remainingCells = CADI_KAZAN_ADVANCED_CELL_COUNT;
  let remainingSafe = safeCellCount;
  for (let step = 1; step <= target; step += 1) {
    if (random() >= remainingSafe / remainingCells) {
      return { bust: true, multiplierBps: 0, maxPayout: false };
    }
    remainingCells -= 1;
    remainingSafe -= 1;
  }
  const multiplierBps = table.multipliersBps[target - 1] ?? 0;
  return {
    bust: false,
    multiplierBps,
    maxPayout: multiplierBps === Math.max(...table.multipliersBps),
  };
}

export function simulateAdvancedEconomy(trials = 1_000_000, seed = 0xcad1ca7a) {
  if (!Number.isInteger(trials) || trials < 1) throw new Error("SIMULATION_TRIALS_MUST_BE_POSITIVE");
  const results: AdvancedSimulationResult[] = [];
  ADVANCED_ALARM_OPTIONS.forEach((bombCount, bombIndex) => {
    ADVANCED_SIMULATION_SCENARIOS.forEach((scenario, scenarioIndex) => {
      const random = createRandomSource(seed + bombIndex * 101 + scenarioIndex * 10_007);
      let payoutMultiplierTotal = 0;
      let busts = 0;
      let maxPayouts = 0;
      for (let trial = 0; trial < trials; trial += 1) {
        const outcome = runTrial(bombCount, scenario, random);
        payoutMultiplierTotal += outcome.multiplierBps / 100;
        if (outcome.bust) busts += 1;
        if (outcome.maxPayout) maxPayouts += 1;
      }
      const averagePayoutMultiplier = payoutMultiplierTotal / trials;
      results.push({
        bombCount,
        scenario,
        trials,
        rtp: averagePayoutMultiplier,
        bustRate: busts / trials,
        averagePayoutMultiplier,
        maxPayoutFrequency: maxPayouts / trials,
      });
    });
  });
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const trials = Number(process.argv[2] ?? 1_000_000);
  console.log(JSON.stringify({
    trials,
    tables: Object.fromEntries(ADVANCED_ALARM_OPTIONS.map((bombCount) => [
      bombCount,
      ADVANCED_PAYOUT_TABLES[bombCount].multipliersBps.map((value) => value / 100),
    ])),
    results: simulateAdvancedEconomy(trials),
  }, null, 2));
}