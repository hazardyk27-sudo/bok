import {
  getRouletteBetTotals,
  moveRouletteBetPlacements,
  type RouletteBetPlacement,
} from "./betState";
import { getRouletteGlobalClientPhase } from "./globalClient";
import { RouletteWalletClient } from "./rouletteWalletClient";
import { formatRouletteAmount } from "./uiFormat";
import {
  getRouletteChipPalette,
  getRouletteChipStackDepth,
  getRouletteChipTier,
} from "./chipVisual";

const HOLD_MS = 120;
const EARLY_DRAG_MS = 20;
const EARLY_DRAG_DISTANCE_PX = 3;
const CHIP_HIT_SLOP_PX = 8;
const PICKUP_SCALE = 1.05;
const SNAP_MS = 45;
const FINAL_HYDRATE_GRACE_MS = 260;

export const ROULETTE_DRAG_SOURCE_SYNC_MAX_ATTEMPTS = 10;
const SOURCE_SYNC_BASE_RETRY_MS = 50;
const SOURCE_SYNC_MAX_RETRY_MS = 250;

type DragWallet = Pick<
  RouletteWalletClient,
  "bootstrap" | "updateGlobalBet"
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

type DesiredDragState = {
  bets: RouletteBetPlacement[];
  templates: Map<string, HTMLElement>;
  fallbackTemplate: HTMLElement;
};

type QueuedMove = {
  beforeBets: RouletteBetPlacement[];
  fromBetId: string;
  toBetId: string;
};

type PendingPointerMove = {
  pointerId: number;
  x: number;
  y: number;
};

function cloneBets(bets: readonly RouletteBetPlacement[]) {
  return bets.map((bet) => ({ ...bet }));
}

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

