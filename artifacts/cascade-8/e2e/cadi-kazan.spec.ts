import { expect, test, type Page, type TestInfo } from "@playwright/test";

type CadiKazanMode = "STANDARD" | "ADVANCED";
type CadiKazanStatus = "ACTIVE" | "CASHED_OUT";

type CadiKazanRound = {
  id: string;
  mode: CadiKazanMode;
  alarmCount: number;
  cellCount: number;
  stakeCents: number;
  revealedCells: number[];
  revealedSafeCount: number;
  currentMultiplierBps: number;
  currentCashoutCents: number;
  status: CadiKazanStatus;
  payoutCents: number;
  revealedBombCells: number[];
  createdAt: string;
  updatedAt: string;
};

type CadiKazanState = {
  wallet: { sessionId: string; balanceCents: number };
  round: CadiKazanRound | null;
};

type CadiKazanMutation = {
  outcome: "SAFE" | "CASHED_OUT";
  state: CadiKazanState;
};

type CadiKazanFixture = {
  page: Page;
  startBodies: Array<Record<string, unknown>>;
  revealBodies: Array<Record<string, unknown>>;
  cashoutBodies: Array<Record<string, unknown>>;
};

const NOW = "2026-09-22T12:00:00.000Z";

function makeRound(overrides: Partial<CadiKazanRound> = {}): CadiKazanRound {
  return {
    id: "cadi-e2e-standard",
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
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeState(round: CadiKazanRound | null = null): CadiKazanState {
  return {
    wallet: { sessionId: "cadi-e2e-session", balanceCents: 100_000 },
    round,
  };
}

async function installCadiKazanFixture(page: Page): Promise<CadiKazanFixture> {
  let state = makeState();
  const startBodies: CadiKazanFixture["startBodies"] = [];
  const revealBodies: CadiKazanFixture["revealBodies"] = [];
  const cashoutBodies: CadiKazanFixture["cashoutBodies"] = [];

  await page.route("**/api/cadi-kazan/state", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(state),
    });
  });

  await page.route("**/api/cadi-kazan/rounds", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    startBodies.push(body);
    const mode = body.mode === "ADVANCED" ? "ADVANCED" : "STANDARD";
    const alarmCount = mode === "ADVANCED" ? Number(body.alarmCount) : 1;
    const round = makeRound({
      id: mode === "ADVANCED" ? "cadi-e2e-advanced" : "cadi-e2e-standard",
      mode,
      alarmCount,
      cellCount: mode === "ADVANCED" ? 25 : 5,
      stakeCents: Number(body.stakeCents),
    });
    state = {
      wallet: { ...state.wallet, balanceCents: state.wallet.balanceCents - round.stakeCents },
      round,
    };
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(state),
    });
  });

  await page.route("**/api/cadi-kazan/rounds/*/reveal", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    revealBodies.push(body);
    const cellIndex = Number(body.cellIndex);
    const round = state.round;
    if (!round) throw new Error("Reveal received without a round");

    state = {
      wallet: state.wallet,
      round: makeRound({
        ...round,
        revealedCells: [...round.revealedCells, cellIndex].sort((a, b) => a - b),
        revealedSafeCount: 1,
        currentMultiplierBps: 120,
        currentCashoutCents: 120,
      }),
    };
    const response: CadiKazanMutation = { outcome: "SAFE", state };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });

  await page.route("**/api/cadi-kazan/rounds/*/cash-out", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    cashoutBodies.push(body);
    const round = state.round;
    if (!round) throw new Error("Cash out received without a round");

    state = {
      wallet: { ...state.wallet, balanceCents: state.wallet.balanceCents + 120 },
      round: makeRound({
        ...round,
        status: "CASHED_OUT",
        currentMultiplierBps: 120,
        currentCashoutCents: 120,
        payoutCents: 120,
        revealedBombCells: [4],
      }),
    };
    const response: CadiKazanMutation = { outcome: "CASHED_OUT", state };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });

  await page.goto("/cadi-kazan");
  await expect(page.locator(".witch-page")).toBeVisible();
  await expect(page.locator("[data-witch-status]")).toHaveText("SERVER’A BAĞLI");

  return { page, startBodies, revealBodies, cashoutBodies };
}

