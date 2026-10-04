import {
  getRouletteBetTotals,
  moveRouletteBetPlacements,
  type RouletteBetPlacement,
} from "./betState";
import {
  getRouletteGlobalClientPhase,
} from "./globalClient";
import {
  RouletteWalletClient,
  type RouletteBootstrapResponse,
} from "./rouletteWalletClient";

const DRAG_HOLD_MS = 180;
const SERVER_MATCH_TIMEOUT_MS = 1_600;
const SERVER_MATCH_POLL_MS = 80;
const DOM_REFRESH_TIMEOUT_MS = 1_500;
const DOM_REFRESH_POLL_MS = 75;

type DragPress = {
  pointerId: number;
  sourceChip: HTMLElement;
  sourceCell: HTMLElement;
  sourceBetId: string;
  clientX: number;
  clientY: number;
  holdTimer: number;
};

type ActiveDrag = {
  pointerId: number;
  sourceChip: HTMLElement;
  sourceCell: HTMLElement;
  sourceBetId: string;
  ghost: HTMLElement;
  targetCell: HTMLElement | null;
  targetBetId: string | null;
};

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function findBetCell(
  root: ParentNode,
  betId: string,
) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      "[data-bet-id]",
    ),
  ).find(
    (cell) => cell.dataset.betId === betId,
  ) ?? null;
}

export function readRoulettePlacedBetPlacements(
  root: ParentNode,
): RouletteBetPlacement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      "[data-bet-id]",
    ),
  ).flatMap((cell) => {
    const betId = cell.dataset.betId;
    const chip =
      cell.querySelector<HTMLElement>(
        ".roulette-placed-chip[data-bet-amount]",
      );
    const amount = Number(
      chip?.dataset.betAmount,
    );

    if (
      !betId ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return [];
    }

    return [{
      betId,
      amount,
    }];
  });
}

export function haveSameRouletteBetTotals(
  left: readonly RouletteBetPlacement[],
  right: readonly RouletteBetPlacement[],
) {
  const leftTotals =
    getRouletteBetTotals(left);
  const rightTotals =
    getRouletteBetTotals(right);
  const keys = new Set([
    ...Object.keys(leftTotals),
    ...Object.keys(rightTotals),
  ]);

  for (const key of keys) {
    if (
      (leftTotals[key] ?? 0) !==
      (rightTotals[key] ?? 0)
    ) {
      return false;
    }
  }

  return true;
}

function isBettingInteractionOpen(
  page: HTMLElement,
  betPanel: HTMLElement,
) {
  return (
    page.dataset.phase === "betting" &&
    page.dataset.bettingLocked !== "true" &&
    betPanel.getAttribute("aria-disabled") !== "true"
  );
}

function getBootstrapServerNow(
  bootstrap: RouletteBootstrapResponse,
) {
  if (
    Number.isFinite(
      bootstrap.serverTimeMs,
    )
  ) {
    return bootstrap.serverTimeMs;
  }

  return (
    bootstrap.globalTable
      ?.serverTimeMs ??
    Date.now()
  );
}

async function waitForMatchingServerBet(
  wallet: RouletteWalletClient,
  uiBets: readonly RouletteBetPlacement[],
) {
  const deadline =
    performance.now() +
    SERVER_MATCH_TIMEOUT_MS;

  while (performance.now() < deadline) {
    const bootstrap =
      await wallet.bootstrap();
    const table =
      bootstrap.globalTable;

    if (!table) {
      throw new Error(
        "ROULETTE_DRAG_TABLE_UNAVAILABLE",
      );
    }

    if (
      getRouletteGlobalClientPhase(
        table,
        getBootstrapServerNow(
          bootstrap,
        ),
      ) !== "betting"
    ) {
      throw new Error(
        "ROULETTE_DRAG_BETTING_CLOSED",
      );
    }

    const serverBets =
      bootstrap.globalBet?.bets ?? [];

    if (
      haveSameRouletteBetTotals(
        uiBets,
        serverBets,
      )
    ) {
      return bootstrap;
    }

    await delay(
      SERVER_MATCH_POLL_MS,
    );
  }

  throw new Error(
    "ROULETTE_DRAG_WAITING_FOR_SYNC",
  );
}

