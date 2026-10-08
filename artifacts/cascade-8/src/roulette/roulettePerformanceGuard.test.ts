import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(name: string) {
  return readFileSync(
    fileURLToPath(new URL(name, import.meta.url)),
    "utf8",
  );
}

const indexSource = source("./index.ts");
const dragSource = source("./chipDragV6.ts");
const runtimeSource = source("./rouletteRuntime.ts");
const authorityVisualSource = source("./betAuthorityVisual.ts");
const authoritySource = source("./betAuthority.ts");

function expectLocalRenderBeforeNetwork(
  actionMarker: string,
) {
  const actionIndex =
    runtimeSource.indexOf(actionMarker);
  expect(actionIndex).toBeGreaterThanOrEqual(0);

  const renderIndex =
    runtimeSource.indexOf(
      "renderBetState();",
      actionIndex,
    );
  const syncIndex =
    runtimeSource.indexOf(
      "queueGlobalBetSync();",
      actionIndex,
    );

  expect(renderIndex).toBeGreaterThan(
    actionIndex,
  );
  expect(syncIndex).toBeGreaterThan(
    renderIndex,
  );
}

describe("roulette performance architecture guard", () => {
  it("keeps retired competing writer and global DOM interception layers out of the mount path", () => {
    expect(indexSource).not.toContain("installRouletteChipDragLatestWriter");
    expect(indexSource).not.toContain("installRouletteIncrementalPlacedChipReuse");
    expect(indexSource).not.toContain("installRouletteOptimisticBalanceUi");
    expect(indexSource).not.toContain("installRouletteBetAuthorityVisual");
  });

  it("keeps drag input-only without its old polling, retry, or DOM-protector loops", () => {
    expect(dragSource).not.toContain("MutationObserver");
    expect(dragSource).not.toContain("setInterval(");
    expect(dragSource).not.toContain("SOURCE_SYNC_ATTEMPTS");
    expect(dragSource).not.toContain("bootstrapRoulette");
    expect(dragSource).not.toContain("flushPendingRemovals");
  });

  it("keeps authority metadata free of DOM rendering and serializes all wager writes", () => {
    expect(authorityVisualSource).not.toContain("MutationObserver");
    expect(authorityVisualSource).not.toContain("querySelector");
    expect(authoritySource).toContain("writeTail");
    expect(authoritySource).toContain("enqueueWrite");
    expect(authoritySource).toContain("authority.optimistic");
  });

  it("renders every button wager mutation locally before starting network sync", () => {
    expectLocalRenderBeforeNetwork(
      "placeRouletteBet(",
    );
    expectLocalRenderBeforeNetwork(
      "undoRouletteBet(",
    );
    expectLocalRenderBeforeNetwork(
      "doubleRouletteBets(",
    );
    expectLocalRenderBeforeNetwork(
      "[data-clear-bets]",
    );
    expectLocalRenderBeforeNetwork(
      "rebetRouletteRound(",
    );
  });

  it("keeps drag pickup movement-only and snap feedback well below the 500ms interaction target", () => {
    expect(dragSource).not.toContain("HOLD_MS");
    expect(dragSource).toContain(
      "const EARLY_DRAG_MS = 20;",
    );
    expect(dragSource).toContain(
      "const EARLY_DRAG_DISTANCE_PX = 3;",
    );
    expect(dragSource).toContain(
      "const SNAP_MS = 45;",
    );

    const startDragIndex =
      dragSource.indexOf("const startDrag = () =>");
    const pointerCaptureIndex =
      dragSource.indexOf(
        "panel.setPointerCapture(current.pointerId);",
      );
    const pointerDownIndex =
      dragSource.indexOf(
        'panel.addEventListener("pointerdown"',
      );

    expect(startDragIndex).toBeGreaterThanOrEqual(0);
    expect(pointerCaptureIndex).toBeGreaterThan(startDragIndex);
    expect(pointerCaptureIndex).toBeLessThan(pointerDownIndex);
    expect(dragSource).not.toContain(
      "panel.setPointerCapture(event.pointerId);",
    );

    expect(dragSource).toContain(
      "setRouletteBetAuthority(",
    );
    expect(dragSource).toContain(
      "renderRouletteBetTopology(app, nextBets);",
    );
    expect(dragSource.indexOf("setRouletteBetAuthority(")).toBeLessThan(
      dragSource.indexOf("renderRouletteBetTopology(app, nextBets);"),
    );
  });
});
