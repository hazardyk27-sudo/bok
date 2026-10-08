import {
  ROULETTE_CHIP_VALUES,
} from "./betState";
import {
  getRouletteChipTier,
  type RouletteChipTier,
} from "./chipTier";
import {
  formatRouletteAmount,
} from "./uiFormat";

export {
  getRouletteChipTier,
  type RouletteChipTier,
} from "./chipTier";

export type RouletteChipPalette = Readonly<{
  base: string;
}>;

/**
 * Tier may change ONE visual property only: the base color.
 * Geometry, ring, edge segments, center, highlight, shadow and typography are
 * fixed by chipVisual.css and must never vary by denomination/tier.
 */
export const ROULETTE_CHIP_PALETTES: Readonly<
  Record<RouletteChipTier, RouletteChipPalette>
> = {
  white: { base: "#F1F1EE" },
  blue: { base: "#2F78C8" },
  green: { base: "#2D9B61" },
  red: { base: "#C73B36" },
  black: { base: "#1E1F22" },
  purple: { base: "#5B2A86" },
};

export function getRouletteChipPalette(
  amount: number,
) {
  return ROULETTE_CHIP_PALETTES[
    getRouletteChipTier(amount)
  ];
}

/**
 * Every visible wager is one physical chip face. Aggregate table amounts are
 * represented by the number printed on that face, never by a visual stack.
 */
export function getRouletteChipStackDepth(
  amount: number,
) {
  return Number.isFinite(amount) && amount > 0
    ? 1
    : 0;
}

export function applyRouletteChipVisualState(
  element: HTMLElement,
  amount: number,
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return false;
  }

  const tier = getRouletteChipTier(amount);
  const palette = getRouletteChipPalette(amount);

  element.classList.add("roulette-casino-chip");
  element.dataset.chipTier = tier;

  // This is intentionally the ONLY tier-dependent visual variable.
  element.style.setProperty(
    "--casino-chip-base",
    palette.base,
  );

  return true;
}

const LEGACY_PLACED_FACE_VARIABLES = [
  "--chip-fill",
  "--chip-ink",
  "--chip-edge",
  "--casino-chip-main",
  "--casino-chip-inner",
  "--casino-chip-ink",
  "--casino-chip-accent",
  "--casino-chip-highlight",
] as const;

const LEGACY_SOURCE_MIRROR_PROPERTIES = [
  "background-color",
  "background-image",
  "background-repeat",
  "background-position",
  "background-size",
  "box-shadow",
  "color",
  "text-shadow",
  "font-family",
  "font-weight",
  "letter-spacing",
] as const;

/**
 * Placed-chip visuals have one authority: aggregate wager amount. Strip every
 * historic denomination/source-mirror face before applying the canonical face.
 */
export function clearRouletteLegacyPlacedChipFace(
  element: HTMLElement,
) {
  for (const className of [...element.classList]) {
    if (className.startsWith("chip-")) {
      element.classList.remove(className);
    }
  }

  for (const variable of LEGACY_PLACED_FACE_VARIABLES) {
    element.style.removeProperty(variable);
  }
  for (const property of LEGACY_SOURCE_MIRROR_PROPERTIES) {
    element.style.removeProperty(property);
  }

  delete element.dataset.chipFaceSourceValue;
}

function setImportantStyle(
  element: HTMLElement,
  property: string,
  value: string,
) {
  element.style.setProperty(property, value, "important");
}

function anchorPlacedChip(
  element: HTMLElement,
) {
  const cell = element.parentElement;
  if (!cell) return;

  element.dataset.chipAnchor = "center";
  setImportantStyle(element, "position", "absolute");
  setImportantStyle(element, "z-index", "6");
  setImportantStyle(element, "margin", "0");
  setImportantStyle(element, "left", "50%");
  setImportantStyle(element, "top", "50%");
  setImportantStyle(element, "right", "auto");
  setImportantStyle(element, "bottom", "auto");
  setImportantStyle(
    element,
    "transform",
    "translate(-50%, -50%)",
  );
  setImportantStyle(element, "max-width", "calc(100% - 6px)");
  setImportantStyle(element, "max-height", "calc(100% - 6px)");
}

function syncChipValueLabel(
  label: HTMLElement,
  amount: number,
) {
  label.classList.add(
    "roulette-chip-face-value",
  );
  label.textContent =
    formatRouletteAmount(amount);
}

