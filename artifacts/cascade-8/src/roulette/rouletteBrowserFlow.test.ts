import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { settleRouletteBets } from "./betRules";
import {
  getRouletteBetTotals,
  type RouletteBetPlacement,
} from "./betState";
import {
  ROULETTE_SIMULATION_VERSION,
  simulateSeededRouletteSpin,
} from "./spinResult";
import type {
  RouletteGlobalBetSnapshot,
  RouletteGlobalTablePhase,
  RouletteGlobalTableSnapshot,
} from "./rouletteWalletClient";

type WriteBody = {
  roundId: string;
  bets: RouletteBetPlacement[];
  idempotencyKey: string;
  expectedRevision: number;
};

const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const TEST_SEED = "roulette-browser-flow-20261007";
const replay = simulateSeededRouletteSpin(TEST_SEED);
if (!replay.result) {
  throw new Error("ROULETTE_BROWSER_TEST_RESULT_UNAVAILABLE");
}
const TEST_RESULT = replay.result;

function cloneBets(bets: readonly RouletteBetPlacement[]) {
  return bets.map((bet) => ({ ...bet }));
}

function stakeCents(bets: readonly RouletteBetPlacement[]) {
  return bets.reduce((sum, bet) => sum + bet.amount, 0) * 100;
}

function totals(bets: readonly RouletteBetPlacement[]) {
  return getRouletteBetTotals(bets);
}

async function eventually(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5_000,
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("ROULETTE_BROWSER_TEST_TIMEOUT");
}

