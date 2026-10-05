import {
  getRouletteBetTotals,
  type RouletteBetPlacement,
} from "./betState";
import {
  RouletteWalletClient,
  type RouletteGlobalBetUpdateResponse,
} from "./rouletteWalletClient";

let installed = false;
let mountedApp: HTMLDivElement | null = null;

export function isRouletteCommittedDragChip(
  bets: readonly RouletteBetPlacement[],
  betId: string,
  amount: number,
) {
  const totals = getRouletteBetTotals(bets);
  return (totals[betId] ?? 0) === amount && amount > 0;
}

function confirmCommittedOptimisticChips(
  app: HTMLDivElement,
  result: RouletteGlobalBetUpdateResponse,
) {
  const bets = result.globalBet?.bets ?? [];

  app
    .querySelectorAll<HTMLElement>(
      '.roulette-placed-chip[data-roulette-drag-optimistic="true"][data-bet-amount]',
    )
    .forEach((chip) => {
      const cell = chip.closest<HTMLElement>("[data-bet-id]");
      const betId = cell?.dataset.betId;
      const amount = Number(chip.dataset.betAmount);

      if (
        betId &&
        Number.isFinite(amount) &&
        isRouletteCommittedDragChip(bets, betId, amount)
      ) {
        delete chip.dataset.rouletteDragOptimistic;
      }
    });
}

export function installRouletteChipDragCommitBridge(
  app: HTMLDivElement,
) {
  mountedApp = app;
  if (installed) return;
  installed = true;

  const originalUpdate =
    RouletteWalletClient.prototype.updateGlobalBet;

  RouletteWalletClient.prototype.updateGlobalBet = async function (
    roundId,
    bets,
    idempotencyKey,
    expectedRevision,
  ) {
    const result = await originalUpdate.call(
      this,
      roundId,
      bets,
      idempotencyKey,
      expectedRevision,
    );

    if (
      idempotencyKey.startsWith("roulette_drag_") &&
      mountedApp?.isConnected
    ) {
      const currentApp = mountedApp;
      queueMicrotask(() => {
        if (!currentApp.isConnected) return;
        confirmCommittedOptimisticChips(currentApp, result);
        document.dispatchEvent(new Event("visibilitychange"));
      });
    }

    return result;
  };
}
