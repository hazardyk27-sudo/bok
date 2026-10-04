import {
  getRouletteBetTotals,
  moveRouletteBetPlacements,
  type RouletteBetPlacement,
} from "./betState";
import { getRouletteGlobalClientPhase } from "./globalClient";
import { RouletteWalletClient } from "./rouletteWalletClient";

const HOLD_MS = 150;
const EARLY_DRAG_MS = 85;
const EARLY_DRAG_DISTANCE_PX = 7;
const CHIP_HIT_SLOP_PX = 7;
const PICKUP_SCALE = 1.06;
const SNAP_MS = 120;

type PressState = {
  pointerId: number;
  chip: HTMLElement;
  cell: HTMLElement;
  betId: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  grabOffsetX: number;
  grabOffsetY: number;
  startedAt: number;
  timer: number;
};

type DragState = {
  pointerId: number;
  chip: HTMLElement;
  cell: HTMLElement;
  betId: string;
  ghost: HTMLElement;
  width: number;
  height: number;
  grabOffsetX: number;
  grabOffsetY: number;
  targetCell: HTMLElement | null;
  targetBetId: string | null;
};

function readPlacedBets(root: ParentNode): RouletteBetPlacement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-bet-id]"))
    .flatMap((cell) => {
      const betId = cell.dataset.betId;
      const chip = cell.querySelector<HTMLElement>(
        ".roulette-placed-chip[data-bet-amount]",
      );
      const amount = Number(chip?.dataset.betAmount);
      return betId && Number.isFinite(amount) && amount > 0
        ? [{ betId, amount }]
        : [];
    });
}

function sameTotals(
  left: readonly RouletteBetPlacement[],
  right: readonly RouletteBetPlacement[],
) {
  const a = getRouletteBetTotals(left);
  const b = getRouletteBetTotals(right);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => (a[key] ?? 0) === (b[key] ?? 0));
}

function bettingOpen(page: HTMLElement, panel: HTMLElement) {
  return (
    page.dataset.phase === "betting" &&
    page.dataset.bettingLocked !== "true" &&
    panel.getAttribute("aria-disabled") !== "true"
  );
}

function pointInsideExpandedRect(
  rect: DOMRect,
  x: number,
  y: number,
) {
  return (
    x >= rect.left - CHIP_HIT_SLOP_PX &&
    x <= rect.right + CHIP_HIT_SLOP_PX &&
    y >= rect.top - CHIP_HIT_SLOP_PX &&
    y <= rect.bottom + CHIP_HIT_SLOP_PX
  );
}

function findPlacedChipAtPoint(
  panel: HTMLElement,
  x: number,
  y: number,
) {
  for (const element of document.elementsFromPoint(x, y)) {
    const direct = element.closest<HTMLElement>(
      ".roulette-placed-chip[data-bet-amount]",
    );
    if (direct && panel.contains(direct)) {
      const cell = direct.closest<HTMLElement>("[data-bet-id]");
      const betId = cell?.dataset.betId;
      if (cell && betId) return { chip: direct, cell, betId };
    }
  }

  for (const element of document.elementsFromPoint(x, y)) {
    const cell = element.closest<HTMLElement>("[data-bet-id]");
    if (!cell || !panel.contains(cell)) continue;
    const chip = cell.querySelector<HTMLElement>(
      ".roulette-placed-chip[data-bet-amount]",
    );
    const betId = cell.dataset.betId;
    if (
      chip &&
      betId &&
      pointInsideExpandedRect(chip.getBoundingClientRect(), x, y)
    ) {
      return { chip, cell, betId };
    }
  }

  return null;
}

function findDropCell(
  panel: HTMLElement,
  x: number,
  y: number,
  sourceBetId: string,
) {
  for (const element of document.elementsFromPoint(x, y)) {
    const cell = element.closest<HTMLElement>("[data-bet-id]");
    const betId = cell?.dataset.betId;
    if (
      cell &&
      betId &&
      betId !== sourceBetId &&
      panel.contains(cell)
    ) {
      return { cell, betId };
    }
  }
  return null;
}

function createDragGhost(
  chip: HTMLElement,
  x: number,
  y: number,
  grabOffsetX: number,
  grabOffsetY: number,
) {
  const rect = chip.getBoundingClientRect();
  const ghost = chip.cloneNode(true) as HTMLElement;
  ghost.classList.add("roulette-chip-drag-ghost");
  ghost.classList.remove("is-chip-drag-source");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.setProperty("position", "fixed", "important");
  ghost.style.setProperty("right", "auto", "important");
  ghost.style.setProperty("bottom", "auto", "important");
  ghost.style.setProperty("width", `${rect.width}px`, "important");
  ghost.style.setProperty("height", `${rect.height}px`, "important");
  ghost.style.setProperty("margin", "0", "important");
  ghost.style.setProperty("z-index", "10000", "important");
  ghost.style.setProperty("pointer-events", "none", "important");
  ghost.style.setProperty("transition", "none", "important");
  ghost.style.setProperty(
    "transform-origin",
    `${grabOffsetX}px ${grabOffsetY}px`,
    "important",
  );
  ghost.style.setProperty(
    "left",
    `${x - grabOffsetX}px`,
    "important",
  );
  ghost.style.setProperty(
    "top",
    `${y - grabOffsetY}px`,
    "important",
  );
  ghost.style.setProperty(
    "transform",
    `translate3d(0, 0, 0) scale(${PICKUP_SCALE})`,
    "important",
  );
  document.body.append(ghost);

  return {
    ghost,
    width: rect.width,
    height: rect.height,
  };
}

