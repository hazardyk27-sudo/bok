const HANDOFF_TIMEOUT_MS = 2200;
const HANDOFF_POLL_MS = 50;
const PLACEHOLDER_DELAY_MS = 145;

type PressSnapshot = {
  pointerId: number;
  sourceChip: HTMLElement;
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
  sourceChip: HTMLElement,
  targetCell: HTMLElement,
) {
  const sourceRect = sourceChip.getBoundingClientRect();
  const targetRect = targetCell.getBoundingClientRect();
  const clone = sourceChip.cloneNode(true) as HTMLElement;

  clone.classList.remove(
    "is-chip-drag-source",
    "is-chip-handoff-source",
    "roulette-chip-drag-ghost",
    "is-pending",
    "is-returning",
  );
  clone.classList.add("roulette-chip-handoff-placeholder");
  clone.setAttribute("aria-hidden", "true");
  clone.style.setProperty("position", "fixed", "important");
  clone.style.setProperty(
    "left",
    `${targetRect.left + targetRect.width / 2 - sourceRect.width / 2}px`,
    "important",
  );
  clone.style.setProperty(
    "top",
    `${targetRect.top + targetRect.height / 2 - sourceRect.height / 2}px`,
    "important",
  );
  clone.style.setProperty("right", "auto", "important");
  clone.style.setProperty("bottom", "auto", "important");
  clone.style.setProperty("width", `${sourceRect.width}px`, "important");
  clone.style.setProperty("height", `${sourceRect.height}px`, "important");
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

  panel.addEventListener("pointerdown", (event) => {
    const hit = findPlacedChipAtPoint(panel, event.clientX, event.clientY);
    if (!hit) {
      press = null;
      return;
    }

    press = {
      pointerId: event.pointerId,
      sourceChip: hit.chip,
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

    const targetInitialAmount = readCellAmount(target.cell);
    const expectedTargetAmount = targetInitialAmount + current.sourceAmount;
    const token = ++handoffToken;
    let placeholder: HTMLElement | null = null;
    let finished = false;

    current.sourceChip.classList.add("is-chip-handoff-source");

    const cleanup = (revealSource: boolean) => {
      if (finished || token !== handoffToken) return;
      finished = true;
      placeholder?.remove();
      placeholder = null;
      if (revealSource && current.sourceChip.isConnected) {
        current.sourceChip.classList.remove("is-chip-handoff-source");
      }
    };

    const isAuthoritativeDomReady = () =>
      readCellAmount(current.sourceCell) === 0 &&
      readCellAmount(target.cell) === expectedTargetAmount;

    const placeholderTimer = window.setTimeout(() => {
      if (finished || token !== handoffToken || isAuthoritativeDomReady()) return;
      if (targetInitialAmount === 0) {
        placeholder = createTargetPlaceholder(current.sourceChip, target.cell);
      }
    }, PLACEHOLDER_DELAY_MS);

    const deadline = performance.now() + HANDOFF_TIMEOUT_MS;
    let refreshCount = 0;

    const poll = () => {
      if (finished || token !== handoffToken) return;

      if (isAuthoritativeDomReady()) {
        window.clearTimeout(placeholderTimer);
        cleanup(false);
        return;
      }

      if (performance.now() >= deadline) {
        window.clearTimeout(placeholderTimer);
        cleanup(true);
        return;
      }

      if (refreshCount < 3) {
        requestRuntimeRefresh();
        refreshCount += 1;
      }

      window.setTimeout(poll, HANDOFF_POLL_MS);
    };

    window.setTimeout(poll, 130);
  });
}
