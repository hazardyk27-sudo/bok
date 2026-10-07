import {
  ROULETTE_CHIP_VALUES,
} from "./betState";
import {
  formatRouletteAmount,
} from "./uiFormat";

export type RouletteChipTier =
  | "white"
  | "blue"
  | "green"
  | "red"
  | "black"
  | "purple";

export type RouletteChipPalette = Readonly<{
  main: string;
  inner: string;
  ink: string;
  accent: string;
  highlight: string;
}>;

export const ROULETTE_CHIP_PALETTES: Readonly<
  Record<RouletteChipTier, RouletteChipPalette>
> = {
  white: {
    main: "#F1F1EE",
    inner: "#D9D9D4",
    ink: "#1A1A1A",
    accent: "#303236",
    highlight: "#FFFFFF",
  },
  blue: {
    main: "#2F78C8",
    inner: "#1F5EA3",
    ink: "#FFFFFF",
    accent: "#F7FAFF",
    highlight: "#67A9EB",
  },
  green: {
    main: "#2D9B61",
    inner: "#1F7448",
    ink: "#FFFFFF",
    accent: "#F7FFF9",
    highlight: "#62C88E",
  },
  red: {
    main: "#C73B36",
    inner: "#922A27",
    ink: "#FFFFFF",
    accent: "#FFF8F7",
    highlight: "#EA6A64",
  },
  black: {
    main: "#1E1F22",
    inner: "#0F1012",
    ink: "#FFFFFF",
    accent: "#F5F5F2",
    highlight: "#4A4D52",
  },
  purple: {
    main: "#5B2A86",
    inner: "#3E1C5D",
    ink: "#FFFFFF",
    accent: "#FBF8FF",
    highlight: "#7B43B6",
  },
};

export function getRouletteChipTier(
  amount: number,
): RouletteChipTier {
  if (amount >= 5_000) return "purple";
  if (amount >= 2_000) return "black";
  if (amount >= 500) return "red";
  if (amount >= 100) return "green";
  if (amount >= 50) return "blue";
  return "white";
}

export function getRouletteChipPalette(
  amount: number,
) {
  return ROULETTE_CHIP_PALETTES[
    getRouletteChipTier(amount)
  ];
}

export function getRouletteChipStackDepth(
  amount: number,
) {
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    ROULETTE_CHIP_VALUES.includes(amount)
  ) {
    return 1;
  }

  const tierFloor =
    amount >= 5_000
      ? 5_000
      : amount >= 2_000
        ? 2_000
        : amount >= 500
          ? 500
          : amount >= 100
            ? 100
            : amount >= 50
              ? 50
              : 10;
  const estimatedChips = Math.max(
    2,
    Math.ceil(amount / tierFloor),
  );

  return Math.min(3, estimatedChips);
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
  element.style.setProperty(
    "--casino-chip-main",
    palette.main,
  );
  element.style.setProperty(
    "--casino-chip-inner",
    palette.inner,
  );
  element.style.setProperty(
    "--casino-chip-ink",
    palette.ink,
  );
  element.style.setProperty(
    "--casino-chip-accent",
    palette.accent,
  );
  element.style.setProperty(
    "--casino-chip-highlight",
    palette.highlight,
  );

  return true;
}

const LEGACY_PLACED_FACE_VARIABLES = [
  "--chip-fill",
  "--chip-ink",
  "--chip-edge",
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
 * Placed-chip visuals have one authority: aggregate wager amount.
 *
 * The old runtime still emits legacy `chip-*` classes and --chip-* variables,
 * and old source-mirror revisions copied denomination styles inline. Strip both
 * before applying the canonical amount tier so a $20 wager can never inherit
 * the historic blue $10 face again.
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

export function syncRoulettePlacedChipVisual(
  element: HTMLElement,
  amount: number,
) {
  clearRouletteLegacyPlacedChipFace(element);

  if (!applyRouletteChipVisualState(element, amount)) {
    return false;
  }

  element.dataset.stackDepth = String(
    getRouletteChipStackDepth(amount),
  );
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
    return;
  }

  if (!applyRouletteChipVisualState(element, amount)) {
    return;
  }

  const label = element.querySelector<HTMLElement>(
    ":scope > span",
  );
  if (label) {
    label.textContent = formatRouletteAmount(amount);
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
    label.textContent = formatRouletteAmount(amount);
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

  // Runtime may replace several placed-chip nodes in one render or mutate an
  // existing chip amount during drag/x2. One observer batch is canonicalized
  // once; no denomination/source mirror is allowed to own the placed face.
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
