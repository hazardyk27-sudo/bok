import "./roulette.css";
import { renderRouletteBetTable } from "./betTable";
import {
  type RouletteRoundSettlement,
} from "./betRules";
import {
  clearRouletteBets,
  createRouletteBetState,
  doubleRouletteBets,
  getRouletteBetTotals,
  getRouletteLastChipByBet,
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
  ROULETTE_RESULT_HOLD_MS,
  canEditRouletteBets,
  canStartRouletteSpin,
  getRoulettePhaseStatus,
  type RouletteScenePhase,
} from "./scenePhase";
import {
  createRouletteResultPresentation,
} from "./resultPresentation";
import {
  readSettledWinningResult,
} from "./spinResult";
import {
  createVerifiedRouletteReplay,
} from "./authoritativeReplay";
import {
  RouletteWalletClient,
  type RouletteServerSpinResponse,
} from "./rouletteWalletClient";
import {
  ROULETTE_RECENT_RESULT_LIMIT,
  ROULETTE_RECENT_RESULTS_STORAGE_KEY,
  appendRouletteRecentResult,
  getRouletteResultTone,
  normalizeRouletteRecentResults,
} from "./recentResults";
import { formatRouletteAmount } from "./uiFormat";
import { renderRouletteWheel } from "./wheelRenderer";

