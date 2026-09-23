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
  process.env.ROULETTE_PART6_TIMEOUT_MS ?? 20_700_000,
);

let telemetry = null;
const seedTelemetry = [];
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
    const prefixes = [
      ['PART6_FULL_SPIN_TELEMETRY ', 'full'],
      ['PART6_SEED_TELEMETRY ', 'seed'],
    ];

    for (const [prefix, kind] of prefixes) {
      if (!text.startsWith(prefix)) continue;
      const raw = text.slice(prefix.length);
      try {
        const parsed = JSON.parse(raw);
        if (kind === 'full') telemetry = parsed;
        else seedTelemetry.push(parsed);
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
    console.error('PAGE_ERROR', error);
  });

  await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  const report = page.locator(
    '[data-testid="part6-full-spin-telemetry-report"]',
  );
  await report.waitFor({ state: 'visible', timeout: 60_000 });

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

  const status = terminalWaitError
    ? null
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
    domStatus: status,
    errorVisible,
    errorText,
    terminalWaitError,
    seedTelemetry,
    telemetry,
    reportText,
  };

  fs.writeFileSync(
    outputPath,
    JSON.stringify(runtimeResult, null, 2),
  );

  const summary = {
    domStatus: status,
    terminalWaitError,
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
  };
  console.log('PART6_RUNTIME_SUMMARY ' + JSON.stringify(summary));

  if (terminalWaitError) {
    throw new Error(terminalWaitError);
  }
  if (!telemetry) {
    throw new Error(
      'PART 6 report reached a terminal DOM state without a structured telemetry payload.',
    );
  }
} finally {
  await browser.close();
}