export function syncRoulettePlacedChipVisual(
  element: HTMLElement,
  amount: number,
) {
  clearRouletteLegacyPlacedChipFace(element);

  if (!applyRouletteChipVisualState(element, amount)) {
    return false;
  }

  // One physical chip everywhere. The amount itself carries aggregate meaning.
  delete element.dataset.stackDepth;
  element.dataset.canonicalChipFace = "true";
  anchorPlacedChip(element);
  return true;
}

function decorateChipElement(
  element: HTMLElement,
  amount: number,
  placed: boolean,
) {
  if (placed) {
    syncRoulettePlacedChipVisual(element, amount);
    element
      .querySelectorAll<HTMLElement>(
        ":scope > .roulette-placed-chip__value, :scope > .roulette-placed-chip__suffix",
      )
      .forEach((label) => {
        label.classList.add(
          "roulette-chip-face-value",
        );
      });
    return;
  }

  if (!applyRouletteChipVisualState(element, amount)) {
    return;
  }

  const label = element.querySelector<HTMLElement>(
    ":scope > span",
  );
  if (label) {
    syncChipValueLabel(label, amount);
  }
}

function decorateMobileChipToggle(
  app: HTMLDivElement,
  amount: number,
) {
  const toggle = app.querySelector<HTMLElement>(
    "[data-mobile-chip-toggle]",
  );

  if (
    !toggle ||
    !applyRouletteChipVisualState(
      toggle,
      amount,
    )
  ) {
    return;
  }

  toggle.dataset.selectedChipValue = String(amount);
  const label = toggle.querySelector<HTMLElement>(
    "[data-mobile-selected-chip]",
  );
  if (label) {
    syncChipValueLabel(label, amount);
  }
}

function decorateRouletteChips(
  root: ParentNode,
) {
  root
    .querySelectorAll<HTMLElement>("[data-chip-value]")
    .forEach((chip) => {
      decorateChipElement(
        chip,
        Number(chip.dataset.chipValue),
        false,
      );
    });

  root
    .querySelectorAll<HTMLElement>(
      ".roulette-placed-chip[data-bet-amount]",
    )
    .forEach((chip) => {
      decorateChipElement(
        chip,
        Number(chip.dataset.betAmount),
        true,
      );
    });
}

function readSelectedChipAmount(
  app: HTMLDivElement,
) {
  const selected = app.querySelector<HTMLElement>(
    "[data-chip-value][aria-pressed=\"true\"]",
  );
  const value = Number(selected?.dataset.chipValue);
  return Number.isFinite(value) && value > 0
    ? value
    : ROULETTE_CHIP_VALUES[0];
}

function recordNeedsChipDecoration(record: MutationRecord) {
  if (
    record.type === "attributes" &&
    record.target instanceof HTMLElement &&
    record.target.matches(
      ".roulette-placed-chip[data-bet-amount]",
    )
  ) {
    return true;
  }

  if (record.type !== "childList") return false;

  for (const node of record.addedNodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (
      node.matches(
        "[data-chip-value], .roulette-placed-chip[data-bet-amount]",
      ) ||
      node.querySelector(
        "[data-chip-value], .roulette-placed-chip[data-bet-amount]",
      )
    ) {
      return true;
    }
  }

  return false;
}

export function installRouletteChipVisuals(
  app: HTMLDivElement,
) {
  const page = app.querySelector<HTMLElement>(
    "[data-roulette-page]",
  );

  if (
    !page ||
    page.dataset.chipVisualsInstalled === "true"
  ) {
    return;
  }

  page.dataset.chipVisualsInstalled = "true";
  decorateRouletteChips(app);
  decorateMobileChipToggle(
    app,
    readSelectedChipAmount(app),
  );

  app.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const chip = target.closest<HTMLElement>(
      "[data-chip-value]",
    );
    if (!chip) return;

    const amount = Number(chip.dataset.chipValue);
    if (!Number.isFinite(amount) || amount <= 0) return;

    queueMicrotask(() => {
      decorateMobileChipToggle(app, amount);
    });
  });

  const observer = new MutationObserver((records) => {
    if (!records.some(recordNeedsChipDecoration)) return;
    decorateRouletteChips(app);
  });

  observer.observe(app, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-bet-amount"],
  });
}
