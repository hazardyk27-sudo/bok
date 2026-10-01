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
const slotCssSource = readFileSync(
  fileURLToPath(new URL("./slot.css", import.meta.url)),
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
    expect(gameSceneSource).toContain("Math.floor(48 / Math.max(active.length, 1))");
    expect(gameSceneSource).toContain("Math.min(6, Math.max(2");
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
