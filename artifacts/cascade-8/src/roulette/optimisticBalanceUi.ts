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
  const phase =
    response.globalTable?.phase ?? null;
  const terminal =
    (
      globalBet?.settledAtMs !== null &&
      globalBet?.settledAtMs !== undefined
    ) ||
    phase === "result" ||
    phase === "complete";

  return {
    roundId:
      response.globalTable?.roundId ??
      globalBet?.roundId ??
      null,
    phase,
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

  const betPanel =
    app.querySelector<HTMLElement>(
      "[data-roulette-bet-panel]",
    );

  let authoritativeBalanceCents:
    number | null = null;
  let serverReservedStakeCents = 0;
  let activeRoundId: string | null = null;
  let terminalRoundId: string | null = null;
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

    if (roundChanged) {
      activeRoundId = detail.roundId;
      terminalRoundId = null;
      acceptedRevision = -1;
    }

    if (
      !roundChanged &&
      terminalRoundId === detail.roundId &&
      !detail.terminal
    ) {
      return;
    }

    const staleBettingSnapshot =
      !roundChanged &&
      !detail.terminal &&
      detail.phase === "betting" &&
      detail.revision < acceptedRevision;

    if (staleBettingSnapshot) return;

    authoritativeBalanceCents =
      safeCents(detail.balanceCents);
    serverReservedStakeCents =
      safeCents(
        detail.serverReservedStakeCents,
      );
    acceptedRevision = Math.max(
      acceptedRevision,
      detail.revision,
    );
    if (detail.terminal) {
      terminalRoundId = detail.roundId;
    }

    renderOptimisticBalance();
  };

  window.addEventListener(
    ROULETTE_WALLET_SNAPSHOT_EVENT,
    onSnapshot,
  );

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    betObserver.disconnect();
    balanceObserver.disconnect();
    window.removeEventListener(
      ROULETTE_WALLET_SNAPSHOT_EVENT,
      onSnapshot,
    );
  };

  const observeAndRender = () => {
    if (!app.isConnected) {
      stop();
      return;
    }
    renderOptimisticBalance();
  };

  const betObserver =
    new MutationObserver(
      observeAndRender,
    );
  const balanceObserver =
    new MutationObserver(
      observeAndRender,
    );

  if (betPanel) {
    betObserver.observe(betPanel, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "data-bet-amount",
      ],
    });
  }

  displays.forEach((display) => {
    balanceObserver.observe(display, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
}