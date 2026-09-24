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
        currentCashoutCents: Math.floor(round.stakeCents * 1.2),
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

    const payoutCents = Math.floor(round.stakeCents * 1.2);
    state = {
      wallet: { ...state.wallet, balanceCents: state.wallet.balanceCents + payoutCents },
      round: makeRound({
        ...round,
        status: "CASHED_OUT",
        currentMultiplierBps: 120,
        currentCashoutCents: payoutCents,
        payoutCents,
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
      await page.mouse.move(to, y, { steps: 1 });
    }
  }
  await page.mouse.up();
}

async function captureMobileLayout(page: Page) {
  return page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>(".witch-control-dock");
    const ticket = document.querySelector<HTMLElement>("[data-witch-ticket]");
    const payout = document.querySelector<HTMLElement>("[data-witch-desktop-payout]");
    const firstCell = document.querySelector<HTMLElement>("[data-witch-cell='0']");
    const scene = document.querySelector<HTMLElement>(".witch-page");
    const viewportWidth = window.visualViewport?.width ?? document.documentElement.clientWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const dockRect = dock?.getBoundingClientRect();
    const ticketRect = ticket?.getBoundingClientRect();
    const payoutRect = payout?.getBoundingClientRect();
    const firstCellRect = firstCell?.getBoundingClientRect();
    const sceneRect = scene?.getBoundingClientRect();
    const inside = (rect?: DOMRect) => Boolean(
      rect &&
      rect.left >= -1 &&
      rect.top >= -1 &&
      rect.right <= viewportWidth + 1 &&
      rect.bottom <= viewportHeight + 1
    );
    return {
      horizontalOverflow: scrollWidth > viewportWidth + 1,
      verticalOverflow: scrollHeight > viewportHeight + 1,
      dockPosition: dock ? getComputedStyle(dock).position : "",
      dockDisplay: dock ? getComputedStyle(dock).display : "",
      dockInsideViewport: inside(dockRect),
      ticketInsideViewport: inside(ticketRect),
      payoutInsideViewport: inside(payoutRect),
      sceneInsideViewport: inside(sceneRect),
      sceneWidth: sceneRect?.width ?? 0,
      sceneHeight: sceneRect?.height ?? 0,
      firstCellWidth: firstCellRect?.width ?? 0,
      firstCellHeight: firstCellRect?.height ?? 0,
      ticketWidth: ticketRect?.width ?? 0,
      ticketHeight: ticketRect?.height ?? 0,
      viewportWidth,
      viewportHeight,
      pageTransform: scene ? getComputedStyle(scene).transform : "none",
    };
  });
}

async function captureTabletLayout(page: Page) {
  return page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const selectors = {
      header: ".witch-appbar",
      stage: ".witch-stage-shell",
      ticket: "[data-witch-ticket]",
      payout: "[data-witch-desktop-payout]",
      dock: ".witch-control-dock",
      buy: "[data-witch-action='start']",
      risk: "[data-witch-alarms]",
    };
    const rects = Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
      const element = document.querySelector<HTMLElement>(selector);
      const rect = element?.getBoundingClientRect();
      return [name, rect ? {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      } : null];
    }));
    const inside = (rect: { left: number; top: number; right: number; bottom: number } | null) =>
      Boolean(rect && rect.left >= -1 && rect.top >= -1 &&
        rect.right <= viewport.width + 1 && rect.bottom <= viewport.height + 1);
    return {
      viewport,
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > viewport.width + 1,
      verticalOverflow: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > viewport.height + 1,
      rects,
      allInside: Object.values(rects).every((rect) => inside(rect)),
      dockDisplay: getComputedStyle(document.querySelector<HTMLElement>(".witch-control-dock")!).display,
    };
  });
}

