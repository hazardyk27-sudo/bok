import fs from 'node:fs';

const browserLogPath = process.argv[2] ?? 'part10a-browser-61006.log';
const serverLogPath = process.argv[3] ?? 'part10a-server-61006.log';
const browserJsonPath =
  process.argv[4] ??
  'artifacts/roulette-physics-lab/part10a-browser-61006.json';
const serverJsonPath =
  process.argv[5] ?? 'part10a-server-result-61006.json';
const outputPath =
  process.argv[6] ?? 'part10a-61006-divergence-summary.json';

const browserLines = fs.readFileSync(browserLogPath, 'utf8').split(/\r?\n/);
const serverLines = fs.readFileSync(serverLogPath, 'utf8').split(/\r?\n/);

const browser = [];
for (const line of browserLines) {
  const marker = 'BROWSER_CONSOLE ';
  const index = line.indexOf(marker);
  if (index < 0) continue;
  try {
    const outer = JSON.parse(line.slice(index + marker.length));
    const prefix = 'ROULETTE_PARITY_STEP ';
    if (!outer.text?.startsWith(prefix)) continue;
    const row = JSON.parse(outer.text.slice(prefix.length));
    if (Number(row.seed) === 61006) browser.push(row);
  } catch {}
}

const server = [];
for (const line of serverLines) {
  const prefix = 'ROULETTE_PARITY_STEP ';
  const index = line.indexOf(prefix);
  if (index < 0) continue;
  try {
    const row = JSON.parse(line.slice(index + prefix.length));
    if (Number(row.seed) === 61006) server.push(row);
  } catch {}
}

let browserStart = null;
for (const line of browserLines) {
  const marker = 'BROWSER_CONSOLE ';
  const index = line.indexOf(marker);
  if (index < 0) continue;
  try {
    const outer = JSON.parse(line.slice(index + marker.length));
    const prefix = 'PART10A_BROWSER_START ';
    if (outer.text?.startsWith(prefix)) {
      browserStart = JSON.parse(outer.text.slice(prefix.length));
      break;
    }
  } catch {}
}

const browserOutput = JSON.parse(fs.readFileSync(browserJsonPath, 'utf8'));
const browserRow =
  (browserOutput.telemetry?.results ?? browserOutput.seedTelemetry ?? [])[0] ??
  null;
const serverResult = JSON.parse(fs.readFileSync(serverJsonPath, 'utf8'));

const browserByStep = new Map(browser.map((row) => [row.step, row]));
const serverByStep = new Map(server.map((row) => [row.step, row]));
const commonSteps = [...browserByStep.keys()]
  .filter((step) => serverByStep.has(step))
  .sort((left, right) => left - right);

if (commonSteps.length === 0) {
  throw new Error(
    'No common seed 61006 parity rows. browser=' +
      browser.length +
      ' server=' +
      server.length,
  );
}

const vectorDelta = (left, right, key) =>
  Math.hypot(
    left[key].x - right[key].x,
    left[key].y - right[key].y,
    left[key].z - right[key].z,
  );

const thresholds = [1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1];
const firstVelocity = Object.fromEntries(
  thresholds.map((threshold) => [String(threshold), null]),
);
const firstPosition = Object.fromEntries(
  thresholds.map((threshold) => [String(threshold), null]),
);
const firstAngularVelocity = Object.fromEntries(
  thresholds.map((threshold) => [String(threshold), null]),
);

let firstContactMismatch = null;
let maxVelocityDelta = 0;
let maxPositionDelta = 0;
let maxAngularVelocityDelta = 0;
const rows = [];

for (const step of commonSteps) {
  const browserState = browserByStep.get(step);
  const serverState = serverByStep.get(step);
  const velocityDelta = vectorDelta(browserState, serverState, 'velocity');
  const positionDelta = vectorDelta(browserState, serverState, 'position');
  const angularVelocityDelta = vectorDelta(
    browserState,
    serverState,
    'angularVelocity',
  );

  maxVelocityDelta = Math.max(maxVelocityDelta, velocityDelta);
  maxPositionDelta = Math.max(maxPositionDelta, positionDelta);
  maxAngularVelocityDelta = Math.max(
    maxAngularVelocityDelta,
    angularVelocityDelta,
  );

  for (const threshold of thresholds) {
    const key = String(threshold);
    if (firstVelocity[key] === null && velocityDelta > threshold) {
      firstVelocity[key] = step;
    }
    if (firstPosition[key] === null && positionDelta > threshold) {
      firstPosition[key] = step;
    }
    if (
      firstAngularVelocity[key] === null &&
      angularVelocityDelta > threshold
    ) {
      firstAngularVelocity[key] = step;
    }
  }

  const contactMismatch =
    Boolean(browserState.darkRaceContact) !==
      Boolean(serverState.darkRaceContact) ||
    Boolean(browserState.outerWallContact) !==
      Boolean(serverState.outerWallContact);
  if (firstContactMismatch === null && contactMismatch) {
    firstContactMismatch = step;
  }

  rows.push({
    step,
    velocityDelta: Number(velocityDelta.toFixed(12)),
    positionDelta: Number(positionDelta.toFixed(12)),
    angularVelocityDelta: Number(angularVelocityDelta.toFixed(12)),
    browserRadius: browserState.radius,
    serverRadius: serverState.radius,
    browserRadialVelocity: browserState.radialVelocity,
    serverRadialVelocity: serverState.radialVelocity,
    browserVerticalVelocity: browserState.verticalVelocity,
    serverVerticalVelocity: serverState.verticalVelocity,
    browserContacts: browserState.contactRoles,
    serverContacts: serverState.contactRoles,
    browserDarkRaceContact: Boolean(browserState.darkRaceContact),
    serverDarkRaceContact: Boolean(serverState.darkRaceContact),
    browserOuterWallContact: Boolean(browserState.outerWallContact),
    serverOuterWallContact: Boolean(serverState.outerWallContact),
  });
}

