import {
  getRouletteChipPalette,
  getRouletteChipStackDepth,
  getRouletteChipTier,
} from "./chipVisual";
import {
  formatRouletteAmount,
  getRouletteAmountScale,
} from "./uiFormat";

export function syncRouletteCanonicalChipFace(
  chip: HTMLElement,
  amount: number,
) {
  const safeAmount =
    Number.isFinite(amount) && amount > 0
      ? amount
      : 0;
  if (safeAmount <= 0) return false;

  const palette =
    getRouletteChipPalette(safeAmount);
  chip.classList.add(
    "roulette-placed-chip",
    "roulette-casino-chip",
  );
  chip.dataset.betAmount =
    String(safeAmount);
  chip.dataset.amountScale =
    getRouletteAmountScale(safeAmount);
  chip.dataset.stackDepth =
    String(
      getRouletteChipStackDepth(
        safeAmount,
      ),
    );
  chip.dataset.chipTier =
    getRouletteChipTier(safeAmount);
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
    formatRouletteAmount(safeAmount);
  const compactSuffix =
    /[KM]$/.test(displayAmount)
      ? displayAmount.slice(-1)
      : "";
  const compactNumber = compactSuffix
    ? displayAmount.slice(0, -1)
    : displayAmount;

  let amountValue =
    chip.querySelector<HTMLElement>(
      ":scope > .roulette-placed-chip__value",
    );
  if (!amountValue) {
    amountValue =
      document.createElement("span");
    amountValue.className =
      "roulette-placed-chip__value";
    chip.prepend(amountValue);
  }
  if (
    amountValue.textContent !==
    compactNumber
  ) {
    amountValue.textContent =
      compactNumber;
  }

  let amountSuffix =
    chip.querySelector<HTMLElement>(
      ":scope > .roulette-placed-chip__suffix",
    );
  if (compactSuffix) {
    if (!amountSuffix) {
      amountSuffix =
        document.createElement("span");
      amountSuffix.className =
        "roulette-placed-chip__suffix";
      chip.append(amountSuffix);
    }
    if (
      amountSuffix.textContent !==
      compactSuffix
    ) {
      amountSuffix.textContent =
        compactSuffix;
    }
  } else {
    amountSuffix?.remove();
  }

  chip.setAttribute(
    "aria-hidden",
    "true",
  );
  return true;
}

export function createRouletteCanonicalPlacedChip(
  amount: number,
) {
  const chip =
    document.createElement("span");
  syncRouletteCanonicalChipFace(
    chip,
    amount,
  );
  return chip;
}
