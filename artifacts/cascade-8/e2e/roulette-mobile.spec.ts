import { test, expect, type Page, type TestInfo } from "@playwright/test";

type RoulettePhase = "LOCKED" | "SPINNING" | "RESULT" | "SETTLING";

type RouletteSnapshot = {
  serverTime: string;
  coordinator: "leader";
  wallet: { sessionId: string; balanceCents: number; lastPayoutCents: number };
  round: {
    id: string;
    sequence: number;
    phase: RoulettePhase;
    phaseStartedAt: string;
    nextTransitionAt: string;
    countdownMs: number;
    commitmentHash: string;
    winningNumber: number | null;
    luckyNumbers: number[];
    revealedMultipliers: number[];
    multipliersTotal: number;
    version: number;
  };
};

type RouletteFixture = {
  page: Page;
  setSnapshot: (snapshot: RouletteSnapshot) => Promise<void>;
  emitSnapshot: (snapshot: RouletteSnapshot) => Promise<void>;
  animationCounts: () => Promise<{ rotor: number; ball: number; active: number }>;
};

const WINNING_NUMBER = 26;
function makeSnapshot(
  phase: RoulettePhase,
  winningNumber: number | null = null,
  phaseStartedAt = new Date().toISOString(),
): RouletteSnapshot {
  const now = Date.now();
  return {
    serverTime: new Date(now).toISOString(),
    coordinator: "leader",
    wallet: { sessionId: "mobile-e2e-session", balanceCents: 100_000, lastPayoutCents: 0 },
    round: {
      id: "mobile-e2e-round",
      sequence: 42,
      phase,
      phaseStartedAt,
      nextTransitionAt: new Date(now + 10_000).toISOString(),
      countdownMs: 10_000,
      commitmentHash: "mobile-e2e-commitment",
      winningNumber,
      luckyNumbers: [],
      revealedMultipliers: [],
      multipliersTotal: 0,
      version: 1,
    },
  };
}

async function installRouletteFixture(page: Page): Promise<RouletteFixture> {
  let currentSnapshot = makeSnapshot("LOCKED");

  await page.addInitScript(() => {
    const sockets = new Set<EventTarget>();
    const animationRecords: Array<{ kind: "rotor" | "ball" | "other"; active: boolean }> = [];
    const originalAnimate = Element.prototype.animate;

    Element.prototype.animate = function (...args: Parameters<typeof originalAnimate>) {
      const element = this as HTMLElement;
      const kind = element.classList.contains("wheel-rotor")
        ? "rotor"
        : element.classList.contains("wheel-ball")
          ? "ball"
          : "other";
      const record = { kind, active: true };
      animationRecords.push(record);
      const animation = originalAnimate.apply(this, args);
      const originalCancel = animation.cancel.bind(animation);
      animation.cancel = () => {
        record.active = false;
        originalCancel();
      };
      animation.finished.finally(() => {
        record.active = false;
      }).catch(() => undefined);
      return animation;
    };

    class FixtureWebSocket extends EventTarget {
      static readonly OPEN = 1;
      readonly readyState = FixtureWebSocket.OPEN;
      constructor() {
        super();
        sockets.add(this);
        queueMicrotask(() => this.dispatchEvent(new Event("open")));
      }
      close() {
        sockets.delete(this);
        this.dispatchEvent(new Event("close"));
      }
      send() {}
    }

    Object.defineProperty(window, "WebSocket", { configurable: true, value: FixtureWebSocket });
    Object.defineProperty(window, "__rouletteFixture", {
      configurable: true,
      value: {
        emit(snapshot: unknown) {
          const event = new MessageEvent("message", { data: JSON.stringify({ snapshot }) });
          sockets.forEach((socket) => socket.dispatchEvent(event));
        },
        animationCounts() {
          return {
            rotor: animationRecords.filter((record) => record.kind === "rotor").length,
            ball: animationRecords.filter((record) => record.kind === "ball").length,
            active: animationRecords.filter((record) => record.active).length,
          };
        },
      },
    });
  });

  await page.route("**/api/roulette/snapshot", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(currentSnapshot),
    });
  });
  await page.route("**/api/roulette/history*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [] }),
    });
  });

  await page.goto("/roulette");
  await expect(page.locator(".roulette-page")).toBeVisible();
  await expect(page.locator(".roulette-hud [data-phase]")).toHaveText("MASA KİLİTLENDİ");
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(600);

  return {
    page,
    setSnapshot: async (snapshot) => {
      currentSnapshot = snapshot;
    },
    emitSnapshot: async (snapshot) => {
      await page.evaluate((next) => {
        (window as Window & {
          __rouletteFixture?: { emit: (value: unknown) => void };
        }).__rouletteFixture?.emit(next);
      }, snapshot);
    },
    animationCounts: async () => page.evaluate(() => {
      return (window as Window & {
        __rouletteFixture?: { animationCounts: () => { rotor: number; ball: number; active: number } };
      }).__rouletteFixture?.animationCounts() ?? { rotor: 0, ball: 0, active: 0 };
    }),
  };
}

