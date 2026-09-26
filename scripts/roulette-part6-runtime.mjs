import { chromium } from '@playwright/test';
import fs from 'node:fs';

// Runtime probe intentionally runs only in GitHub Actions for PART 6B validation.
const targetUrl =
  process.env.ROULETTE_LAB_URL ??
  'http://127.0.0.1:4173/?part6Headless=1';
const outputPath =
  process.env.ROULETTE_PART6_OUTPUT ??
  'artifacts/roulette-physics-lab/part6-runtime-result.json';
const terminalTimeoutMs = Number(
  process.env.ROULETTE_PART6_TIMEOUT_MS ?? 180_000,
);
const expectedSeedCount = Number(
  process.env.ROULETTE_PART6_EXPECTED_SEEDS ?? 20,
);

let telemetry = null;
let glbColliderParity = null;
const seedTelemetry = [];
let lastStepProgress = null;
let lastDiagnosticStage = null;
const startupConsole = [];
const pageErrors = [];
const requestFailures = [];
const responseEvents = [];
const startupSnapshots = [];

const pushBounded = (target, value, limit = 120) => {
  if (target.length < limit) target.push(value);
};

const captureStartupSnapshot = async (page, label) => {
  const snapshot = await page
    .evaluate((snapshotLabel) => {
      const byTestId = (id) =>
        document.querySelector(`[data-testid="${id}"]`);
      const text = (element) =>
        element?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
      const report = byTestId('part6-full-spin-telemetry-report');
      const error = byTestId('status-error');
      const loading = byTestId('status-loading');
      const loaded = byTestId('status-loaded');
      const validationIssue = byTestId('status-validation-issue');
      const viewport = byTestId('canvas-viewport');
      const canvas = viewport?.querySelector('canvas') ?? null;

      return {
        label: snapshotLabel,
        href: window.location.href,
        readyState: document.readyState,
        bodyTextExcerpt:
          document.body?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 1800) ??
          '',
        reportExists: Boolean(report),
        reportStatus: report?.getAttribute('data-status') ?? null,
        reportSafety: report?.getAttribute('data-safety') ?? null,
        loadingVisible: Boolean(loading),
        loadedVisible: Boolean(loaded),
        errorVisible: Boolean(error),
        errorText: text(error),
        validationIssueVisible: Boolean(validationIssue),
        validationIssueText: text(validationIssue),
        buildMarker: text(byTestId('build-part6b')),
        viewportExists: Boolean(viewport),
        canvasExists: Boolean(canvas),
        canvasWidth: canvas instanceof HTMLCanvasElement ? canvas.width : null,
        canvasHeight: canvas instanceof HTMLCanvasElement ? canvas.height : null,
      };
    }, label)
    .catch((error) => ({
      label,
      snapshotError: error instanceof Error ? error.message : String(error),
    }));

  startupSnapshots.push(snapshot);
  console.log('PART6_STARTUP_SNAPSHOT ' + JSON.stringify(snapshot));
  return snapshot;
};