function browserExecutable() {
  return [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/repl/tools/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
}

async function dragChip(page: Page, fromBetId: string, toBetId: string) {
  const chip = page.locator(
    `[data-bet-id="${fromBetId}"] .roulette-placed-chip`,
  );
  const target = page.locator(`[data-bet-id="${toBetId}"]`);
  const chipBox = await chip.boundingBox();
  const targetBox = await target.boundingBox();
  if (!chipBox || !targetBox) {
    throw new Error(`ROULETTE_BROWSER_DRAG_GEOMETRY:${fromBetId}:${toBetId}`);
  }

  const startX = chipBox.x + chipBox.width / 2;
  const startY = chipBox.y + chipBox.height / 2;
  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(30);
  await page.mouse.move(startX + 8, startY + 4, { steps: 2 });
  await page.mouse.move(targetX, targetY, { steps: 8 });
  await page.waitForTimeout(20);
  await page.mouse.up();
}

async function chipState(page: Page, betId: string) {
  return page
    .locator(`[data-bet-id="${betId}"] .roulette-placed-chip`)
    .evaluate((element: HTMLElement) => ({
      amount: Number(element.dataset.betAmount),
      tier: element.dataset.chipTier ?? "",
      label: element.textContent?.trim() ?? "",
    }));
}

describe("roulette real browser wager lifecycle", () => {
  let vite: ViteDevServer;
  let browser: Browser;
  let page: Page;
  let baseUrl = "";
  let phase: RouletteGlobalTablePhase = "betting";
  let roundId = "browser-round-1";
  let globalBet: RouletteGlobalBetSnapshot | null = null;
  let walletBalanceCents = 100_000_000;
  const writes: WriteBody[] = [];

  function tableSnapshot(): RouletteGlobalTableSnapshot {
    const now = Date.now();
    const common = {
      roundId,
      simulationVersion: ROULETTE_SIMULATION_VERSION,
      serverTimeMs: now,
    };

    if (phase === "betting") {
      return {
        ...common,
        phase,
        bettingOpenAtMs: now - 10_000,
        bettingCloseAtMs: now + 60_000,
        spinStartedAtMs: now + 61_000,
        resultAtMs: now + 70_000,
        nextRoundAtMs: now + 75_000,
        seed: null,
        result: null,
      };
    }

    if (phase === "verifying") {
      return {
        ...common,
        phase,
        bettingOpenAtMs: now - 60_000,
        bettingCloseAtMs: now - 1_000,
        spinStartedAtMs: now + 8_000,
        resultAtMs: now + 18_000,
        nextRoundAtMs: now + 23_000,
        seed: null,
        result: null,
      };
    }

    if (phase === "spinning") {
      return {
        ...common,
        phase,
        bettingOpenAtMs: now - 60_000,
        bettingCloseAtMs: now - 20_000,
        spinStartedAtMs: now - 1_000,
        resultAtMs: now + 9_000,
        nextRoundAtMs: now + 14_000,
        seed: TEST_SEED,
        result: null,
      };
    }

    return {
      ...common,
      phase: "result",
      bettingOpenAtMs: now - 70_000,
      bettingCloseAtMs: now - 30_000,
      spinStartedAtMs: now - 20_000,
      resultAtMs: now - 1_000,
      nextRoundAtMs: now + 8_000,
      seed: TEST_SEED,
      result: TEST_RESULT,
    };
  }

  async function forceStateRefresh() {
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(250);
  }

  async function beginRound(id: string) {
    roundId = id;
    phase = "betting";
    globalBet = null;
    await forceStateRefresh();
    await eventually(async () =>
      (await page.locator("[data-roulette-page]").getAttribute("data-betting-locked")) ===
      "false",
    );
  }

  async function waitForServerTotals(expected: Record<string, number>) {
    await eventually(() => {
      const actual = totals(globalBet?.bets ?? []);
      return (
        Object.keys(expected).length === Object.keys(actual).length &&
        Object.entries(expected).every(([key, value]) => actual[key] === value)
      );
    });
  }

  beforeAll(async () => {
    const port = 46_000 + (process.pid % 1_000);
    process.env.PORT = String(port);
    process.env.BASE_PATH = "/";
    vite = await createServer({
      root: APP_ROOT,
      configFile: path.join(APP_ROOT, "vite.config.ts"),
      logLevel: "silent",
      server: {
        host: "127.0.0.1",
        port,
        strictPort: true,
      },
    });
    await vite.listen();
    baseUrl = `http://127.0.0.1:${port}`;

    const executablePath = browserExecutable();
    browser = await chromium.launch(
      executablePath
        ? { executablePath, headless: true }
        : { channel: "chrome", headless: true },
    );
    const context = await browser.newContext({
      viewport: { width: 915, height: 412 },
      screen: { width: 915, height: 412 },
    });
    page = await context.newPage();

    await page.route("**/api/roulette/state", async (route) => {
      const table = tableSnapshot();
      const responseGlobalBet = globalBet
        ? {
            ...globalBet,
            bets: cloneBets(globalBet.bets),
            settlement:
              phase === "result"
                ? settleRouletteBets(globalBet.bets, TEST_RESULT.number)
                : null,
            payoutCents:
              phase === "result"
                ? settleRouletteBets(globalBet.bets, TEST_RESULT.number).grossReturn * 100
                : 0,
          }
        : null;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "X-Roulette-Simulation-Version": ROULETTE_SIMULATION_VERSION,
        },
        body: JSON.stringify({
          simulationVersion: ROULETTE_SIMULATION_VERSION,
          serverTimeMs: Date.now(),
          globalTable: table,
          recentResults: [],
          globalBet: responseGlobalBet,
          wallet: {
            sessionId: "roulette-browser-session",
            balanceCents: walletBalanceCents,
          },
        }),
      });
    });

    await page.route("**/api/roulette/global-bets", async (route) => {
      const body = route.request().postDataJSON() as WriteBody;
      writes.push({
        ...body,
        bets: cloneBets(body.bets),
      });

      if (body.roundId !== roundId || phase !== "betting") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "ROULETTE_GLOBAL_BETTING_CLOSED" }),
        });
        return;
      }

      const currentRevision = globalBet?.revision ?? 0;
      if (body.expectedRevision !== currentRevision) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "ROULETTE_GLOBAL_BET_STALE" }),
        });
        return;
      }

      const nextRevision = currentRevision + 1;
      globalBet = {
        id: `browser-bet-${roundId}`,
        roundId,
        bets: cloneBets(body.bets),
        stakeCents: stakeCents(body.bets),
        payoutCents: 0,
        revision: nextRevision,
        settlement: null,
        settledAtMs: null,
        updatedAtMs: Date.now(),
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          globalBet,
          balanceCents: walletBalanceCents,
        }),
      });
    });

    await page.goto(`${baseUrl}/roulette`);
    await page.locator(".roulette-page").waitFor({ state: "visible" });
    await eventually(() => globalBet === null);
    await eventually(async () =>
      (await page.locator("[data-roulette-page]").getAttribute("data-betting-locked")) ===
      "false",
    );
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
    await vite?.close();
  });

  it(
    "places, repeatedly moves, reuses the freed source, doubles by value tier, survives verify/spin, and preserves a $1000 board",
    async () => {
      const chip10 = page.locator('.roulette-chip-option[data-chip-value="10"]:visible').first();
      await chip10.click();
      await page.locator('[data-bet-id="straight-24"]').click();
      await waitForServerTotals({ "straight-24": 10 });
      expect(await chipState(page, "straight-24")).toMatchObject({
        amount: 10,
        tier: "white",
      });

      await dragChip(page, "straight-24", "straight-25");
      await waitForServerTotals({ "straight-25": 10 });
      await eventually(async () =>
        (await page.locator('[data-bet-id="straight-24"] .roulette-placed-chip').count()) === 0,
      );
      expect(await chipState(page, "straight-25")).toMatchObject({ amount: 10 });

      await page.waitForTimeout(380);
      await dragChip(page, "straight-25", "straight-26");
      await waitForServerTotals({ "straight-26": 10 });
      await page.waitForTimeout(380);
      await dragChip(page, "straight-26", "straight-25");
      await waitForServerTotals({ "straight-25": 10 });

      await page.waitForTimeout(380);
      await page.locator('[data-bet-id="straight-24"]').click();
      await waitForServerTotals({
        "straight-25": 10,
        "straight-24": 10,
      });

      const doubleButton = page.locator("[data-double-bet]:visible").first();
      const expectedAmounts = [20, 40, 80, 160];
      for (const expected of expectedAmounts) {
        await doubleButton.click();
        await waitForServerTotals({
          "straight-25": expected,
          "straight-24": expected,
        });
      }

      expect(await chipState(page, "straight-24")).toMatchObject({
        amount: 160,
        tier: "green",
      });
      expect(await chipState(page, "straight-25")).toMatchObject({
        amount: 160,
        tier: "green",
      });

      const dragWrites = writes.filter((write) =>
        write.idempotencyKey.startsWith("roulette_move_v6_") ||
        write.idempotencyKey.startsWith("roulette_move_latest_")
      );
      expect(dragWrites.length).toBeGreaterThanOrEqual(3);
      expect(dragWrites.every((write) => stakeCents(write.bets) === 1_000)).toBe(true);

      phase = "verifying";
      await forceStateRefresh();
      await eventually(async () =>
        (await page.locator("[data-roulette-page]").getAttribute("data-betting-locked")) ===
        "true",
      );
      expect(await chipState(page, "straight-24")).toMatchObject({ amount: 160 });
      expect(await chipState(page, "straight-25")).toMatchObject({ amount: 160 });
      expect(stakeCents(globalBet?.bets ?? [])).toBe(32_000);

      phase = "spinning";
      await forceStateRefresh();
      await eventually(async () =>
        (await page.locator("[data-roulette-wheel]").getAttribute("data-roulette-state")) ===
        "spinning",
      );
      expect(await chipState(page, "straight-24")).toMatchObject({ amount: 160 });
      expect(await chipState(page, "straight-25")).toMatchObject({ amount: 160 });

      phase = "result";
      await forceStateRefresh();
      await eventually(async () =>
        (await page.locator("[data-roulette-wheel]").getAttribute("data-roulette-state")) ===
        "settled",
      );

      await beginRound("browser-round-2");
      const chip100 = page.locator('.roulette-chip-option[data-chip-value="100"]:visible').first();
      await chip100.click();
      await page.locator('[data-bet-id="straight-30"]').click();
      await waitForServerTotals({ "straight-30": 100 });
      await doubleButton.click();
      await waitForServerTotals({ "straight-30": 200 });
      expect(await chipState(page, "straight-30")).toMatchObject({
        amount: 200,
        tier: "green",
      });

      phase = "result";
      await forceStateRefresh();
      await eventually(async () =>
        (await page.locator("[data-roulette-wheel]").getAttribute("data-roulette-state")) ===
        "settled",
      );

      await beginRound("browser-round-3");
      await page.locator('.roulette-chip-option[data-chip-value="100"]:visible').first().click();
      for (let number = 1; number <= 10; number += 1) {
        await page.locator(`[data-bet-id="straight-${number}"]`).click();
        await waitForServerTotals(
          Object.fromEntries(
            Array.from({ length: number }, (_, index) => [
              `straight-${index + 1}`,
              100,
            ]),
          ),
        );
      }
      expect(stakeCents(globalBet?.bets ?? [])).toBe(100_000);
      expect(await page.locator(".roulette-placed-chip").count()).toBe(10);

      phase = "verifying";
      await forceStateRefresh();
      await page.waitForTimeout(300);
      expect(stakeCents(globalBet?.bets ?? [])).toBe(100_000);
      expect(await page.locator(".roulette-placed-chip").count()).toBe(10);
      for (let number = 1; number <= 10; number += 1) {
        expect(await chipState(page, `straight-${number}`)).toMatchObject({
          amount: 100,
          tier: "green",
        });
      }

      phase = "spinning";
      await forceStateRefresh();
      await eventually(async () =>
        (await page.locator("[data-roulette-wheel]").getAttribute("data-roulette-state")) ===
        "spinning",
      );
      expect(stakeCents(globalBet?.bets ?? [])).toBe(100_000);
      expect(await page.locator(".roulette-placed-chip").count()).toBe(10);
    },
    60_000,
  );
});