function collectTemplates(root: ParentNode) {
  const templates = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>("[data-bet-id]").forEach((cell) => {
    const betId = cell.dataset.betId;
    const chip = cell.querySelector<HTMLElement>(
      ".roulette-placed-chip[data-bet-amount]",
    );
    if (betId && chip) {
      templates.set(betId, chip.cloneNode(true) as HTMLElement);
    }
  });
  return templates;
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

function pointInsideExpandedRect(rect: DOMRect, x: number, y: number) {
  return (
    x >= rect.left - CHIP_HIT_SLOP_PX &&
    x <= rect.right + CHIP_HIT_SLOP_PX &&
    y >= rect.top - CHIP_HIT_SLOP_PX &&
    y <= rect.bottom + CHIP_HIT_SLOP_PX
  );
}

function findPlacedChipAtPoint(panel: HTMLElement, x: number, y: number) {
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

function moveGhost(drag: DragState, x: number, y: number) {
  drag.ghost.style.setProperty("transition", "none", "important");
  drag.ghost.style.setProperty(
    "transform",
    ghostTransform(x - drag.grabOffsetX, y - drag.grabOffsetY),
    "important",
  );
}

function snapGhostToCell(drag: DragState, cell: HTMLElement) {
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

function forceRuntimeRefresh() {
  document.dispatchEvent(new Event("visibilitychange"));
}

function updateChipAmount(chip: HTMLElement, amount: number) {
  chip.dataset.betAmount = String(amount);
  chip.dataset.stackDepth = String(getRouletteChipStackDepth(amount));
  chip.dataset.chipTier = getRouletteChipTier(amount);
  chip.dataset.rouletteDragOptimistic = "true";

  const palette = getRouletteChipPalette(amount);
  chip.style.setProperty("--casino-chip-main", palette.main);
  chip.style.setProperty("--casino-chip-inner", palette.inner);
  chip.style.setProperty("--casino-chip-ink", palette.ink);
  chip.style.setProperty("--casino-chip-accent", palette.accent);
  chip.style.setProperty("--casino-chip-highlight", palette.highlight);

  const displayAmount = formatRouletteAmount(amount);
  const suffix = /[KM]$/.test(displayAmount) ? displayAmount.slice(-1) : "";
  const number = suffix ? displayAmount.slice(0, -1) : displayAmount;

  let value = chip.querySelector<HTMLElement>(".roulette-placed-chip__value");
  if (!value) {
    value = document.createElement("span");
    value.className = "roulette-placed-chip__value";
    chip.prepend(value);
  }
  value.textContent = number;

  chip.querySelector(".roulette-placed-chip__suffix")?.remove();
  if (suffix) {
    const suffixElement = document.createElement("span");
    suffixElement.className = "roulette-placed-chip__suffix";
    suffixElement.textContent = suffix;
    chip.append(suffixElement);
  }
}

function makeOptimisticChip(template: HTMLElement, amount: number) {
  const chip = template.cloneNode(true) as HTMLElement;
  chip.classList.remove(
    "is-chip-drag-source",
    "roulette-chip-drag-ghost",
    "is-pending",
    "is-returning",
    "is-chip-handoff-source",
  );
  chip.removeAttribute("data-roulette-drag-handoff");
  updateChipAmount(chip, amount);
  return chip;
}

function renderDesiredState(app: HTMLDivElement, state: DesiredDragState) {
  const totals = getRouletteBetTotals(state.bets);

  app.querySelectorAll<HTMLElement>("[data-bet-id]").forEach((cell) => {
    const betId = cell.dataset.betId;
    if (!betId) return;
    const desiredAmount = totals[betId] ?? 0;
    const chips = Array.from(
      cell.querySelectorAll<HTMLElement>(".roulette-placed-chip"),
    );
    const currentAmount = Number(chips[0]?.dataset.betAmount ?? 0);

    if (desiredAmount <= 0) {
      if (chips.length > 0) chips.forEach((chip) => chip.remove());
      cell.classList.remove("has-bet");
      return;
    }

    if (
      chips.length === 1 &&
      Number.isFinite(currentAmount) &&
      currentAmount === desiredAmount
    ) {
      cell.classList.add("has-bet");
      return;
    }

    chips.forEach((chip) => chip.remove());
    const template = state.templates.get(betId) ?? state.fallbackTemplate;
    cell.classList.add("has-bet");
    cell.append(makeOptimisticChip(template, desiredAmount));
  });
}

export function getRouletteDragSourceRetryMs(attempt: number) {
  const safeAttempt = Math.max(0, Math.trunc(attempt));
  return Math.min(
    SOURCE_SYNC_MAX_RETRY_MS,
    Math.round(
      SOURCE_SYNC_BASE_RETRY_MS *
        Math.pow(1.5, safeAttempt),
    ),
  );
}

function waitForSourceSync(attempt: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(
      resolve,
      getRouletteDragSourceRetryMs(attempt),
    );
  });
}

export async function commitRouletteSequentialChipMove(
  wallet: DragWallet,
  expectedBefore: readonly RouletteBetPlacement[],
  fromBetId: string,
  toBetId: string,
  waitForRetry: (attempt: number) => Promise<void> = waitForSourceSync,
) {
  let lastError = "ROULETTE_DRAG_BET_UNAVAILABLE";

  for (
    let attempt = 0;
    attempt < ROULETTE_DRAG_SOURCE_SYNC_MAX_ATTEMPTS;
    attempt += 1
  ) {
    const bootstrap = await wallet.bootstrap();
    const table = bootstrap.globalTable;
    const globalBet = bootstrap.globalBet;

    if (!table) {
      lastError = "ROULETTE_DRAG_BET_UNAVAILABLE";
    } else {
      const serverNow = Number.isFinite(bootstrap.serverTimeMs)
        ? bootstrap.serverTimeMs
        : table.serverTimeMs;
      if (getRouletteGlobalClientPhase(table, serverNow) !== "betting") {
        throw new Error("ROULETTE_DRAG_BETTING_CLOSED");
      }

      if (!globalBet || globalBet.roundId !== table.roundId) {
        lastError = "ROULETTE_DRAG_BET_UNAVAILABLE";
      } else if (!sameTotals(expectedBefore, globalBet.bets)) {
        lastError = "ROULETTE_DRAG_WAITING_FOR_SYNC";
      } else if (!globalBet.bets.some((bet) => bet.betId === fromBetId)) {
        lastError = "ROULETTE_DRAG_SOURCE_MISSING";
      } else {
        const moved = moveRouletteBetPlacements(
          globalBet.bets,
          fromBetId,
          toBetId,
        );
        try {
          await wallet.updateGlobalBet(
            table.roundId,
            moved,
            `roulette_move_v6_${Date.now()}_${crypto.randomUUID().replaceAll("-", "")}`,
            globalBet.revision,
          );
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message !== "ROULETTE_GLOBAL_BET_STALE") throw error;
          lastError = message;
        }
      }
    }

    if (attempt + 1 < ROULETTE_DRAG_SOURCE_SYNC_MAX_ATTEMPTS) {
      await waitForRetry(attempt);
    }
  }

  throw new Error(lastError);
}

