import "./roulette.css";
import { renderRouletteBetTable } from "./betTable";
import {
  settleRouletteBets,
  type RouletteRoundSettlement,
} from "./betRules";
import {
  clearRouletteBets,
  createRouletteBetState,
  doubleRouletteBets,
  getRouletteBetTotals,
  getRouletteDisplayChipValue,
  getRouletteTotalStake,
  isRouletteChipValue,
  placeRouletteBet,
  rebetRouletteRound,
  selectRouletteChip,
  snapshotRouletteRound,
  undoRouletteBet,
  type RouletteBetState,
  type RouletteChipValue,
} from "./betState";
import {
  createBallOrbit,
  sampleBallOrbit,
  type BallOrbit,
} from "./ballMotion";
import {
  sampleRotorSpin,
  type RotorSpin,
} from "./spinMotion";
import {
  collectRouletteSimulationEvents,
  createRouletteSimulationEvents,
  type RouletteSimulationEvent,
} from "./simulationEvents";
import { RouletteAudioEngine } from "./rouletteAudio";
import {
  canEditRouletteBets,
  getRoulettePhaseStatus,
  type RouletteScenePhase,
} from "./scenePhase";
import {
  createRouletteResultPresentation,
  type RouletteResultPresentation,
} from "./resultPresentation";
import {
  ROULETTE_SIMULATION_VERSION,
  readSettledWinningResult,
  simulateSeededRouletteSpin,
} from "./spinResult";
import {
  RouletteWalletClient,
  type RouletteBootstrapResponse,
  type RouletteGlobalTableSnapshot,
} from "./rouletteWalletClient";
import {
  estimateRouletteServerClockOffset,
  getRouletteGlobalBettingSecondsRemaining,
  getRouletteGlobalClientPhase,
  getRouletteGlobalSpinElapsedMs,
  getRouletteServerNowMs,
} from "./globalClient";
import {
  ROULETTE_RECENT_RESULT_LIMIT,
  getRouletteResultTone,
  normalizeRouletteRecentResults,
} from "./recentResults";
import {
  formatRouletteAmount,
  formatRouletteBalance,
  formatRouletteMoney,
  formatRouletteSignedMoney,
  getRouletteAmountScale,
  getRouletteBalanceScale,
} from "./uiFormat";
import { renderRouletteWheel } from "./wheelRenderer";

const ROULETTE_PLACED_CHIP_PALETTE: Record<
  RouletteChipValue,
  {
    fill: string;
    ink: string;
    edge: string;
  }
> = {
  1: {
    fill: "#e7ebee",
    ink: "#111315",
    edge: "#ffffff",
  },
  5: {
    fill: "#e05249",
    ink: "#ffffff",
    edge: "#ffaaa3",
  },
  10: {
    fill: "#3b8ce0",
    ink: "#ffffff",
    edge: "#9acbff",
  },
  25: {
    fill: "#34a96d",
    ink: "#ffffff",
    edge: "#a0e6bd",
  },
  100: {
    fill: "#4a5157",
    ink: "#ffffff",
    edge: "#b6bdc2",
  },
  500: {
    fill: "#8b65c4",
    ink: "#ffffff",
    edge: "#d2baf0",
  },
};

type RouletteViewState = {
  rotorAngle: number;
  ballAngle: number;
  ballRadiusRatio: number;
  ballVisible: boolean;
  resultMarkerAngle: number | null;
};

function renderCanvas(
  canvas: HTMLCanvasElement,
  viewState: RouletteViewState,
) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Roulette canvas 2D context is unavailable.");

  renderRouletteWheel(ctx, width, height, viewState);
}

