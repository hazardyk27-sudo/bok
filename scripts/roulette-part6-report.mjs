import fs from 'node:fs';

const inputPath =
  process.env.ROULETTE_PART6_OUTPUT ??
  'artifacts/roulette-physics-lab/part6-runtime-result.json';
const reportPath =
  process.env.ROULETTE_PART6_EVIDENCE ??
  'artifacts/roulette-physics-lab/part6-calibration-evidence.json';

if (!fs.existsSync(inputPath)) {
  throw new Error('PART 6 runtime result not found at ' + inputPath);
}

const runtime = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const telemetry = runtime.telemetry;
if (!telemetry || !Array.isArray(telemetry.results)) {
  throw new Error('PART 6 runtime result has no structured telemetry.results payload.');
}

const results = telemetry.results;
const quantile = (values, q) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};
const seedsWhere = (predicate) =>
  results.filter(predicate).map((result) => result.seed);

const lapCounts = results.map((result) => result.lapCount).filter(Number.isFinite);
const contactRatios = results
  .map((result) => result.trackContactRatio)
  .filter(Number.isFinite);

const evidence = {
  schemaVersion: telemetry.schemaVersion ?? null,
  runtimeCapturedAt: runtime.capturedAt ?? null,
  telemetryStatus: telemetry.status ?? null,
  safetyStatus: telemetry.safetyStatus ?? null,
  calibrationStatus: telemetry.calibrationStatus ?? null,
  expectedSeedCount: 20,
  resultCount: results.length,
  completedCount: telemetry.completedCount ?? null,
  seedResetFailureSeeds: seedsWhere((result) => !result.stateResetVerified),
  telemetryIncompleteSeeds: seedsWhere((result) => !result.telemetryComplete),
  timeoutSeeds: seedsWhere((result) => result.timedOut),
  safetyFailureSeeds: seedsWhere((result) => !result.safetyPassed),
  phaseSequenceFailureSeeds: seedsWhere((result) => !result.phaseSequenceValid),
  hoverSeeds: seedsWhere((result) => result.hover),
  clippingSeeds: seedsWhere((result) => result.clipping),
  tunnelingSeeds: seedsWhere((result) => result.tunneling),
  escapedSeeds: seedsWhere((result) => result.escaped),
  velocitySpikeSeeds: seedsWhere((result) => result.velocitySpike),
  artificialAccelerationSeeds: seedsWhere(
    (result) => result.artificialAcceleration,
  ),
  outerLapDistribution: {
    min: lapCounts.length ? Math.min(...lapCounts) : null,
    p25: quantile(lapCounts, 0.25),
    median: quantile(lapCounts, 0.5),
    p75: quantile(lapCounts, 0.75),
    max: lapCounts.length ? Math.max(...lapCounts) : null,
    fourToFiveCount: results.filter((result) => result.outerLapTargetMet).length,
  },
  trackContactDistribution: {
    min: contactRatios.length ? Math.min(...contactRatios) : null,
    median: quantile(contactRatios, 0.5),
    max: contactRatios.length ? Math.max(...contactRatios) : null,
  },
  chainCounts: {
    inwardTransition: results.filter(
      (result) => result.inwardTransitionTime !== null,
    ).length,
    deflectorContact: results.filter(
      (result) => result.deflectorContactCount > 0,
    ).length,
    fretContact: results.filter((result) => result.fretContact).length,
    pocketEntry: results.filter((result) => result.pocketEntered).length,
    settled: results.filter((result) => result.settled).length,
  },
  perSeed: results.map((result) => ({
    seed: result.seed,
    lapCount: result.lapCount,
    trackContactRatio: result.trackContactRatio,
    inwardTransitionTime: result.inwardTransitionTime,
    deflectorContactCount: result.deflectorContactCount,
    pocketEntered: result.pocketEntered,
    settled: result.settled,
    timedOut: result.timedOut,
    safetyPassed: result.safetyPassed,
    phases: Array.isArray(result.phases)
      ? result.phases.map((event) => event.phase)
      : [],
  })),
};

fs.writeFileSync(reportPath, JSON.stringify(evidence, null, 2));
console.log('PART6_CALIBRATION_EVIDENCE ' + JSON.stringify(evidence));