async function setVisibility(page: Page, state: "hidden" | "visible") {
  await page.evaluate((nextState) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => nextState,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

async function expectHiddenResult(page: Page) {
  await expect(page.locator("[data-overlay-winning]")).toHaveText("?");
  await expect(page.locator("[data-result-overlay]")).not.toHaveClass(/is-visible/);
  await expect(page.locator(".wheel-pocket.is-winning")).toHaveCount(0);
}

async function expectSettledResult(page: Page) {
  await expect(page.locator("[data-overlay-winning]")).toHaveText(String(WINNING_NUMBER), { timeout: 5_000 });
  await expect(page.locator("[data-result-overlay]")).toHaveClass(/is-visible/);
  await expect(page.locator(".wheel-pocket.is-winning")).toHaveCount(1);
  await expect(page.locator(`.wheel-pocket[data-wheel-number="${WINNING_NUMBER}"]`)).toHaveClass(/is-winning/);
}

async function attachLifecycleDiagnostics(page: Page, testInfo: TestInfo) {
  await testInfo.attach("roulette-lifecycle-state", {
    body: await page.evaluate(() => JSON.stringify({
      viewport: { width: window.innerWidth, height: window.innerHeight },
      phase: document.querySelector("[data-phase]")?.textContent,
      winningNumber: document.querySelector("[data-overlay-winning]")?.textContent,
      resultVisible: document.querySelector("[data-result-overlay]")?.classList.contains("is-visible"),
      winningPockets: document.querySelectorAll(".wheel-pocket.is-winning").length,
    }, null, 2)),
    contentType: "application/json",
  });
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) await attachLifecycleDiagnostics(page, testInfo);
});

test.describe("roulette recovery on mobile browsers", () => {
  test("recovers from backgrounding during SPINNING without inventing a result", async ({ page }) => {
    const fixture = await installRouletteFixture(page);
    const spinning = makeSnapshot("SPINNING");

    await test.step("lifecycle: enter SPINNING", async () => {
      await fixture.emitSnapshot(spinning);
      await expect(page.locator(".roulette-hud [data-phase]")).toHaveText("ÇARK DÖNÜYOR");
      await expect(page.locator("[data-wheel]")).toHaveClass(/is-spinning/);
    });

    await test.step("lifecycle: background and return", async () => {
      await setVisibility(page, "hidden");
      await fixture.setSnapshot(spinning);
      await setVisibility(page, "visible");
      await expect(page.locator(".roulette-hud [data-phase]")).toHaveText("ÇARK DÖNÜYOR");
      await expect(page.locator("[data-wheel]")).toHaveClass(/is-spinning/);
    });

    await test.step("visual settlement: result remains server-controlled", async () => {
      await expect(page.locator("[data-overlay-winning]")).toHaveText("?");
      await expect(page.locator(".wheel-pocket.is-winning")).toHaveCount(0);
      const counts = await fixture.animationCounts();
      expect(counts.rotor).toBe(1);
      expect(counts.active).toBe(2);
    });
  });

  test("resumes RESULT landing and reveals only the server-selected pocket", async ({ page }) => {
    const fixture = await installRouletteFixture(page);
    const resultStartedAt = new Date(Date.now() - 1_200).toISOString();
    const result = makeSnapshot("RESULT", WINNING_NUMBER, resultStartedAt);

    await test.step("lifecycle: enter RESULT", async () => {
      await fixture.emitSnapshot(makeSnapshot("SPINNING"));
      await fixture.emitSnapshot(result);
      await expect(page.locator(".roulette-hud [data-phase]")).toHaveText("KAZANAN SAYI");
      await expectHiddenResult(page);
    });

    await test.step("lifecycle: background and refresh RESULT", async () => {
      await setVisibility(page, "hidden");
      await fixture.setSnapshot(result);
      await setVisibility(page, "visible");
      await expectHiddenResult(page);
    });

    await test.step("visual settlement: landing completes exactly once", async () => {
      await expectSettledResult(page);
      const beforeDuplicate = await fixture.animationCounts();
      await fixture.emitSnapshot(result);
      await page.waitForTimeout(150);
      const afterDuplicate = await fixture.animationCounts();
      expect(afterDuplicate.ball).toBe(beforeDuplicate.ball);
      expect(afterDuplicate.active).toBe(0);
    });
  });

  test("keeps a settled result stable after backgrounding again", async ({ page }) => {
    const fixture = await installRouletteFixture(page);
    const settled = makeSnapshot("SETTLING", WINNING_NUMBER, new Date(Date.now() - 5_000).toISOString());

    await test.step("visual settlement: hydrate an already-settled round", async () => {
      await fixture.setSnapshot(settled);
      await fixture.emitSnapshot(settled);
      await expectSettledResult(page);
    });

    await test.step("lifecycle: background and refresh after settlement", async () => {
      await setVisibility(page, "hidden");
      await fixture.setSnapshot(settled);
      await setVisibility(page, "visible");
      await expectSettledResult(page);
    });

    await test.step("realtime refresh: duplicate settled snapshots do not reland", async () => {
      const beforeDuplicate = await fixture.animationCounts();
      await fixture.emitSnapshot(settled);
      await page.waitForTimeout(150);
      const afterDuplicate = await fixture.animationCounts();
      expect(afterDuplicate.ball).toBe(beforeDuplicate.ball);
      expect(afterDuplicate.rotor).toBe(beforeDuplicate.rotor);
      expect(afterDuplicate.active).toBe(0);
    });
  });
});