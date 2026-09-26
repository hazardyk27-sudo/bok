import { chromium } from "@playwright/test";
import fs from "node:fs";

const viteBase = process.env.ROULETTE_E2E_VITE_BASE ?? "http://127.0.0.1:4173";
const apiBase = process.env.ROULETTE_E2E_API_BASE ?? "http://127.0.0.1:8080";
const roundId = process.env.ROULETTE_E2E_ROUND_ID ?? "";
const expectedNumber = Number(process.env.ROULETTE_E2E_WINNING_NUMBER ?? "NaN");
const replayPath =
  process.env.ROULETTE_E2E_REPLAY_JSON ?? "/tmp/roulette-production-replay.json";
const tolerance = 0.000001;

if (!roundId || !Number.isInteger(expectedNumber)) {
  throw new Error("ROULETTE_E2E_BROWSER_INPUT_INVALID");
}

const replay = JSON.parse(fs.readFileSync(replayPath, "utf8"));
const europeanOrder = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const step = (Math.PI * 2) / europeanOrder.length;
const normalize = (angle) => {
  const full = Math.PI * 2;
  const wrapped = angle % full;
  return wrapped < 0 ? wrapped + full : wrapped;
};
const vec3Delta = (a, b) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const quatDelta = (a, b) => {
  const an = Math.hypot(a.x, a.y, a.z, a.w) || 1;
  const bn = Math.hypot(b.x, b.y, b.z, b.w) || 1;
  const dot =
    (a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w) / (an * bn);
  return 1 - Math.min(1, Math.abs(dot));
};

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-gl=swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--disable-gpu-sandbox",
  ],
});

const evidence = {
  roundId,
  expectedNumber,
  replayRoundId: replay.roundId,
  trajectoryHash: replay.trajectoryHash,
  pageErrors: [],
  requestFailures: [],
  final: null,
};

try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("requestfailed", (request) =>
    evidence.requestFailures.push({
      url: request.url(),
      errorText: request.failure()?.errorText ?? null,
    }),
  );

  const url =
    viteBase +
    "/roulette-production-replay-probe.html?roundId=" +
    encodeURIComponent(roundId) +
    "&expectedNumber=" +
    encodeURIComponent(String(expectedNumber)) +
    "&apiBase=" +
    encodeURIComponent(apiBase);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForFunction(
    () => document.documentElement.dataset.probeState === "complete",
    undefined,
    { timeout: 45_000 },
  );

  const snapshot = await page.evaluate(() => {
    const canvas = document.querySelector("#roulette-production-replay");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("ROULETTE_E2E_CANVAS_MISSING");
    }
    const raw = canvas.dataset.replayFinal;
    if (!raw) throw new Error("ROULETTE_E2E_FINAL_TELEMETRY_MISSING");
    return {
      replayRoundId: canvas.dataset.replayRoundId ?? null,
      replayTrajectoryHash: canvas.dataset.replayTrajectoryHash ?? null,
      replayPocket: canvas.dataset.replayPocket ?? null,
      replayState: canvas.dataset.replayState ?? null,
      final: JSON.parse(raw),
    };
  });

  const actual = snapshot.final.actual;
  const expected = snapshot.final.expected;
  const worldAngle = Math.atan2(
    actual.ballPosition.x,
    actual.ballPosition.z,
  );
  const rotorAngle =
    2 *
    Math.atan2(
      actual.rotorOrientation.y,
      actual.rotorOrientation.w,
    );
  const visiblePocketIndex =
    Math.round(normalize(worldAngle - rotorAngle) / step) %
    europeanOrder.length;
  const visiblePocketNumber = europeanOrder[visiblePocketIndex];

  const finalSample = expected.finalSample;
  if (!finalSample) throw new Error("ROULETTE_E2E_FINAL_SAMPLE_MISSING");

  const ballPositionDelta = vec3Delta(
    actual.ballPosition,
    finalSample.ball.position,
  );
  const ballOrientationDelta = quatDelta(
    actual.ballOrientation,
    finalSample.ball.orientation,
  );
  const rotorOrientationDelta = quatDelta(
    actual.rotorOrientation,
    finalSample.rotor.orientation,
  );

  const passed =
    snapshot.replayState === "settled" &&
    snapshot.replayRoundId === replay.roundId &&
    snapshot.replayTrajectoryHash === replay.trajectoryHash &&
    Number(snapshot.replayPocket) === expectedNumber &&
    expected.finalPocket.index === replay.finalPocket.index &&
    expected.finalPocket.number === replay.finalPocket.number &&
    expected.winningNumber === replay.winningNumber &&
    visiblePocketIndex === replay.finalPocket.index &&
    visiblePocketNumber === replay.finalPocket.number &&
    visiblePocketNumber === replay.winningNumber &&
    replay.winningNumber === expectedNumber &&
    ballPositionDelta <= tolerance &&
    ballOrientationDelta <= tolerance &&
    rotorOrientationDelta <= tolerance &&
    evidence.pageErrors.length === 0 &&
    evidence.requestFailures.length === 0;

  evidence.final = {
    passed,
    visiblePocketIndex,
    visiblePocketNumber,
    finalPocketIndex: replay.finalPocket.index,
    finalPocketNumber: replay.finalPocket.number,
    winningNumber: replay.winningNumber,
    ballPositionDelta,
    ballOrientationDelta,
    rotorOrientationDelta,
    replayState: snapshot.replayState,
    replayPocket: snapshot.replayPocket,
  };

  fs.writeFileSync(
    "/tmp/roulette-production-browser.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    "ROULETTE_PRODUCTION_BROWSER_REPLAY " +
      JSON.stringify(evidence.final),
  );

  if (!passed) process.exitCode = 1;
} catch (error) {
  evidence.final = {
    passed: false,
    error: error instanceof Error ? error.message : String(error),
  };
  fs.writeFileSync(
    "/tmp/roulette-production-browser.json",
    JSON.stringify(evidence, null, 2),
  );
  console.error(
    "ROULETTE_PRODUCTION_BROWSER_REPLAY " +
      JSON.stringify(evidence.final),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