async function commitDraggedBet(
  wallet: RouletteWalletClient,
  uiBets: readonly RouletteBetPlacement[],
  fromBetId: string,
  toBetId: string,
) {
  for (
    let attempt = 0;
    attempt < 2;
    attempt += 1
  ) {
    const bootstrap =
      await waitForMatchingServerBet(
        wallet,
        uiBets,
      );
    const table =
      bootstrap.globalTable;
    const globalBet =
      bootstrap.globalBet;

    if (
      !table ||
      !globalBet ||
      globalBet.roundId !==
        table.roundId
    ) {
      throw new Error(
        "ROULETTE_DRAG_BET_UNAVAILABLE",
      );
    }

    const movedBets =
      moveRouletteBetPlacements(
        globalBet.bets,
        fromBetId,
        toBetId,
      );

    if (
      !globalBet.bets.some(
        (placement) =>
          placement.betId ===
          fromBetId,
      )
    ) {
      throw new Error(
        "ROULETTE_DRAG_SOURCE_MISSING",
      );
    }

    try {
      await wallet.updateGlobalBet(
        table.roundId,
        movedBets,
        `roulette_drag_${Date.now()}_${crypto.randomUUID().replaceAll("-", "")}`,
        globalBet.revision,
      );
      return movedBets;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "ROULETTE_DRAG_FAILED";

      if (
        message ===
          "ROULETTE_GLOBAL_BET_STALE" &&
        attempt === 0
      ) {
        await delay(
          SERVER_MATCH_POLL_MS,
        );
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    "ROULETTE_DRAG_FAILED",
  );
}

function createDragGhost(
  sourceChip: HTMLElement,
  clientX: number,
  clientY: number,
) {
  const rect =
    sourceChip.getBoundingClientRect();
  const ghost =
    sourceChip.cloneNode(true) as HTMLElement;

  ghost.classList.add(
    "roulette-chip-drag-ghost",
  );
  ghost.classList.remove(
    "is-chip-drag-source",
  );
  ghost.setAttribute(
    "aria-hidden",
    "true",
  );
  ghost.style.setProperty(
    "position",
    "fixed",
    "important",
  );
  ghost.style.setProperty(
    "left",
    "0",
    "important",
  );
  ghost.style.setProperty(
    "top",
    "0",
    "important",
  );
  ghost.style.setProperty(
    "right",
    "auto",
    "important",
  );
  ghost.style.setProperty(
    "bottom",
    "auto",
    "important",
  );
  ghost.style.setProperty(
    "width",
    `${rect.width}px`,
    "important",
  );
  ghost.style.setProperty(
    "height",
    `${rect.height}px`,
    "important",
  );
  ghost.style.setProperty(
    "margin",
    "0",
    "important",
  );
  ghost.style.setProperty(
    "z-index",
    "9999",
    "important",
  );

  document.body.append(ghost);
  positionDragGhost(
    ghost,
    clientX,
    clientY,
  );
  return ghost;
}

function positionDragGhost(
  ghost: HTMLElement,
  clientX: number,
  clientY: number,
) {
  const width =
    ghost.getBoundingClientRect()
      .width;
  const height =
    ghost.getBoundingClientRect()
      .height;

  ghost.style.setProperty(
    "transform",
    `translate3d(${clientX - width / 2}px, ${clientY - height / 2}px, 0) scale(1.12)`,
    "important",
  );
}

function positionGhostOnCell(
  ghost: HTMLElement,
  cell: HTMLElement,
) {
  const rect =
    cell.getBoundingClientRect();
  positionDragGhost(
    ghost,
    rect.left + rect.width / 2,
    rect.top + rect.height / 2,
  );
}

function clearDropTarget(
  drag: ActiveDrag,
) {
  drag.targetCell?.classList.remove(
    "roulette-chip-drop-target",
  );
  drag.targetCell = null;
  drag.targetBetId = null;
}

function updateDropTarget(
  drag: ActiveDrag,
  betPanel: HTMLElement,
  page: HTMLElement,
  clientX: number,
  clientY: number,
) {
  clearDropTarget(drag);

  if (
    !isBettingInteractionOpen(
      page,
      betPanel,
    )
  ) {
    return;
  }

  const hit =
    document.elementFromPoint(
      clientX,
      clientY,
    );
  const cell =
    hit?.closest<HTMLElement>(
      "[data-bet-id]",
    ) ?? null;
  const betId =
    cell?.dataset.betId ?? null;

  if (
    !cell ||
    !betId ||
    betId === drag.sourceBetId ||
    !betPanel.contains(cell)
  ) {
    return;
  }

  drag.targetCell = cell;
  drag.targetBetId = betId;
  cell.classList.add(
    "roulette-chip-drop-target",
  );
}

function triggerRuntimeBetRefresh() {
  document.dispatchEvent(
    new Event("visibilitychange"),
  );
}

async function waitForDomMove(
  app: HTMLDivElement,
  fromBetId: string,
  toBetId: string,
  expectedTargetAmount: number,
) {
  const deadline =
    performance.now() +
    DOM_REFRESH_TIMEOUT_MS;
  let lastRefreshAt = 0;

  while (performance.now() < deadline) {
    const totals =
      getRouletteBetTotals(
        readRoulettePlacedBetPlacements(
          app,
        ),
      );

    if (
      (totals[fromBetId] ?? 0) === 0 &&
      (totals[toBetId] ?? 0) ===
        expectedTargetAmount
    ) {
      return true;
    }

    if (
      performance.now() -
        lastRefreshAt >=
      250
    ) {
      triggerRuntimeBetRefresh();
      lastRefreshAt =
        performance.now();
    }

    await delay(
      DOM_REFRESH_POLL_MS,
    );
  }

  return false;
}

function returnGhostToSource(
  drag: ActiveDrag,
) {
  const rect =
    drag.sourceCell.getBoundingClientRect();
  drag.ghost.classList.add(
    "is-returning",
  );
  positionDragGhost(
    drag.ghost,
    rect.left + rect.width / 2,
    rect.top + rect.height / 2,
  );

  window.setTimeout(() => {
    drag.ghost.remove();
    drag.sourceChip.classList.remove(
      "is-chip-drag-source",
    );
  }, 150);
}

export function installRouletteChipDrag(
  app: HTMLDivElement,
) {
  const page =
    app.querySelector<HTMLElement>(
      "[data-roulette-page]",
    );
  const betPanel =
    app.querySelector<HTMLElement>(
      "[data-roulette-bet-panel]",
    );

  if (
    !page ||
    !betPanel ||
    page.dataset.chipDragInstalled ===
      "true"
  ) {
    return;
  }

  page.dataset.chipDragInstalled =
    "true";

  const wallet =
    new RouletteWalletClient();
  let press: DragPress | null = null;
  let drag: ActiveDrag | null = null;
  let suppressClickUntil = 0;

  const cancelPress = () => {
    if (!press) return;
    window.clearTimeout(
      press.holdTimer,
    );
    press = null;
  };

  const activateDrag = () => {
    if (
      !press ||
      drag ||
      !isBettingInteractionOpen(
        page,
        betPanel,
      ) ||
      !press.sourceChip.isConnected
    ) {
      return;
    }

    const current = press;
    drag = {
      pointerId:
        current.pointerId,
      sourceChip:
        current.sourceChip,
      sourceCell:
        current.sourceCell,
      sourceBetId:
        current.sourceBetId,
      ghost:
        createDragGhost(
          current.sourceChip,
          current.clientX,
          current.clientY,
        ),
      targetCell: null,
      targetBetId: null,
    };

    current.sourceChip.classList.add(
      "is-chip-drag-source",
    );
    betPanel.classList.add(
      "is-chip-dragging",
    );
    suppressClickUntil =
      performance.now() + 800;
  };

  app.addEventListener(
    "click",
    (event) => {
      if (
        performance.now() >
          suppressClickUntil
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          ".roulette-placed-chip",
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  betPanel.addEventListener(
    "contextmenu",
    (event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          ".roulette-placed-chip",
        )
      ) {
        event.preventDefault();
      }
    },
  );

  betPanel.addEventListener(
    "pointerdown",
    (event) => {
      if (
        event.pointerType === "mouse" &&
        event.button !== 0
      ) {
        return;
      }

      if (
        drag ||
        !isBettingInteractionOpen(
          page,
          betPanel,
        )
      ) {
        return;
      }

      const target =
        event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const sourceChip =
        target.closest<HTMLElement>(
          ".roulette-placed-chip[data-bet-amount]",
        );
      const sourceCell =
        sourceChip?.closest<HTMLElement>(
          "[data-bet-id]",
        ) ?? null;
      const sourceBetId =
        sourceCell?.dataset.betId ?? null;

      if (
        !sourceChip ||
        !sourceCell ||
        !sourceBetId
      ) {
        return;
      }

      cancelPress();
      const nextPress:
        DragPress = {
          pointerId:
            event.pointerId,
          sourceChip,
          sourceCell,
          sourceBetId,
          clientX:
            event.clientX,
          clientY:
            event.clientY,
          holdTimer: 0,
        };
      nextPress.holdTimer =
        window.setTimeout(
          activateDrag,
          DRAG_HOLD_MS,
        );
      press = nextPress;

      try {
        sourceChip.setPointerCapture(
          event.pointerId,
        );
      } catch {
        // Pointer capture is optional; document-level hit testing still works.
      }
    },
  );

  betPanel.addEventListener(
    "pointermove",
    (event) => {
      if (
        press &&
        press.pointerId ===
          event.pointerId
      ) {
        press.clientX =
          event.clientX;
        press.clientY =
          event.clientY;
      }

      if (
        !drag ||
        drag.pointerId !==
          event.pointerId
      ) {
        return;
      }

      event.preventDefault();
      positionDragGhost(
        drag.ghost,
        event.clientX,
        event.clientY,
      );
      updateDropTarget(
        drag,
        betPanel,
        page,
        event.clientX,
        event.clientY,
      );
    },
  );

  const finishPointer = (
    event: PointerEvent,
    cancelled: boolean,
  ) => {
    if (
      press?.pointerId ===
      event.pointerId
    ) {
      window.clearTimeout(
        press.holdTimer,
      );
    }

    if (
      !drag ||
      drag.pointerId !==
        event.pointerId
    ) {
      press = null;
      return;
    }

    event.preventDefault();
    suppressClickUntil =
      performance.now() + 900;

    const completedDrag = drag;
    const targetCell =
      completedDrag.targetCell;
    const targetBetId =
      completedDrag.targetBetId;

    clearDropTarget(
      completedDrag,
    );
    betPanel.classList.remove(
      "is-chip-dragging",
    );
    drag = null;
    press = null;

    if (
      cancelled ||
      !targetCell ||
      !targetBetId ||
      !isBettingInteractionOpen(
        page,
        betPanel,
      )
    ) {
      returnGhostToSource(
        completedDrag,
      );
      return;
    }

    positionGhostOnCell(
      completedDrag.ghost,
      targetCell,
    );
    completedDrag.ghost.classList.add(
      "is-pending",
    );

    void (async () => {
      const uiBets =
        readRoulettePlacedBetPlacements(
          app,
        );
      const uiTotals =
        getRouletteBetTotals(
          uiBets,
        );
      const sourceAmount =
        uiTotals[
          completedDrag.sourceBetId
        ] ?? 0;
      const targetAmountBefore =
        uiTotals[targetBetId] ?? 0;

      if (sourceAmount <= 0) {
        returnGhostToSource(
          completedDrag,
        );
        return;
      }

      try {
        await commitDraggedBet(
          wallet,
          uiBets,
          completedDrag.sourceBetId,
          targetBetId,
        );

        const expectedTargetAmount =
          sourceAmount +
          targetAmountBefore;
        triggerRuntimeBetRefresh();
        const hydrated =
          await waitForDomMove(
            app,
            completedDrag.sourceBetId,
            targetBetId,
            expectedTargetAmount,
          );

        completedDrag.ghost.remove();
        completedDrag.sourceChip.classList.remove(
          "is-chip-drag-source",
        );

        if (hydrated) {
          targetCell.classList.add(
            "roulette-chip-drop-confirmed",
          );
          window.setTimeout(() => {
            targetCell.classList.remove(
              "roulette-chip-drop-confirmed",
            );
          }, 220);
        } else {
          triggerRuntimeBetRefresh();
        }

        navigator.vibrate?.(8);
      } catch (error) {
        console.error(
          "[roulette] chip drag failed",
          error,
        );
        returnGhostToSource(
          completedDrag,
        );
      }
    })();
  };

  betPanel.addEventListener(
    "pointerup",
    (event) => {
      finishPointer(
        event,
        false,
      );
    },
  );

  betPanel.addEventListener(
    "pointercancel",
    (event) => {
      finishPointer(
        event,
        true,
      );
    },
  );
}
