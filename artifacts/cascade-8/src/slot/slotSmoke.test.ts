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

  it("does not leak win-label and transient FX work across round boundaries", () => {
    expect(gameSceneSource).toContain("settleRoundVisuals()");
    expect(gameSceneSource).toContain("this.activeWinLabels.completeAll()");
    expect(gameSceneSource).toContain("deferredDestroyQueue");
    expect(gameSceneSource).toContain("scheduleDeferredDestroy()");
    expect(gameSceneSource).toContain("window.requestAnimationFrame(drain)");
    expect(gameSceneSource).toContain("splice(0, 3)");
    expect(gameSceneSource).toContain("winLabelPool");
    expect(gameSceneSource).toContain("acquireWinLabel");
    expect(gameSceneSource).toContain("releaseWinLabel");
    expect(gameSceneSource).not.toContain("this.retireGameObject(container)");
    const settleRoundVisualsBody =
      gameSceneSource.match(/settleRoundVisuals\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(settleRoundVisualsBody).not.toContain("clearTransientEffects");
    expect(gameSceneSource).toContain("this.acquireBurstParticle(");
    expect(gameSceneSource).not.toContain('this.add.text(centerX, centerY, "✦"');
    expect(gameSceneSource).toContain("void Promise.all(scatterNodes.map((node) => this.animateScatterLanding(node)))");
    expect(gameSceneSource).toContain('if (node.symbol === "SCATTER") void this.animateScatterLanding(node);');
    expect(gameSceneSource).not.toContain("if (mayResolveAtVisualSettle) complete()");
    expect(gameSceneSource).toContain("Math.min(720, duration)");
    expect(gameSceneSource).not.toContain("Math.max(650, Math.min(700");
    expect(gameSceneSource).not.toContain("Math.max(900, Math.min(1000");
    expect(gameControllerSource).toContain("const winLabelDuration = Math.min(");
    expect(gameControllerSource).toContain("tumbleDuration(ANIMATION.refill) - 80");
    expect(gameControllerSource.match(/this\.scene\.settleRoundVisuals\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("keeps live round diagnostics available while the stall investigation is active", () => {
    expect(roundTimingSource).toContain("SLOT_RUNTIME_DIAGNOSTICS_ENABLED");
    expect(roundTimingSource).toContain('["/slot", "/lab"].includes(window.location.pathname.replace(/\\/+$/, ""))');
    expect(roundTimingSource).toContain('get("slotPerf") === "1"');
    expect(roundTimingSource).toContain("!SLOT_RUNTIME_DIAGNOSTICS_ENABLED");
  });

  it("keeps win highlight nonblocking and compacts repeated tumble transport state", () => {
    expect(gameSceneSource).toContain("highlightCells(cells: Cell[], duration: number)");
    expect(gameSceneSource).not.toContain("async highlightCells(cells: Cell[], duration: number)");
    expect(gameControllerSource).toContain("this.scene.highlightCells(tumble.winningCells");
    expect(gameControllerSource).not.toContain("await this.scene.highlightCells(tumble.winningCells");
    expect(gameControllerSource).toContain('{ blocking: false }');
    expect(slotRepositorySource).toContain("compactTumbleForWire");
    expect(slotRepositorySource).toContain('boardBefore: _boardBefore');
    expect(slotRepositorySource).toContain('boardAfterGravity: _boardAfterGravity');
    expect(slotRepositorySource).toContain('newSymbols: _newSymbols');
    expect(slotRepositorySource).toContain('multiplierCoreCells: _multiplierCoreCells');
    expect(slotWalletClientSource).toContain("hydrateTumbles");
    expect(slotWalletClientSource).toContain("boardBefore = tumble.boardAfterRefill");
    expect(slotWalletClientSource).toContain("boardAfterGravity: tumble.boardAfterRefill");
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