function moveGhost(
  drag: DragState,
  x: number,
  y: number,
) {
  drag.ghost.style.setProperty("transition", "none", "important");
  drag.ghost.style.setProperty(
    "left",
    `${x - drag.grabOffsetX}px`,
    "important",
  );
  drag.ghost.style.setProperty(
    "top",
    `${y - drag.grabOffsetY}px`,
    "important",
  );
  drag.ghost.style.setProperty(
    "transform",
    `translate3d(0, 0, 0) scale(${PICKUP_SCALE})`,
    "important",
  );
}

function snapGhostToCell(
  drag: DragState,
  cell: HTMLElement,
  mode: "pending" | "returning",
) {
  const rect = cell.getBoundingClientRect();
  const left = rect.left + rect.width / 2 - drag.width / 2;
  const top = rect.top + rect.height / 2 - drag.height / 2;

  drag.ghost.classList.add(
    mode === "pending" ? "is-pending" : "is-returning",
  );
  drag.ghost.style.setProperty(
    "transform-origin",
    "50% 50%",
    "important",
  );
  drag.ghost.style.setProperty(
    "transition",
    `left ${SNAP_MS}ms ease-out, top ${SNAP_MS}ms ease-out, transform ${SNAP_MS}ms ease-out, opacity ${SNAP_MS}ms ease-out`,
    "important",
  );
  drag.ghost.style.setProperty("left", `${left}px`, "important");
  drag.ghost.style.setProperty("top", `${top}px`, "important");
  drag.ghost.style.setProperty(
    "transform",
    "translate3d(0, 0, 0) scale(1)",
    "important",
  );
}

function forceRuntimeRefresh() {
  document.dispatchEvent(new Event("visibilitychange"));
}

async function commitMove(
  wallet: RouletteWalletClient,
  uiBets: readonly RouletteBetPlacement[],
  fromBetId: string,
  toBetId: string,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const bootstrap = await wallet.bootstrap();
    const table = bootstrap.globalTable;
    const globalBet = bootstrap.globalBet;
    if (!table || !globalBet || globalBet.roundId !== table.roundId) {
      throw new Error("ROULETTE_DRAG_BET_UNAVAILABLE");
    }

    const serverNow = Number.isFinite(bootstrap.serverTimeMs)
      ? bootstrap.serverTimeMs
      : table.serverTimeMs;
    if (getRouletteGlobalClientPhase(table, serverNow) !== "betting") {
      throw new Error("ROULETTE_DRAG_BETTING_CLOSED");
    }
    if (!sameTotals(uiBets, globalBet.bets)) {
      throw new Error("ROULETTE_DRAG_WAITING_FOR_SYNC");
    }
    if (!globalBet.bets.some((bet) => bet.betId === fromBetId)) {
      throw new Error("ROULETTE_DRAG_SOURCE_MISSING");
    }

    const moved = moveRouletteBetPlacements(
      globalBet.bets,
      fromBetId,
      toBetId,
    );
    try {
      await wallet.updateGlobalBet(
        table.roundId,
        moved,
        `roulette_drag_v3_${Date.now()}_${crypto.randomUUID().replaceAll("-", "")}`,
        globalBet.revision,
      );
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "ROULETTE_GLOBAL_BET_STALE" && attempt === 0) {
        continue;
      }
      throw error;
    }
  }
}

