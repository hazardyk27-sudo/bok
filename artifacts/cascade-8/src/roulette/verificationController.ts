import type {
  RouletteBetPlacement,
} from "./betState";
import {
  estimateRouletteServerClockOffset,
  getRouletteGlobalClientPhase,
  getRouletteGlobalVerificationSecondsRemaining,
  getRouletteServerNowMs,
} from "./globalClient";
import {
  RouletteWalletClient,
  type RouletteGlobalBetSnapshot,
  type RouletteGlobalTableSnapshot,
} from "./rouletteWalletClient";

type RouletteVerificationState =
  | "checking"
  | "confirmed"
  | "mismatch";

type RouletteBetTotals =
  Record<string, number>;

export function aggregateRouletteBetTotals(
  bets: readonly RouletteBetPlacement[],
): RouletteBetTotals {
  const totals: RouletteBetTotals = {};

  bets.forEach((bet) => {
    totals[bet.betId] =
      (totals[bet.betId] ?? 0) +
      bet.amount;
  });

  return totals;
}

export function rouletteBetTotalsMatch(
  first: RouletteBetTotals,
  second: RouletteBetTotals,
) {
  const keys = new Set([
    ...Object.keys(first),
    ...Object.keys(second),
  ]);

  for (const key of keys) {
    if (
      (first[key] ?? 0) !==
      (second[key] ?? 0)
    ) {
      return false;
    }
  }

  return true;
}

function readRenderedBetTotals(
  root: ParentNode,
): RouletteBetTotals {
  const totals: RouletteBetTotals = {};

  root
    .querySelectorAll<HTMLElement>(
      "[data-bet-id]",
    )
    .forEach((cell) => {
      const betId = cell.dataset.betId;
      if (!betId) return;

      const chip =
        cell.querySelector<HTMLElement>(
          ".roulette-placed-chip",
        );
      const amount = Number(
        chip?.dataset.betAmount ?? 0,
      );

      if (
        Number.isFinite(amount) &&
        amount > 0
      ) {
        totals[betId] = amount;
      }
    });

  return totals;
}

function readServerBetTotals(
  globalBet:
    | RouletteGlobalBetSnapshot
    | null,
) {
  return aggregateRouletteBetTotals(
    globalBet?.bets ?? [],
  );
}

function getVerificationRefreshDelay(
  table: RouletteGlobalTableSnapshot,
  serverNowMs: number,
) {
  const phase =
    getRouletteGlobalClientPhase(
      table,
      serverNowMs,
    );

  if (phase === "verifying") {
    return 650;
  }

  if (phase === "betting") {
    return Math.min(
      5_000,
      Math.max(
        100,
        table.bettingCloseAtMs -
          serverNowMs +
          25,
      ),
    );
  }

  return 1_000;
}

