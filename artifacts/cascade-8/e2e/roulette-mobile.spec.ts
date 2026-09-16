import { test, expect, type Page, type TestInfo } from "@playwright/test";

type RoulettePhase = "OPEN" | "LAST_CALL" | "LOCKED" | "MULTIPLIER_REVEAL" | "SPINNING" | "RESULT" | "SETTLING";

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
    bettingClosesAt: string;
    countdownMs: number;
    commitmentHash: string;
    winningNumber: number | null;
    luckyNumbers: number[];
    revealedMultipliers: number[];
    multipliersTotal: number;
    version: number;
    bets: Array<{
      type: string;
      numbers: number[];
      stakeCents: number;
      status: "ACCEPTED" | "WON" | "LOST";
      payoutCents: number;
      label: string;
    }>;
  };
};

type RouletteFixture = {
  page: Page;
  setSnapshot: (snapshot: RouletteSnapshot) => Promise<void>;
  emitSnapshot: (snapshot: RouletteSnapshot) => Promise<void>;
  animationCounts: () => Promise<{ rotor: number; ball: number; active: number }>;
  postBatches: Array<{ bets: Array<{ type: string; numbers: number[]; stakeCents: number; label: string }> }>;
};

type OrientationDiagnostics = {
  orientation: "portrait" | "landscape";
  viewport: { width: number; height: number };
  safeAreaInsets: SafeAreaInsets;
  safeAreaPadding: SafeAreaInsets;
  wheel: { width: number; height: number; left: number; top: number };
  overlay: { width: number; height: number; left: number; top: number; visible: boolean };
  overlayWithinWheel: boolean;
  wheelWithinSafeArea: boolean;
  overlayWithinSafeArea: boolean;
  winningNumber: string;
  winningPockets: number;
};

type BettingControlDiagnostics = {
  viewport: { width: number; height: number };
  scroll: { clientWidth: number; scrollWidth: number; clientHeight: number; scrollHeight: number };
  horizontalOverflow: boolean;
  bettingCard: { left: number; right: number; top: number; bottom: number; width: number; height: number };
  controls: Record<string, {
    visible: boolean;
    reachable: boolean;
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
  }>;
};

type SafeAreaInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

const WINNING_NUMBER = 26;
const MOBILE_SAFE_AREA_INSETS: SafeAreaInsets = { top: 30, right: 24, bottom: 36, left: 18 };

function makeSnapshot(
  phase: RoulettePhase,
  winningNumber: number | null = null,
  phaseStartedAt = new Date().toISOString(),
  bettingClosesInMs = 10_000,
  roundId = "mobile-e2e-round",
): RouletteSnapshot {
  const now = Date.now();
  return {
    serverTime: new Date(now).toISOString(),
    coordinator: "leader",
    wallet: { sessionId: "mobile-e2e-session", balanceCents: 100_000, lastPayoutCents: 0 },
    round: {
      id: roundId,
      sequence: 42,
      phase,
      phaseStartedAt,
      nextTransitionAt: new Date(now + 10_000).toISOString(),
      bettingClosesAt: new Date(now + bettingClosesInMs).toISOString(),
      countdownMs: 10_000,
      commitmentHash: "mobile-e2e-commitment",
      winningNumber,
      luckyNumbers: [],
      revealedMultipliers: [],
      multipliersTotal: 0,
      version: 1,
      bets: [],
    },
  };
}

