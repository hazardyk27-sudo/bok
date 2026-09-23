import { chromium } from '@playwright/test';
import fs from 'node:fs';

// Runtime probe intentionally runs only in GitHub Actions for PART 6B validation.
const targetUrl = process.env.ROULETTE_LAB_URL ?? 'http://127.0.0.1:4173/';
const outputPath =
  process.env.ROULETTE_PART6_OUTPUT ??
  'artifacts/roulette-physics-lab/part6-runtime-result.json';

let telemetry = null;
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

  page.on('console', (message) => {
    const text = message.text();
    if (!text.startsWith('PART6_FULL_SPIN_TELEMETRY ')) return;
    const raw = text.slice('PART6_FULL_SPIN_TELEMETRY '.length);
    try {
      telemetry = JSON.parse(raw);
    } catch (error) {
      console.error('Could not parse PART 6 telemetry console payload:', error);
    }
  });

  page.on('pageerror', (error) => {
    console.error('PAGE_ERROR', error);
  });

  await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  const report = page.locator('[data-testid="part6-full-spin-telemetry-report"]');
  await report.waitFor({ state: 'visible', timeout: 60_000 });

  await page.waitForFunction(
    () => {
      const element = document.querySelector(
        '[data-testid="part6-full-spin-telemetry-report"]',
      );
      const status = element?.getAttribute('data-status');
      return status === 'captured' || status === 'failed';
    },
    undefined,
    { timeout: 240_000 },
  );

  const status = await report.getAttribute('data-status');
  const reportText = await report.innerText();
  const errorOverlay = page.locator('[data-testid="status-error"]');
  const errorVisible = await errorOverlay.isVisible().catch(() => false);
  const errorText = errorVisible
    ? await errorOverlay.innerText().catch(() => '')
    : '';

  const runtimeResult = {
    capturedAt: new Date().toISOString(),
    url: targetUrl,
    domStatus: status,
    errorVisible,
    errorText,
    telemetry,
    reportText,
  };

  fs.writeFileSync(outputPath, JSON.stringify(runtimeResult, null, 2));
  console.log('PART6_RUNTIME_RESULT ' + JSON.stringify(runtimeResult));

  if (!telemetry) {
    throw new Error(
      'PART 6 report reached a terminal DOM state without a structured telemetry payload.',
    );
  }
} finally {
  await browser.close();
}
