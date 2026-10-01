import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const slotSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);
const routerSource = readFileSync(
  fileURLToPath(new URL("../main.ts", import.meta.url)),
  "utf8",
);
const gameSceneSource = readFileSync(
  fileURLToPath(new URL("../game/GameScene.ts", import.meta.url)),
  "utf8",
);
const gameControllerSource = readFileSync(
  fileURLToPath(new URL("../game/GameController.ts", import.meta.url)),
  "utf8",
);
const slotCssSource = readFileSync(
  fileURLToPath(new URL("./slot.css", import.meta.url)),
  "utf8",
);
const roundTimingSource = readFileSync(
  fileURLToPath(new URL("../game/RoundTiming.ts", import.meta.url)),
  "utf8",
);
const gameTimingSource = readFileSync(
  fileURLToPath(new URL("../game/GameTiming.ts", import.meta.url)),
  "utf8",
);
const slotWalletClientSource = readFileSync(
  fileURLToPath(new URL("../game/SlotWalletClient.ts", import.meta.url)),
  "utf8",
);
const slotRepositorySource = readFileSync(
  fileURLToPath(new URL("../../../api-server/src/slot/repository.ts", import.meta.url)),
  "utf8",
);

describe("slot route smoke contract", () => {
  it("routes /slot and /lab through the Slot-owned module", () => {
    expect(routerSource).toContain(
      'const isSlotRoute = currentPath === "/slot" || isLab;',
    );
    expect(routerSource).toContain(
      'const slotModule = await import("./slot");',
    );
    expect(routerSource).toContain(
      "slotModule.mountSlot(app, currentPath);",
    );
  });

  it("keeps the critical Slot DOM anchors in Slot ownership", () => {
    const requiredMarkupIds = [
      "balance",
      "bet",
      "win",
      "bonus-win",
      "phaser-board",
      "free-spins",
      "game-status-badge",
      "game-status-label",
      "tumble",
      "status",
      "bet-minus",
      "bet-plus",
      "auto-toggle",
      "auto-menu",
      "auto-count",
      "spin",
      "turbo",
      "sound",
      "bonus-overlay",
    ];

    for (const id of requiredMarkupIds) {
      expect(slotSource).toContain(`id="${id}"`);
    }
  });

  it("keeps decorative effects from stealing the reel animation budget", () => {
    expect(gameSceneSource).toContain("lastAmbientUpdateAt");
    expect(gameSceneSource).toContain("time - this.lastAmbientUpdateAt < 33");
    expect(gameSceneSource).toContain('document.visibilityState === "hidden"');
    expect(slotCssSource).toContain("contain: layout paint");
    expect(slotCssSource).toContain("backdrop-filter: none");
    expect(gameSceneSource).toContain("Math.floor(36 / Math.max(active.length, 1))");
    expect(gameSceneSource).toContain("Math.min(4, Math.max(1");
    expect(gameSceneSource).toContain("boardFrameGraphics");
    expect(gameSceneSource).toContain("graphics.fillRect");
    expect(gameSceneSource).not.toContain("cellFrames");
    expect(gameSceneSource).toContain("reuseNormalNode");
    expect(gameSceneSource).toContain("previousNodes");
    expect(gameSceneSource).toContain("reusedNodes");
    expect(gameSceneSource).toContain("createdNodes");
    expect(gameSceneSource).toContain("normalNodePool");
    expect(gameSceneSource).toContain("releaseNormalNode");
    expect(gameSceneSource).toContain("pooledNormalNodes");
  });

  it("keeps the Phaser heartbeat alive between rounds", () => {
    expect(gameSceneSource).toContain("setRuntimeActive(_active: boolean)");
    expect(gameSceneSource).toContain("setIdleSleepEnabled(_enabled: boolean)");
    expect(gameSceneSource).not.toContain("this.game.loop.sleep()");
    expect(gameSceneSource).not.toContain("this.game.loop.wake(");
    expect(gameSceneSource).not.toContain("this.game.loop.resetDelta()");
    expect(slotSource).toContain("scene.setIdleSleepEnabled(!isLab);");
    expect(gameControllerSource).toContain("this.scene.setRuntimeActive(true)");
    expect(gameControllerSource).toContain("this.scene.setRuntimeActive(false)");
  });

  it("keeps the original tumble cadence while keeping pooled visuals", () => {
    expect(gameSceneSource).toContain("winLabelPool");
    expect(gameSceneSource).toContain("acquireWinLabel");
    expect(gameSceneSource).toContain("releaseWinLabel");
    expect(gameSceneSource).toContain("async highlightCells(cells: Cell[], duration: number)");
    expect(gameControllerSource).toContain("await this.scene.highlightCells(tumble.winningCells");
    expect(gameControllerSource).toContain("this.duration(ANIMATION.burst, isBonus)");
    expect(gameControllerSource).toContain("this.duration(ANIMATION.refill, isBonus)");
    expect(gameControllerSource).toContain("this.duration(ANIMATION.winLabel, isBonus)");
    expect(gameSceneSource).toContain("Math.min(2000, duration)");
    expect(gameSceneSource).toContain("Math.max(650, Math.min(700");
    expect(gameSceneSource).toContain("Math.max(900, Math.min(1000");
    expect(gameSceneSource).toContain("if (awaitScatterLanding) void Promise.all(landings).then(complete)");
    expect(gameSceneSource).toContain("if (mayResolveAtVisualSettle) complete()");
    expect(gameSceneSource).toContain("if (!hasSpecialSymbol) complete()");
    expect(gameTimingSource).not.toContain("getTumblePacingFactor");
    expect(gameTimingSource).not.toContain("scaleTumbleAnimationDuration");
    expect(gameControllerSource).not.toContain("scaleTumbleAnimationDuration");
    expect(gameControllerSource).not.toContain("this.scene.settleRoundVisuals()");
    const renderBoardBody =
      gameSceneSource.match(/renderBoard\(board: Board,[\s\S]*?\n  async animateDrop/)?.[0] ?? "";
    expect(renderBoardBody).not.toContain("clearTransientEffects()");
    expect(renderBoardBody).not.toContain("clearPooledBurstEffects()");
  });

  it("keeps diagnostics opt-in and off the round-end network path", () => {
    expect(roundTimingSource).toContain("SLOT_RUNTIME_DIAGNOSTICS_ENABLED");
    expect(roundTimingSource).toContain('window.location.pathname.replace(/\\/+$/, "") === "/lab"');
    expect(roundTimingSource).toContain('get("slotPerf") === "1"');
    expect(roundTimingSource).not.toContain('fetch("/api/slot/perf"');
    expect(roundTimingSource).toContain("!SLOT_RUNTIME_DIAGNOSTICS_ENABLED");
  });

  it("compacts repeated tumble transport state without changing gameplay math", () => {
    expect(slotRepositorySource).toContain("compactTumbleForWire");
    expect(slotRepositorySource).toContain('boardBefore: _boardBefore');
    expect(slotRepositorySource).toContain('boardAfterGravity: _boardAfterGravity');
    expect(slotRepositorySource).toContain('newSymbols: _newSymbols');
    expect(slotRepositorySource).toContain('multiplierCoreCells: _multiplierCoreCells');
    expect(slotWalletClientSource).toContain("hydrateTumbles");
    expect(slotWalletClientSource).toContain("boardBefore = tumble.boardAfterRefill");
    expect(slotWalletClientSource).toContain("boardAfterGravity: tumble.boardAfterRefill");
  });

  it("guards burst completion without changing burst duration", () => {
    expect(gameSceneSource).toContain("watchdog = window.setTimeout(finish, duration + 220)");
    expect(gameSceneSource).toContain("onComplete: finish");
    expect(gameSceneSource).toContain("duration,");
    expect(gameSceneSource).not.toContain("duration: Math.min");
  });

  it("keeps Big/Mega/Max ceremony out of base-game round completion", () => {
    const baseSpinStart = gameControllerSource.indexOf('private async spin(');
    const freeSpinStart = gameControllerSource.indexOf('private async startFreeSpins(');
    const baseSpinBody = baseSpinStart >= 0 && freeSpinStart > baseSpinStart
      ? gameControllerSource.slice(baseSpinStart, freeSpinStart)
      : "";
    expect(baseSpinBody).not.toContain("presentLargeWin(");
    expect(gameControllerSource).toContain("await this.presentLargeWin(freeSpin.finalWinMultiplier, freeSpin.win)");
  });

  it("mounts Phaser and GameController from the Slot-owned runtime", () => {
    expect(slotSource).toContain(
      'const game = createGameScene(byId("phaser-board"));',
    );
    expect(slotSource).toContain(
      'game.scene.getScene("Cascade8GameScene") as GameScene',
    );
    expect(slotSource).toContain(
      "controller = new GameController(scene, {",
    );
    expect(slotSource).toContain('import "./slot.css";');
    expect(routerSource).not.toContain("createGameScene(");
    expect(routerSource).not.toContain("new GameController(");
  });
});