async function lightlyScratchCell(page: Page, cellIndex: number) {
  const canvas = page.locator(`[data-witch-cell="${cellIndex}"] .witch-scratch-layer-lacquer`);
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Scratch canvas is not laid out");

  const y = box.y + box.height * 0.5;
  await page.mouse.move(box.x + box.width * 0.38, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.58, y, { steps: 4 });
  await page.mouse.up();
}

async function scratchCell(page: Page, cellIndex: number) {
  const canvas = page.locator(`[data-witch-cell="${cellIndex}"] .witch-scratch-layer-lacquer`);
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Scratch canvas is not laid out");

  const left = box.x + 4;
  const right = box.x + box.width - 4;
  const top = box.y + 4;
  const bottom = box.y + box.height - 4;
  await page.mouse.move(left, top);
  await page.mouse.down();
  for (let pass = 0; pass < 9; pass += 1) {
    for (let row = 0; row <= 10; row += 1) {
      const y = top + (bottom - top) * (row / 10);
      const from = pass % 2 === 0 ? left : right;
      const to = pass % 2 === 0 ? right : left;
      await page.mouse.move(from, y);
      await page.mouse.move(to, y, { steps: 12 });
    }
  }
  await page.mouse.up();
}

async function captureMobileLayout(page: Page) {
  return page.evaluate(() => {
    const actions = document.querySelector<HTMLElement>("[data-witch-mobile-actions]");
    const cashout = actions?.querySelector<HTMLElement>("[data-witch-action='cashout']");
    const viewportWidth = document.documentElement.clientWidth;
    const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const actionsRect = actions?.getBoundingClientRect();
    const cashoutRect = cashout?.getBoundingClientRect();
    return {
      horizontalOverflow: scrollWidth > viewportWidth + 1,
      actionsPosition: actions ? getComputedStyle(actions).position : "",
      actionsWithinViewport: Boolean(actionsRect && actionsRect.left >= 0 && actionsRect.right <= viewportWidth),
      cashoutWithinViewport: Boolean(cashoutRect && cashoutRect.left >= 0 && cashoutRect.right <= viewportWidth),
      cashoutBottom: cashoutRect?.bottom ?? 0,
      viewportHeight: window.innerHeight,
    };
  });
}

