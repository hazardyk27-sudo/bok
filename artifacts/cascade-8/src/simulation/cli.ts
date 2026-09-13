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
    "Average Win": `${report.averageWinMultiplier}x`,
    "Median Win": `${report.medianWinMultiplier}x`,
    "Max Observed Win": `${report.maxObservedWinMultiplier}x`,
    "Crystal Trigger Frequency": `${report.multiplierCrystalTriggerFrequency}%`,
  });
  console.log(`Histogram: ${JSON.stringify(report.histogram)}`);
  console.log(`Saved report: ${await saveSimulationReport(report)}`);
}

void main();