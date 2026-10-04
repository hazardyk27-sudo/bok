const HANDOFF_TIMEOUT_MS = 2400;
const HANDOFF_POLL_MS = 50;
const PLACEHOLDER_DELAY_MS = 145;
const REFRESH_INTERVAL_MS = 180;

type PressSnapshot = {
  pointerId: number;
  sourceChip: HTMLElement;
  sourceChipTemplate: HTMLElement;
  sourceChipWidth: number;
  sourceChipHeight: number;
  sourceCell: HTMLElement;
  sourceBetId: string;
  sourceAmount: number;
};

function readCellAmount(cell: HTMLElement) {
  const chip = cell.querySelector<HTMLElement>(
    ".roulette-placed-chip[data-bet-amount]",
  );
  const amount = Number(chip?.dataset.betAmount ?? 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function findPlacedChipAtPoint(
  panel: HTMLElement,
  x: number,
  y: number,
) {
  for (const element of document.elementsFromPoint(x, y)) {
    const chip = element.closest<HTMLElement>(
      ".roulette-placed-chip[data-bet-amount]",
    );
    if (!chip || !panel.contains(chip)) continue;

    const cell = chip.closest<HTMLElement>("[data-bet-id]");
    const betId = cell?.dataset.betId;
    const amount = Number(chip.dataset.betAmount);
    if (
      cell &&
      betId &&
      Number.isFinite(amount) &&
      amount > 0
    ) {
      return { chip, cell, betId, amount };
    }
  }

  return null;
}

function findBetCellAtPoint(
  panel: HTMLElement,
  x: number,
  y: number,
) {
  for (const element of document.elementsFromPoint(x, y)) {
    const cell = element.closest<HTMLElement>("[data-bet-id]");
    const betId = cell?.dataset.betId;
    if (cell && betId && panel.contains(cell)) {
      return { cell, betId };
    }
  }

  return null;
}

function createTargetPlaceholder(
  sourceChipTemplate: HTMLElement,
  sourceChipWidth: number,
  sourceChipHeight: number,
  targetCell: HTMLElement,
) {
  const targetRect = targetCell.getBoundingClientRect();
  const clone = sourceChipTemplate.cloneNode(true) as HTMLElement;

  clone.classList.remove(
    "is-chip-drag-source",
    "roulette-chip-drag-ghost",
    "is-pending",
    "is-returning",
  );
  clone.classList.add("roulette-chip-handoff-placeholder");
  clone.setAttribute("aria-hidden", "true");
  clone.style.setProperty("position", "fixed", "important");
  clone.style.setProperty(
    "left",
    `${targetRect.left + targetRect.width / 2 - sourceChipWidth / 2}px`,
    "important",
  );
  clone.style.setProperty(
    "top",
    `${targetRect.top + targetRect.height / 2 - sourceChipHeight / 2}px`,
    "important",
  );
  clone.style.setProperty("right", "auto", "important");
  clone.style.setProperty("bottom", "auto", "important");
  clone.style.setProperty("width", `${sourceChipWidth}px`, "important");
  clone.style.setProperty("height", `${sourceChipHeight}px`, "important");
  clone.style.setProperty("margin", "0", "important");
  clone.style.setProperty("transform", "none", "important");
  clone.style.setProperty("transition", "none", "important");
  document.body.append(clone);
  return clone;
}

function requestRuntimeRefresh() {
  document.dispatchEvent(new Event("visibilitychange"));
}

export function installRouletteChipDragHandoff(app: HTMLDivElement) {
  const panel = app.querySelector<HTMLElement>("[data-roulette-bet-panel]");
  if (!panel || panel.dataset.chipDragHandoffInstalled === "true") return;
  panel.dataset.chipDragHandoffInstalled = "true";

  let press: PressSnapshot | null = null;
  let handoffToken = 0;
  let cancelActiveHandoff: (() => void) | null = null;

  panel.addEventListener("pointerdown", (event) => {
    const hit = findPlacedChipAtPoint(panel, event.clientX, event.clientY);
    if (!hit) {
      press = null;
      return;
    }

    const sourceRect = hit.chip.getBoundingClientRect();
    press = {
      pointerId: event.pointerId,
      sourceChip: hit.chip,
      sourceChipTemplate: hit.chip.cloneNode(true) as HTMLElement,
      sourceChipWidth: sourceRect.width,
      sourceChipHeight: sourceRect.height,
      sourceCell: hit.cell,
      sourceBetId: hit.betId,
      sourceAmount: hit.amount,
    };
  });

  panel.addEventListener("pointercancel", (event) => {
    if (press?.pointerId === event.pointerId) press = null;
  });

  panel.addEventListener("pointerup", (event) => {
    const current = press;
    press = null;

    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.sourceChip.classList.contains("is-chip-drag-source")) return;

    const target = findBetCellAtPoint(panel, event.clientX, event.clientY);
    if (!target || target.betId === current.sourceBetId) return;

    cancelActiveHandoff?.();
    cancelActiveHandoff = null;

    const targetInitialAmount = readCellAmount(target.cell);
    const expectedTargetAmount = targetInitialAmount + current.sourceAmount;
    const token = ++handoffToken;
    let placeholder: HTMLElement | null = null;
    let finished = false;
    let placeholderTimer = 0;
    let pollTimer = 0;
    let lastRefreshAt = -Infinity;

    current.sourceCell.classList.add("is-chip-handoff-source-cell");

    const isAuthoritativeDomReady = () =>
      readCellAmount(current.sourceCell) === 0 &&
      readCellAmount(target.cell) === expectedTargetAmount;

    const observer = new MutationObserver(() => {
      if (!finished && token === handoffToken && isAuthoritativeDomReady()) {
        cleanup();
      }
    });

    const cleanup = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(placeholderTimer);
      window.clearTimeout(pollTimer);
      observer.disconnect();
      placeholder?.remove();
      placeholder = null;
      current.sourceCell.classList.remove("is-chip-handoff-source-cell");
      if (cancelActiveHandoff === cleanup) cancelActiveHandoff = null;
    };

    cancelActiveHandoff = cleanup;
    observer.observe(panel, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-bet-amount"],
    });

    placeholderTimer = window.setTimeout(() => {
      if (finished || token !== handoffToken || isAuthoritativeDomReady()) return;
      if (targetInitialAmount === 0) {
        placeholder = createTargetPlaceholder(
          current.sourceChipTemplate,
          current.sourceChipWidth,
          current.sourceChipHeight,
          target.cell,
        );
      }
    }, PLACEHOLDER_DELAY_MS);

    const deadline = performance.now() + HANDOFF_TIMEOUT_MS;

    const poll = () => {
      if (finished || token !== handoffToken) return;

      if (isAuthoritativeDomReady()) {
        cleanup();
        return;
      }

      const now = performance.now();
      if (now >= deadline) {
        cleanup();
        return;
      }

      if (now - lastRefreshAt >= REFRESH_INTERVAL_MS) {
        requestRuntimeRefresh();
        lastRefreshAt = now;
      }

      pollTimer = window.setTimeout(poll, HANDOFF_POLL_MS);
    };

    pollTimer = window.setTimeout(poll, 80);
  });
}