test.describe("Cadı Kazan critical round lifecycle", () => {
  test("desktop protects hidden results, settles GOLD/BOMBA, and starts a new card", async ({ page }, testInfo: TestInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop Cadı Kazan coverage runs in the desktop project");
    const fixture = await installCadiKazanFixture(page);

    await test.step("buy a Standard card without leaking active bomb results", async () => {
      await expect(page.locator("[data-witch-ticket]")).toBeHidden();
      await page.locator("[data-witch-mode='STANDARD']").click();
      await page.locator("[data-witch-action='start']").click();
      await expect(page.locator("[data-witch-ticket]")).toBeVisible();
      await expect(page.locator("[data-witch-cell]")).toHaveCount(5);
      await expect(page.locator("[data-witch-round-status]")).toHaveText("ACTIVE");
      await expect(page.locator("[data-witch-play-mode]")).toHaveText("STANDARD 5 / 01 BOMB");
      await expect(page.locator("[data-witch-action='cashout']:visible")).toBeDisabled();
      await expect(page.locator("[data-witch-cell].is-bomb")).toHaveCount(0);
      await expect(page.locator("[data-witch-cell='4']")).toHaveAttribute("aria-label", "Kazınabilir kapalı alan");
      await expect(page.locator("[data-witch-cell='4'] .witch-cell-result-label")).toHaveText("");
      expect(fixture.startBodies[0]).toMatchObject({ mode: "STANDARD", alarmCount: 1, stakeCents: 100 });
    });

    await test.step("a light scratch does not spoil or settle the hidden result", async () => {
      await lightlyScratchCell(page, 0);
      await page.waitForTimeout(120);
      expect(fixture.revealBodies).toHaveLength(0);
      await expect(page.locator("[data-witch-action='cashout']:visible")).toBeDisabled();
      await expect(page.locator("[data-witch-cell='0'] .witch-cell-result-label")).toHaveText("");
    });

    await test.step("a meaningful scratch settles and reveals the real result", async () => {
      await scratchCell(page, 0);
      await expect.poll(() => fixture.revealBodies.length).toBe(1);
      await expect(page.locator("[data-witch-cell='0']")).toHaveClass(/is-safe/);
      await expect(page.locator("[data-witch-cell='0'] .witch-cell-content")).toHaveText("✦");
      await expect(page.locator("[data-witch-cell='0'] .witch-cell-result-label")).toHaveText("ALTIN");
      await expect(page.locator("[data-witch-action='cashout']:visible")).toBeEnabled();
      expect(fixture.revealBodies[0]).toMatchObject({ cellIndex: 0 });
    });

    await test.step("cash out safely, reveal the terminal bomb, and start a new card", async () => {
      await page.locator("[data-witch-desktop-payout] [data-witch-action='cashout']").click();
      await expect(page.locator("[data-witch-round-status]")).toHaveText("CASHED_OUT");
      await expect(page.locator("[data-witch-payout]")).toHaveText("1,20 kredi");
      await expect(page.locator("[data-witch-cell='0']")).toHaveClass(/is-safe/);
      await expect(page.locator("[data-witch-cell='4']")).toHaveClass(/is-bomb/, { timeout: 2_000 });
      await expect(page.locator("[data-witch-cell='4'] .witch-cell-result-label")).toHaveText("BOMBA");
      await expect(page.locator("[data-witch-desktop-payout] [data-witch-action='cashout']")).toBeDisabled();
      await expect(page.locator("[data-witch-desktop-payout] [data-witch-action='new']")).toBeVisible();
      expect(fixture.cashoutBodies).toHaveLength(1);

      await page.locator("[data-witch-desktop-payout] [data-witch-action='new']").click();
      await expect(page.locator("[data-witch-ticket]")).toBeHidden();
      await expect(page.locator("[data-witch-empty]")).toBeVisible();
      await expect(page.locator("[data-witch-cell]")).toHaveCount(0);
      await expect(page.locator("[data-witch-round-status]")).toHaveText("HAZIR");
    });
  });

  test("mobile starts Advanced with 25 cells and keeps the sticky payout actions usable", async ({ page }, testInfo: TestInfo) => {
    test.skip(testInfo.project.name !== "android-chrome", "Mobile Cadı Kazan coverage runs in the Android project");
    const fixture = await installCadiKazanFixture(page);

    await page.locator("[data-witch-mode='ADVANCED']").click();
    await expect(page.locator("[data-witch-alarms]")).toBeEnabled();
    await page.locator("[data-witch-alarms]").selectOption("1");
    await page.locator("[data-witch-action='start']").click();

    await expect(page.locator("[data-witch-ticket]")).toBeVisible();
    await expect(page.locator("[data-witch-cell]")).toHaveCount(25);
    await expect(page.locator("[data-witch-play-mode]")).toHaveText("ADVANCED 25 / 01 BOMBS");
    await expect(page.locator("[data-witch-mobile-actions]")).toBeVisible();
    await expect(page.locator("[data-witch-mobile-actions] [data-witch-action='cashout']")).toBeVisible();
    await expect(page.locator("[data-witch-mobile-actions] [data-witch-action='cashout']")).toBeDisabled();
    expect(fixture.startBodies[0]).toMatchObject({ mode: "ADVANCED", alarmCount: 1, stakeCents: 100 });

    const layout = await captureMobileLayout(page);
    expect(layout.horizontalOverflow).toBe(false);
    expect(layout.actionsPosition).toBe("fixed");
    expect(layout.actionsWithinViewport).toBe(true);
    expect(layout.cashoutWithinViewport).toBe(true);
    expect(layout.cashoutBottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
  });
});