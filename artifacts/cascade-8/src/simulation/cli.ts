import { saveSimulationReport, simulate } from "./Simulator";

const spinsArg = process.argv.find((arg) => arg.startsWith("--spins="))?.split("=")[1] ?? "100000";
const seed = process.argv.find((arg) => arg.startsWith("--seed="))?.split("=")[1] ?? "12345";
const spins = Math.max(1, Number.parseInt(spinsArg, 10));

async function main() {
  console.log(`Running ${spins.toLocaleString()} spins with seed ${seed}...`);
  const report = simulate(spins, seed, 100, (completed) => {
    if (spins >= 1_000_000) console.log(`  ${completed.toLocaleString()} / ${spins.toLocaleString()}`);
  });
  console.table({
    "Total Spins": report.totalSpins,
    "Total Bet": report.totalBetCents / 100,
    "Total Return": report.totalReturnCents / 100,
    "Overall RTP": `${report.overallRtp}%`,
    "Base Game RTP": `${report.baseGameRtp}%`,
    "Bonus RTP": `${report.bonusRtp}%`,
    "Hit Rate": `${report.hitRate}%`,
    "Zero-win Rate": `${report.zeroWinRate}%`,
    "Bonus Trigger Count": report.bonusTriggerCount,
    "Bonus Frequency": report.bonusFrequency,
    "Average Bonus Win": `${report.averageBonusWinMultiplier}x`,
    "Median Bonus Win": `${report.medianBonusWinMultiplier}x`,
    "Average Tumbles": report.averageTumblesPerPaidSpin,
    "Maximum Tumbles": report.maximumTumblesSeen,
     "Initial 8+ Frequency": `${report.initialEightPlusFrequency}%`,
     "2+ / 3+ / 4+ Tumbles": `${report.twoTumbleFrequency}% / ${report.threeTumbleFrequency}% / ${report.fourTumbleFrequency}%`,
    "Average Win": `${report.averageWinMultiplier}x`,
    "Median Win": `${report.medianWinMultiplier}x`,
    "Max Observed Win": `${report.maxObservedWinMultiplier}x`,
     "Core Spawn Frequency": `${report.multiplierCoreFrequency}%`,
     "Avg Core Cells / Free Refill": report.averageCoreCellsPerFreeRefill,
     "Base Core / Refill Cell": `${report.baseCoreSpawnFrequency}%`,
     "Base Paid Spins With Core": `${report.baseCorePaidSpinFrequency}%`,
     "Base Avg Core Value": `${report.baseCoreAverageValue}x`,
     "Base 50 / 100 / 250 / 500x": `${report.baseCore50xFrequency}% / ${report.baseCore100xFrequency}% / ${report.baseCore250xFrequency}% / ${report.baseCore500xFrequency}%`,
     "Bonus Avg Core Value": `${report.bonusCoreAverageValue}x`,
     "Bonus 50 / 100 / 250 / 500x": `${report.bonusCore50xFrequency}% / ${report.bonusCore100xFrequency}% / ${report.bonusCore250xFrequency}% / ${report.bonusCore500xFrequency}%`,
     "Avg Combined Core": `${report.averageCombinedCoreMultiplier}x`,
     "Core RTP Contribution": `${report.coreRtpContribution}%`,
     "Avg Raw Sequence": `${report.averageRawSequenceMultiplier}x`,
     "Avg Final Sequence": `${report.averageFinalSequenceMultiplier}x`,
     "Avg Core Uplift": `${report.averageCoreUpliftMultiplier}x`,
     "Chain Rate": `${report.chainRate}%`,
     "Configured Singles / Pairs": `${report.configuredSingleProbability}% / ${report.configuredPairProbability}%`,
      "Observed Visible Runs": `${report.observedSingleProbability}% / ${report.observedPairProbability}%`,
      "Observed Packets S / D": `${report.observedPacketSingleProbability}% / ${report.observedPacketDoubleProbability}%`,
      "Initial Boards With Double": `${report.initialBoardDoubleStackFrequency}%`,
      "Refill Events With Double": `${report.refillDoubleStackFrequency}%`,
     "Maximum Normal Streak": report.maximumContiguousNormal,
     "Unique Normals / Column": report.averageUniqueNormalSymbolsPerColumn,
     "Visible Pair Frequency": `${report.visiblePairFrequency}%`,
     "3 / 4 / 5 Same Column": `${report.columnThreeSameFrequency}% / ${report.columnFourSameFrequency}% / ${report.columnFiveSameFrequency}%`,
     "Sequences With Cores": `${report.sequenceCorePercentage}%`,
     "Active Cores / Settlement": report.averageActiveCoresAtSettlement,
     "Run Lengths": JSON.stringify(report.runLengthDistribution),
     "Symbol Hits": JSON.stringify(report.symbolHitCounts),
     "Core Distribution": JSON.stringify(report.coreValueDistribution),
  });
  console.log(`Histogram: ${JSON.stringify(report.histogram)}`);
  console.log(`Saved report: ${await saveSimulationReport(report)}`);
}

void main();