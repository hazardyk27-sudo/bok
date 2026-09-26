import { chromium } from '@playwright/test';
import fs from 'node:fs';

const targetUrl =
  process.env.ROULETTE_REPLAY_URL ??
  'http://127.0.0.1:4173/?part6ReplayProbe=1';
const outputPath =
  process.env.ROULETTE_REPLAY_OUTPUT ??
  'artifacts/roulette-physics-lab/authoritative-replay-runtime.json';
const timeoutMs = Number(process.env.ROULETTE_REPLAY_TIMEOUT_MS ?? 45_000);
const tolerance = Number(process.env.ROULETTE_REPLAY_TOLERANCE ?? 0.000001);

const vec3Delta = (left, right) =>
  Math.hypot(
    left.x - right.x,
    left.y - right.y,
    left.z - right.z,
  );

const quaternionOrientationDelta = (left, right) => {
  const leftNorm = Math.hypot(left.x, left.y, left.z, left.w) || 1;
  const rightNorm = Math.hypot(right.x, right.y, right.z, right.w) || 1;
  const dot =
    (left.x * right.x +
      left.y * right.y +
      left.z * right.z +
      left.w * right.w) /
    (leftNorm * rightNorm);
  return 1 - Math.min(1, Math.abs(dot));
};

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-gl=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--disable-gpu-sandbox',
  ],
});

const result = {
  capturedAt: new Date().toISOString(),
  targetUrl,
  tolerance,
  pageErrors: [],
  requestFailures: [],
  authoritativeRoundRequests: [],
  fullSpinTelemetryConsoleCount: 0,
  replay: null,
};

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });

  page.on('pageerror', (error) => {
    result.pageErrors.push(error.message);
  });
  page.on('requestfailed', (request) => {
    result.requestFailures.push({
      url: request.url(),
      errorText: request.failure()?.errorText ?? null,
    });
  });
  page.on('request', (request) => {
    if (request.url().includes('/physics-lab/rounds')) {
      result.authoritativeRoundRequests.push(request.url());
    }
  });
  page.on('console', (message) => {
    if (message.text().startsWith('PART6_FULL_SPIN_TELEMETRY ')) {
      result.fullSpinTelemetryConsoleCount += 1;
    }
  });

  await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  });

  await page.waitForFunction(
    () => {
      const viewport = document.querySelector('[data-testid="canvas-viewport"]');
      return (
        viewport?.getAttribute('data-authoritative-replay-complete') === 'true' &&
        Boolean(viewport?.getAttribute('data-authoritative-replay-final'))
      );
    },
    undefined,
    { timeout: timeoutMs },
  );

  const snapshot = await page.evaluate(() => {
    const viewport = document.querySelector('[data-testid="canvas-viewport"]');
    if (!(viewport instanceof HTMLElement)) {
      throw new Error('REPLAY_VIEWPORT_MISSING');
    }
    const finalRaw = viewport.getAttribute('data-authoritative-replay-final');
    if (!finalRaw) {
      throw new Error('REPLAY_FINAL_TELEMETRY_MISSING');
    }
    return {
      trajectoryHash:
        viewport.getAttribute('data-authoritative-replay') ?? null,
      complete:
        viewport.getAttribute('data-authoritative-replay-complete') === 'true',
      final: JSON.parse(finalRaw),
      validationIssue:
        document.querySelector('[data-testid="status-validation-issue"]')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim() ?? null,
    };
  });

  const final = snapshot.final;
  const ballPositionDelta = vec3Delta(
    final.actual.ballPosition,
    final.expected.ballPosition,
  );
  const ballOrientationDelta = quaternionOrientationDelta(
    final.actual.ballOrientation,
    final.expected.ballOrientation,
  );
  const rotorOrientationDelta = quaternionOrientationDelta(
    final.actual.rotorOrientation,
    final.expected.rotorOrientation,
  );
  const pocketIndexMatches =
    final.actual.visiblePocketIndex === final.expected.finalPocketIndex;
  const pocketNumberMatches =
    final.actual.visiblePocketNumber === final.expected.finalPocketNumber;
  const winningNumberMatches =
    final.actual.visiblePocketNumber === final.expected.winningNumber &&
    final.expected.finalPocketNumber === final.expected.winningNumber;

  const passed =
    snapshot.complete &&
    snapshot.trajectoryHash === final.trajectoryHash &&
    ballPositionDelta <= tolerance &&
    ballOrientationDelta <= tolerance &&
    rotorOrientationDelta <= tolerance &&
    pocketIndexMatches &&
    pocketNumberMatches &&
    winningNumberMatches &&
    final.expected.finalPocketIndex !== null &&
    final.expected.finalPocketNumber !== null &&
    final.expected.winningNumber !== null &&
    result.pageErrors.length === 0 &&
    result.requestFailures.length === 0 &&
    result.authoritativeRoundRequests.length === 0 &&
    result.fullSpinTelemetryConsoleCount === 0;

  result.replay = {
    passed,
    roundId: final.roundId,
    trajectoryHash: final.trajectoryHash,
    viewportTrajectoryHash: snapshot.trajectoryHash,
    ballPositionDelta,
    ballOrientationDelta,
    rotorOrientationDelta,
    pocketIndexMatches,
    pocketNumberMatches,
    winningNumberMatches,
    visiblePocketIndex: final.actual.visiblePocketIndex,
    visiblePocketNumber: final.actual.visiblePocketNumber,
    finalPocketIndex: final.expected.finalPocketIndex,
    finalPocketNumber: final.expected.finalPocketNumber,
    winningNumber: final.expected.winningNumber,
    validationIssue: snapshot.validationIssue,
    actual: final.actual,
    expected: final.expected,
  };

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log('ROULETTE_AUTHORITATIVE_REPLAY_GATE ' + JSON.stringify(result.replay));

  if (!passed) process.exitCode = 1;
} catch (error) {
  result.replay = {
    passed: false,
    error: error instanceof Error ? error.message : String(error),
  };
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.error(
    'ROULETTE_AUTHORITATIVE_REPLAY_GATE ' + JSON.stringify(result.replay),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
