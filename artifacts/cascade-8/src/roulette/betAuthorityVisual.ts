import {
  clearRouletteAuthoritativeDragPlacements,
  getRouletteBetTotals,
  setRouletteAuthoritativeDragPlacements,
  type RouletteBetPlacement,
} from "./betState";
import {
  createRouletteCanonicalPlacedChip,
  syncRouletteCanonicalChipFace,
} from "./canonicalPlacedChip";
import { cloneRouletteAuthorityBets } from "./betAuthorityState";

let authorityRoundId: string | null = null;
let authorityBets: RouletteBetPlacement[] | null = null;
let authorityRevision = 0;
let authorityOptimistic = false;
let rendering = false;
let mountedApp: HTMLDivElement | null = null;

export function getRouletteBetAuthoritySnapshot() {
  return {
    roundId: authorityRoundId,
    bets: authorityBets
      ? cloneRouletteAuthorityBets(authorityBets)
      : null,
    revision: authorityRevision,
    optimistic: authorityOptimistic,
  };
}

export function clearRouletteBetAuthority() {
  authorityRoundId = null;
  authorityBets = null;
  authorityRevision = 0;
  authorityOptimistic = false;
  clearRouletteAuthoritativeDragPlacements();
}

export function setRouletteBetAuthority(
  roundId: string,
  bets: readonly RouletteBetPlacement[],
  revision: number,
  optimistic: boolean,
) {
  authorityRoundId = roundId;
  authorityBets = cloneRouletteAuthorityBets(bets);
  authorityRevision = Math.max(0, revision);
  authorityOptimistic = optimistic;
  setRouletteAuthoritativeDragPlacements(authorityBets);
  queueMicrotask(renderRouletteBetAuthority);
}

export function renderRouletteBetAuthority() {
  const app = mountedApp;
  const bets = authorityBets;
  if (!app || !bets || rendering) return;

  const page = app.querySelector<HTMLElement>("[data-roulette-page]");
  if (!page) return;

  if (page.dataset.phase === "settled") {
    clearRouletteBetAuthority();
    return;
  }

  if (
    page.dataset.phase !== "betting" &&
    page.dataset.phase !== "spinning"
  ) {
    return;
  }

  if (
    !authorityOptimistic &&
    app.querySelector(
      ".roulette-placed-chip[data-roulette-drag-optimistic=\"true\"]",
    )
  ) {
    return;
  }

  const totals = getRouletteBetTotals(bets);
  rendering = true;
  try {
    app.querySelectorAll<HTMLElement>("[data-bet-id]").forEach((cell) => {
      const betId = cell.dataset.betId;
      if (!betId) return;
      const amount = totals[betId] ?? 0;
      const chips = Array.from(
        cell.querySelectorAll<HTMLElement>(".roulette-placed-chip"),
      );

      if (amount <= 0) {
        chips.forEach((chip) => chip.remove());
        cell.classList.remove("has-bet");
        return;
      }

      const chip = chips[0] ?? createRouletteCanonicalPlacedChip(amount);
      chips.slice(1).forEach((extra) => extra.remove());
      syncRouletteCanonicalChipFace(chip, amount);
      cell.classList.add("has-bet");
      if (!chip.isConnected || chip.parentElement !== cell) {
        cell.append(chip);
      }
    });
  } finally {
    rendering = false;
  }
}

export function installRouletteBetAuthorityVisual(app: HTMLDivElement) {
  mountedApp = app;
  const observer = new MutationObserver(() => {
    renderRouletteBetAuthority();
  });
  observer.observe(app, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-phase", "data-betting-locked"],
  });
}