export function installRouletteChipDragV2(app: HTMLDivElement) {
  const page = app.querySelector<HTMLElement>("[data-roulette-page]");
  const panel = app.querySelector<HTMLElement>("[data-roulette-bet-panel]");
  if (!page || !panel || page.dataset.chipDragV2Installed === "true") return;
  page.dataset.chipDragV2Installed = "true";

  const wallet = new RouletteWalletClient();
  let press: PressState | null = null;
  let drag: DragState | null = null;
  let suppressClickUntil = 0;

  const clearPress = () => {
    if (press) window.clearTimeout(press.timer);
    press = null;
    panel.classList.remove("is-chip-drag-armed");
  };

  const clearTarget = () => {
    drag?.targetCell?.classList.remove("roulette-chip-drop-target");
    if (drag) {
      drag.targetCell = null;
      drag.targetBetId = null;
    }
  };

  const startDrag = () => {
    if (!press || drag || !bettingOpen(page, panel) || !press.chip.isConnected) {
      return;
    }

    const current = press;
    const created = createDragGhost(
      current.chip,
      current.x,
      current.y,
      current.grabOffsetX,
      current.grabOffsetY,
    );

    drag = {
      pointerId: current.pointerId,
      chip: current.chip,
      cell: current.cell,
      betId: current.betId,
      ghost: created.ghost,
      width: created.width,
      height: created.height,
      grabOffsetX: current.grabOffsetX,
      grabOffsetY: current.grabOffsetY,
      targetCell: null,
      targetBetId: null,
    };

    current.chip.classList.add("is-chip-drag-source");
    panel.classList.remove("is-chip-drag-armed");
    panel.classList.add("is-chip-dragging");
    suppressClickUntil = performance.now() + 1000;
    navigator.vibrate?.(6);
  };

  app.addEventListener(
    "click",
    (event) => {
      if (performance.now() > suppressClickUntil) return;
      const target = event.target;
      if (target instanceof Element && target.closest("[data-bet-id]")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  panel.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!bettingOpen(page, panel) || drag) return;

    const hit = findPlacedChipAtPoint(panel, event.clientX, event.clientY);
    if (!hit) return;

    const chipRect = hit.chip.getBoundingClientRect();
    const grabOffsetX = Math.min(
      chipRect.width,
      Math.max(0, event.clientX - chipRect.left),
    );
    const grabOffsetY = Math.min(
      chipRect.height,
      Math.max(0, event.clientY - chipRect.top),
    );

    clearPress();
    press = {
      pointerId: event.pointerId,
      chip: hit.chip,
      cell: hit.cell,
      betId: hit.betId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      grabOffsetX,
      grabOffsetY,
      startedAt: performance.now(),
      timer: 0,
    };
    press.timer = window.setTimeout(startDrag, HOLD_MS);
    panel.classList.add("is-chip-drag-armed");

    try {
      panel.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers may decline capture; panel listeners still handle the pointer.
    }
  });

  panel.addEventListener("pointermove", (event) => {
    if (press?.pointerId === event.pointerId) {
      press.x = event.clientX;
      press.y = event.clientY;
      if (!drag) {
        const dx = event.clientX - press.startX;
        const dy = event.clientY - press.startY;
        const distance = Math.hypot(dx, dy);
        if (
          performance.now() - press.startedAt >= EARLY_DRAG_MS &&
          distance >= EARLY_DRAG_DISTANCE_PX
        ) {
          window.clearTimeout(press.timer);
          startDrag();
        }
      }
    }

    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    moveGhost(drag, event.clientX, event.clientY);
    clearTarget();
    if (!bettingOpen(page, panel)) return;
    const target = findDropCell(
      panel,
      event.clientX,
      event.clientY,
      drag.betId,
    );
    if (target) {
      drag.targetCell = target.cell;
      drag.targetBetId = target.betId;
      target.cell.classList.add("roulette-chip-drop-target");
    }
  });

  const finish = (event: PointerEvent, cancelled: boolean) => {
    if (press?.pointerId === event.pointerId) {
      window.clearTimeout(press.timer);
    }

    if (!drag || drag.pointerId !== event.pointerId) {
      clearPress();
      try {
        panel.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore unsupported capture release.
      }
      return;
    }

    event.preventDefault();
    suppressClickUntil = performance.now() + 1100;
    const completed = drag;
    const targetCell = completed.targetCell;
    const targetBetId = completed.targetBetId;
    clearTarget();
    drag = null;
    clearPress();
    panel.classList.remove("is-chip-dragging");
    try {
      panel.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore unsupported capture release.
    }

    if (
      cancelled ||
      !targetCell ||
      !targetBetId ||
      !bettingOpen(page, panel)
    ) {
      snapGhostToCell(completed, completed.cell, "returning");
      window.setTimeout(() => {
        completed.ghost.remove();
        completed.chip.classList.remove("is-chip-drag-source");
      }, SNAP_MS + 30);
      return;
    }

    snapGhostToCell(completed, targetCell, "pending");
    const uiBets = readPlacedBets(app);

    void commitMove(wallet, uiBets, completed.betId, targetBetId)
      .then(() => {
        window.setTimeout(() => {
          forceRuntimeRefresh();
          completed.ghost.remove();
          completed.chip.classList.remove("is-chip-drag-source");
          targetCell.classList.add("roulette-chip-drop-confirmed");
          window.setTimeout(
            () => targetCell.classList.remove("roulette-chip-drop-confirmed"),
            220,
          );
          navigator.vibrate?.(8);
        }, SNAP_MS);
      })
      .catch((error) => {
        console.error("[roulette] chip drag v3 failed", error);
        snapGhostToCell(completed, completed.cell, "returning");
        window.setTimeout(() => {
          completed.ghost.remove();
          completed.chip.classList.remove("is-chip-drag-source");
          forceRuntimeRefresh();
        }, SNAP_MS + 30);
      });
  };

  panel.addEventListener("pointerup", (event) => finish(event, false));
  panel.addEventListener("pointercancel", (event) => finish(event, true));
  panel.addEventListener("lostpointercapture", (event) => {
    if (drag?.pointerId === event.pointerId) finish(event, true);
  });

  panel.addEventListener("contextmenu", (event) => {
    if (findPlacedChipAtPoint(panel, event.clientX, event.clientY)) {
      event.preventDefault();
    }
  });
}