type RouletteViewState = {
  rotorAngle: number;
  ballAngle: number;
  ballRadiusRatio: number;
  ballVisible: boolean;
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
      aria-label="Roulette 2D"
    >
      <div class="roulette-game-shell">
        <section
          class="roulette-wheel-panel"
          aria-label="European roulette wheel"
        >
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
              role="button"
              tabindex="0"
              aria-label="European roulette wheel. Press to spin the wheel and ball."
            ></canvas>
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
  const walletBalance = app.querySelector<HTMLElement>("[data-wallet-balance]");
  const totalBet = app.querySelector<HTMLElement>("[data-total-bet]");
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
  const rebetButton = app.querySelector<HTMLButtonElement>("[data-rebet]");
  const spinButton = app.querySelector<HTMLButtonElement>("[data-spin-button]");
  const mobileChipToggle =
    app.querySelector<HTMLButtonElement>("[data-mobile-chip-toggle]");
  const mobileChipMenu =
    app.querySelector<HTMLElement>("[data-mobile-chip-menu]");
  const mobileSelectedChip =
    app.querySelector<HTMLElement>("[data-mobile-selected-chip]");
  const recentResultsStrip =
    app.querySelector<HTMLElement>("[data-roulette-recent-results]");

  if (!canvas) throw new Error("Roulette canvas was not mounted.");
  if (!page) throw new Error("Roulette page was not mounted.");
  if (!betPanel) throw new Error("Roulette betting panel was not mounted.");

  const initialBallOrbit = createBallOrbit();

  const viewState: RouletteViewState = {
    rotorAngle: 0,
    ballAngle: initialBallOrbit.startAngle,
    ballRadiusRatio: initialBallOrbit.trackRadius,
    ballVisible: true,
  };

  let betState: RouletteBetState =
    createRouletteBetState();
  let walletBalanceCents: number | null = null;
  let pendingServerSpin: RouletteServerSpinResponse | null = null;
  let activeRotorSpin: RotorSpin | null = null;
  let activeBallOrbit: BallOrbit | null = null;
  let motionStartedAt = 0;
  let lastEventElapsedMs = -1;
  let simulationEvents: RouletteSimulationEvent[] = [];
  let frameId = 0;
  let resultHoldTimer = 0;
  let recentResults: number[] = [];

  try {
    recentResults =
      normalizeRouletteRecentResults(
        JSON.parse(
          window.localStorage.getItem(
            ROULETTE_RECENT_RESULTS_STORAGE_KEY,
          ) ?? "[]",
        ),
      );
  } catch {
    recentResults = [];
  }

  const rouletteAudio =
    new RouletteAudioEngine();
  const rouletteWallet =
    new RouletteWalletClient();

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
  };

  const recordRecentResult = (
    number: number,
  ) => {
    recentResults =
      appendRouletteRecentResult(
        recentResults,
        number,
      );

    try {
      window.localStorage.setItem(
        ROULETTE_RECENT_RESULTS_STORAGE_KEY,
        JSON.stringify(
          recentResults,
        ),
      );
    } catch {
      // The history remains available for this mounted session.
    }

    renderRecentResults();
  };

  const renderWalletBalance = () => {
    if (!walletBalance) return;
    walletBalance.textContent =
      walletBalanceCents === null
        ? "…"
        : formatRouletteAmount(walletBalanceCents / 100);
  };

  const canAffordCurrentBet = () =>
    walletBalanceCents !== null &&
    getRouletteTotalStake(betState.placements) * 100 <= walletBalanceCents;

  const canDoubleCurrentBet = () =>
    walletBalanceCents !== null &&
    betState.placements.length > 0 &&
    betState.placements.length <= 250 &&
    getRouletteTotalStake(betState.placements) * 200 <= walletBalanceCents;

  const setMobileChipMenuOpen = (open: boolean) => {
    if (mobileChipMenu) {
      mobileChipMenu.hidden = !open;
    }
    if (mobileChipToggle) {
      mobileChipToggle.setAttribute("aria-expanded", String(open));
    }
    betPanel.dataset.mobileChipMenuOpen = String(open);
  };

  const updateSpinAvailability = () => {
    if (!spinButton) return;
    spinButton.disabled =
      !canStartRouletteSpin(
        page.dataset.phase as RouletteScenePhase,
      ) ||
      !canAffordCurrentBet();
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

    delete page.dataset.resultNumber;
  };

  const renderRoundResult = (
    settlement: RouletteRoundSettlement,
  ) => {
    const presentation =
      createRouletteResultPresentation(
        settlement,
      );

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

    const winningNumberCell =
      app.querySelector<HTMLElement>(
        `[data-bet-id="${presentation.winningNumberBetId}"]`,
      );
    winningNumberCell?.classList.add(
      "is-result-number",
    );

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
        presentation.grossReturnText;
    }
    if (roundProfit) {
      roundProfit.textContent =
        presentation.netProfitText;
    }
    if (roundOutcome) {
      roundOutcome.dataset.roundOutcome =
        presentation.outcome;
    }

    page.dataset.resultNumber =
      String(
        presentation.winningNumber,
      );
  };

  const setScenePhase = (
    phase: RouletteScenePhase,
    resultNumber?: number,
  ) => {
    page.dataset.phase = phase;
    page.dataset.bettingLocked =
      String(
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
        !canEditRouletteBets(phase),
      ),
    );

    updateSpinAvailability();
  };

  const reopenBettingAfterResult = () => {
    window.clearTimeout(
      resultHoldTimer,
    );

    resultHoldTimer =
      window.setTimeout(() => {
        if (
          activeRotorSpin ||
          activeBallOrbit ||
          page.dataset.phase !==
            "settled"
        ) {
          return;
        }

        canvas.dataset.rouletteState =
          "ready";
        setScenePhase("betting");
        canvas.setAttribute(
          "aria-label",
          "European roulette wheel. Betting open. Press to spin again.",
        );
      }, ROULETTE_RESULT_HOLD_MS);
  };

  const renderBetState = () => {
    const totals =
      getRouletteBetTotals(
        betState.placements,
      );
    const lastChipByBet =
      getRouletteLastChipByBet(
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

        const lastChip =
          lastChipByBet[betId] ?? 10;
        const chip =
          document.createElement("span");
        chip.className =
          `roulette-placed-chip chip-${lastChip}`;
        chip.dataset.betAmount =
          String(amount);
        chip.textContent =
          formatRouletteAmount(
            amount,
          );
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
    if (totalBet) {
      totalBet.textContent =
        formatRouletteAmount(
          stake,
        );
    }

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
    if (rebetButton) {
      rebetButton.disabled =
        betState.previousRoundPlacements
          .length === 0;
    }

    updateSpinAvailability();
  };

  const animate = (timestamp: number) => {
    const elapsedMs = timestamp - motionStartedAt;
    let rotorAngularVelocity = 0;

    if (activeRotorSpin) {
      const rotorSample = sampleRotorSpin(activeRotorSpin, elapsedMs);
      viewState.rotorAngle = rotorSample.angle;
      rotorAngularVelocity = rotorSample.angularVelocity;
      if (rotorSample.done) activeRotorSpin = null;
    }

    if (activeBallOrbit) {
      const dueEvents =
        collectRouletteSimulationEvents(
          simulationEvents,
          lastEventElapsedMs,
          elapsedMs,
        );

      dueEvents.forEach((event) => {
        rouletteAudio.handleEvent(event);
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
      lastEventElapsedMs = elapsedMs;

      const ballSample = sampleBallOrbit(activeBallOrbit, elapsedMs);
      viewState.ballAngle = ballSample.angle;
      viewState.ballRadiusRatio = ballSample.radiusRatio;

      rouletteAudio.updateMotion({
        rotorAngularVelocity,
        ballAngularVelocity:
          ballSample.angularVelocity,
        ballPhase: ballSample.phase,
      });

      if (ballSample.done) {
        const completedOrbit = activeBallOrbit;
        const result = readSettledWinningResult(completedOrbit);

        if (
          result &&
          pendingServerSpin &&
          pendingServerSpin.result.number === result.number &&
          pendingServerSpin.result.pocketIndex === result.pocketIndex
        ) {
          renderRoundResult(pendingServerSpin.settlement);
          recordRecentResult(
            result.number,
          );
          walletBalanceCents = pendingServerSpin.wallet.balanceCents;
          renderWalletBalance();

          canvas.dataset.rouletteState = "settled";
          setScenePhase(
            "settled",
            result.number,
          );
          canvas.dataset.roulettePocketIndex = String(result.pocketIndex);
          canvas.dataset.rouletteWinningNumber = String(result.number);
          canvas.dataset.rouletteWinningColor = result.color;
          canvas.setAttribute(
            "aria-label",
            `European roulette wheel. Result ${result.number}.`,
          );
          reopenBettingAfterResult();
          pendingServerSpin = null;
        } else {
          canvas.dataset.rouletteState = "unsettled";
          setScenePhase("betting");
          delete canvas.dataset.roulettePocketIndex;
          delete canvas.dataset.rouletteWinningNumber;
          delete canvas.dataset.rouletteWinningColor;
        }

        activeBallOrbit = null;
        rouletteAudio.stopMotion();
      }
    }

    redraw();

    if (!activeRotorSpin && !activeBallOrbit) {
      rouletteAudio.stopMotion();
      frameId = 0;
      return;
    }

    frameId = window.requestAnimationFrame(animate);
  };

  const startSpin = async () => {
    if (
      activeRotorSpin ||
      activeBallOrbit ||
      !canStartRouletteSpin(
        page.dataset.phase as RouletteScenePhase,
      ) ||
      !canAffordCurrentBet()
    ) {
      return;
    }

    window.clearTimeout(
      resultHoldTimer,
    );

    await rouletteAudio.ensureStarted();

    if (activeRotorSpin || activeBallOrbit) return;

    clearRoundResult();

    canvas.dataset.rouletteState = "authorizing";
    setScenePhase("spinning");
    delete canvas.dataset.roulettePocketIndex;
    delete canvas.dataset.rouletteWinningNumber;
    delete canvas.dataset.rouletteWinningColor;
    canvas.setAttribute(
      "aria-label",
      "European roulette wheel. Spin authorization in progress.",
    );

    try {
      const idempotencyKey =
        `roulette_${crypto.randomUUID().replaceAll("-", "")}`;

      pendingServerSpin = await rouletteWallet.spin(
        betState.placements,
        idempotencyKey,
      );

      const replay =
        createVerifiedRouletteReplay(
          pendingServerSpin,
        );

      betState = snapshotRouletteRound(betState);
      renderBetState();
      activeRotorSpin = replay.rotorSpin;
      activeBallOrbit = replay.ballOrbit;
    } catch (error) {
      pendingServerSpin = null;
      canvas.dataset.rouletteState = "ready";
      setScenePhase("betting");
      if (betStatus) {
        betStatus.textContent =
          error instanceof Error &&
          error.message === "INSUFFICIENT_ROULETTE_CREDITS"
            ? "INSUFFICIENT BALANCE"
            : "SPIN FAILED";
      }
      return;
    }

    canvas.dataset.rouletteState = "spinning";
    canvas.setAttribute(
      "aria-label",
      "European roulette wheel. Spin in progress.",
    );

    simulationEvents =
      createRouletteSimulationEvents(
        activeBallOrbit,
      );
    lastEventElapsedMs = -1;

    const initialBallSample = sampleBallOrbit(activeBallOrbit, 0);
    viewState.ballAngle = initialBallSample.angle;
    viewState.ballRadiusRatio = initialBallSample.radiusRatio;

    motionStartedAt = performance.now();

    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = window.requestAnimationFrame(animate);
  };

  canvas.dataset.rouletteState = "ready";
  setScenePhase("betting");

  const observer = new ResizeObserver(redraw);
  observer.observe(canvas);
  redraw();
  renderRecentResults();
  renderWalletBalance();
  renderBetState();

  void rouletteWallet
    .bootstrap()
    .then((wallet) => {
      walletBalanceCents = wallet.balanceCents;
      renderWalletBalance();
      renderBetState();
    })
    .catch(() => {
      walletBalanceCents = null;
      if (walletBalance) walletBalance.textContent = "ERR";
      updateSpinAvailability();
    });

  betPanel.addEventListener(
    "click",
    (event) => {
      if (
        !canEditRouletteBets(
          page.dataset.phase as
            RouletteScenePhase,
        )
      ) {
        return;
      }

      const target =
        event.target as HTMLElement;

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
          betState =
            placeRouletteBet(
              betState,
              betId,
            );
          renderBetState();
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
        return;
      }

      if (
        target.closest(
          "[data-rebet]",
        )
      ) {
        betState =
          rebetRouletteRound(
            betState,
          );
        renderBetState();
      }
    },
  );

  spinButton?.addEventListener(
    "click",
    () => {
      void startSpin();
    },
  );

  canvas.addEventListener("click", () => {
    void startSpin();
  });
  canvas.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void startSpin();
  });

  window.addEventListener("resize", redraw, { passive: true });
}