const persistPartialResult = (extra = {}) => {
  const partial = {
    capturedAt: new Date().toISOString(),
    url: targetUrl,
    terminalTimeoutMs,
    partial: true,
    seedTelemetry,
    telemetry,
    glbColliderParity,
    startupConsole,
    pageErrors,
    requestFailures,
    responseEvents,
    startupSnapshots,
    ...extra,
  };
  fs.writeFileSync(outputPath, JSON.stringify(partial, null, 2));
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

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1200 },
  });

  page.on('console', (message) => {
    const text = message.text();
    pushBounded(startupConsole, {
      type: message.type(),
      text,
      location: message.location(),
    });
    console.log(
      'BROWSER_CONSOLE ' +
        JSON.stringify({
          type: message.type(),
          text,
          location: message.location(),
        }),
    );

    if (text.startsWith('GLB_COLLIDER_PARITY_REPORT ')) {
      const raw = text.slice('GLB_COLLIDER_PARITY_REPORT '.length);
      try {
        glbColliderParity = JSON.parse(raw);
        console.log('PART6_GLB_COLLIDER_PARITY ' + raw);
        persistPartialResult({
          expectedSeedCount,
          glbColliderParity,
          seedResultsCaptured: seedTelemetry.length,
        });
      } catch (error) {
        console.error('Could not parse GLB collider parity payload:', error);
      }
      return;
    }

    if (text.startsWith('PART6_DIAGNOSTIC_STAGE ')) {
      const raw = text.slice('PART6_DIAGNOSTIC_STAGE '.length);
      try {
        lastDiagnosticStage = JSON.parse(raw);
        console.log('PART6_RUNTIME_STAGE ' + raw);
        persistPartialResult({
          expectedSeedCount,
          lastDiagnosticStage,
          lastStepProgress,
          seedResultsCaptured: seedTelemetry.length,
        });
      } catch (error) {
        console.error('Could not parse PART 6 diagnostic stage payload:', error);
      }
      return;
    }

    if (text.startsWith('PART6_STEP_PROGRESS ')) {
      const raw = text.slice('PART6_STEP_PROGRESS '.length);
      try {
        lastStepProgress = JSON.parse(raw);
        console.log('PART6_RUNTIME_STEP ' + raw);
        persistPartialResult({
          expectedSeedCount,
          lastStepProgress,
          seedResultsCaptured: seedTelemetry.length,
        });
      } catch (error) {
        console.error('Could not parse PART 6 step progress payload:', error);
      }
      return;
    }

    const prefixes = [
      ['PART6_FULL_SPIN_TELEMETRY ', 'full'],
      ['PART6_SEED_TELEMETRY ', 'seed'],
    ];

    for (const [prefix, kind] of prefixes) {
      if (!text.startsWith(prefix)) continue;
      const raw = text.slice(prefix.length);
      try {
        const parsed = JSON.parse(raw);
        if (kind === 'full') {
          telemetry = parsed;
          persistPartialResult({ partial: false });
        } else {
          seedTelemetry.push(parsed);
          const current = seedTelemetry.length;
          console.log(
            'PART6_RUNTIME_SEED ' +
              String(current) +
              '/' +
              String(expectedSeedCount) +
              ' seed=' +
              String(parsed.seed) +
              ' laps=' +
              String(parsed.lapCount) +
              ' settled=' +
              String(parsed.settled) +
              ' safety=' +
              String(parsed.safetyPassed),
          );
          persistPartialResult({
            lastSeed: parsed.seed,
            seedResultsCaptured: current,
          });
        }
      } catch (error) {
        console.error(
          'Could not parse PART 6 ' + kind + ' telemetry payload:',
          error,
        );
      }
      return;
    }
  });

  page.on('pageerror', (error) => {
    const value = {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
    pushBounded(pageErrors, value, 40);
    console.error('PAGE_ERROR ' + JSON.stringify(value));
    persistPartialResult({ expectedSeedCount, phase: 'pageerror' });
  });

  page.on('requestfailed', (request) => {
    const value = {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText ?? null,
    };
    pushBounded(requestFailures, value, 80);
    console.error('REQUEST_FAILED ' + JSON.stringify(value));
    persistPartialResult({ expectedSeedCount, phase: 'requestfailed' });
  });

  page.on('response', (response) => {
    const request = response.request();
    const resourceType = request.resourceType();
    const url = response.url();
    if (
      resourceType === 'document' ||
      resourceType === 'script' ||
      url.includes('.glb')
    ) {
      const value = {
        url,
        status: response.status(),
        ok: response.ok(),
        resourceType,
      };
      pushBounded(responseEvents, value, 100);
      console.log('NETWORK_RESPONSE ' + JSON.stringify(value));
    }
  });

  await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 15_000,
  });

  await captureStartupSnapshot(page, 'domcontentloaded');

  const report = page.locator(
    '[data-testid="part6-full-spin-telemetry-report"]',
  );

  let reportWaitError = null;
  try {
    await report.waitFor({ state: 'visible', timeout: 10_000 });
  } catch (error) {
    reportWaitError = error instanceof Error ? error.message : String(error);
  }

  await captureStartupSnapshot(page, 'report-wait-complete');

  if (reportWaitError) {
    persistPartialResult({
      expectedSeedCount,
      reportWaitError,
      lastDiagnosticStage,
      lastStepProgress,
      seedResultsCaptured: seedTelemetry.length,
    });
    throw new Error(
      'PART 6 startup probe could not see the telemetry report: ' +
        reportWaitError,
    );
  }

  let terminalWaitError = null;
  try {
    await page.waitForFunction(
      () => {
        const element = document.querySelector(
          '[data-testid="part6-full-spin-telemetry-report"]',
        );
        const status = element?.getAttribute('data-status');
        return status === 'captured' || status === 'failed';
      },
      undefined,
      { timeout: terminalTimeoutMs },
    );
  } catch (error) {
    terminalWaitError =
      error instanceof Error ? error.message : String(error);
  }

  await captureStartupSnapshot(page, 'terminal-wait-complete');

  const status = terminalWaitError
    ? await report.getAttribute('data-status').catch(() => null)
    : await report.getAttribute('data-status');
  const reportText = terminalWaitError
    ? ''
    : await report.innerText().catch(() => '');
  const errorOverlay = page.locator('[data-testid="status-error"]');
  const errorVisible = await errorOverlay.isVisible().catch(() => false);
  const errorText = errorVisible
    ? await errorOverlay.innerText().catch(() => '')
    : '';

  const runtimeResult = {
    capturedAt: new Date().toISOString(),
    url: targetUrl,
    terminalTimeoutMs,
    expectedSeedCount,
    startupConsole,
    pageErrors,
    requestFailures,
    responseEvents,
    startupSnapshots,
    lastStepProgress,
    lastDiagnosticStage,
    domStatus: status,
    errorVisible,
    errorText,
    terminalWaitError,
    seedTelemetry,
    telemetry,
    glbColliderParity,
    reportText,
  };

  fs.writeFileSync(
    outputPath,
    JSON.stringify(runtimeResult, null, 2),
  );

  const summary = {
    domStatus: status,
    terminalWaitError,
    expectedSeedCount,
    lastStepProgress,
    lastDiagnosticStage,
    seedResultsCaptured: seedTelemetry.length,
    telemetryStatus: telemetry?.status ?? null,
    safetyStatus: telemetry?.safetyStatus ?? null,
    completedCount: telemetry?.completedCount ?? null,
    fourToFiveLapCount: telemetry?.fourToFiveLapCount ?? null,
    medianLapCount: telemetry?.medianLapCount ?? null,
    inwardTransitionRate: telemetry?.inwardTransitionRate ?? null,
    deflectorContactRate: telemetry?.deflectorContactRate ?? null,
    pocketEntryRate: telemetry?.pocketEntryRate ?? null,
    settleRate: telemetry?.settleRate ?? null,
    safetyFailureRate: telemetry?.safetyFailureRate ?? null,
    visualParityStatus: telemetry?.visualParityStatus ?? null,
    visualParityFailureCount: telemetry?.visualParityFailureCount ?? null,
    glbColliderParityPassed: glbColliderParity?.passed ?? null,
    glbColliderParityMaxAbsMm: glbColliderParity?.maxAbsMm ?? null,
    glbColliderParityMaxNormalAngleDegrees:
      glbColliderParity?.maxNormalAngleDegrees ?? null,
  };
  console.log('PART6_RUNTIME_SUMMARY ' + JSON.stringify(summary));

  const terminalTelemetryCaptured =
    telemetry?.status === 'captured' &&
    seedTelemetry.length >= expectedSeedCount;
  if (terminalWaitError && !terminalTelemetryCaptured) {
    throw new Error(terminalWaitError);
  }
  if (!telemetry) {
    throw new Error(
      'PART 6 report reached a terminal DOM state without a structured telemetry payload.',
    );
  }
  if (telemetry.visualParityStatus !== 'passed') {
    throw new Error(
      'ROULETTE_VISUAL_SURFACE_PARITY_FAILED: ' +
        String(telemetry.visualParityFailureCount ?? 'unknown') +
        ' seed(s) failed GLB surface contact parity.',
    );
  }
  if (!glbColliderParity) {
    throw new Error(
      'ROULETTE_GLB_COLLIDER_PARITY_MISSING: no structured GLB/collider parity report was captured.',
    );
  }
  if (glbColliderParity.passed !== true) {
    throw new Error(
      'ROULETTE_GLB_COLLIDER_PARITY_FAILED: max gap ' +
        String(glbColliderParity.maxAbsMm ?? 'unknown') +
        ' mm, max normal delta ' +
        String(glbColliderParity.maxNormalAngleDegrees ?? 'unknown') +
        ' deg.',
    );
  }
} finally {
  await browser.close();
}
