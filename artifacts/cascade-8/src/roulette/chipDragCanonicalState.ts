import {
  clearRouletteAuthoritativeDragPlacements,
  getRouletteBetTotals,
  setRouletteAuthoritativeDragPlacements,
  type RouletteBetPlacement,
} from "./betState";
import {
  getRouletteChipPalette,
  getRouletteChipStackDepth,
  getRouletteChipTier,
} from "./chipVisual";
import { RouletteWalletClient } from "./rouletteWalletClient";
import { formatRouletteAmount } from "./uiFormat";

const V6_MOVE_PREFIX = "roulette_move_v6_";

export const ROULETTE_CANONICAL_RESET_SELECTOR = [
  "[data-double-bet]",
  "[data-undo-bet]",
  "[data-clear-bets]",
  "[data-rebet]",
].join(", ");

type CanonicalState = {
  placements: RouletteBetPlacement[];
  templates: Map<string, HTMLElement>;
  fallbackTemplate: HTMLElement | null;
};

let installed = false;
let mountedApp: HTMLDivElement | null = null;
let canonicalState: CanonicalState | null = null;
let rendering = false;

function clonePlacements(
  placements: readonly RouletteBetPlacement[],
) {
  return placements.map((placement) => ({
    ...placement,
  }));
}

function totalStake(
  placements: readonly RouletteBetPlacement[],
) {
  return placements.reduce(
    (sum, placement) =>
      sum + placement.amount,
    0,
  );
}

export function shouldEnforceRouletteCanonicalDragState(
  phase: string | undefined,
  bettingLocked: string | undefined,
) {
  return (
    phase === "spinning" ||
    (
      phase === "betting" &&
      bettingLocked === "true"
    )
  );
}

export function shouldResetRouletteCanonicalDragStateForUpdate(
  idempotencyKey: string,
) {
  return !idempotencyKey.startsWith(
    V6_MOVE_PREFIX,
  );
}

function resetCanonicalDragState() {
  canonicalState = null;
  clearRouletteAuthoritativeDragPlacements();
}

function readVisiblePlacements(
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

    return (
      betId &&
      Number.isFinite(amount) &&
      amount > 0
    )
      ? [{ betId, amount }]
      : [];
  });
}

function collectTemplates(
  root: ParentNode,
) {
  const templates =
    new Map<string, HTMLElement>();
  let fallbackTemplate:
    HTMLElement | null = null;

  root
    .querySelectorAll<HTMLElement>(
      "[data-bet-id]",
    )
    .forEach((cell) => {
      const betId =
        cell.dataset.betId;
      const chip =
        cell.querySelector<HTMLElement>(
          ".roulette-placed-chip[data-bet-amount]",
        );
      if (!betId || !chip) return;

      const template =
        chip.cloneNode(true) as HTMLElement;
      templates.set(
        betId,
        template,
      );
      fallbackTemplate ??=
        template.cloneNode(true) as HTMLElement;
    });

  return {
    templates,
    fallbackTemplate,
  };
}

function updateChipAmount(
  chip: HTMLElement,
  amount: number,
) {
  chip.dataset.betAmount =
    String(amount);
  chip.dataset.stackDepth =
    String(
      getRouletteChipStackDepth(
        amount,
      ),
    );
  chip.dataset.chipTier =
    getRouletteChipTier(amount);
  delete chip.dataset
    .rouletteDragOptimistic;

  const palette =
    getRouletteChipPalette(amount);
  chip.style.setProperty(
    "--casino-chip-main",
    palette.main,
  );
  chip.style.setProperty(
    "--casino-chip-inner",
    palette.inner,
  );
  chip.style.setProperty(
    "--casino-chip-ink",
    palette.ink,
  );
  chip.style.setProperty(
    "--casino-chip-accent",
    palette.accent,
  );
  chip.style.setProperty(
    "--casino-chip-highlight",
    palette.highlight,
  );

  const displayAmount =
    formatRouletteAmount(amount);
  const suffix =
    /[KM]$/.test(displayAmount)
      ? displayAmount.slice(-1)
      : "";
  const number = suffix
    ? displayAmount.slice(0, -1)
    : displayAmount;

  let value =
    chip.querySelector<HTMLElement>(
      ".roulette-placed-chip__value",
    );
  if (!value) {
    value =
      document.createElement("span");
    value.className =
      "roulette-placed-chip__value";
    chip.prepend(value);
  }
  value.textContent = number;

  chip
    .querySelector(
      ".roulette-placed-chip__suffix",
    )
    ?.remove();
  if (suffix) {
    const suffixElement =
      document.createElement("span");
    suffixElement.className =
      "roulette-placed-chip__suffix";
    suffixElement.textContent =
      suffix;
    chip.append(suffixElement);
  }
}