async function installRouletteFixture(page: Page): Promise<RouletteFixture> {
  let currentSnapshot = makeSnapshot("LOCKED");
  const postBatches: RouletteFixture["postBatches"] = [];

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
  await page.route("**/api/roulette/bets", async (route) => {
    const payload = route.request().postDataJSON() as RouletteFixture["postBatches"][number];
    if (!["OPEN", "LAST_CALL"].includes(currentSnapshot.round.phase)) {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "BETTING_CLOSED" }),
      });
      return;
    }
    postBatches.push(payload);
    const accepted = payload.bets.map((bet) => ({
      ...bet,
      status: "ACCEPTED" as const,
      payoutCents: 0,
    }));
    currentSnapshot = {
      ...currentSnapshot,
      round: { ...currentSnapshot.round, bets: accepted },
    };
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        bets: accepted,
        totalStakeCents: accepted.reduce((sum, bet) => sum + bet.stakeCents, 0),
        wallet: {
          sessionId: currentSnapshot.wallet.sessionId,
          balanceCents: currentSnapshot.wallet.balanceCents - accepted.reduce((sum, bet) => sum + bet.stakeCents, 0),
        },
      }),
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
    postBatches,
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
  await expect(page.locator("[data-overlay-winning]")).toHaveText(String(WINNING_NUMBER), { timeout: 10_000 });
  await expect(page.locator("[data-result-overlay]")).toHaveClass(/is-visible/);
  await expect(page.locator(".wheel-pocket.is-winning")).toHaveCount(1);
  await expect(page.locator(`.wheel-pocket[data-wheel-number="${WINNING_NUMBER}"]`)).toHaveClass(/is-winning/);
}

async function captureOrientationDiagnostics(page: Page): Promise<OrientationDiagnostics> {
  return page.evaluate(() => {
    const wheel = document.querySelector<HTMLElement>("[data-wheel]")!;
    const overlay = document.querySelector<HTMLElement>("[data-result-overlay]")!;
    const appShell = document.querySelector<HTMLElement>(".app-shell")!;
    const wheelRect = wheel.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const orientation = window.matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape";
    const rootStyles = getComputedStyle(document.documentElement);
    const shellStyles = getComputedStyle(appShell);
    const readPixels = (value: string) => Number.parseFloat(value) || 0;
    const safeAreaInsets = {
      top: readPixels(rootStyles.getPropertyValue("--safe-area-inset-top")),
      right: readPixels(rootStyles.getPropertyValue("--safe-area-inset-right")),
      bottom: readPixels(rootStyles.getPropertyValue("--safe-area-inset-bottom")),
      left: readPixels(rootStyles.getPropertyValue("--safe-area-inset-left")),
    };
    const safeAreaPadding = {
      top: readPixels(shellStyles.paddingTop),
      right: readPixels(shellStyles.paddingRight),
      bottom: readPixels(shellStyles.paddingBottom),
      left: readPixels(shellStyles.paddingLeft),
    };
    const overlayWithinWheel = overlayRect.left >= wheelRect.left
      && overlayRect.top >= wheelRect.top
      && overlayRect.right <= wheelRect.right
      && overlayRect.bottom <= wheelRect.bottom;
    const wheelWithinSafeArea = wheelRect.left >= safeAreaInsets.left
      && wheelRect.top >= safeAreaInsets.top
      && wheelRect.right <= viewport.width - safeAreaInsets.right
      && wheelRect.bottom <= viewport.height - safeAreaInsets.bottom;
    const overlayWithinSafeArea = !overlay.classList.contains("is-visible")
      || (overlayRect.left >= safeAreaInsets.left
        && overlayRect.top >= safeAreaInsets.top
        && overlayRect.right <= viewport.width - safeAreaInsets.right
        && overlayRect.bottom <= viewport.height - safeAreaInsets.bottom);
    return {
      orientation,
      viewport,
      safeAreaInsets,
      safeAreaPadding,
      wheel: { width: wheelRect.width, height: wheelRect.height, left: wheelRect.left, top: wheelRect.top },
      overlay: {
        width: overlayRect.width,
        height: overlayRect.height,
        left: overlayRect.left,
        top: overlayRect.top,
        visible: overlay.classList.contains("is-visible"),
      },
      overlayWithinWheel,
      wheelWithinSafeArea,
      overlayWithinSafeArea,
      winningNumber: document.querySelector<HTMLElement>("[data-overlay-winning]")?.textContent ?? "",
      winningPockets: document.querySelectorAll(".wheel-pocket.is-winning").length,
    };
  });
}