export function installRouletteChipDragV6(app: HTMLDivElement) {
  const page = app.querySelector<HTMLElement>("[data-roulette-page]");
  const panel = app.querySelector<HTMLElement>("[data-roulette-bet-panel]");
  if (!page || !panel || page.dataset.chipDragV6Installed === "true") return;
  page.dataset.chipDragV6Installed = "true";

  const wallet = new RouletteWalletClient();
  let press: PressState | null = null;
  let drag: DragState | null = null;
  let desiredState: DesiredDragState | null = null;
  let protecting = false;
  let protector: MutationObserver | null = null;
  let suppressClickUntil = 0;
  let processingQueue = false;
  let hydrateTimer = 0;
  let pointerMoveFrame = 0;
  let pendingPointerMove: PendingPointerMove | null = null;
  const moveQueue: QueuedMove[] = [];

  const stopProtector = () => {
    protector?.disconnect();
    protector = null;
  };

  const ensureProtector = () => {
    if (protector) return;
    protector = new MutationObserver(() => {
      if (!desiredState || protecting) return;
      protecting = true;
      try {
        renderDesiredState(app, desiredState);
      } finally {
        protecting = false;
      }
    });
    protector.observe(panel, { childList: true, subtree: true });
  };

  const scheduleFinalHydrate = () => {
    window.clearTimeout(hydrateTimer);
    forceRuntimeRefresh();
    hydrateTimer = window.setTimeout(() => {
      if (moveQueue.length > 0 || processingQueue) return;
      stopProtector();
      desiredState = null;
      forceRuntimeRefresh();
    }, FINAL_HYDRATE_GRACE_MS);
  };

  const processMoveQueue = async () => {
    if (processingQueue) return;
    processingQueue = true;
    try {
      while (moveQueue.length > 0) {
        const command = moveQueue[0]!;
        await commitRouletteSequentialChipMove(
          wallet,
          command.beforeBets,
          command.fromBetId,
          command.toBetId,
        );
        moveQueue.shift();
      }
      scheduleFinalHydrate();
    } catch (error) {
      console.error("[roulette] chip drag v6 failed", error);
      moveQueue.length = 0;
      stopProtector();
      desiredState = null;
      forceRuntimeRefresh();
    } finally {
      processingQueue = false;
      if (moveQueue.length > 0) void processMoveQueue();
    }
  };

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
    suppressClickUntil = performance.now() + 320;
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
    applyDragPointerPosition(pending.pointerId, pending.x, pending.y);
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
    applyDragPointerPosition(event.pointerId, event.clientX, event.clientY);
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
      timer: 0,
    };
    press.timer = window.setTimeout(startDrag, HOLD_MS);
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
          window.clearTimeout(press.timer);
          startDrag();
        }
      }
    }

    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    queuePointerMove(event.pointerId, event.clientX, event.clientY);
  });

  const finish = (event: PointerEvent, cancelled: boolean) => {
    if (press?.pointerId === event.pointerId) window.clearTimeout(press.timer);
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
    suppressClickUntil = performance.now() + 320;
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

    const currentBets = desiredState
      ? cloneBets(desiredState.bets)
      : readPlacedBets(app);
    const currentTotals = getRouletteBetTotals(currentBets);
    const sourceAmount = currentTotals[completed.betId] ?? 0;
    if (sourceAmount <= 0) {
      completed.ghost.remove();
      completed.chip.classList.remove("is-chip-drag-source");
      forceRuntimeRefresh();
      return;
    }

    const nextBets = moveRouletteBetPlacements(
      currentBets,
      completed.betId,
      targetBetId,
    );
    const templates = desiredState
      ? new Map(desiredState.templates)
      : collectTemplates(app);
    const sourceTemplate = completed.chip.cloneNode(true) as HTMLElement;
    const targetTemplate = targetCell.querySelector<HTMLElement>(
      ".roulette-placed-chip[data-bet-amount]",
    );
    templates.delete(completed.betId);
    templates.set(
      targetBetId,
      targetTemplate
        ? (targetTemplate.cloneNode(true) as HTMLElement)
        : sourceTemplate,
    );

    desiredState = {
      bets: cloneBets(nextBets),
      templates,
      fallbackTemplate: sourceTemplate,
    };
    ensureProtector();
    moveQueue.push({
      beforeBets: cloneBets(currentBets),
      fromBetId: completed.betId,
      toBetId: targetBetId,
    });

    snapGhostToCell(completed, targetCell);
    window.setTimeout(() => {
      completed.ghost.remove();
      completed.chip.classList.remove("is-chip-drag-source");
      if (desiredState) {
        protecting = true;
        try {
          renderDesiredState(app, desiredState);
        } finally {
          protecting = false;
        }
      }
      targetCell.classList.add("roulette-chip-drop-confirmed");
      window.setTimeout(
        () => targetCell.classList.remove("roulette-chip-drop-confirmed"),
        140,
      );
      navigator.vibrate?.(5);
      void processMoveQueue();
    }, SNAP_MS);
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