const meaningfulCandidates = [
  firstVelocity['0.001'],
  firstPosition['0.001'],
  firstContactMismatch,
].filter((value) => value !== null);
const firstMeaningfulDivergence =
  meaningfulCandidates.length > 0
    ? Math.min(...meaningfulCandidates)
    : null;

const window =
  firstMeaningfulDivergence === null
    ? rows.slice(0, 12)
    : rows.filter(
        (row) => Math.abs(row.step - firstMeaningfulDivergence) <= 5,
      );

const serverStart = serverResult.startConditions ?? null;
const serverAngularVelocity =
  serverStart && Array.isArray(serverStart.ballSpinAxis)
    ? {
        x: serverStart.ballSpinAxis[0] * serverStart.ballSpin,
        y: serverStart.ballSpinAxis[1] * serverStart.ballSpin,
        z: serverStart.ballSpinAxis[2] * serverStart.ballSpin,
      }
    : null;
const browserStartPosition = browserStart?.ballPosition ?? null;
const browserStartVelocity = browserStart?.ballVelocity ?? null;
const browserStartAngularVelocity = browserStart?.ballAngularVelocity ?? null;
const serverStartPosition =
  serverStart && Array.isArray(serverStart.ballPosition)
    ? {
        x: serverStart.ballPosition[0],
        y: serverStart.ballPosition[1],
        z: serverStart.ballPosition[2],
      }
    : null;
const serverStartVelocity =
  serverStart && Array.isArray(serverStart.ballVelocity)
    ? {
        x: serverStart.ballVelocity[0],
        y: serverStart.ballVelocity[1],
        z: serverStart.ballVelocity[2],
      }
    : null;
const startVectorDelta = (left, right) =>
  left && right
    ? Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z)
    : null;

const summary = {
  seed: 61006,
  initialState: {
    browserStart,
    serverStartConditions: serverStart,
    positionDelta: startVectorDelta(
      browserStartPosition,
      serverStartPosition,
    ),
    velocityDelta: startVectorDelta(
      browserStartVelocity,
      serverStartVelocity,
    ),
    angularVelocityDelta: startVectorDelta(
      browserStartAngularVelocity,
      serverAngularVelocity,
    ),
    rotorAngleDelta:
      browserStart && serverStart
        ? Math.abs(
            browserStart.rotorStartAngle -
              serverStart.rotorInitialAngleRadians,
          )
        : null,
  },
  browserParityRows: browser.length,
  serverParityRows: server.length,
  commonRows: commonSteps.length,
  browserFirstStep: browser[0]?.step ?? null,
  browserLastStep: browser.at(-1)?.step ?? null,
  serverFirstStep: server[0]?.step ?? null,
  serverLastStep: server.at(-1)?.step ?? null,
  firstVelocityThreshold: firstVelocity,
  firstPositionThreshold: firstPosition,
  firstAngularVelocityThreshold: firstAngularVelocity,
  firstContactMismatch,
  firstMeaningfulDivergence,
  maxVelocityDelta: Number(maxVelocityDelta.toFixed(12)),
  maxPositionDelta: Number(maxPositionDelta.toFixed(12)),
  maxAngularVelocityDelta: Number(maxAngularVelocityDelta.toFixed(12)),
  browserLaunch: browserRow
    ? {
        launchAzimuth: browserRow.launchAzimuth,
        launchSpeed: browserRow.launchSpeed,
        launchSpeedMetersPerSecond: browserRow.launchSpeedMetersPerSecond,
        launchRadius: browserRow.launchRadius,
        launchHeight: browserRow.launchHeight,
        rotorStartAngle: browserRow.rotorStartAngle,
      }
    : null,
  serverStartConditions: serverResult.startConditions,
  browserSettled: browserRow?.settled ?? null,
  browserFinalPocketNumber: browserRow?.finalPocketNumber ?? null,
  serverStatus: serverResult.status,
  serverErrorCode: serverResult.errorCode,
  serverFinalPocketNumber: serverResult.finalPocketNumber,
  serverStableSettleStep: serverResult.stableSettleStep,
};

fs.writeFileSync(
  outputPath,
  JSON.stringify({ summary, window, rows }, null, 2),
);
console.log('PART10A_61006_SUMMARY ' + JSON.stringify(summary));
for (const row of window) {
  console.log('PART10A_61006_WINDOW ' + JSON.stringify(row));
}
