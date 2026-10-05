import {
  RouletteWalletClient,
  type RouletteBootstrapResponse,
  type RouletteGlobalBetUpdateResponse,
  type RouletteGlobalTablePhase,
} from "./rouletteWalletClient";
import {
  formatRouletteBalance,
  getRouletteBalanceScale,
} from "./uiFormat";

const ROULETTE_WALLET_SNAPSHOT_EVENT =
  "roulette-authoritative-wallet-snapshot";

type RouletteAuthoritativeWalletSnapshot = {
  roundId: string | null;
  phase: RouletteGlobalTablePhase | null;
  revision: number;
  balanceCents: number;
  serverReservedStakeCents: number;
  terminal: boolean;
};

type RouletteOptimisticWindow = Window & {
  __rouletteOptimisticBalanceBridgeInstalled?: boolean;
};

function safeCents(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export function getRouletteOptimisticBalanceCents(
  authoritativeBalanceCents: number,
  serverReservedStakeCents: number,
  localDesiredStakeCents: number,
) {
  return Math.max(
    0,
    safeCents(authoritativeBalanceCents) +
      safeCents(serverReservedStakeCents) -
      safeCents(localDesiredStakeCents),
  );
}

function publishSnapshot(
  detail: RouletteAuthoritativeWalletSnapshot,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<RouletteAuthoritativeWalletSnapshot>(
      ROULETTE_WALLET_SNAPSHOT_EVENT,
      { detail },
    ),
  );
}

function snapshotFromBootstrap(
  response: RouletteBootstrapResponse,
): RouletteAuthoritativeWalletSnapshot {
  const globalBet = response.globalBet;
  const terminal =
    globalBet?.settledAtMs !== null &&
    globalBet?.settledAtMs !== undefined;

  return {
    roundId:
      response.globalTable?.roundId ??
      globalBet?.roundId ??
      null,
    phase:
      response.globalTable?.phase ??
      null,
    revision:
      globalBet?.revision ?? 0,
    balanceCents:
      safeCents(response.wallet.balanceCents),
    serverReservedStakeCents:
      terminal
        ? 0
        : safeCents(globalBet?.stakeCents ?? 0),
    terminal,
  };
}

function snapshotFromMutation(
  roundId: string,
  expectedRevision: number,
  response: RouletteGlobalBetUpdateResponse,
): RouletteAuthoritativeWalletSnapshot {
  const globalBet = response.globalBet;
  const terminal =
    globalBet?.settledAtMs !== null &&
    globalBet?.settledAtMs !== undefined;

  return {
    roundId,
    phase: "betting",
    revision:
      globalBet?.revision ??
      expectedRevision + 1,
    balanceCents:
      safeCents(response.balanceCents),
    serverReservedStakeCents:
      terminal
        ? 0
        : safeCents(globalBet?.stakeCents ?? 0),
    terminal,
  };
}

export function installRouletteOptimisticBalanceBridge() {
  if (typeof window === "undefined") return;

  const guardedWindow =
    window as RouletteOptimisticWindow;
  if (
    guardedWindow
      .__rouletteOptimisticBalanceBridgeInstalled
  ) {
    return;
  }
  guardedWindow
    .__rouletteOptimisticBalanceBridgeInstalled = true;

  const prototype =
    RouletteWalletClient.prototype;
  const nativeBootstrap =
    prototype.bootstrap;
  const nativeUpdateGlobalBet =
    prototype.updateGlobalBet;

  prototype.bootstrap =
    async function optimisticBootstrap() {
      const response =
        await nativeBootstrap.call(this);
      publishSnapshot(
        snapshotFromBootstrap(response),
      );
      return response;
    };

  prototype.updateGlobalBet =
    async function optimisticUpdateGlobalBet(
      roundId,
      bets,
      idempotencyKey,
      expectedRevision,
    ) {
      const response =
        await nativeUpdateGlobalBet.call(
          this,
          roundId,
          bets,
          idempotencyKey,
          expectedRevision,
        );
      publishSnapshot(
        snapshotFromMutation(
          roundId,
          expectedRevision,
          response,
        ),
      );
      return response;
    };
}

function readLocalDesiredStakeCents(
  app: HTMLElement,
) {
  let totalCents = 0;

  app
    .querySelectorAll<HTMLElement>(
      ".roulette-placed-chip[data-bet-amount]",
    )
    .forEach((chip) => {
      const amount =
        Number(chip.dataset.betAmount);
      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return;
      }
      totalCents +=
        Math.round(amount * 100);
    });

  return safeCents(totalCents);
}

export function installRouletteOptimisticBalanceUi(
  app: HTMLElement,
) {
  if (
    app.dataset
      .rouletteOptimisticBalanceUi ===
    "true"
  ) {
    return;
  }
  app.dataset.rouletteOptimisticBalanceUi =
    "true";

  const displays = Array.from(
    app.querySelectorAll<HTMLElement>(
      "[data-wallet-balance]",
    ),
  );
  if (displays.length === 0) return;

  let authoritativeBalanceCents:
    number | null = null;
  let serverReservedStakeCents = 0;
  let activeRoundId: string | null = null;
  let acceptedRevision = -1;

  const renderOptimisticBalance = () => {
    if (
      authoritativeBalanceCents === null ||
      !app.isConnected
    ) {
      return;
    }

    const localDesiredStakeCents =
      readLocalDesiredStakeCents(app);
    const optimisticBalanceCents =
      getRouletteOptimisticBalanceCents(
        authoritativeBalanceCents,
        serverReservedStakeCents,
        localDesiredStakeCents,
      );
    const balanceValue =
      optimisticBalanceCents / 100;
    const balanceText =
      formatRouletteBalance(balanceValue);
    const balanceScale =
      getRouletteBalanceScale(balanceValue);

    displays.forEach((display) => {
      if (
        display.textContent !== balanceText
      ) {
        display.textContent = balanceText;
      }
      if (
        display.dataset.balanceScale !==
        balanceScale
      ) {
        display.dataset.balanceScale =
          balanceScale;
      }
    });
  };

  const onSnapshot = (event: Event) => {
    const detail =
      (event as CustomEvent<
        RouletteAuthoritativeWalletSnapshot
      >).detail;
    if (!detail) return;

    const roundChanged =
      detail.roundId !== activeRoundId;
    const staleBettingSnapshot =
      !roundChanged &&
      !detail.terminal &&
      detail.phase === "betting" &&
      detail.revision < acceptedRevision;

    if (staleBettingSnapshot) return;

    if (roundChanged) {
      activeRoundId = detail.roundId;
      acceptedRevision = -1;
    }

    authoritativeBalanceCents =
      safeCents(detail.balanceCents);
    serverReservedStakeCents =
      safeCents(
        detail.serverReservedStakeCents,
      );
    acceptedRevision = detail.terminal
      ? 0
      : Math.max(
          acceptedRevision,
          detail.revision,
        );

    renderOptimisticBalance();
  };

  window.addEventListener(
    ROULETTE_WALLET_SNAPSHOT_EVENT,
    onSnapshot,
  );

  const observer =
    new MutationObserver(() => {
      if (!app.isConnected) {
        observer.disconnect();
        window.removeEventListener(
          ROULETTE_WALLET_SNAPSHOT_EVENT,
          onSnapshot,
        );
        return;
      }
      renderOptimisticBalance();
    });

  observer.observe(app, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "data-bet-amount",
    ],
  });
}