export function installRouletteBetVerificationUi(
  app: HTMLDivElement,
) {
  const page =
    app.querySelector<HTMLElement>(
      "[data-roulette-page]",
    );
  const timer =
    app.querySelector<HTMLElement>(
      "[data-betting-timer]",
    );
  const betStatus =
    app.querySelector<HTMLElement>(
      "[data-bet-status]",
    );

  if (!page || !timer) {
    return;
  }

  const overlay =
    document.createElement("div");
  overlay.className =
    "roulette-verification-overlay";
  overlay.setAttribute(
    "aria-hidden",
    "true",
  );

  const overlayLabel =
    document.createElement("span");
  overlayLabel.className =
    "roulette-verification-overlay__label";
  overlayLabel.textContent =
    "VERIFY BETS";

  const overlayValue =
    document.createElement("strong");
  overlayValue.className =
    "roulette-verification-overlay__value";
  overlayValue.textContent = "3";

  overlay.append(
    overlayLabel,
    overlayValue,
  );
  timer.append(overlay);

  const walletClient =
    new RouletteWalletClient();
  let table:
    | RouletteGlobalTableSnapshot
    | null = null;
  let serverClockOffsetMs = 0;
  let verificationState:
    RouletteVerificationState =
      "checking";
  let verifiedRoundId:
    string | null = null;
  let desiredBetStatus = "";
  let refreshTimer = 0;
  let stopped = false;

  const enforceBetStatus = () => {
    if (
      !betStatus ||
      page.dataset.betVerification !==
        "active" ||
      !desiredBetStatus
    ) {
      return;
    }

    if (
      betStatus.textContent !==
      desiredBetStatus
    ) {
      betStatus.textContent =
        desiredBetStatus;
    }
  };

  const statusObserver =
    betStatus &&
    typeof MutationObserver !==
      "undefined"
      ? new MutationObserver(
          enforceBetStatus,
        )
      : null;

  statusObserver?.observe(
    betStatus as HTMLElement,
    {
      childList: true,
      characterData: true,
      subtree: true,
    },
  );

  const renderVerification = () => {
    if (!table) {
      return;
    }

    const serverNowMs =
      getRouletteServerNowMs(
        serverClockOffsetMs,
      );
    const phase =
      getRouletteGlobalClientPhase(
        table,
        serverNowMs,
      );

    if (phase !== "verifying") {
      page.dataset.betVerification =
        "inactive";
      delete page.dataset
        .betVerificationState;
      overlay.setAttribute(
        "aria-hidden",
        "true",
      );
      desiredBetStatus = "";
      return;
    }

    const seconds =
      getRouletteGlobalVerificationSecondsRemaining(
        table,
        serverNowMs,
      );

    page.dataset.betVerification =
      "active";
    page.dataset.betVerificationState =
      verificationState;
    overlay.setAttribute(
      "aria-hidden",
      "false",
    );
    overlayValue.textContent =
      String(Math.max(1, seconds));

    desiredBetStatus =
      verificationState ===
        "confirmed"
        ? "BETS CONFIRMED"
        : verificationState ===
            "mismatch"
          ? "BET CHECK FAILED"
          : "VERIFYING BETS";

    timer.setAttribute(
      "aria-label",
      verificationState ===
        "confirmed"
        ? `Bets confirmed. Spin starts in ${Math.max(1, seconds)} seconds.`
        : verificationState ===
            "mismatch"
          ? `Bet verification mismatch. Spin starts in ${Math.max(1, seconds)} seconds.`
          : `Bets locked. Verifying with server. Spin starts in ${Math.max(1, seconds)} seconds.`,
    );
    enforceBetStatus();
  };

  const renderInterval =
    window.setInterval(() => {
      if (
        stopped ||
        !page.isConnected
      ) {
        stopped = true;
        window.clearInterval(
          renderInterval,
        );
        window.clearTimeout(
          refreshTimer,
        );
        statusObserver?.disconnect();
        return;
      }

      renderVerification();
    }, 100);

  const scheduleRefresh = (
    delayMs: number,
  ) => {
    window.clearTimeout(
      refreshTimer,
    );
    refreshTimer =
      window.setTimeout(
        () => {
          void refresh();
        },
        delayMs,
      );
  };

  const refresh = async () => {
    if (
      stopped ||
      !page.isConnected
    ) {
      return;
    }

    const requestStartedAtMs =
      Date.now();

    try {
      const bootstrap =
        await walletClient.bootstrap();
      const responseReceivedAtMs =
        Date.now();

      serverClockOffsetMs =
        estimateRouletteServerClockOffset(
          bootstrap.serverTimeMs,
          requestStartedAtMs,
          responseReceivedAtMs,
        );
      table = bootstrap.globalTable;

      if (!table) {
        verificationState =
          "checking";
        verifiedRoundId = null;
        renderVerification();
        scheduleRefresh(1_000);
        return;
      }

      const serverNowMs =
        getRouletteServerNowMs(
          serverClockOffsetMs,
        );
      const phase =
        getRouletteGlobalClientPhase(
          table,
          serverNowMs,
        );

      if (phase === "verifying") {
        const renderedTotals =
          readRenderedBetTotals(app);
        const serverTotals =
          readServerBetTotals(
            bootstrap.globalBet,
          );

        verificationState =
          rouletteBetTotalsMatch(
            renderedTotals,
            serverTotals,
          )
            ? "confirmed"
            : "mismatch";
        verifiedRoundId =
          table.roundId;
      } else if (
        verifiedRoundId !==
          table.roundId
      ) {
        verificationState =
          "checking";
        verifiedRoundId = null;
      }

      renderVerification();
      scheduleRefresh(
        getVerificationRefreshDelay(
          table,
          serverNowMs,
        ),
      );
    } catch {
      renderVerification();
      scheduleRefresh(
        page.dataset
          .betVerification ===
          "active"
          ? 500
          : 1_000,
      );
    }
  };

  void refresh();
}
