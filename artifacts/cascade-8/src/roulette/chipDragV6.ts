import {
  getRouletteBetTotals,
  moveRouletteBetPlacements,
  type RouletteBetPlacement,
} from "./betState";
import {
  getRouletteBetAuthoritySnapshot,
  setRouletteBetAuthority,
} from "./betAuthorityVisual";
import {
  renderRouletteBetTopology,
  renderRouletteCurrentAuthorityBets,
} from "./authorityBetDom";
import { RouletteWalletClient } from "./rouletteWalletClient";

const EARLY_DRAG_MS = 20;
const EARLY_DRAG_DISTANCE_PX = 3;
const CHIP_HIT_SLOP_PX = 8;
const PICKUP_SCALE = 1.05;
const SNAP_MS = 45;
const POST_DRAG_CLICK_SUPPRESS_MS = 48;

type DragWallet = Pick<
  RouletteWalletClient,
  "updateGlobalBet"
>;

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

type PendingPointerMove = {
  pointerId: number;
  x: number;
  y: number;
};

function cloneBets(
  bets: readonly RouletteBetPlacement[],
) {
  return bets.map((bet) => ({ ...bet }));
}

function bettingOpen(
  page: HTMLElement,
  panel: HTMLElement,
) {
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
  const stack = document.elementsFromPoint(x, y);

  for (const element of stack) {
    const chip = element.closest<HTMLElement>(
      ".roulette-placed-chip[data-bet-amount]",
    );
    if (!chip || !panel.contains(chip)) continue;
    const cell = chip.closest<HTMLElement>("[data-bet-id]");
    const betId = cell?.dataset.betId;
    if (cell && betId) return { chip, cell, betId };
  }

  for (const element of stack) {
    const cell = element.closest<HTMLElement>("[data-bet-id]");
    if (!cell || !panel.contains(cell)) continue;
    const chip = cell.querySelector<HTMLElement>(
      ".roulette-placed-chip[data-bet-amount]",
    );
    const betId = cell.dataset.betId;
    if (
      chip &&
      betId &&
      pointInsideExpandedRect(
        chip.getBoundingClientRect(),
        x,
        y,
      )
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

function ghostTransform(
  x: number,
  y: number,
  scale = PICKUP_SCALE,
) {
  return `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
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
  ghost.style.setProperty("left", "0", "important");
  ghost.style.setProperty("top", "0", "important");
  ghost.style.setProperty("right", "auto", "important");
  ghost.style.setProperty("bottom", "auto", "important");
  ghost.style.setProperty("width", `${rect.width}px`, "important");
  ghost.style.setProperty("height", `${rect.height}px`, "important");
  ghost.style.setProperty("margin", "0", "important");
  ghost.style.setProperty("z-index", "10000", "important");
  ghost.style.setProperty("pointer-events", "none", "important");
  ghost.style.setProperty("will-change", "transform", "important");
  ghost.style.setProperty("transition", "none", "important");
  ghost.style.setProperty(
    "transform-origin",
    `${grabOffsetX}px ${grabOffsetY}px`,
    "important",
  );
  ghost.style.setProperty(
    "transform",
    ghostTransform(x - grabOffsetX, y - grabOffsetY),
    "important",
  );
  document.body.append(ghost);
  return { ghost, width: rect.width, height: rect.height };
}

function moveGhost(
  drag: DragState,
  x: number,
  y: number,
) {
  drag.ghost.style.setProperty("transition", "none", "important");
  drag.ghost.style.setProperty(
    "transform",
    ghostTransform(x - drag.grabOffsetX, y - drag.grabOffsetY),
    "important",
  );
}

function snapGhostToCell(
  drag: DragState,
  cell: HTMLElement,
) {
  const rect = cell.getBoundingClientRect();
  const left = rect.left + rect.width / 2 - drag.width / 2;
  const top = rect.top + rect.height / 2 - drag.height / 2;
  drag.ghost.style.setProperty("transform-origin", "50% 50%", "important");
  drag.ghost.style.setProperty(
    "transition",
    `transform ${SNAP_MS}ms ease-out`,
    "important",
  );
  drag.ghost.style.setProperty(
    "transform",
    ghostTransform(left, top, 1),
    "important",
  );
}

export function createRouletteMovedBets(
  beforeBets: readonly RouletteBetPlacement[],
  fromBetId: string,
  toBetId: string,
) {
  const beforeTotals = getRouletteBetTotals(beforeBets);
  if ((beforeTotals[fromBetId] ?? 0) <= 0) {
    throw new Error("ROULETTE_DRAG_SOURCE_MISSING");
  }

  const moved = moveRouletteBetPlacements(
    beforeBets,
    fromBetId,
    toBetId,
  );

  const beforeStake = beforeBets.reduce(
    (sum, bet) => sum + bet.amount,
    0,
  );
  const afterStake = moved.reduce(
    (sum, bet) => sum + bet.amount,
    0,
  );
  if (beforeStake !== afterStake) {
    throw new Error("ROULETTE_DRAG_STAKE_MISMATCH");
  }

  return moved;
}

export async function commitRouletteSequentialChipMove(
  wallet: DragWallet,
  roundId: string,
  expectedRevision: number,
  beforeBets: readonly RouletteBetPlacement[],
  fromBetId: string,
  toBetId: string,
) {
  const moved = createRouletteMovedBets(
    beforeBets,
    fromBetId,
    toBetId,
  );

  await wallet.updateGlobalBet(
    roundId,
    moved,
    `roulette_move_v6_${Date.now()}_${crypto.randomUUID().replaceAll("-", "")}`,
    expectedRevision,
  );

  return cloneBets(moved);
}

export function installRouletteChipDragV6(app: HTMLDivElement) {
  const page = app.querySelector<HTMLElement>("[data-roulette-page]");
  const panel = app.querySelector<HTMLElement>("[data-roulette-bet-panel]");
  if (!page || !panel || page.dataset.chipDragV6Installed === "true") {
    return;
  }
  page.dataset.chipDragV6Installed = "true";

  const wallet = new RouletteWalletClient();
  let press: PressState | null = null;
  let drag: DragState | null = null;
  let suppressClickUntil = 0;
  let pointerMoveFrame = 0;
  let pendingPointerMove: PendingPointerMove | null = null;

  const clearPress = () => {
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
    navigator.vibrate?.(4);
  };

  const applyDragPointerPosition = (
    pointerId: number,
    x: number,
    y: number,
  ) => {
    if (!drag || drag.pointerId !== pointerId) return;
    moveGhost(drag, x, y);
    clearTarget();
    if (!bettingOpen(page, panel)) return;

    const target = findDropCell(panel, x, y, drag.betId);
    if (target) {
      drag.targetCell = target.cell;
      drag.targetBetId = target.betId;
      target.cell.classList.add("roulette-chip-drop-target");
    }
  };

  const flushPointerMove = () => {
    pointerMoveFrame = 0;
    const pending = pendingPointerMove;
    pendingPointerMove = null;
    if (!pending) return;
    applyDragPointerPosition(
      pending.pointerId,
      pending.x,
      pending.y,
    );
  };

  const queuePointerMove = (
    pointerId: number,
    x: number,
    y: number,
  ) => {
    pendingPointerMove = { pointerId, x, y };
    if (pointerMoveFrame) return;
    pointerMoveFrame = window.requestAnimationFrame(flushPointerMove);
  };

  const flushFinalPointerPosition = (event: PointerEvent) => {
    if (pointerMoveFrame) {
      window.cancelAnimationFrame(pointerMoveFrame);
      pointerMoveFrame = 0;
    }
    pendingPointerMove = null;
    applyDragPointerPosition(
      event.pointerId,
      event.clientX,
      event.clientY,
    );
  };

  app.addEventListener(
    "click",
    (event) => {
      if (performance.now() > suppressClickUntil) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-bet-id]")
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  panel.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!bettingOpen(page, panel) || drag) return;

    const hit = findPlacedChipAtPoint(
      panel,
      event.clientX,
      event.clientY,
    );
    if (!hit) return;

    const chipRect = hit.chip.getBoundingClientRect();
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
      grabOffsetX: Math.min(
        chipRect.width,
        Math.max(0, event.clientX - chipRect.left),
      ),
      grabOffsetY: Math.min(
        chipRect.height,
        Math.max(0, event.clientY - chipRect.top),
      ),
      startedAt: performance.now(),
    };
    panel.classList.add("is-chip-drag-armed");

    try {
      panel.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional.
    }
  });

  panel.addEventListener("pointermove", (event) => {
    if (press?.pointerId === event.pointerId) {
      press.x = event.clientX;
      press.y = event.clientY;

      if (!drag) {
        const distance = Math.hypot(
          event.clientX - press.startX,
          event.clientY - press.startY,
        );
        if (
          performance.now() - press.startedAt >= EARLY_DRAG_MS &&
          distance >= EARLY_DRAG_DISTANCE_PX
        ) {
          startDrag();
        }
      }
    }

    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    queuePointerMove(
      event.pointerId,
      event.clientX,
      event.clientY,
    );
  });

  const finish = (
    event: PointerEvent,
    cancelled: boolean,
  ) => {
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
    flushFinalPointerPosition(event);
    suppressClickUntil =
      performance.now() + POST_DRAG_CLICK_SUPPRESS_MS;

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
      snapGhostToCell(completed, completed.cell);
      window.setTimeout(() => {
        completed.ghost.remove();
        completed.chip.classList.remove("is-chip-drag-source");
      }, SNAP_MS + 10);
      return;
    }

    snapGhostToCell(completed, targetCell);

    const latestAuthority =
      getRouletteBetAuthoritySnapshot();
    const latestBets = latestAuthority.bets;

    if (
      !latestAuthority.roundId ||
      !latestBets ||
      !bettingOpen(page, panel) ||
      (getRouletteBetTotals(latestBets)[completed.betId] ?? 0) <= 0
    ) {
      completed.ghost.remove();
      completed.chip.classList.remove("is-chip-drag-source");
      renderRouletteCurrentAuthorityBets(app);
      return;
    }

    let nextBets: RouletteBetPlacement[];
    try {
      nextBets = createRouletteMovedBets(
        latestBets,
        completed.betId,
        targetBetId,
      );
    } catch (error) {
      console.error("[roulette] chip drag rejected", error);
      completed.ghost.remove();
      completed.chip.classList.remove("is-chip-drag-source");
      renderRouletteCurrentAuthorityBets(app);
      return;
    }

    setRouletteBetAuthority(
      latestAuthority.roundId,
      nextBets,
      latestAuthority.revision,
      true,
    );
    renderRouletteBetTopology(app, nextBets);

    void commitRouletteSequentialChipMove(
      wallet,
      latestAuthority.roundId,
      latestAuthority.revision,
      latestBets,
      completed.betId,
      targetBetId,
    )
      .then(() => {
        renderRouletteCurrentAuthorityBets(app);
      })
      .catch((error) => {
        console.error("[roulette] chip drag sync failed", error);
        renderRouletteCurrentAuthorityBets(app);
      });

    window.setTimeout(() => {
      completed.ghost.remove();
      completed.chip.classList.remove("is-chip-drag-source");
      targetCell.classList.add("roulette-chip-drop-confirmed");
      window.setTimeout(
        () => targetCell.classList.remove("roulette-chip-drop-confirmed"),
        140,
      );
      navigator.vibrate?.(5);
    }, SNAP_MS + 10);
  };

  panel.addEventListener("pointerup", (event) => finish(event, false));
  panel.addEventListener("pointercancel", (event) => finish(event, true));
  panel.addEventListener("lostpointercapture", (event) => {
    if (drag?.pointerId === event.pointerId) {
      finish(event, true);
    }
  });
  panel.addEventListener("contextmenu", (event) => {
    if (
      findPlacedChipAtPoint(
        panel,
        event.clientX,
        event.clientY,
      )
    ) {
      event.preventDefault();
    }
  });
}
