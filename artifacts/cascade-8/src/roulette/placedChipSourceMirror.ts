import {
  ROULETTE_CHIP_VALUES,
} from "./betState";
import {
  getRouletteChipTier,
} from "./chipVisual";
import {
  formatRouletteAmount,
} from "./uiFormat";

const FACE_VARIABLES = [
  "--casino-chip-main",
  "--casino-chip-inner",
  "--casino-chip-ink",
  "--casino-chip-accent",
  "--casino-chip-highlight",
] as const;

const FACE_PROPERTIES = [
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

const LABEL_PROPERTIES = [
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "letter-spacing",
  "line-height",
  "text-shadow",
] as const;

function validChipValue(value: number) {
  return (
    Number.isFinite(value) &&
    value > 0 &&
    ROULETTE_CHIP_VALUES.includes(value)
  );
}

export function getRoulettePlacedChipSourceValue(
  amount: number,
  selectedValue: number | null,
  existingValue: number | null = null,
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return ROULETTE_CHIP_VALUES[0];
  }

  if (
    existingValue !== null &&
    validChipValue(existingValue) &&
    amount % existingValue === 0
  ) {
    return existingValue;
  }

  if (
    selectedValue !== null &&
    validChipValue(selectedValue) &&
    amount % selectedValue === 0
  ) {
    return selectedValue;
  }

  if (ROULETTE_CHIP_VALUES.includes(amount)) {
    return amount;
  }

  const descending = [...ROULETTE_CHIP_VALUES]
    .sort((left, right) => right - left);
  const divisor = descending.find(
    (value) => value <= amount && amount % value === 0,
  );

  return divisor ?? ROULETTE_CHIP_VALUES[0];
}

export function getRoulettePlacedChipDisplayLabel(
  amount: number,
) {
  return formatRouletteAmount(amount);
}

function readSelectedChipValue(app: HTMLDivElement) {
  const toggle = app.querySelector<HTMLElement>(
    "[data-mobile-chip-toggle]",
  );
  const toggleValue = Number(
    toggle?.dataset.selectedChipValue,
  );
  if (validChipValue(toggleValue)) {
    return toggleValue;
  }

  const selected = app.querySelector<HTMLElement>(
    ".roulette-chip-option[data-chip-value][aria-pressed=\"true\"]",
  );
  const selectedValue = Number(
    selected?.dataset.chipValue,
  );
  return validChipValue(selectedValue)
    ? selectedValue
    : null;
}

function findChipFaceSource(
  app: HTMLDivElement,
  value: number,
) {
  const toggle = app.querySelector<HTMLElement>(
    "[data-mobile-chip-toggle]",
  );
  if (
    toggle &&
    Number(toggle.dataset.selectedChipValue) === value
  ) {
    return toggle;
  }

  const selector =
    `.roulette-chip-option[data-chip-value="${value}"]`;
  return (
    app.querySelector<HTMLElement>(
      `${selector}[aria-pressed="true"]`,
    ) ??
    app.querySelector<HTMLElement>(selector)
  );
}

function copyImportantComputedProperty(
  target: HTMLElement,
  sourceStyle: CSSStyleDeclaration,
  property: string,
) {
  const value = sourceStyle.getPropertyValue(property);
  if (!value) return;
  target.style.setProperty(property, value, "important");
}

function sourceLabelFor(source: HTMLElement) {
  return (
    source.querySelector<HTMLElement>(
      "[data-mobile-selected-chip]",
    ) ??
    source.querySelector<HTMLElement>(
      ":scope > span",
    )
  );
}