function renderCanonicalState(
  app: HTMLDivElement,
  state: CanonicalState,
) {
  const totals =
    getRouletteBetTotals(
      state.placements,
    );

  app
    .querySelectorAll<HTMLElement>(
      "[data-bet-id]",
    )
    .forEach((cell) => {
      const betId =
        cell.dataset.betId;
      if (!betId) return;

      const amount =
        totals[betId] ?? 0;
      const chips = Array.from(
        cell.querySelectorAll<HTMLElement>(
          ".roulette-placed-chip",
        ),
      );

      if (amount <= 0) {
        chips.forEach((chip) =>
          chip.remove(),
        );
        cell.classList.remove(
          "has-bet",
        );
        return;
      }

      const currentAmount = Number(
        chips[0]?.dataset.betAmount ??
          0,
      );
      if (
        chips.length === 1 &&
        currentAmount === amount
      ) {
        cell.classList.add(
          "has-bet",
        );
        return;
      }

      chips.forEach((chip) =>
        chip.remove(),
      );

      const template =
        state.templates.get(betId) ??
        state.fallbackTemplate;
      if (!template) return;

      const chip =
        template.cloneNode(true) as HTMLElement;
      chip.classList.remove(
        "is-chip-drag-source",
        "roulette-chip-drag-ghost",
        "is-pending",
        "is-returning",
        "is-chip-handoff-source",
      );
      chip.removeAttribute(
        "data-roulette-drag-handoff",
      );
      updateChipAmount(
        chip,
        amount,
      );
      cell.classList.add(
        "has-bet",
      );
      cell.append(chip);
    });
}

function enforceIfLocked() {
  const app = mountedApp;
  const state = canonicalState;
  if (!app || !state || rendering) {
    return;
  }

  const page =
    app.querySelector<HTMLElement>(
      "[data-roulette-page]",
    );
  if (!page) return;

  if (
    page.dataset.phase === "settled"
  ) {
    resetCanonicalDragState();
    return;
  }

  if (
    !shouldEnforceRouletteCanonicalDragState(
      page.dataset.phase,
      page.dataset.bettingLocked,
    )
  ) {
    return;
  }

  rendering = true;
  try {
    renderCanonicalState(
      app,
      state,
    );
  } finally {
    rendering = false;
  }
}

export function installRouletteChipDragCanonicalState(
  app: HTMLDivElement,
) {
  mountedApp = app;
  if (installed) return;
  installed = true;

  app.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          ROULETTE_CANONICAL_RESET_SELECTOR,
        )
      ) {
        resetCanonicalDragState();
      }
    },
    true,
  );

  const originalUpdate =
    RouletteWalletClient.prototype
      .updateGlobalBet;

  RouletteWalletClient.prototype.updateGlobalBet =
    async function (
      roundId,
      bets,
      idempotencyKey,
      expectedRevision,
    ) {
      const isDragUpdate =
        !shouldResetRouletteCanonicalDragStateForUpdate(
          idempotencyKey,
        );

      if (isDragUpdate) {
        setRouletteAuthoritativeDragPlacements(
          bets,
        );
      }

      let result;
      try {
        result =
          await originalUpdate.call(
            this,
            roundId,
            bets,
            idempotencyKey,
            expectedRevision,
          );
      } catch (error) {
        if (isDragUpdate) {
          resetCanonicalDragState();
        }
        throw error;
      }

      if (!isDragUpdate) {
        resetCanonicalDragState();
        return result;
      }

      if (
        !mountedApp?.isConnected ||
        !result.globalBet
      ) {
        return result;
      }

      const visible =
        readVisiblePlacements(
          mountedApp,
        );
      const visibleStake =
        totalStake(visible);
      const resultStake =
        result.globalBet.stakeCents /
        100;

      if (
        visible.length === 0 ||
        Math.abs(
          visibleStake - resultStake,
        ) > 1e-9
      ) {
        return result;
      }

      const templateState =
        collectTemplates(
          mountedApp,
        );
      canonicalState = {
        placements:
          clonePlacements(visible),
        templates:
          templateState.templates,
        fallbackTemplate:
          templateState.fallbackTemplate,
      };
      setRouletteAuthoritativeDragPlacements(
        visible,
      );

      queueMicrotask(
        enforceIfLocked,
      );

      return result;
    };

  const observer =
    new MutationObserver(() => {
      enforceIfLocked();
    });

  observer.observe(app, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "data-phase",
      "data-betting-locked",
    ],
  });
}