async function captureBettingControlDiagnostics(page: Page): Promise<BettingControlDiagnostics> {
  return page.evaluate(() => {
    const rectValues = (element: HTMLElement | null) => {
      if (!element) return { visible: false, reachable: false, left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const visible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      const viewportWidth = document.documentElement.clientWidth;
      const reachable = visible
        && rect.left >= -1
        && rect.right <= viewportWidth + 1
        && rect.top >= -1
        && rect.bottom <= document.documentElement.scrollHeight + 1;
      return {
        visible,
        reachable,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const firstVisible = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector))
      .find((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }) ?? null;
    const controls = {
      betArea: firstVisible('[data-bet-key="straight:7"]'),
      chip: firstVisible('[data-action="drawer-chips"], [data-stake="100"]'),
      undo: firstVisible('[data-action="undo"]'),
      clear: firstVisible('[data-action="clear"]'),
      spin: firstVisible("[data-wheel]"),
    };
    const bettingCard = document.querySelector<HTMLElement>(".roulette-bet-card");
    const scroll = {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      clientHeight: document.documentElement.clientHeight,
      scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    };
    const cardRect = bettingCard?.getBoundingClientRect() ?? new DOMRect();
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll,
      horizontalOverflow: scroll.scrollWidth > scroll.clientWidth + 1,
      bettingCard: {
        left: cardRect.left,
        right: cardRect.right,
        top: cardRect.top,
        bottom: cardRect.bottom,
        width: cardRect.width,
        height: cardRect.height,
      },
      controls: Object.fromEntries(Object.entries(controls).map(([name, element]) => [name, rectValues(element)])),
    } as BettingControlDiagnostics;
  });
}

async function emulateSafeAreaInsets(page: Page, insets: SafeAreaInsets) {
  await page.addStyleTag({
    content: `
      :root {
        --safe-area-inset-top: ${insets.top}px !important;
        --safe-area-inset-right: ${insets.right}px !important;
        --safe-area-inset-bottom: ${insets.bottom}px !important;
        --safe-area-inset-left: ${insets.left}px !important;
      }
    `,
  });
  await expect.poll(() => page.evaluate(() => ({
    top: getComputedStyle(document.documentElement).getPropertyValue("--safe-area-inset-top").trim(),
    right: getComputedStyle(document.documentElement).getPropertyValue("--safe-area-inset-right").trim(),
    bottom: getComputedStyle(document.documentElement).getPropertyValue("--safe-area-inset-bottom").trim(),
    left: getComputedStyle(document.documentElement).getPropertyValue("--safe-area-inset-left").trim(),
  }))).toEqual({
    top: `${insets.top}px`,
    right: `${insets.right}px`,
    bottom: `${insets.bottom}px`,
    left: `${insets.left}px`,
  });
}

async function setMobileOrientation(page: Page, orientation: "portrait" | "landscape") {
  const viewport = orientation === "portrait"
    ? { width: 412, height: 915 }
    : { width: 915, height: 412 };
  await page.setViewportSize(viewport);
  await expect.poll(() => page.evaluate(() => ({
    orientation: window.matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape",
    width: window.innerWidth,
    height: window.innerHeight,
  }))).toEqual({ orientation, ...viewport });
  return captureOrientationDiagnostics(page);
}

