import {
  getRouletteBetTotals,
  type RouletteBetPlacement,
} from "./betState";
import {
  createRouletteCanonicalPlacedChip,
  syncRouletteCanonicalChipFace,
} from "./canonicalPlacedChip";
import {
  getRouletteBetAuthoritySnapshot,
} from "./betAuthorityVisual";

function directPlacedChips(
  cell: HTMLElement,
) {
  return Array.from(cell.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      child.classList.contains(
        "roulette-placed-chip",
      ),
  );
}

function sameRenderedAmount(
  chip: HTMLElement,
  amount: number,
) {
  return Number(chip.dataset.betAmount) === amount;
}

export function renderRouletteBetTopology(
  app: HTMLDivElement,
  bets: readonly RouletteBetPlacement[],
) {
  const totals = getRouletteBetTotals(bets);

  app
    .querySelectorAll<HTMLElement>("[data-bet-id]")
    .forEach((cell) => {
      const betId = cell.dataset.betId;
      if (!betId) return;

      const amount = totals[betId] ?? 0;
      const chips = directPlacedChips(cell);

      if (amount <= 0) {
        chips.forEach((chip) => chip.remove());
        cell.classList.remove("has-bet");
        return;
      }

      const chip =
        chips[0] ??
        createRouletteCanonicalPlacedChip(amount);

      chips.slice(1).forEach((extra) => extra.remove());
      syncRouletteCanonicalChipFace(chip, amount);

      cell.classList.add("has-bet");
      if (!chip.isConnected || chip.parentElement !== cell) {
        cell.append(chip);
      }
    });
}

export function renderRouletteCurrentAuthorityBets(
  app: HTMLDivElement,
) {
  const authority =
    getRouletteBetAuthoritySnapshot();
  if (!authority.bets) return false;

  renderRouletteBetTopology(
    app,
    authority.bets,
  );
  return true;
}

function topologyMatchesDom(
  app: HTMLDivElement,
  bets: readonly RouletteBetPlacement[],
) {
  const totals = getRouletteBetTotals(bets);

  for (const cell of app.querySelectorAll<HTMLElement>(
    "[data-bet-id]",
  )) {
    const betId = cell.dataset.betId;
    if (!betId) continue;

    const expected = totals[betId] ?? 0;
    const chips = directPlacedChips(cell);

    if (expected <= 0) {
      if (chips.length !== 0) return false;
      continue;
    }

    if (
      chips.length !== 1 ||
      !sameRenderedAmount(chips[0]!, expected)
    ) {
      return false;
    }
  }

  return true;
}

export function installRouletteAuthorityBetDomGuard(
  app: HTMLDivElement,
) {
  const page = app.querySelector<HTMLElement>(
    "[data-roulette-page]",
  );
  const panel = app.querySelector<HTMLElement>(
    "[data-roulette-bet-panel]",
  );

  if (
    !page ||
    !panel ||
    page.dataset.authorityBetDomGuardInstalled === "true"
  ) {
    return;
  }

  page.dataset.authorityBetDomGuardInstalled = "true";

  let reconcileQueued = false;
  const reconcile = () => {
    reconcileQueued = false;

    // Authority remains the visual owner through betting and spinning. The
    // runtime intentionally clears placed chips only when the round is settled;
    // stopping reconciliation earlier lets its stale local mirror resurrect the
    // pre-drag source cell exactly at the betting -> spin transition.
    if (page.dataset.phase === "settled") return;

    const authority =
      getRouletteBetAuthoritySnapshot();
    if (!authority.bets) return;

    if (!topologyMatchesDom(app, authority.bets)) {
      renderRouletteBetTopology(app, authority.bets);
    }
  };

  const queueReconcile = () => {
    if (reconcileQueued) return;
    reconcileQueued = true;
    queueMicrotask(reconcile);
  };

  const observer = new MutationObserver((records) => {
    if (
      records.some((record) =>
        record.type === "childList" ||
        (
          record.type === "attributes" &&
          record.target instanceof HTMLElement &&
          (
            record.target.matches(".roulette-placed-chip") ||
            record.target.matches("[data-roulette-page]")
          )
        )
      )
    ) {
      queueReconcile();
    }
  });

  observer.observe(panel, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-bet-amount"],
  });
  observer.observe(page, {
    attributes: true,
    attributeFilter: ["data-phase"],
  });
}