export function mountRoulette(app: HTMLDivElement) {
  app.innerHTML = `
    <main
      class="roulette-page"
      data-roulette-page
      data-phase="betting"
      data-result-visible="false"
      aria-label="Roulette 2D"
    >
      <div class="roulette-game-shell">
        <section
          class="roulette-wheel-panel"
          aria-label="European roulette wheel"
        >
          <div
            class="roulette-top-hud"
            aria-label="Roulette account summary"
          >
            <div class="roulette-top-hud__metric roulette-top-hud__metric--balance">
              <span>BALANCE</span>
              <strong
                data-wallet-balance
                data-balance-scale="normal"
                aria-live="polite"
              >…</strong>
            </div>
            <div class="roulette-top-hud__metric">
              <span>TOTAL BET</span>
              <strong data-total-bet>$0</strong>
            </div>
            <div class="roulette-top-hud__metric">
              <span>LAST WIN</span>
              <strong data-last-win aria-live="polite">-</strong>
            </div>
            <div class="roulette-top-hud__menu-slot">
              <button
                type="button"
                class="roulette-menu-button"
                data-roulette-menu-toggle
                aria-label="Open roulette menu"
                aria-expanded="false"
                aria-controls="roulette-settings-menu"
              >
                <span></span>
                <span></span>
                <span></span>
              </button>
            </div>
          </div>

          <section
            id="roulette-settings-menu"
            class="roulette-settings-menu"
            data-roulette-settings-menu
            aria-label="Roulette menu"
            hidden
          >
            <div class="roulette-settings-menu__header">
              <div>
                <span>ROULETTE</span>
                <strong>MENU</strong>
              </div>
              <button
                type="button"
                class="roulette-settings-menu__close"
                data-roulette-menu-close
                aria-label="Close roulette menu"
              >×</button>
            </div>

            <label class="roulette-audio-control">
              <span class="roulette-audio-control__copy">
                <strong>KRUPİYER / MASA</strong>
                <small>Masa ve çarpma sesleri</small>
              </span>
              <output data-dealer-volume-output>100%</output>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value="100"
                data-dealer-volume
                aria-label="Krupiyer ve masa sesi"
              />
            </label>

            <label class="roulette-audio-control">
              <span class="roulette-audio-control__copy">
                <strong>ORTAM</strong>
                <small>Çark ve top ortam sesi</small>
              </span>
              <output data-ambient-volume-output>100%</output>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value="100"
                data-ambient-volume
                aria-label="Ortam sesi"
              />
            </label>

            <button
              type="button"
              class="roulette-main-menu-button"
              data-roulette-main-menu
            >
              <span>ANA MENÜ</span>
              <strong>⌂</strong>
            </button>
          </section>

          <div
            class="roulette-betting-timer"
            data-betting-timer
            aria-label="Betting phase timer"
          >
            <span class="roulette-betting-timer__label" data-betting-timer-label>BET TIME</span>
            <strong class="roulette-betting-timer__value" data-betting-timer-value>10</strong>
          </div>

          <div
            class="roulette-recent-strip"
            data-roulette-recent-results
            aria-label="No recent results yet"
            aria-live="polite"
          ></div>

          <div class="roulette-stage">
            <canvas
              class="roulette-wheel-canvas"
              data-roulette-wheel
              role="img"
              aria-label="Live European roulette wheel."
            ></canvas>

            <div
              class="roulette-result-banner"
              data-result-banner
              aria-live="polite"
              aria-hidden="true"
            >
              <span
                class="roulette-result-banner__neighbor"
                data-result-left-neighbor
              >—</span>
              <strong
                class="roulette-result-banner__number"
                data-result-winning-number
              >—</strong>
              <span
                class="roulette-result-banner__neighbor"
                data-result-right-neighbor
              >—</span>
            </div>

            <div
              class="roulette-win-message"
              data-win-message
              aria-live="polite"
              aria-hidden="true"
            >
              <span>KAZANDINIZ</span>
              <strong data-win-amount>—</strong>
            </div>
          </div>
        </section>

        ${renderRouletteBetTable()}
      </div>
    </main>
  `;

  const canvas = app.querySelector<HTMLCanvasElement>("[data-roulette-wheel]");
  const page = app.querySelector<HTMLElement>("[data-roulette-page]");
  const betStatus = app.querySelector<HTMLElement>("[data-bet-status]");
  const betPanel = app.querySelector<HTMLElement>("[data-roulette-bet-panel]");
  const walletBalanceDisplays = Array.from(
    app.querySelectorAll<HTMLElement>("[data-wallet-balance]"),
  );
  const totalBetDisplays = Array.from(
    app.querySelectorAll<HTMLElement>("[data-total-bet]"),
  );
  const lastWinDisplays = Array.from(
    app.querySelectorAll<HTMLElement>("[data-last-win]"),
  );
  const roundReturn = app.querySelector<HTMLElement>("[data-round-return]");
  const roundProfit = app.querySelector<HTMLElement>("[data-round-profit]");
  const roundOutcome = app.querySelector<HTMLElement>("[data-round-outcome]");
  const undoButtons = Array.from(
    app.querySelectorAll<HTMLButtonElement>("[data-undo-bet]"),
  );
  const doubleButtons = Array.from(
    app.querySelectorAll<HTMLButtonElement>("[data-double-bet]"),
  );
  const clearButton = app.querySelector<HTMLButtonElement>("[data-clear-bets]");
  const rebetButtons = Array.from(
    app.querySelectorAll<HTMLButtonElement>("[data-rebet]"),
  );
  const spinButton = app.querySelector<HTMLButtonElement>("[data-spin-button]");
  const mobileChipToggle =
    app.querySelector<HTMLButtonElement>("[data-mobile-chip-toggle]");
  const mobileChipMenu =
    app.querySelector<HTMLElement>("[data-mobile-chip-menu]");
  const mobileSelectedChip =
    app.querySelector<HTMLElement>("[data-mobile-selected-chip]");
  const recentResultsStrip =
    app.querySelector<HTMLElement>("[data-roulette-recent-results]");
  const resultBanner =
    app.querySelector<HTMLElement>("[data-result-banner]");
  const resultWinningNumber =
    app.querySelector<HTMLElement>("[data-result-winning-number]");
  const resultLeftNeighbor =
    app.querySelector<HTMLElement>("[data-result-left-neighbor]");
  const resultRightNeighbor =
    app.querySelector<HTMLElement>("[data-result-right-neighbor]");
  const winMessage =
    app.querySelector<HTMLElement>("[data-win-message]");
  const winAmount =
    app.querySelector<HTMLElement>("[data-win-amount]");
  const bettingTimerLabel =
    app.querySelector<HTMLElement>("[data-betting-timer-label]");
  const bettingTimerValue =
    app.querySelector<HTMLElement>("[data-betting-timer-value]");
  const mobileStatsToggle =
    app.querySelector<HTMLButtonElement>("[data-mobile-stats-toggle]");
  const mobileStatsPanel =
    app.querySelector<HTMLElement>("[data-mobile-stats-panel]");
  const statRed =
    app.querySelector<HTMLElement>("[data-stat-red]");
  const statBlack =
    app.querySelector<HTMLElement>("[data-stat-black]");
  const statZero =
    app.querySelector<HTMLElement>("[data-stat-zero]");
  const rouletteMenuToggle =
    app.querySelector<HTMLButtonElement>("[data-roulette-menu-toggle]");
  const rouletteSettingsMenu =
    app.querySelector<HTMLElement>("[data-roulette-settings-menu]");
  const rouletteMenuClose =
    app.querySelector<HTMLButtonElement>("[data-roulette-menu-close]");
  const dealerVolumeInput =
    app.querySelector<HTMLInputElement>("[data-dealer-volume]");
  const dealerVolumeOutput =
    app.querySelector<HTMLOutputElement>("[data-dealer-volume-output]");
  const ambientVolumeInput =
    app.querySelector<HTMLInputElement>("[data-ambient-volume]");
  const ambientVolumeOutput =
    app.querySelector<HTMLOutputElement>("[data-ambient-volume-output]");
  const rouletteMainMenuButton =
    app.querySelector<HTMLButtonElement>("[data-roulette-main-menu]");

  if (!canvas) throw new Error("Roulette canvas was not mounted.");
  if (!page) throw new Error("Roulette page was not mounted.");
  if (!betPanel) throw new Error("Roulette betting panel was not mounted.");

  const initialBallOrbit = createBallOrbit();

  const viewState: RouletteViewState = {
    rotorAngle: 0,
    ballAngle: initialBallOrbit.startAngle,
    ballRadiusRatio: initialBallOrbit.trackRadius,
    ballVisible: true,
    resultMarkerAngle: null,
  };

  let betState: RouletteBetState =
    createRouletteBetState();
  let walletBalanceCents: number | null = null;
  let activeRotorSpin: RotorSpin | null = null;
  let activeBallOrbit: BallOrbit | null = null;
  let motionStartedAt = 0;
  let lastEventElapsedMs = -1;
  let simulationEvents: RouletteSimulationEvent[] = [];
  let frameId = 0;
  let recentResults: number[] = [];
  let bettingWindowClosed = true;
  let apiSimulationReady = false;
  let apiReadinessRetryTimer = 0;
  let globalTableSnapshot:
    RouletteGlobalTableSnapshot | null =
      null;
  let activeGlobalRoundId:
    string | null = null;
  let spinningGlobalRoundId:
    string | null = null;
  let renderedGlobalResultRoundId:
    string | null = null;
  let roundSnapshotCapturedId:
    string | null = null;
  let serverClockOffsetMs = 0;
  let stateRequestInFlight = false;
  let globalBetSyncInFlight = false;
  let pendingGlobalBetSync:
    | {
        roundId: string;
        bets: RouletteBetState["placements"];
        version: number;
      }
    | null = null;
  let globalBetMutationVersion = 0;
  let serverReservedStakeCents = 0;
  let serverGlobalBetRevision = 0;
  let lastHydratedGlobalBetRevision = 0;
  let activeResultPresentation:
    RouletteResultPresentation | null =
      null;

  const rouletteAudio =
    new RouletteAudioEngine();
  const rouletteWallet =
    new RouletteWalletClient();

  const rouletteAudioSettingsKey =
    "roulette.audio.settings.v1";
  let dealerVolume = 1;
  let ambientVolume = 1;

  try {
    const storedAudioSettings =
      JSON.parse(
        window.localStorage.getItem(
          rouletteAudioSettingsKey,
        ) ?? "{}",
      ) as {
        dealer?: unknown;
        ambient?: unknown;
      };

    const storedDealer =
      Number(storedAudioSettings.dealer);
    const storedAmbient =
      Number(storedAudioSettings.ambient);

    if (Number.isFinite(storedDealer)) {
      dealerVolume =
        Math.min(
          1,
          Math.max(
            0,
            storedDealer,
          ),
        );
    }
    if (Number.isFinite(storedAmbient)) {
      ambientVolume =
        Math.min(
          1,
          Math.max(
            0,
            storedAmbient,
          ),
        );
    }
  } catch {
    dealerVolume = 1;
    ambientVolume = 1;
  }

  rouletteAudio.setDealerVolume(
    dealerVolume,
  );
  rouletteAudio.setAmbientVolume(
    ambientVolume,
  );

  const syncAudioSettingsUi = () => {
    const dealerPercent =
      Math.round(dealerVolume * 100);
    const ambientPercent =
      Math.round(ambientVolume * 100);

    if (dealerVolumeInput) {
      dealerVolumeInput.value =
        String(dealerPercent);
    }
    if (dealerVolumeOutput) {
      dealerVolumeOutput.value =
        `${dealerPercent}%`;
      dealerVolumeOutput.textContent =
        `${dealerPercent}%`;
    }
    if (ambientVolumeInput) {
      ambientVolumeInput.value =
        String(ambientPercent);
    }
    if (ambientVolumeOutput) {
      ambientVolumeOutput.value =
        `${ambientPercent}%`;
      ambientVolumeOutput.textContent =
        `${ambientPercent}%`;
    }
  };

  const persistAudioSettings = () => {
    try {
      window.localStorage.setItem(
        rouletteAudioSettingsKey,
        JSON.stringify({
          dealer: dealerVolume,
          ambient: ambientVolume,
        }),
      );
    } catch {
      // Settings remain active for this mounted session.
    }
  };

  syncAudioSettingsUi();

  const redraw = () => renderCanvas(canvas, viewState);

  const renderRecentResults = () => {
    if (!recentResultsStrip) return;

    const newestFirst =
      [...recentResults].reverse();

    recentResultsStrip.replaceChildren(
      ...Array.from(
        {
          length:
            ROULETTE_RECENT_RESULT_LIMIT,
        },
        (_, index) => {
          const cell =
            document.createElement("span");
          const value =
            newestFirst[index];

          cell.className =
            "roulette-recent-result";

          if (value === undefined) {
            cell.classList.add(
              "is-empty",
            );
            cell.textContent = "—";
            cell.setAttribute(
              "aria-hidden",
              "true",
            );
            return cell;
          }

          const tone =
            getRouletteResultTone(
              value,
            );
          cell.classList.add(
            `is-${tone}`,
          );
          cell.dataset.resultNumber =
            String(value);
          cell.textContent =
            String(value);
          return cell;
        },
      ),
    );

    recentResultsStrip.setAttribute(
      "aria-label",
      newestFirst.length > 0
        ? `Recent results: ${newestFirst.join(", ")}`
        : "No recent results yet",
    );

    let redCount = 0;
    let blackCount = 0;
    let zeroCount = 0;
    newestFirst.forEach((number) => {
      const tone = getRouletteResultTone(number);
      if (tone === "red") redCount += 1;
      if (tone === "black") blackCount += 1;
      if (tone === "green") zeroCount += 1;
    });

    if (statRed) statRed.textContent = String(redCount);
    if (statBlack) statBlack.textContent = String(blackCount);
    if (statZero) statZero.textContent = String(zeroCount);
  };

  const renderWalletBalance = () => {
    const balanceValue =
      walletBalanceCents === null
        ? null
        : walletBalanceCents / 100;
    const balanceText =
      balanceValue === null
        ? "…"
        : formatRouletteBalance(
            balanceValue,
          );

    walletBalanceDisplays.forEach((display) => {
      display.textContent = balanceText;
      display.dataset.balanceScale =
        balanceValue === null
          ? "normal"
          : getRouletteBalanceScale(
              balanceValue,
            );
    });
  };

  const renderLastWin = (
    settlement: RouletteRoundSettlement,
  ) => {
    const lastWinText =
      settlement.grossReturn > 0
        ? formatRouletteMoney(
            settlement.grossReturn,
          )
        : "-";

    lastWinDisplays.forEach((display) => {
      display.textContent =
        lastWinText;
    });
  };

  const getPendingLocalReserveCents = () =>
    Math.max(
      0,
      getRouletteTotalStake(
        betState.placements,
      ) *
        100 -
        serverReservedStakeCents,
    );

  const canAffordAdditionalStake = (
    additionalStake: number,
  ) =>
    walletBalanceCents !== null &&
    additionalStake * 100 <=
      walletBalanceCents -
        getPendingLocalReserveCents();

  const canPlaceSelectedChip = () =>
    canAffordAdditionalStake(
      betState.selectedChip,
    );

  const canDoubleCurrentBet = () =>
    betState.placements.length > 0 &&
    canAffordAdditionalStake(
      getRouletteTotalStake(
        betState.placements,
      ),
    );

  const canRebetPreviousRound = () => {
    if (
      betState.previousRoundPlacements
        .length === 0
    ) {
      return false;
    }

    const desiredStake =
      getRouletteTotalStake(
        betState.previousRoundPlacements,
      );
    const currentStake =
      getRouletteTotalStake(
        betState.placements,
      );

    return canAffordAdditionalStake(
      Math.max(
        0,
        desiredStake -
          currentStake,
      ),
    );
  };

  const getGlobalServerNow = () =>
    getRouletteServerNowMs(
      serverClockOffsetMs,
    );

  const setMobileStatsOpen = (open: boolean) => {
    if (mobileStatsPanel) {
      mobileStatsPanel.hidden = !open;
    }
    if (mobileStatsToggle) {
      mobileStatsToggle.setAttribute("aria-expanded", String(open));
    }
  };

  const setMobileChipMenuOpen = (open: boolean) => {
    if (open) {
      setMobileStatsOpen(false);
    }
    if (mobileChipMenu) {
      mobileChipMenu.hidden = !open;
    }
    if (mobileChipToggle) {
      mobileChipToggle.setAttribute("aria-expanded", String(open));
    }
    betPanel.dataset.mobileChipMenuOpen = String(open);
  };

  const setRouletteMenuOpen = (
    open: boolean,
  ) => {
    if (open) {
      setMobileChipMenuOpen(false);
      setMobileStatsOpen(false);
    }

    if (rouletteSettingsMenu) {
      rouletteSettingsMenu.hidden =
        !open;
    }
    if (rouletteMenuToggle) {
      rouletteMenuToggle.setAttribute(
        "aria-expanded",
        String(open),
      );
    }

    page.dataset.rouletteMenuOpen =
      String(open);
  };

  const closeMobileHudMenus = () => {
    setMobileChipMenuOpen(false);
    setMobileStatsOpen(false);
    setRouletteMenuOpen(false);
  };

  const renderPhaseTimer = () => {
    if (
      !apiSimulationReady ||
      !globalTableSnapshot
    ) {
      if (bettingTimerLabel) {
        bettingTimerLabel.textContent =
          "UPDATING GAME";
      }
      if (bettingTimerValue) {
        bettingTimerValue.textContent =
          "—";
      }
      return null;
    }

    const serverNowMs =
      getGlobalServerNow();
    const globalPhase =
      getRouletteGlobalClientPhase(
        globalTableSnapshot,
        serverNowMs,
      );

    if (globalPhase === "betting") {
      const remaining =
        getRouletteGlobalBettingSecondsRemaining(
          globalTableSnapshot,
          serverNowMs,
        );

      if (bettingTimerLabel) {
        bettingTimerLabel.textContent =
          "BET TIME";
      }
      if (bettingTimerValue) {
        bettingTimerValue.textContent =
          String(remaining);
      }
      return remaining;
    }

    if (bettingTimerLabel) {
      bettingTimerLabel.textContent =
        globalPhase === "spinning"
          ? "SPIN"
          : globalPhase === "result"
            ? "RESULT"
            : "NEXT ROUND";
    }
    if (bettingTimerValue) {
      bettingTimerValue.textContent =
        globalPhase === "result"
          ? String(
              globalTableSnapshot
                .result?.number ??
                page.dataset
                  .resultNumber ??
                "—",
            )
          : globalPhase === "spinning"
            ? "••"
            : "—";
    }

    return null;
  };

  const updateSpinAvailability = () => {
    if (!spinButton) return;

    spinButton.disabled = true;
    spinButton.textContent = "LIVE";
    spinButton.setAttribute(
      "aria-label",
      "Global roulette runs automatically",
    );
  };

  const clearRoundResult = () => {
    app
      .querySelectorAll<HTMLElement>(
        ".is-result-number, .is-winning-bet",
      )
      .forEach((cell) => {
        cell.classList.remove(
          "is-result-number",
          "is-winning-bet",
        );
      });

    app
      .querySelectorAll<HTMLElement>(
        ".roulette-winner-mark",
      )
      .forEach((marker) => {
        marker.remove();
      });

    if (roundReturn) {
      roundReturn.textContent = "—";
    }
    if (roundProfit) {
      roundProfit.textContent = "—";
    }
    if (roundOutcome) {
      roundOutcome.dataset.roundOutcome =
        "idle";
    }

    activeResultPresentation = null;
    viewState.resultMarkerAngle = null;
    page.dataset.resultVisible = "false";

    if (resultBanner) {
      resultBanner.setAttribute(
        "aria-hidden",
        "true",
      );
    }
    if (resultWinningNumber) {
      resultWinningNumber.textContent =
        "—";
    }
    if (resultLeftNeighbor) {
      resultLeftNeighbor.textContent =
        "—";
    }
    if (resultRightNeighbor) {
      resultRightNeighbor.textContent =
        "—";
    }
    if (winMessage) {
      winMessage.setAttribute(
        "aria-hidden",
        "true",
      );
    }
    if (winAmount) {
      winAmount.textContent = "—";
    }

    delete page.dataset.resultNumber;
    delete page.dataset.resultColor;
    delete page.dataset.resultLeftNeighbor;
    delete page.dataset.resultRightNeighbor;
    delete page.dataset.resultPocketIndex;
    delete page.dataset.resultMarkerAngle;
    delete page.dataset.resultHasPayout;
    delete page.dataset.resultGrossReturn;
    delete canvas.dataset.rouletteResultMarkerAngle;
    redraw();
  };

  const renderRoundResult = (
    settlement: RouletteRoundSettlement,
    finalRotorAngle: number,
  ) => {
    const presentation =
      createRouletteResultPresentation(
        settlement,
      );
    activeResultPresentation =
      presentation;

    app
      .querySelectorAll<HTMLElement>(
        ".is-result-number, .is-winning-bet",
      )
      .forEach((cell) => {
        cell.classList.remove(
          "is-result-number",
          "is-winning-bet",
        );
      });

    app
      .querySelectorAll<HTMLElement>(
        ".roulette-winner-mark",
      )
      .forEach((marker) => {
        marker.remove();
      });

    const winningNumberCell =
      app.querySelector<HTMLElement>(
        `[data-bet-id="${presentation.winningNumberBetId}"]`,
      );
    winningNumberCell?.classList.add(
      "is-result-number",
    );

    if (winningNumberCell) {
      const winnerMark =
        document.createElement("span");
      winnerMark.className =
        "roulette-winner-mark";
      winnerMark.setAttribute(
        "aria-hidden",
        "true",
      );
      winningNumberCell.append(
        winnerMark,
      );
    }

    presentation.winningBetIds
      .forEach((betId) => {
        app
          .querySelector<HTMLElement>(
            `[data-bet-id="${betId}"]`,
          )
          ?.classList.add(
            "is-winning-bet",
          );
      });

    if (roundReturn) {
      roundReturn.textContent =
        formatRouletteMoney(
          settlement.grossReturn,
        );
    }
    if (roundProfit) {
      roundProfit.textContent =
        formatRouletteSignedMoney(
          settlement.netProfit,
        );
    }
    if (roundOutcome) {
      roundOutcome.dataset.roundOutcome =
        presentation.outcome;
    }

    renderLastWin(settlement);

    const markerAngle =
      Math.atan2(
        Math.sin(
          finalRotorAngle +
            presentation
              .markerRelativeAngle,
        ),
        Math.cos(
          finalRotorAngle +
            presentation
              .markerRelativeAngle,
        ),
      );

    page.dataset.resultVisible = "true";
    page.dataset.resultNumber =
      String(
        presentation.winningNumber,
      );
    page.dataset.resultColor =
      presentation.winningColor;
    page.dataset.resultLeftNeighbor =
      String(
        presentation.leftNeighborNumber,
      );
    page.dataset.resultRightNeighbor =
      String(
        presentation.rightNeighborNumber,
      );
    page.dataset.resultPocketIndex =
      String(
        presentation.winningPocketIndex,
      );
    page.dataset.resultMarkerAngle =
      String(markerAngle);
    page.dataset.resultHasPayout =
      String(
        presentation.hasPayout,
      );
    page.dataset.resultGrossReturn =
      String(
        presentation.grossReturn,
      );
    canvas.dataset.rouletteResultMarkerAngle =
      String(markerAngle);
    viewState.resultMarkerAngle =
      markerAngle;

    if (resultLeftNeighbor) {
      resultLeftNeighbor.textContent =
        String(
          presentation.leftNeighborNumber,
        );
    }
    if (resultWinningNumber) {
      resultWinningNumber.textContent =
        String(
          presentation.winningNumber,
        );
    }
    if (resultRightNeighbor) {
      resultRightNeighbor.textContent =
        String(
          presentation.rightNeighborNumber,
        );
    }
    if (resultBanner) {
      resultBanner.setAttribute(
        "aria-hidden",
        "false",
      );
      resultBanner.setAttribute(
        "aria-label",
        `Winning number ${presentation.winningNumber}. Neighbors ${presentation.leftNeighborNumber} and ${presentation.rightNeighborNumber}.`,
      );
    }

    const showWinMessage =
      presentation.hasPayout;
    if (winMessage) {
      winMessage.setAttribute(
        "aria-hidden",
        String(!showWinMessage),
      );
    }
    if (winAmount) {
      winAmount.textContent =
        showWinMessage
          ? formatRouletteMoney(
              presentation.grossReturn,
            )
          : "—";
    }

    return presentation;
  };

  const setScenePhase = (
    phase: RouletteScenePhase,
    resultNumber?: number,
  ) => {
    page.dataset.phase = phase;

    if (phase === "betting") {
      bettingWindowClosed =
        !apiSimulationReady ||
        !globalTableSnapshot ||
        getRouletteGlobalClientPhase(
          globalTableSnapshot,
          getGlobalServerNow(),
        ) !== "betting";
    } else {
      bettingWindowClosed = true;
    }

    page.dataset.bettingLocked =
      String(
        bettingWindowClosed ||
        !canEditRouletteBets(phase),
      );

    if (betStatus) {
      betStatus.textContent =
        getRoulettePhaseStatus(
          phase,
          resultNumber,
        );
    }

    betPanel.setAttribute(
      "aria-disabled",
      String(
        bettingWindowClosed ||
        !canEditRouletteBets(phase),
      ),
    );

    if (phase !== "betting") {
      closeMobileHudMenus();
    }

    if (phase !== "settled") {
      activeResultPresentation = null;
      viewState.resultMarkerAngle = null;
      page.dataset.resultVisible = "false";
      resultBanner?.setAttribute(
        "aria-hidden",
        "true",
      );
      winMessage?.setAttribute(
        "aria-hidden",
        "true",
      );
      delete page.dataset.resultNumber;
      delete page.dataset.resultColor;
      delete page.dataset.resultLeftNeighbor;
      delete page.dataset.resultRightNeighbor;
      delete page.dataset.resultPocketIndex;
      delete page.dataset.resultMarkerAngle;
      delete page.dataset.resultHasPayout;
      delete page.dataset.resultGrossReturn;
      delete canvas.dataset.rouletteResultMarkerAngle;
    }

    renderPhaseTimer();
    updateSpinAvailability();
  };


  const renderBetState = () => {
    const totals =
      getRouletteBetTotals(
        betState.placements,
      );
    app
      .querySelectorAll<HTMLElement>(
        "[data-bet-id]",
      )
      .forEach((cell) => {
        cell
          .querySelector(
            ".roulette-placed-chip",
          )
          ?.remove();
        cell.classList.remove(
          "has-bet",
        );

        const betId =
          cell.dataset.betId;
        if (!betId) return;

        if (
          !cell.dataset.baseAriaLabel
        ) {
          cell.dataset.baseAriaLabel =
            cell.getAttribute(
              "aria-label",
            ) ?? betId;
        }

        const amount =
          totals[betId] ?? 0;
        const baseAriaLabel =
          cell.dataset.baseAriaLabel;

        if (amount <= 0) {
          cell.setAttribute(
            "aria-label",
            baseAriaLabel,
          );
          return;
        }

        cell.classList.add(
          "has-bet",
        );
        cell.setAttribute(
          "aria-label",
          `${baseAriaLabel}, bet ${amount}`,
        );

        const displayChip =
          getRouletteDisplayChipValue(
            amount,
          );
        const chip =
          document.createElement("span");
        chip.className =
          `roulette-placed-chip chip-${displayChip}`;
        const chipPalette =
          ROULETTE_PLACED_CHIP_PALETTE[
            displayChip
          ];
        chip.style.setProperty(
          "--chip-fill",
          chipPalette.fill,
        );
        chip.style.setProperty(
          "--chip-ink",
          chipPalette.ink,
        );
        chip.style.setProperty(
          "--chip-edge",
          chipPalette.edge,
        );
        const displayAmount =
          formatRouletteAmount(
            amount,
          );
        chip.dataset.betAmount =
          String(amount);
        chip.dataset.amountScale =
          getRouletteAmountScale(
            amount,
          );
        const compactSuffix =
          /[KM]$/.test(displayAmount)
            ? displayAmount.slice(-1)
            : "";
        const compactNumber =
          compactSuffix
            ? displayAmount.slice(0, -1)
            : displayAmount;
        const amountValue =
          document.createElement("span");
        amountValue.className =
          "roulette-placed-chip__value";
        amountValue.textContent =
          compactNumber;
        chip.append(amountValue);

        if (compactSuffix) {
          const amountSuffix =
            document.createElement("span");
          amountSuffix.className =
            "roulette-placed-chip__suffix";
          amountSuffix.textContent =
            compactSuffix;
          chip.append(amountSuffix);
        }

        chip.setAttribute(
          "aria-hidden",
          "true",
        );
        cell.append(chip);
      });

    app
      .querySelectorAll<HTMLButtonElement>(
        "[data-chip-value]",
      )
      .forEach((button) => {
        const value = Number(
          button.dataset.chipValue,
        );
        const selected =
          value ===
          betState.selectedChip;

        button.classList.toggle(
          "is-selected",
          selected,
        );
        button.setAttribute(
          "aria-pressed",
          String(selected),
        );
      });

    if (mobileSelectedChip) {
      mobileSelectedChip.textContent =
        formatRouletteAmount(betState.selectedChip);
    }
    if (mobileChipToggle) {
      mobileChipToggle.dataset.selectedChip =
        String(betState.selectedChip);
    }

    const stake =
      getRouletteTotalStake(
        betState.placements,
      );
    const totalBetText =
      formatRouletteMoney(
        stake,
      );
    totalBetDisplays.forEach((display) => {
      display.textContent =
        totalBetText;
    });

    undoButtons.forEach((button) => {
      button.disabled =
        betState.placements.length === 0;
    });
    doubleButtons.forEach((button) => {
      button.disabled = !canDoubleCurrentBet();
    });
    if (clearButton) {
      clearButton.disabled =
        betState.placements.length === 0;
    }
    rebetButtons.forEach((button) => {
      button.disabled =
        !canRebetPreviousRound();
    });

    updateSpinAvailability();
  };

  const animate = (
    timestamp: number,
  ) => {
    const elapsedMs =
      Math.max(
        0,
        timestamp -
          motionStartedAt,
      );
    let rotorAngularVelocity = 0;

    if (activeRotorSpin) {
      const rotorSample =
        sampleRotorSpin(
          activeRotorSpin,
          elapsedMs,
        );
      viewState.rotorAngle =
        rotorSample.angle;
      rotorAngularVelocity =
        rotorSample.angularVelocity;

      if (rotorSample.done) {
        activeRotorSpin = null;
      }
    }

    if (activeBallOrbit) {
      const dueEvents =
        collectRouletteSimulationEvents(
          simulationEvents,
          lastEventElapsedMs,
          elapsedMs,
        );

      dueEvents.forEach((event) => {
        rouletteAudio.handleEvent(
          event,
        );
        canvas.dispatchEvent(
          new CustomEvent<RouletteSimulationEvent>(
            "roulette-simulation-event",
            {
              detail: event,
              bubbles: true,
            },
          ),
        );
      });
      lastEventElapsedMs =
        elapsedMs;

      const ballSample =
        sampleBallOrbit(
          activeBallOrbit,
          elapsedMs,
        );
      viewState.ballAngle =
        ballSample.angle;
      viewState.ballRadiusRatio =
        ballSample.radiusRatio;

      rouletteAudio.updateMotion({
        rotorAngularVelocity,
        ballAngularVelocity:
          ballSample.angularVelocity,
        ballPhase:
          ballSample.phase,
      });

      if (ballSample.done) {
        activeBallOrbit = null;
        activeRotorSpin = null;
        rouletteAudio.stopMotion();
      }
    }

    redraw();

    if (
      !activeRotorSpin &&
      !activeBallOrbit
    ) {
      rouletteAudio.stopMotion();
      frameId = 0;
      return;
    }

    frameId =
      window.requestAnimationFrame(
        animate,
      );
  };

  const startGlobalSpin = (
    table: RouletteGlobalTableSnapshot,
  ) => {
    if (
      table.roundId ===
        spinningGlobalRoundId &&
      (
        activeRotorSpin ||
        activeBallOrbit
      )
    ) {
      return;
    }

    if (
      !table.seed ||
      table.simulationVersion !==
        ROULETTE_SIMULATION_VERSION
    ) {
      return;
    }

    const replay =
      simulateSeededRouletteSpin(
        table.seed,
      );

    if (!replay.result) {
      throw new Error(
        "ROULETTE_GLOBAL_REPLAY_UNSETTLED",
      );
    }

    if (
      roundSnapshotCapturedId !==
      table.roundId
    ) {
      betState =
        snapshotRouletteRound(
          betState,
        );
      roundSnapshotCapturedId =
        table.roundId;
    }

    spinningGlobalRoundId =
      table.roundId;
    renderedGlobalResultRoundId =
      null;
    bettingWindowClosed = true;
    closeMobileHudMenus();
    clearRoundResult();
    setScenePhase("spinning");

    canvas.dataset.rouletteState =
      "spinning";
    delete canvas.dataset
      .roulettePocketIndex;
    delete canvas.dataset
      .rouletteWinningNumber;
    delete canvas.dataset
      .rouletteWinningColor;
    canvas.setAttribute(
      "aria-label",
      "Live European roulette wheel. Global spin in progress.",
    );

    activeRotorSpin =
      replay.rotorSpin;
    activeBallOrbit =
      replay.ballOrbit;
    simulationEvents =
      createRouletteSimulationEvents(
        replay.ballOrbit,
      );

    const elapsedMs =
      getRouletteGlobalSpinElapsedMs(
        table,
        getGlobalServerNow(),
      );

    lastEventElapsedMs =
      elapsedMs;

    const rotorSample =
      sampleRotorSpin(
        replay.rotorSpin,
        elapsedMs,
      );
    const ballSample =
      sampleBallOrbit(
        replay.ballOrbit,
        elapsedMs,
      );

    viewState.rotorAngle =
      rotorSample.angle;
    viewState.ballAngle =
      ballSample.angle;
    viewState.ballRadiusRatio =
      ballSample.radiusRatio;
    viewState.ballVisible = true;

    motionStartedAt =
      performance.now() -
      elapsedMs;

    void rouletteAudio
      .ensureStarted()
      .catch(() => {
        // The global table continues even when autoplay is blocked.
      });

    if (frameId) {
      window.cancelAnimationFrame(
        frameId,
      );
    }
    frameId =
      window.requestAnimationFrame(
        animate,
      );
  };

  const renderGlobalResult = (
    bootstrap:
      RouletteBootstrapResponse,
  ) => {
    const table =
      bootstrap.globalTable;

    if (
      !table ||
      !table.seed ||
      !table.result ||
      renderedGlobalResultRoundId ===
        table.roundId
    ) {
      return;
    }

    const replay =
      simulateSeededRouletteSpin(
        table.seed,
      );
    const replayResult =
      replay.result;

    if (
      !replayResult ||
      replayResult.number !==
        table.result.number ||
      replayResult.pocketIndex !==
        table.result.pocketIndex ||
      replayResult.color !==
        table.result.color
    ) {
      apiSimulationReady = false;
      throw new Error(
        "ROULETTE_GLOBAL_RESULT_MISMATCH",
      );
    }

    if (frameId) {
      window.cancelAnimationFrame(
        frameId,
      );
      frameId = 0;
    }
    activeRotorSpin = null;
    activeBallOrbit = null;
    rouletteAudio.stopMotion();

    const finalRotor =
      sampleRotorSpin(
        replay.rotorSpin,
        replay.ballOrbit.durationMs,
      );
    const finalBall =
      sampleBallOrbit(
        replay.ballOrbit,
        replay.ballOrbit.durationMs,
      );

    viewState.rotorAngle =
      finalRotor.angle;
    viewState.ballAngle =
      finalBall.angle;
    viewState.ballRadiusRatio =
      finalBall.radiusRatio;

    const settlement =
      bootstrap.globalBet
        ?.settlement ??
      settleRouletteBets(
        bootstrap.globalBet?.bets ??
          betState.placements,
        table.result.number,
      );
    const presentation =
      renderRoundResult(
        settlement,
        finalRotor.angle,
      );

    if (
      presentation.winningPocketIndex !==
        table.result.pocketIndex ||
      presentation.winningColor !==
        table.result.color
    ) {
      throw new Error(
        "ROULETTE_RESULT_PRESENTATION_MISMATCH",
      );
    }

    if (
      roundSnapshotCapturedId !==
      table.roundId
    ) {
      betState =
        snapshotRouletteRound(
          betState,
        );
      roundSnapshotCapturedId =
        table.roundId;
    }

    betState =
      clearRouletteBets(
        betState,
      );
    serverReservedStakeCents = 0;
    renderBetState();

    renderedGlobalResultRoundId =
      table.roundId;
    canvas.dataset.rouletteState =
      "settled";
    setScenePhase(
      "settled",
      table.result.number,
    );
    canvas.dataset
      .roulettePocketIndex =
      String(
        table.result.pocketIndex,
      );
    canvas.dataset
      .rouletteWinningNumber =
      String(
        table.result.number,
      );
    canvas.dataset
      .rouletteWinningColor =
      table.result.color;
    canvas.setAttribute(
      "aria-label",
      `Live European roulette wheel. Result ${table.result.number}.`,
    );
    redraw();
  };

  const applyGlobalBootstrap = (
    bootstrap:
      RouletteBootstrapResponse,
    requestStartedAtMs: number,
    responseReceivedAtMs: number,
    forceBetHydrate = false,
  ) => {
    serverClockOffsetMs =
      estimateRouletteServerClockOffset(
        bootstrap.serverTimeMs,
        requestStartedAtMs,
        responseReceivedAtMs,
      );
    walletBalanceCents =
      bootstrap.wallet.balanceCents;
    recentResults =
      normalizeRouletteRecentResults(
        bootstrap.recentResults,
      );
    renderRecentResults();
    globalTableSnapshot =
      bootstrap.globalTable;
    apiSimulationReady =
      bootstrap.simulationVersion ===
        ROULETTE_SIMULATION_VERSION &&
      bootstrap.globalTable !== null &&
      bootstrap.globalTable
        .simulationVersion ===
        ROULETTE_SIMULATION_VERSION;

    renderWalletBalance();

    if (
      !apiSimulationReady ||
      !globalTableSnapshot
    ) {
      bettingWindowClosed = true;
      if (betStatus) {
        betStatus.textContent =
          "UPDATING GAME";
      }
      renderPhaseTimer();
      updateSpinAvailability();
      return;
    }

    const serverNowMs =
      getGlobalServerNow();
    const globalPhase =
      getRouletteGlobalClientPhase(
        globalTableSnapshot,
        serverNowMs,
      );
    const roundChanged =
      activeGlobalRoundId !==
      globalTableSnapshot.roundId;

    if (roundChanged) {
      if (
        activeGlobalRoundId &&
        roundSnapshotCapturedId !==
          activeGlobalRoundId &&
        betState.placements.length > 0
      ) {
        betState =
          snapshotRouletteRound(
            betState,
          );
      }

      activeGlobalRoundId =
        globalTableSnapshot.roundId;
      spinningGlobalRoundId = null;
      renderedGlobalResultRoundId =
        null;
      roundSnapshotCapturedId =
        null;
      serverReservedStakeCents = 0;
      serverGlobalBetRevision = 0;
      lastHydratedGlobalBetRevision =
        0;
      pendingGlobalBetSync = null;

      if (
        globalPhase === "betting"
      ) {
        clearRoundResult();
      }
    }

    const serverBet =
      bootstrap.globalBet;
    const canHydrateBet =
      (
        roundChanged ||
        forceBetHydrate ||
        (
          !globalBetSyncInFlight &&
          !pendingGlobalBetSync &&
          (
            serverBet?.revision ??
            0
          ) >=
            lastHydratedGlobalBetRevision
        )
      );

    if (
      canHydrateBet &&
      serverBet?.roundId ===
        globalTableSnapshot.roundId &&
      globalPhase === "betting"
    ) {
      betState = {
        ...betState,
        placements:
          serverBet.bets.map(
            (bet) => ({
              ...bet,
            }),
          ),
      };
      serverReservedStakeCents =
        serverBet.stakeCents;
      serverGlobalBetRevision =
        serverBet.revision;
      lastHydratedGlobalBetRevision =
        serverBet.revision;
    } else if (
      canHydrateBet &&
      roundChanged &&
      !serverBet &&
      globalPhase === "betting"
    ) {
      betState =
        clearRouletteBets(
          betState,
        );
      serverReservedStakeCents = 0;
      serverGlobalBetRevision = 0;
      lastHydratedGlobalBetRevision =
        0;
    }

    if (globalPhase === "betting") {
      bettingWindowClosed = false;
      canvas.dataset.rouletteState =
        "ready";
      setScenePhase("betting");
      canvas.setAttribute(
        "aria-label",
        "Live European roulette wheel. Betting open.",
      );
    } else if (
      globalPhase === "spinning"
    ) {
      bettingWindowClosed = true;
      startGlobalSpin(
        globalTableSnapshot,
      );
    } else if (
      globalPhase === "result"
    ) {
      bettingWindowClosed = true;
      renderGlobalResult(
        bootstrap,
      );
    } else {
      bettingWindowClosed = true;
      setScenePhase("betting");
      betPanel.setAttribute(
        "aria-disabled",
        "true",
      );
    }

    renderBetState();
    renderPhaseTimer();
    updateSpinAvailability();
  };

  const scheduleApiReadinessRetry = (
    delayMs = 500,
  ) => {
    window.clearTimeout(
      apiReadinessRetryTimer,
    );

    apiReadinessRetryTimer =
      window.setTimeout(() => {
        void bootstrapRouletteApi();
      }, delayMs);
  };

  const bootstrapRouletteApi = async (
    forceBetHydrate = false,
  ) => {
    if (stateRequestInFlight) {
      return;
    }

    stateRequestInFlight = true;
    const requestStartedAtMs =
      Date.now();

    try {
      const bootstrap =
        await rouletteWallet.bootstrap();
      const responseReceivedAtMs =
        Date.now();

      applyGlobalBootstrap(
        bootstrap,
        requestStartedAtMs,
        responseReceivedAtMs,
        forceBetHydrate,
      );
    } catch (error) {
      apiSimulationReady = false;
      bettingWindowClosed = true;

      if (betStatus) {
        betStatus.textContent =
          "CONNECTING";
      }

      console.error(
        "[roulette] global state sync failed",
        error,
      );
      renderPhaseTimer();
      updateSpinAvailability();
    } finally {
      stateRequestInFlight = false;

      if (app.isConnected) {
        scheduleApiReadinessRetry(
          apiSimulationReady
            ? 500
            : 750,
        );
      }
    }
  };

  const drainGlobalBetSync = async () => {
    if (globalBetSyncInFlight) {
      return;
    }

    globalBetSyncInFlight = true;

    try {
      while (
        pendingGlobalBetSync
      ) {
        const job =
          pendingGlobalBetSync;
        pendingGlobalBetSync =
          null;

        try {
          const response =
            await rouletteWallet
              .updateGlobalBet(
                job.roundId,
                job.bets,
                `roulette_gbet_${job.version}_${crypto.randomUUID().replaceAll("-", "")}`,
                serverGlobalBetRevision,
              );

          if (
            globalTableSnapshot
              ?.roundId ===
              job.roundId
          ) {
            walletBalanceCents =
              response.balanceCents;
            serverReservedStakeCents =
              response.globalBet
                ?.stakeCents ??
              0;
            serverGlobalBetRevision =
              response.globalBet
                ?.revision ??
              serverGlobalBetRevision;
            lastHydratedGlobalBetRevision =
              response.globalBet
                ?.revision ??
              lastHydratedGlobalBetRevision;
            renderWalletBalance();
            renderBetState();
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "ROULETTE_GLOBAL_BET_FAILED";

          const discardPending =
            message ===
              "ROULETTE_GLOBAL_BET_STALE" ||
            message ===
              "ROULETTE_GLOBAL_BETTING_CLOSED" ||
            message ===
              "ROULETTE_GLOBAL_BET_ALREADY_SETTLED";

          if (discardPending) {
            pendingGlobalBetSync =
              null;
          }

          if (betStatus) {
            betStatus.textContent =
              message ===
                "INSUFFICIENT_ROULETTE_CREDITS"
                ? "INSUFFICIENT BALANCE"
                : message ===
                      "ROULETTE_GLOBAL_BETTING_CLOSED"
                  ? "NO MORE BETS"
                  : message ===
                        "ROULETTE_GLOBAL_BET_STALE"
                    ? "BET UPDATED ELSEWHERE"
                    : "BET SYNC FAILED";
          }

          console.error(
            "[roulette] global bet sync failed",
            error,
          );

          await bootstrapRouletteApi(
            true,
          );
          break;
        }
      }
    } finally {
      globalBetSyncInFlight =
        false;

      if (
        pendingGlobalBetSync
      ) {
        void drainGlobalBetSync();
      }
    }
  };

  const queueGlobalBetSync = () => {
    if (
      !apiSimulationReady ||
      !globalTableSnapshot ||
      getRouletteGlobalClientPhase(
        globalTableSnapshot,
        getGlobalServerNow(),
      ) !== "betting"
    ) {
      return;
    }

    globalBetMutationVersion += 1;
    pendingGlobalBetSync = {
      roundId:
        globalTableSnapshot.roundId,
      bets:
        betState.placements.map(
          (bet) => ({
            ...bet,
          }),
        ),
      version:
        globalBetMutationVersion,
    };

    void drainGlobalBetSync();
  };

  const tickPhaseTimer = () => {
    renderPhaseTimer();

    if (
      !apiSimulationReady ||
      !globalTableSnapshot
    ) {
      return;
    }

    const globalPhase =
      getRouletteGlobalClientPhase(
        globalTableSnapshot,
        getGlobalServerNow(),
      );
    const uiPhase =
      page.dataset.phase as
        RouletteScenePhase;

    if (
      globalPhase === "betting"
    ) {
      if (
        uiPhase !== "betting" ||
        bettingWindowClosed
      ) {
        void bootstrapRouletteApi(
          true,
        );
      }
      return;
    }

    bettingWindowClosed = true;
    page.dataset.bettingLocked =
      "true";
    betPanel.setAttribute(
      "aria-disabled",
      "true",
    );

    if (
      globalPhase === "spinning" &&
      (
        uiPhase !== "spinning" ||
        !globalTableSnapshot.seed
      )
    ) {
      void bootstrapRouletteApi();
      return;
    }

    if (
      globalPhase === "result" &&
      uiPhase !== "settled"
    ) {
      void bootstrapRouletteApi();
    }
  };

  const phaseTimerInterval =
    window.setInterval(() => {
      if (!app.isConnected) {
        window.clearInterval(
          phaseTimerInterval,
        );
        window.clearTimeout(
          apiReadinessRetryTimer,
        );
        return;
      }

      tickPhaseTimer();
    }, 100);

  canvas.dataset.rouletteState = "ready";
  setScenePhase("betting");

  const observer = new ResizeObserver(redraw);
  observer.observe(canvas);
  redraw();
  renderRecentResults();
  renderWalletBalance();
  renderBetState();
  renderPhaseTimer();

  void bootstrapRouletteApi();

  betPanel.addEventListener(
    "click",
    (event) => {
      const target =
        event.target as HTMLElement;

      if (
        target.closest(
          "[data-mobile-stats-toggle]",
        )
      ) {
        const isOpen =
          mobileStatsToggle?.getAttribute("aria-expanded") === "true";
        setMobileChipMenuOpen(false);
        setMobileStatsOpen(!isOpen);
        return;
      }

      if (
        !apiSimulationReady ||
        !globalTableSnapshot ||
        bettingWindowClosed ||
        getRouletteGlobalClientPhase(
          globalTableSnapshot,
          getGlobalServerNow(),
        ) !== "betting" ||
        !canEditRouletteBets(
          page.dataset.phase as
            RouletteScenePhase,
        )
      ) {
        return;
      }

      if (
        target.closest(
          "[data-mobile-chip-toggle]",
        )
      ) {
        const isOpen =
          mobileChipToggle?.getAttribute("aria-expanded") === "true";
        setMobileChipMenuOpen(!isOpen);
        return;
      }

      const chipButton =
        target.closest<HTMLButtonElement>(
          "[data-chip-value]",
        );
      if (chipButton) {
        const value = Number(
          chipButton.dataset.chipValue,
        );
        if (
          isRouletteChipValue(value)
        ) {
          betState =
            selectRouletteChip(
              betState,
              value as RouletteChipValue,
            );
          renderBetState();
          setMobileChipMenuOpen(false);
        }
        return;
      }

      const betCell =
        target.closest<HTMLElement>(
          "[data-bet-id]",
        );
      if (betCell) {
        const betId =
          betCell.dataset.betId;
        if (betId) {
          if (!canPlaceSelectedChip()) {
            if (betStatus) {
              betStatus.textContent =
                walletBalanceCents === null
                  ? "WAITING FOR WALLET"
                  : "INSUFFICIENT BALANCE";
            }
            return;
          }

          betState =
            placeRouletteBet(
              betState,
              betId,
            );
          renderBetState();
          queueGlobalBetSync();
          setMobileChipMenuOpen(false);
        }
        return;
      }

      if (
        target.closest(
          "[data-undo-bet]",
        )
      ) {
        betState =
          undoRouletteBet(
            betState,
          );
        renderBetState();
        queueGlobalBetSync();
        setMobileChipMenuOpen(false);
        return;
      }

      if (
        target.closest(
          "[data-double-bet]",
        )
      ) {
        if (canDoubleCurrentBet()) {
          betState =
            doubleRouletteBets(
              betState,
            );
          renderBetState();
          queueGlobalBetSync();
        }
        setMobileChipMenuOpen(false);
        return;
      }

      if (
        target.closest(
          "[data-clear-bets]",
        )
      ) {
        betState =
          clearRouletteBets(
            betState,
          );
        renderBetState();
        queueGlobalBetSync();
        return;
      }

      if (
        target.closest(
          "[data-rebet]",
        )
      ) {
        if (!canRebetPreviousRound()) {
          if (betStatus) {
            betStatus.textContent =
              walletBalanceCents === null
                ? "WAITING FOR WALLET"
                : "INSUFFICIENT BALANCE";
          }
          return;
        }

        betState =
          rebetRouletteRound(
            betState,
          );
        renderBetState();
        queueGlobalBetSync();
      }
    },
  );

  rouletteMenuToggle?.addEventListener(
    "click",
    (event) => {
      event.stopPropagation();

      const isOpen =
        rouletteMenuToggle.getAttribute(
          "aria-expanded",
        ) === "true";

      setRouletteMenuOpen(
        !isOpen,
      );
    },
  );

  rouletteMenuClose?.addEventListener(
    "click",
    () => {
      setRouletteMenuOpen(false);
      rouletteMenuToggle?.focus();
    },
  );

  dealerVolumeInput?.addEventListener(
    "input",
    () => {
      dealerVolume =
        Math.min(
          1,
          Math.max(
            0,
            Number(
              dealerVolumeInput.value,
            ) / 100,
          ),
        );

      rouletteAudio.setDealerVolume(
        dealerVolume,
      );
      syncAudioSettingsUi();
      persistAudioSettings();
    },
  );

  ambientVolumeInput?.addEventListener(
    "input",
    () => {
      ambientVolume =
        Math.min(
          1,
          Math.max(
            0,
            Number(
              ambientVolumeInput.value,
            ) / 100,
          ),
        );

      rouletteAudio.setAmbientVolume(
        ambientVolume,
      );
      syncAudioSettingsUi();
      persistAudioSettings();
    },
  );

  rouletteMainMenuButton?.addEventListener(
    "click",
    () => {
      rouletteAudio.stopMotion();
      window.location.assign("/");
    },
  );

  page.addEventListener(
    "click",
    (event) => {
      if (
        rouletteSettingsMenu?.hidden !==
          false
      ) {
        return;
      }

      const target =
        event.target as HTMLElement;

      if (
        target.closest(
          "[data-roulette-settings-menu]",
        ) ||
        target.closest(
          "[data-roulette-menu-toggle]",
        )
      ) {
        return;
      }

      setRouletteMenuOpen(false);
    },
  );

  page.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape" &&
        rouletteSettingsMenu?.hidden ===
          false
      ) {
        setRouletteMenuOpen(false);
        rouletteMenuToggle?.focus();
      }
    },
  );

  window.addEventListener("resize", redraw, { passive: true });
}