test.describe("Cadı Kazan critical round lifecycle", () => {
  test("desktop Standard 5 matches Saul card art, protects hidden results, and settles safely", async ({ page }, testInfo: TestInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop Cadı Kazan coverage runs in the desktop project");
    const fixture = await installCadiKazanFixture(page);

    await test.step("buy a Standard card without leaking active bomb results", async () => {
      await expect(page.locator("[data-witch-ticket]")).toBeHidden();
      await page.locator("[data-witch-mode='STANDARD']").click();
      await page.locator("[data-witch-stake]").fill("250");
      await page.locator("[data-witch-action='start']").click();
      await expect(page.locator("[data-witch-ticket]")).toBeVisible();
      await expect(page.locator("[data-witch-cell]")).toHaveCount(5);
      await expect(page.locator("[data-witch-round-status]")).toHaveText("ACTIVE");
      await expect(page.locator("[data-witch-play-mode]")).toHaveText("STANDARD 5 / 01 BOMBA");
      await expect(page.locator("[data-witch-action='cashout']:visible")).toBeDisabled();
      await expect(page.locator("[data-witch-cell].is-bomb")).toHaveCount(0);
      await expect(page.locator("[data-witch-cell='4']")).toHaveAttribute("aria-label", "Kazınabilir kapalı alan");
      await expect(page.locator("[data-witch-cell='4'] .witch-cell-result-label")).toHaveText("");
      expect(fixture.startBodies[0]).toMatchObject({ mode: "STANDARD", alarmCount: 1, stakeCents: 25_000 });
      await expect(page.locator("[data-witch-ticket-price]")).toHaveText("$250");
      await expect(page.locator("[data-witch-standard-price]")).toHaveText("$250");
      await expect(page.locator(".witch-page")).toHaveClass(/is-standard-theme/);

      const standardVisual = await page.locator("[data-witch-ticket]").evaluate((ticket: HTMLElement) => {
        const rect = ticket.getBoundingClientRect();
        const style = getComputedStyle(ticket);
        const cells = Array.from(ticket.querySelectorAll<HTMLElement>("[data-witch-cell]"))
          .map((cell) => cell.getBoundingClientRect());
        return {
          ratio: rect.width / Math.max(1, rect.height),
          cardArtVisible: (() => {
            const art = ticket.querySelector<HTMLElement>(".witch-bcs-card-art");
            if (!art) return false;
            const artStyle = getComputedStyle(art);
            const artRect = art.getBoundingClientRect();
            return artStyle.display !== "none" && artRect.width > 0 && artRect.height > 0;
          })(),
          topbarText: ticket.querySelector<HTMLElement>(".witch-bcs-topbar")?.textContent?.trim() ?? "",
          bottomText: ticket.querySelector<HTMLElement>(".witch-bcs-bottombar")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
          cellsInside: cells.every((cell) =>
            cell.left >= rect.left - 1 &&
            cell.top >= rect.top - 1 &&
            cell.right <= rect.right + 1 &&
            cell.bottom <= rect.bottom + 1
          ),
          cellsSeparated: cells.every((cell, index) =>
            index === 0 || cell.left > cells[index - 1]!.right
          ),
        };
      });
      expect(standardVisual.ratio).toBeGreaterThan(2.8);
      expect(standardVisual.ratio).toBeLessThan(3.2);
      expect(standardVisual.cardArtVisible).toBe(true);
      expect(standardVisual.topbarText).toBe("IN LEGAL TROUBLE?");
      expect(standardVisual.bottomText).toContain("NOT TOLL FREE");
      expect(standardVisual.bottomText).toContain("SE HABLA ESPAÑOL");
      expect(standardVisual.cellsInside).toBe(true);
      expect(standardVisual.cellsSeparated).toBe(true);
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
      await expect(page.locator("[data-witch-cell='0']")).toHaveAttribute("aria-label", "SAUL GOODMAN");
      await expect(page.locator("[data-witch-cell='0'] .witch-cell-content img")).toHaveAttribute("src", "/cadi-kazan/bcs-saul.webp");
      await expect(page.locator("[data-witch-cell='0'] .witch-cell-result-label")).toHaveText("SAUL GOODMAN");
      await expect(page.locator("[data-witch-action='cashout']:visible")).toBeEnabled();
      expect(fixture.revealBodies[0]).toMatchObject({ cellIndex: 0 });
    });

    await test.step("cash out safely, reveal the terminal bomb, and start a new card", async () => {
      await page.locator("[data-witch-desktop-payout] [data-witch-action='cashout']").click();
      await expect(page.locator("[data-witch-round-status]")).toHaveText("CASHED_OUT");
      await expect(page.locator("[data-witch-payout]")).toHaveText("$300.00");
      await expect(page.locator("[data-witch-cell='0']")).toHaveClass(/is-safe/);
      await expect(page.locator("[data-witch-cell='4']")).toHaveClass(/is-bomb/, { timeout: 2_000 });
      await expect(page.locator("[data-witch-cell='4']")).toHaveAttribute("aria-label", "I AM THE DANGER");
      await expect(page.locator("[data-witch-cell='4'] .witch-cell-content img")).toHaveAttribute("src", "/cadi-kazan/bcs-danger.webp");
      await expect(page.locator("[data-witch-cell='4'] .witch-cell-result-label")).toHaveText("I AM THE DANGER");
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

  test("desktop Advanced 25 uses the approved wide 30/70 ticket", async ({ page }, testInfo: TestInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop Advanced 25 coverage runs in the desktop project");
    const fixture = await installCadiKazanFixture(page);

    await page.locator("[data-witch-mode='ADVANCED']").click();
    await page.locator("[data-witch-alarms]").selectOption("3");
    await page.locator("[data-witch-action='start']").click();

    await expect(page.locator("[data-witch-ticket]")).toBeVisible();
    await expect(page.locator("[data-witch-cell]")).toHaveCount(25);
    await expect(page.locator(".witch-page")).toHaveClass(/is-advanced-round/);

    const layout = await page.evaluate(() => {
      const ticket = document.querySelector<HTMLElement>("[data-witch-ticket]");
      const board = document.querySelector<HTMLElement>(".witch-ticket.is-advanced .witch-board-wrap");
      const firstCell = document.querySelector<HTMLElement>("[data-witch-cell='0']");
      const payout = document.querySelector<HTMLElement>("[data-witch-desktop-payout]");
      const ticketRect = ticket?.getBoundingClientRect();
      const boardRect = board?.getBoundingClientRect();
      const firstCellRect = firstCell?.getBoundingClientRect();
      const payoutRect = payout?.getBoundingClientRect();
      return {
        ticketWidth: ticketRect?.width ?? 0,
        ticketHeight: ticketRect?.height ?? 0,
        boardWidth: boardRect?.width ?? 0,
        ticketRight: ticketRect?.right ?? 0,
        payoutLeft: payoutRect?.left ?? 0,
        cellWidth: firstCellRect?.width ?? 0,
        cellHeight: firstCellRect?.height ?? 0,
      };
    });

    expect(layout.ticketWidth / Math.max(1, layout.ticketHeight)).toBeGreaterThanOrEqual(1.75);
    expect(layout.boardWidth / Math.max(1, layout.ticketWidth)).toBeGreaterThanOrEqual(0.60);
    expect(layout.payoutLeft - layout.ticketRight).toBeGreaterThanOrEqual(8);
    expect(Math.min(layout.cellWidth, layout.cellHeight)).toBeGreaterThanOrEqual(52);

    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    const lacquer = page.locator("[data-witch-cell='0'] .witch-scratch-layer-lacquer");
    const registration = await lacquer.evaluate((canvas: HTMLCanvasElement) => {
      const expectedRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      return {
        cssWidth: canvas.clientWidth,
        cssHeight: canvas.clientHeight,
        backingWidth: canvas.width,
        backingHeight: canvas.height,
        expectedRatio,
      };
    });
    expect(Math.abs(registration.backingWidth - Math.round(registration.cssWidth * registration.expectedRatio))).toBeLessThanOrEqual(1);
    expect(Math.abs(registration.backingHeight - Math.round(registration.cssHeight * registration.expectedRatio))).toBeLessThanOrEqual(1);

    const lacquerBox = await lacquer.boundingBox();
    if (!lacquerBox) throw new Error("Advanced scratch canvas is not laid out");
    const alphaBefore = await lacquer.evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext("2d")!;
      return context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3];
    });
    await page.mouse.move(lacquerBox.x + lacquerBox.width / 2, lacquerBox.y + lacquerBox.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    const alphaAfter = await lacquer.evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext("2d")!;
      return context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3];
    });
    expect(alphaAfter).toBeLessThan(alphaBefore);

    expect(fixture.startBodies[0]).toMatchObject({ mode: "ADVANCED", alarmCount: 3 });
  });

  test("tablet layout keeps the ticket, payout, and all controls inside the viewport", async ({ page }, testInfo: TestInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Tablet Cadı Kazan coverage runs in the desktop project");
    await page.setViewportSize({ width: 768, height: 1024 });
    const fixture = await installCadiKazanFixture(page);

    await page.locator("[data-witch-mode='STANDARD']").click();
    await page.locator("[data-witch-action='start']").click();
    await expect(page.locator("[data-witch-ticket]")).toBeVisible();

    const layout = await captureTabletLayout(page);
    expect(layout.horizontalOverflow).toBe(false);
    expect(layout.verticalOverflow).toBe(false);
    expect(layout.allInside).toBe(true);
    expect(layout.dockDisplay).not.toBe("none");
    expect(fixture.startBodies[0]).toMatchObject({ mode: "STANDARD", alarmCount: 1 });

    await lightlyScratchCell(page, 0);
    await expect.poll(() => fixture.revealBodies.length).toBe(0);
    await expect(page.locator("[data-witch-action='cashout']:visible")).toBeDisabled();
    const lacquer = page.locator("[data-witch-cell='0'] .witch-scratch-layer-lacquer");
    const canvasSize = await lacquer.evaluate((canvas: HTMLCanvasElement) => ({
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
      backingWidth: canvas.width,
      backingHeight: canvas.height,
      ratio: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
    }));
    expect(Math.abs(canvasSize.backingWidth - Math.round(canvasSize.cssWidth * canvasSize.ratio))).toBeLessThanOrEqual(1);
    expect(Math.abs(canvasSize.backingHeight - Math.round(canvasSize.cssHeight * canvasSize.ratio))).toBeLessThanOrEqual(1);
    expect((await captureTabletLayout(page)).allInside).toBe(true);
  });

  test("tablet Advanced 25 keeps every scratch area large and visible", async ({ page }, testInfo: TestInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Tablet Cadı Kazan coverage runs in the desktop project");
    await page.setViewportSize({ width: 768, height: 1024 });
    await installCadiKazanFixture(page);

    await page.locator("[data-witch-mode='ADVANCED']").click();
    await page.locator("[data-witch-alarms]").selectOption("3");
    await page.locator("[data-witch-action='start']").click();
    await expect(page.locator("[data-witch-cell]")).toHaveCount(25);

    const layout = await captureTabletLayout(page);
    expect(layout.horizontalOverflow).toBe(false);
    expect(layout.verticalOverflow).toBe(false);
    expect(layout.allInside).toBe(true);
    const advancedCells = await page.locator("[data-witch-cell]").evaluateAll((cells) =>
      cells.map((cell) => {
        const rect = cell.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      })
    );
    expect(Math.min(...advancedCells.map(({ width, height }) => Math.min(width, height)))).toBeGreaterThanOrEqual(52);
    await expect(page.locator(".witch-ticket.is-advanced .witch-scratch-layer-lacquer")).toHaveCount(25);
  });

  test("mobile physical orientation fits Advanced 25, payout HUD, and control dock without overflow", async ({ page }, testInfo: TestInfo) => {
    test.skip(!["android-chrome", "android-portrait", "android-small-portrait", "android-narrow-portrait", "android-medium-portrait", "android-large-portrait"].includes(testInfo.project.name), "Mobile Cadı Kazan coverage runs in Android projects");
    const fixture = await installCadiKazanFixture(page);

    await page.locator("[data-witch-mode='ADVANCED']").click();
    await expect(page.locator("[data-witch-alarms]")).toBeEnabled();
    await page.locator("[data-witch-alarms]").selectOption("1");
    await page.locator("[data-witch-action='start']").click();

    await expect(page.locator("[data-witch-ticket]")).toBeVisible();
    await expect(page.locator("[data-witch-cell]")).toHaveCount(25);
    await expect(page.locator("[data-witch-play-mode]")).toHaveText("ADVANCED 25 / 01 BOMBA");
    await expect(page.locator("[data-witch-desktop-payout]")).toBeVisible();
    await expect(page.locator("[data-witch-desktop-payout] [data-witch-action='cashout']")).toBeVisible();
    await expect(page.locator("[data-witch-desktop-payout] [data-witch-action='cashout']")).toBeDisabled();
    expect(fixture.startBodies[0]).toMatchObject({ mode: "ADVANCED", alarmCount: 1, stakeCents: 100 });

    const layout = await captureMobileLayout(page);
    expect(layout.horizontalOverflow).toBe(false);
    expect(layout.verticalOverflow).toBe(false);
    expect(layout.sceneInsideViewport).toBe(true);
    expect(layout.ticketInsideViewport).toBe(true);
    expect(layout.payoutInsideViewport).toBe(true);
    expect(layout.dockDisplay).not.toBe("none");
    expect(layout.dockInsideViewport).toBe(true);
    expect(Math.abs(layout.sceneWidth - layout.viewportWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(layout.sceneHeight - layout.viewportHeight)).toBeLessThanOrEqual(2);
    expect(Math.min(layout.firstCellWidth, layout.firstCellHeight)).toBeGreaterThanOrEqual(38);
    const renderedTicketRatio = layout.ticketWidth / Math.max(1, layout.ticketHeight);
    if (layout.viewportWidth < layout.viewportHeight) {
      expect(renderedTicketRatio).toBeLessThanOrEqual(0.65);
    } else {
      expect(renderedTicketRatio).toBeGreaterThanOrEqual(1.55);
    }
    await expect(page.locator(".witch-page")).toHaveClass(/is-advanced-round/);
    expect(layout.pageTransform).not.toBe("none");
    await expect(page.locator(".witch-rotate-hint")).toHaveCount(0);
  });
});