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

test("Standard 5 visual lock", async ({ page }, testInfo) => {
  if (testInfo.project.name.startsWith("mobile-") && testInfo.project.name !== "mobile-844x390") {
    test.skip(true, "Only the approved 844×390 mobile baseline is image-locked; other phone sizes use geometry locks.");
  }
  await expect(page).toHaveScreenshot("cadi-kazan-standard-active.png", {
    fullPage: false,
  });
});

test("mobile landscape geometry lock", async ({ page }, testInfo) => {
  if (!testInfo.project.name.startsWith("mobile-")) {
    test.skip(true, "Mobile-only geometry guard.");
  }

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  const geometry = await page.evaluate(() => {
    const rect = (selector: string) => {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    return {
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      page: rect(".witch-page"),
      header: rect(".witch-appbar"),
      stage: rect(".witch-stage-shell"),
      ticket: rect("[data-witch-ticket]"),
      payout: rect(".witch-payout-panel"),
      deck: rect(".witch-control-dock"),
    };
  });

  const width = viewport!.width;
  const height = viewport!.height;
  expect(geometry.documentWidth).toBeLessThanOrEqual(width + 1);
  expect(geometry.documentHeight).toBeLessThanOrEqual(height + 1);

  for (const [name, box] of Object.entries(geometry).filter(([key]) => !key.startsWith("document"))) {
    expect(box, `${name} should exist`).not.toBeNull();
    if (!box) continue;
    expect(box.left, `${name} left overflow`).toBeGreaterThanOrEqual(-1);
    expect(box.top, `${name} top overflow`).toBeGreaterThanOrEqual(-1);
    expect(box.right, `${name} right overflow`).toBeLessThanOrEqual(width + 1);
    expect(box.bottom, `${name} bottom overflow`).toBeLessThanOrEqual(height + 1);
  }

  expect(geometry.ticket!.left).toBeLessThan(geometry.payout!.left);
  expect(Math.abs(geometry.ticket!.top - geometry.payout!.top)).toBeLessThanOrEqual(12);
  expect(Math.abs(geometry.ticket!.bottom - geometry.payout!.bottom)).toBeLessThanOrEqual(12);
  expect(geometry.deck!.bottom).toBeGreaterThanOrEqual(height - 2);
});
