import {
  syncRouletteCanonicalChipFace,
} from "./canonicalPlacedChip";

type RouletteReuseWindow = Window & {
  __roulettePlacedChipReuseInstalled?: boolean;
};

type PendingRemoval = {
  chip: HTMLElement;
  cell: HTMLElement;
};

const activeRouletteApps =
  new Set<HTMLDivElement>();
const pendingRemovals =
  new Set<PendingRemoval>();
let flushQueued = false;

function findRouletteApp(
  element: Element,
) {
  for (const app of activeRouletteApps) {
    if (
      app.isConnected &&
      app.contains(element)
    ) {
      return app;
    }
  }
  return null;
}

function directPlacedChip(
  cell: Element,
) {
  return Array.from(cell.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      child.classList.contains(
        "roulette-placed-chip",
      ),
  ) ?? null;
}

function clearPendingForChip(
  chip: HTMLElement,
) {
  for (const pending of pendingRemovals) {
    if (pending.chip === chip) {
      pendingRemovals.delete(pending);
    }
  }
  delete chip.dataset
    .roulettePendingRuntimeRemoval;
}

function flushPendingRemovals() {
  flushQueued = false;

  for (const pending of [
    ...pendingRemovals,
  ]) {
    pendingRemovals.delete(pending);
    const { chip, cell } = pending;

    if (
      chip.dataset
        .roulettePendingRuntimeRemoval !==
        "true"
    ) {
      continue;
    }

    delete chip.dataset
      .roulettePendingRuntimeRemoval;

    if (
      chip.isConnected &&
      chip.parentElement === cell
    ) {
      nativeRemove.call(chip);
    }
  }
}

function schedulePendingFlush() {
  if (flushQueued) return;
  flushQueued = true;
  queueMicrotask(
    flushPendingRemovals,
  );
}

const nativeRemove =
  Element.prototype.remove;
const nativeAppend =
  Element.prototype.append;

function interceptRemove(
  this: Element,
) {
  if (
    !(this instanceof HTMLElement) ||
    !this.classList.contains(
      "roulette-placed-chip",
    ) ||
    !this.parentElement ||
    !this.parentElement.matches(
      "[data-bet-id]",
    ) ||
    !findRouletteApp(this)
  ) {
    return nativeRemove.call(this);
  }

  const cell = this.parentElement;
  this.dataset
    .roulettePendingRuntimeRemoval =
    "true";
  pendingRemovals.add({
    chip: this,
    cell,
  });
  schedulePendingFlush();
}

function isPlacedChipNode(
  node: unknown,
): node is HTMLElement {
  return (
    node instanceof HTMLElement &&
    node.classList.contains(
      "roulette-placed-chip",
    )
  );
}

function interceptAppend(
  this: Element,
  ...nodes: (Node | string)[]
) {
  const app =
    this.matches("[data-bet-id]")
      ? findRouletteApp(this)
      : null;

  if (!app) {
    return nativeAppend.apply(
      this,
      nodes,
    );
  }

  const passThrough:
    (Node | string)[] = [];

  for (const node of nodes) {
    if (!isPlacedChipNode(node)) {
      passThrough.push(node);
      continue;
    }

    const amount =
      Number(node.dataset.betAmount);
    const existing =
      directPlacedChip(this);

    if (
      existing &&
      existing.dataset
        .roulettePendingRuntimeRemoval ===
        "true"
    ) {
      clearPendingForChip(existing);
      syncRouletteCanonicalChipFace(
        existing,
        amount,
      );
      continue;
    }

    syncRouletteCanonicalChipFace(
      node,
      amount,
    );
    passThrough.push(node);
  }

  if (passThrough.length > 0) {
    nativeAppend.apply(
      this,
      passThrough,
    );
  }
}

function pruneDisconnectedApps() {
  for (const app of activeRouletteApps) {
    if (!app.isConnected) {
      activeRouletteApps.delete(app);
    }
  }
}

export function installRouletteIncrementalPlacedChipReuse(
  app: HTMLDivElement,
) {
  activeRouletteApps.add(app);

  if (typeof window === "undefined") {
    return;
  }

  const guardedWindow =
    window as RouletteReuseWindow;
  if (
    guardedWindow
      .__roulettePlacedChipReuseInstalled
  ) {
    return;
  }

  guardedWindow
    .__roulettePlacedChipReuseInstalled =
    true;

  Element.prototype.remove =
    interceptRemove;
  Element.prototype.append =
    interceptAppend;

  window.addEventListener(
    "pagehide",
    pruneDisconnectedApps,
    { passive: true },
  );
}

export function getRoulettePlacedChipReuseDebugState() {
  return {
    activeApps: activeRouletteApps.size,
    pendingRemovals:
      pendingRemovals.size,
  };
}