export function mirrorRoulettePlacedChipFromSource(
  app: HTMLDivElement,
  chip: HTMLElement,
) {
  const amount = Number(chip.dataset.betAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return false;
  }

  const existingValue = Number(
    chip.dataset.chipFaceSourceValue,
  );
  const selectedValue = readSelectedChipValue(app);
  const sourceValue = getRoulettePlacedChipSourceValue(
    amount,
    selectedValue,
    validChipValue(existingValue)
      ? existingValue
      : null,
  );
  const source = findChipFaceSource(
    app,
    sourceValue,
  );
  if (!source) return false;

  const sourceStyle = getComputedStyle(source);
  chip.classList.add(
    "roulette-placed-chip",
    "roulette-casino-chip",
  );
  chip.dataset.canonicalChipFace = "true";
  chip.dataset.chipFaceSourceValue =
    String(sourceValue);

  // Aggregate tier describes the wager amount. The visual face is a separate
  // invariant and is copied from the denomination that originally created the
  // chip. Example: a $10 white chip doubled to $160 stays visually white while
  // its aggregate metadata tier becomes green.
  chip.dataset.chipTier = getRouletteChipTier(amount);

  for (const variable of FACE_VARIABLES) {
    const value = sourceStyle.getPropertyValue(variable);
    if (value) {
      chip.style.setProperty(variable, value);
    }
  }
  for (const property of FACE_PROPERTIES) {
    copyImportantComputedProperty(
      chip,
      sourceStyle,
      property,
    );
  }

  const sourceLabel = sourceLabelFor(source);
  if (sourceLabel) {
    const displayLabel =
      getRoulettePlacedChipDisplayLabel(amount);
    const label = document.createElement("span");
    label.className = "roulette-placed-chip__value";
    label.textContent = displayLabel;

    const sourceLabelStyle =
      getComputedStyle(sourceLabel);
    for (const property of LABEL_PROPERTIES) {
      copyImportantComputedProperty(
        label,
        sourceLabelStyle,
        property,
      );
    }
    label.style.setProperty(
      "position",
      "relative",
      "important",
    );
    label.style.setProperty(
      "z-index",
      "3",
      "important",
    );

    const currentValue =
      chip.querySelector<HTMLElement>(
        ":scope > .roulette-placed-chip__value",
      );
    const hasSuffix = Boolean(
      chip.querySelector(
        ":scope > .roulette-placed-chip__suffix",
      ),
    );
    if (
      !currentValue ||
      currentValue.textContent !== displayLabel ||
      hasSuffix
    ) {
      chip.replaceChildren(label);
    } else {
      for (const property of LABEL_PROPERTIES) {
        copyImportantComputedProperty(
          currentValue,
          sourceLabelStyle,
          property,
        );
      }
    }
  }

  chip.setAttribute("aria-hidden", "true");
  return true;
}

function mirrorAllPlacedChips(app: HTMLDivElement) {
  app
    .querySelectorAll<HTMLElement>(
      ".roulette-placed-chip[data-bet-amount]",
    )
    .forEach((chip) => {
      mirrorRoulettePlacedChipFromSource(
        app,
        chip,
      );
    });
}

export function installRoulettePlacedChipSourceMirror(
  app: HTMLDivElement,
) {
  const page = app.querySelector<HTMLElement>(
    "[data-roulette-page]",
  );
  if (
    !page ||
    page.dataset.placedChipSourceMirrorInstalled ===
      "true"
  ) {
    return;
  }

  page.dataset.placedChipSourceMirrorInstalled =
    "true";
  mirrorAllPlacedChips(app);

  const observer = new MutationObserver((records) => {
    let needsMirror = false;

    for (const record of records) {
      if (
        record.type === "attributes" &&
        record.target instanceof HTMLElement &&
        record.target.matches(
          ".roulette-placed-chip[data-bet-amount]",
        )
      ) {
        mirrorRoulettePlacedChipFromSource(
          app,
          record.target,
        );
        continue;
      }

      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (
          node.matches(
            ".roulette-placed-chip[data-bet-amount]",
          ) ||
          node.querySelector(
            ".roulette-placed-chip[data-bet-amount]",
          )
        ) {
          needsMirror = true;
          break;
        }
      }
    }

    if (needsMirror) {
      mirrorAllPlacedChips(app);
    }
  });

  observer.observe(app, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-bet-amount"],
  });
}
