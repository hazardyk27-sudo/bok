import {
  ROULETTE_CHIP_VALUES,
} from "./betState";

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
    ROULETTE_CHIP_VALUES.includes(
      amount as (typeof ROULETTE_CHIP_VALUES)[number],
    )
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
  const estimatedChips =
    Math.max(
      2,
      Math.ceil(amount / tierFloor),
    );

  return Math.min(3, estimatedChips);
}

function decorateChipElement(
  element: HTMLElement,
  amount: number,
  placed: boolean,
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const tier = getRouletteChipTier(amount);
  const palette = getRouletteChipPalette(amount);

  element.classList.add(
    "roulette-casino-chip",
  );
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

  if (placed) {
    element.dataset.stackDepth = String(
      getRouletteChipStackDepth(amount),
    );
  }
}

function decorateRouletteChips(
  root: ParentNode,
) {
  root
    .querySelectorAll<HTMLElement>(
      "[data-chip-value]",
    )
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

export function installRouletteChipVisuals(
  app: HTMLDivElement,
) {
  const page =
    app.querySelector<HTMLElement>(
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

  const observer = new MutationObserver(
    (records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }

          if (
            node.matches(
              "[data-chip-value], .roulette-placed-chip[data-bet-amount]",
            )
          ) {
            decorateRouletteChips(
              node.parentElement ?? node,
            );
          } else if (
            node.querySelector(
              "[data-chip-value], .roulette-placed-chip[data-bet-amount]",
            )
          ) {
            decorateRouletteChips(node);
          }
        }
      }
    },
  );

  observer.observe(app, {
    childList: true,
    subtree: true,
  });
}