async function attachLifecycleDiagnostics(page: Page, testInfo: TestInfo) {
  const lifecycle = await page.evaluate(() => ({
    viewport: { width: window.innerWidth, height: window.innerHeight },
    phase: document.querySelector("[data-phase]")?.textContent,
    winningNumber: document.querySelector("[data-overlay-winning]")?.textContent,
    resultVisible: document.querySelector("[data-result-overlay]")?.classList.contains("is-visible"),
    winningPockets: document.querySelectorAll(".wheel-pocket.is-winning").length,
    safeAreaInsets: (() => {
      const styles = getComputedStyle(document.documentElement);
      const readPixels = (value: string) => Number.parseFloat(value) || 0;
      return {
        top: readPixels(styles.getPropertyValue("--safe-area-inset-top")),
        right: readPixels(styles.getPropertyValue("--safe-area-inset-right")),
        bottom: readPixels(styles.getPropertyValue("--safe-area-inset-bottom")),
        left: readPixels(styles.getPropertyValue("--safe-area-inset-left")),
      };
    })(),
    safeAreaPadding: (() => {
      const appShell = document.querySelector<HTMLElement>(".app-shell");
      if (!appShell) return null;
      const styles = getComputedStyle(appShell);
      const readPixels = (value: string) => Number.parseFloat(value) || 0;
      return {
        top: readPixels(styles.paddingTop),
        right: readPixels(styles.paddingRight),
        bottom: readPixels(styles.paddingBottom),
        left: readPixels(styles.paddingLeft),
      };
    })(),
  }));
  let geometry: OrientationDiagnostics | null = null;
  try {
    geometry = await captureOrientationDiagnostics(page);
  } catch {
    // Keep lifecycle state when the page failed before the roulette geometry mounted.
  }
  await testInfo.attach("roulette-lifecycle-state", {
    body: JSON.stringify({ lifecycle, geometry }, null, 2),
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

  test("keeps wheel geometry and the server result authoritative across orientation changes", async ({ page }, testInfo) => {
    const fixture = await installRouletteFixture(page);
    const orientationDiagnostics: OrientationDiagnostics[] = [];
    const spinning = makeSnapshot("SPINNING");
    await emulateSafeAreaInsets(page, MOBILE_SAFE_AREA_INSETS);

    await test.step("lifecycle: enter SPINNING in portrait", async () => {
      orientationDiagnostics.push(await setMobileOrientation(page, "portrait"));
      expect(orientationDiagnostics.at(-1)?.safeAreaInsets).toEqual(MOBILE_SAFE_AREA_INSETS);
      expect(orientationDiagnostics.at(-1)?.safeAreaPadding.left).toBeGreaterThanOrEqual(MOBILE_SAFE_AREA_INSETS.left);
      expect(orientationDiagnostics.at(-1)?.safeAreaPadding.right).toBeGreaterThanOrEqual(MOBILE_SAFE_AREA_INSETS.right);
      expect(orientationDiagnostics.at(-1)?.safeAreaPadding.top).toBeGreaterThanOrEqual(MOBILE_SAFE_AREA_INSETS.top);
      expect(orientationDiagnostics.at(-1)?.safeAreaPadding.bottom).toBeGreaterThanOrEqual(MOBILE_SAFE_AREA_INSETS.bottom);
      await fixture.emitSnapshot(spinning);
      await expect(page.locator(".roulette-hud [data-phase]")).toHaveText("ÇARK DÖNÜYOR");
      await expect(page.locator("[data-wheel]")).toHaveClass(/is-spinning/);
      await expectHiddenResult(page);
    });

    await test.step("layout: rotate to landscape during SPINNING", async () => {
      const diagnostics = await setMobileOrientation(page, "landscape");
      orientationDiagnostics.push(diagnostics);
      expect(diagnostics.orientation).toBe("landscape");
      expect(diagnostics.safeAreaInsets).toEqual(MOBILE_SAFE_AREA_INSETS);
      expect(diagnostics.safeAreaPadding.left).toBeGreaterThanOrEqual(MOBILE_SAFE_AREA_INSETS.left);
      expect(diagnostics.safeAreaPadding.right).toBeGreaterThanOrEqual(MOBILE_SAFE_AREA_INSETS.right);
      expect(diagnostics.wheel.width).toBeGreaterThan(0);
      expect(diagnostics.wheel.height).toBeGreaterThan(0);
      expect(Math.abs(diagnostics.wheel.width - diagnostics.wheel.height)).toBeLessThan(2);
      expect(diagnostics.overlay.visible).toBe(false);
      await expect(page.locator("[data-wheel]")).toHaveClass(/is-spinning/);
      await expectHiddenResult(page);
    });

    await test.step("lifecycle: enter RESULT without exposing the pocket", async () => {
      const result = makeSnapshot("RESULT", WINNING_NUMBER, new Date().toISOString());
      await fixture.emitSnapshot(result);
      await expect(page.locator(".roulette-hud [data-phase]")).toHaveText("KAZANAN SAYI");
      await expectHiddenResult(page);
      orientationDiagnostics.push(await captureOrientationDiagnostics(page));
    });

    await test.step("layout: rotate portrait to landscape again during RESULT", async () => {
      const portraitDiagnostics = await setMobileOrientation(page, "portrait");
      const landscapeDiagnostics = await setMobileOrientation(page, "landscape");
      orientationDiagnostics.push(portraitDiagnostics, landscapeDiagnostics);
      for (const diagnostics of [portraitDiagnostics, landscapeDiagnostics]) {
        expect(diagnostics.safeAreaInsets).toEqual(MOBILE_SAFE_AREA_INSETS);
        expect(diagnostics.wheel.width).toBeGreaterThan(0);
        expect(diagnostics.wheel.height).toBeGreaterThan(0);
        expect(Math.abs(diagnostics.wheel.width - diagnostics.wheel.height)).toBeLessThan(2);
        expect(diagnostics.overlay.visible).toBe(false);
        expect(diagnostics.winningNumber).toBe("?");
        expect(diagnostics.winningPockets).toBe(0);
      }
      await expectHiddenResult(page);
    });

    await test.step("visual settlement: reveal only the server-selected pocket", async () => {
      await expectSettledResult(page);
      const settledDiagnostics = await captureOrientationDiagnostics(page);
      orientationDiagnostics.push(settledDiagnostics);
      expect(settledDiagnostics.winningNumber).toBe(String(WINNING_NUMBER));
      expect(settledDiagnostics.winningPockets).toBe(1);
      expect(settledDiagnostics.overlay.visible).toBe(true);
      expect(settledDiagnostics.overlayWithinWheel).toBe(true);
      expect(settledDiagnostics.overlayWithinSafeArea, JSON.stringify(settledDiagnostics, null, 2)).toBe(true);
    });

    await testInfo.attach("roulette-orientation-diagnostics", {
      body: JSON.stringify(orientationDiagnostics, null, 2),
      contentType: "application/json",
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

  test("reveals one and multiple multiplier targets on the actual portrait cells", async ({ page }) => {
    const fixture = await installRouletteFixture(page);
    const makeReveal = (revealedMultipliers: number[]) => {
      const snapshot = makeSnapshot(
        "MULTIPLIER_REVEAL",
        null,
        new Date(Date.now() - 2_000).toISOString(),
        8_000,
        "mobile-multiplier-round",
      );
      return {
        ...snapshot,
        round: {
          ...snapshot.round,
          luckyNumbers: [7, 26],
          revealedMultipliers,
          multipliersTotal: 2,
          nextTransitionAt: new Date(Date.now() + 7_000).toISOString(),
          version: revealedMultipliers.length,
        },
      };
    };

    const firstReveal = makeReveal([50]);
    await fixture.setSnapshot(firstReveal);
    await fixture.emitSnapshot(firstReveal);
    await expect(page.locator(".roulette-hud [data-phase]")).toHaveText("MULTIPLIER REVEAL");
    await expect(page.locator('[data-bet-key="straight:7"]:visible .multiplier-badge')).toHaveText("50x");
    await expect(page.locator('[data-bet-key="straight:26"]:visible .multiplier-badge')).toHaveCount(1);

    const secondReveal = makeReveal([50, 500]);
    await fixture.setSnapshot(secondReveal);
    await fixture.emitSnapshot(secondReveal);
    await expect(page.locator('[data-bet-key="straight:26"]:visible .multiplier-badge')).toHaveText("500x");

    const diagnostics = await page.evaluate(() => {
      const visibleTarget = (number: number) => Array.from(document.querySelectorAll<HTMLElement>(`[data-bet-key="straight:${number}"]`))
        .find((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }) ?? null;
      const effects = document.querySelector<HTMLElement>("[data-multiplier-effects]");
      const strike = document.querySelector<HTMLElement>(".multiplier-strike");
      const impact = document.querySelector<HTMLElement>(".multiplier-impact");
      const effectRect = effects?.getBoundingClientRect() ?? new DOMRect();
      const targets = [7, 26].map((number) => {
        const target = visibleTarget(number);
        const rect = target?.getBoundingClientRect() ?? new DOMRect();
        return {
          number,
          isMobileTable: target?.closest(".roulette-mobile-table") !== null,
          withinEffects: rect.left >= effectRect.left
            && rect.right <= effectRect.right
            && rect.top >= effectRect.top
            && rect.bottom <= effectRect.bottom,
        };
      });
      return {
        targets,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        strikeUsesTargetOrigin: Boolean(strike?.style.getPropertyValue("--strike-start-x")),
        impactUsesTargetCoordinates: Boolean(impact?.style.getPropertyValue("--impact-x")),
      };
    });

    expect(diagnostics.horizontalOverflow).toBe(false);
    expect(diagnostics.targets).toEqual([
      { number: 7, isMobileTable: true, withinEffects: true },
      { number: 26, isMobileTable: true, withinEffects: true },
    ]);
    expect(diagnostics.strikeUsesTargetOrigin).toBe(true);
    expect(diagnostics.impactUsesTargetCoordinates).toBe(true);
  });
});

test.describe("roulette betting controls on rotation", () => {
  test("keeps OPEN and LAST_CALL controls reachable in short landscape viewports", async ({ page }, testInfo) => {
    const fixture = await installRouletteFixture(page);
    const open = makeSnapshot("OPEN", null, new Date().toISOString(), 60_000);
    const diagnostics: BettingControlDiagnostics[] = [];
    const landscapeViewports = [
      { width: 915, height: 412 },
      { width: 667, height: 375 },
      { width: 568, height: 320 },
    ];

    await fixture.setSnapshot(open);
    await fixture.emitSnapshot(open);
    await expect(page.locator(".roulette-page")).toHaveClass(/is-betting-phase/);

    for (const [index, viewport] of landscapeViewports.entries()) {
      await page.setViewportSize(viewport);
      await expect.poll(() => page.evaluate(() => ({
        orientation: window.matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape",
        width: window.innerWidth,
        height: window.innerHeight,
      }))).toEqual({ orientation: "landscape", ...viewport });

      if (index === 1) {
        const lastCall = makeSnapshot("LAST_CALL", null, new Date().toISOString(), 60_000, open.round.id);
        await fixture.emitSnapshot(lastCall);
        await expect(page.locator(".roulette-page")).toHaveClass(/is-betting-phase/);
      }

      const viewportDiagnostics = await captureBettingControlDiagnostics(page);
      diagnostics.push(viewportDiagnostics);
      expect(viewportDiagnostics.horizontalOverflow, JSON.stringify(viewportDiagnostics, null, 2)).toBe(false);
      expect(viewportDiagnostics.bettingCard.width).toBeLessThanOrEqual(viewport.width);
      expect(viewportDiagnostics.bettingCard.left).toBeGreaterThanOrEqual(-1);
      expect(viewportDiagnostics.bettingCard.right).toBeLessThanOrEqual(viewport.width + 1);
      for (const [name, control] of Object.entries(viewportDiagnostics.controls)) {
        expect(control.visible, `${name} is not visible: ${JSON.stringify(viewportDiagnostics, null, 2)}`).toBe(true);
        expect(control.reachable, `${name} is clipped: ${JSON.stringify(viewportDiagnostics, null, 2)}`).toBe(true);
      }
    }

    await testInfo.attach("roulette-betting-control-diagnostics", {
      body: JSON.stringify(diagnostics, null, 2),
      contentType: "application/json",
    });
  });
});

test.describe("roulette betting flow", () => {
  test("keeps multiple bets, auto-submits once, restores after refresh, and rejects late bets", async ({ page }) => {
    const fixture = await installRouletteFixture(page);
    const open = makeSnapshot("OPEN", null, new Date().toISOString(), 3_000);
    const visibleBet = (key: string) => page.locator(`[data-bet-key="${key}"]:visible`).first();

    await fixture.setSnapshot(open);
    await fixture.emitSnapshot(open);
    await expect(page.locator(".roulette-hud [data-phase]")).toHaveText("BAHİSLER AÇIK");
    await expect(page.locator("[data-action='bet']")).toHaveCount(0);

    for (const key of ["straight:7", "straight:17", "straight:22", "red", "dozen:2"]) {
      await visibleBet(key).click();
    }
    await visibleBet("straight:7").click();
    await expect(page.locator("[data-bet-count]")).toHaveText("5 ALAN");
    await expect(visibleBet("straight:7").locator(".table-chip")).toHaveText("2,00");

    await page.locator("[data-action='undo']:visible").first().click();
    await expect(visibleBet("straight:7").locator(".table-chip")).toHaveText("1,00");
    await expect(page.locator("[data-bet-count]")).toHaveText("5 ALAN");

    await expect.poll(() => fixture.postBatches.length, { timeout: 5_000 }).toBe(1);
    expect(fixture.postBatches[0].bets.map((bet) => `${bet.type}:${bet.numbers.join("-")}`)).toEqual([
      "STRAIGHT:7",
      "STRAIGHT:17",
      "STRAIGHT:22",
      "RED:1-3-5-7-9-12-14-16-18-19-21-23-25-27-30-32-34-36",
      "DOZEN:13-14-15-16-17-18-19-20-21-22-23-24",
    ]);

    const acceptedBets = fixture.postBatches[0].bets.map((bet) => ({
      ...bet,
      status: "ACCEPTED" as const,
      payoutCents: 0,
    }));
    const locked = {
      ...open,
      round: {
        ...open.round,
        phase: "LOCKED" as const,
        nextTransitionAt: new Date(Date.now() + 1_000).toISOString(),
        bets: acceptedBets,
      },
    };
    await fixture.setSnapshot(locked);
    await fixture.emitSnapshot(locked);
    await fixture.emitSnapshot(locked);
    await expect(page.locator("[data-action='bet']")).toHaveCount(0);
    expect(fixture.postBatches).toHaveLength(1);

    const lateResponse = await page.evaluate(async () => {
      const response = await fetch("/api/roulette/bets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bets: [{ type: "STRAIGHT", numbers: [26], stakeCents: 100, label: "26" }],
          idempotencyKey: "late-bet-fixture-key",
        }),
      });
      return { status: response.status, body: await response.json() };
    });
    expect(lateResponse).toEqual({ status: 409, body: { error: "BETTING_CLOSED" } });

    await page.reload();
    await expect(page.locator(".roulette-hud [data-phase]")).toHaveText("MASA KİLİTLENDİ");
    await expect(visibleBet("straight:7").locator(".table-chip")).toHaveText("1,00");
    await page.waitForTimeout(250);
    expect(fixture.postBatches).toHaveLength(1);

    const nextRound = makeSnapshot("OPEN", null, new Date().toISOString(), 10_000, "mobile-e2e-next-round");
    await fixture.setSnapshot(nextRound);
    await fixture.emitSnapshot(nextRound);
    await expect(page.locator(".roulette-hud [data-phase]")).toHaveText("BAHİSLER AÇIK");
    await page.locator("[data-action='rebet']:visible").first().click();
    await expect(page.locator("[data-bet-count]")).toHaveText("5 ALAN");
    await expect(visibleBet("straight:7").locator(".table-chip")).toHaveText("1,00");
    await page.locator("[data-action='clear']:visible").first().click();
    await expect(page.locator("[data-bet-count]")).toHaveText("0 ALAN");
    await page.locator("[data-action='rebet']:visible").first().click();
    await expect(page.locator("[data-bet-count]")).toHaveText("5 ALAN");
  });
});