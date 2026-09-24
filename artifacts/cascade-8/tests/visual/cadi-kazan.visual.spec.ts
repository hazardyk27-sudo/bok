import { expect, test } from "@playwright/test";

const fixedState = {
  wallet: {
    sessionId: "visual-lock-session",
    balanceCents: 100_000,
  },
  round: {
    id: "visual-lock-standard-round-0001",
    mode: "STANDARD",
    alarmCount: 1,
    cellCount: 5,
    stakeCents: 100,
    revealedCells: [],
    revealedSafeCount: 0,
    currentMultiplierBps: 0,
    currentCashoutCents: 0,
    status: "ACTIVE",
    payoutCents: 0,
    revealedBombCells: [],
    createdAt: "2026-09-24T12:00:00.000Z",
    updatedAt: "2026-09-24T12:00:00.000Z",
  },
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/cadi-kazan/state", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixedState),
    });
  });

  await page.goto("/cadi-kazan", { waitUntil: "domcontentloaded" });
  await page.locator("[data-witch-ticket]").waitFor({ state: "visible" });

  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  // The scratch coating uses an asynchronously loaded image painted to canvas.
  // Wait beyond the ticket entrance timer so the screenshot is deterministic.
  await page.waitForTimeout(900);
});

test("Standard 5 visual lock", async ({ page }) => {
  await expect(page).toHaveScreenshot("cadi-kazan-standard-active.png", {
    fullPage: false,
  });
});
