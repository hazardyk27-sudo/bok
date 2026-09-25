import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(
  fileURLToPath(new URL("./main.ts", import.meta.url)),
  "utf8",
);

describe("slot route smoke contract", () => {
  it("keeps /slot and /lab routed through the Slot branch", () => {
    expect(mainSource).toContain(
      'const isSlotRoute = currentPath === "/slot" || isLab;',
    );
    expect(mainSource).toContain(
      '} else if (!isSlotRoute) {\n  app.innerHTML = routeShell(mainMenuMarkup, "is-route-page is-menu-page");\n} else {',
    );
    expect(mainSource).toContain(
      '<div class="app-shell is-slot-game',
    );
  });

  it("keeps the critical Slot DOM anchors required by the controller", () => {
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
      expect(mainSource).toContain(`id="${id}"`);
    }
  });

  it("still mounts the Phaser scene and GameController only on the Slot route", () => {
    const slotClientStart = mainSource.indexOf("} else if (isSlotRoute) {");
    expect(slotClientStart).toBeGreaterThan(-1);

    const slotClientSource = mainSource.slice(slotClientStart, slotClientStart + 6500);
    expect(slotClientSource).toContain(
      'const game = createGameScene(byId("phaser-board"));',
    );
    expect(slotClientSource).toContain(
      'game.scene.getScene("Cascade8GameScene") as GameScene',
    );
    expect(slotClientSource).toContain(
      "controller = new GameController(scene, {",
    );

    const requiredControllerBindings = [
      "balance",
      "bet",
      "win",
      "spin",
      "bet-minus",
      "bet-plus",
      "auto-toggle",
      "turbo",
      "sound",
      "bonus-overlay",
    ];

    for (const id of requiredControllerBindings) {
      expect(slotClientSource).toContain(`byId("${id}")`);
    }
  });
});
