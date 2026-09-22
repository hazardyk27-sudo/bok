import { ANIMATION, BETS_CENTS, FREE_BET_CENTS, MAX_WIN_MULTIPLIER, STARTING_BALANCE_CENTS, getSymbolDefinition } from "../config/GameConfig";
import {
  addFreeSpinSymbolWin,
  beginFreeSpinAccounting,
  createFreeSpinAccounting,
  resolveFreeSpinAccounting,
  settleFreeSpinAccounting,
} from "../engine/SlotEngine";
import { evaluateBoard } from "../engine/WinEvaluator";
import type { Board, BoardCell, SpinResult } from "../engine/types";
import { AudioManager } from "./AudioManager";
import { renderBonusCeremony } from "./bonusCeremony";
import { GameScene } from "./GameScene";
import { mountResponsiveWinAmount } from "./ResponsiveWinAmount";
import { buildWinLabelEvents, type WinLabelEvent } from "./WinLabel";
import { isLargeWin, isMaxWin, winTier } from "./WinTiers";
import { getAnimationDuration, shouldResumeAutoSpin } from "./GameTiming";
import { SlotWalletClient } from "./SlotWalletClient";

type ControllerState = "BOOT" | "IDLE" | "SPIN_INIT" | "INITIAL_DROP" | "EVALUATING" | "WIN_HIGHLIGHT" | "WIN_EXPLOSION" | "GRAVITY" | "REFILL" | "CASCADE_DROP" | "BONUS_TRIGGER_CEREMONY" | "BONUS_AWARD_PRESENTATION" | "BONUS_WAITING_FOR_START" | "BONUS_INTRO" | "FREE_SPIN_PLAY" | "CORE_REVEAL" | "BIG_WIN" | "MAX_WIN" | "BONUS_SUMMARY" | "SPIN_COMPLETE";

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const animateValue = (from: number, to: number, milliseconds: number, onUpdate: (value: number) => void) => new Promise<void>((resolve) => {
  const startedAt = performance.now();
  const tick = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / Math.max(1, milliseconds));
    const eased = 1 - Math.pow(1 - progress, 3);
    onUpdate(from + (to - from) * eased);
    if (progress < 1) window.requestAnimationFrame(tick);
    else resolve();
  };
  window.requestAnimationFrame(tick);
});

export class GameController {
  state: ControllerState = "BOOT";
  balanceCents = STARTING_BALANCE_CENTS;
  betIndex = 2;
  currentWinCents = 0;
  bonusWinCents = 0;
  freeSpinAccounting = createFreeSpinAccounting();
  turbo = localStorage.getItem("cascade8-turbo") === "true";
  freeSpinsLeft = 0;
  bonusTriggerScatterCount = 0;
  private busy = false;
  private pendingBonusResult: SpinResult | null = null;
  private pendingRetriggerContinue: (() => void) | null = null;
  private pendingAutoResume = false;
  private autoRunning = false;
  private autoStopping = false;
  private autoRemaining = 0;
  private walletReady = false;
  private readonly wallet = new SlotWalletClient();
  readonly audio = new AudioManager();
  private readonly scene: GameScene;
  private readonly ui: {
    balance: HTMLElement; bet: HTMLElement; win: HTMLElement; bonusWin: HTMLElement; freeSpins: HTMLElement; gameStatusBadge: HTMLElement; gameStatusLabel: HTMLElement;
     tumble: HTMLElement; status: HTMLElement; spin: HTMLButtonElement; spinLabel: HTMLElement; betMinus: HTMLButtonElement; betPlus: HTMLButtonElement;
      autoToggle: HTMLButtonElement; autoActionDesktop: HTMLElement; autoActionMobile: HTMLElement; autoSelectionDesktop: HTMLElement; autoSelectionValue: HTMLElement; autoSelectionLabel: HTMLElement; autoMenu: HTMLElement; autoCount: HTMLSelectElement;
      turbo: HTMLButtonElement; sound: HTMLButtonElement; bonusOverlay: HTMLElement; bonusStart: HTMLButtonElement; bonusSpinCount: HTMLElement; bonusScatterRow: HTMLElement; bonusTriggerLabel: HTMLElement; bonusTitle: HTMLElement; bonusSupport: HTMLElement; bonusInstruction: HTMLElement; freeSpinCalculation: HTMLElement; freeSpinRawWin: HTMLElement; freeSpinMultiplier: HTMLElement; freeSpinFinalWin: HTMLElement; freeSpinMultiplyOperator: HTMLElement; freeSpinEqualsOperator: HTMLElement; tumbleLabel: HTMLElement; tumbleSymbolWin: HTMLElement; tumbleIncrement: HTMLElement; tumbleMeta: HTMLElement; tumbleSettlement: HTMLElement; tumblePanel: HTMLElement; bigWinOverlay: HTMLElement; bonusSummaryOverlay: HTMLElement; boardWrap: HTMLElement; controlDeck: HTMLElement;
    setModal: (name: string | null) => void;
  };

  constructor(scene: GameScene, ui: GameController["ui"]) {
    this.scene = scene;
    this.ui = ui;
    this.state = "IDLE";
    this.bind();
    this.audio.startMusic();
    this.updateHud();
    void this.initializeWallet();
  }

  private async initializeWallet() {
    try {
      const wallet = await this.wallet.bootstrap();
      this.balanceCents = wallet.balanceCents;
      this.walletReady = true;
      this.message("SERVER WALLET CONNECTED");
      this.updateHud();
    } catch {
      this.message("WALLET CONNECTION REQUIRED");
      this.updateHud();
    }
  }

  private bind() {
    this.ui.spin.addEventListener("click", () => void this.spin());
    this.ui.betMinus.addEventListener("click", () => this.changeBet(-1));
    this.ui.betPlus.addEventListener("click", () => this.changeBet(1));
    this.ui.autoCount.addEventListener("change", () => this.updateAutoStatus());
    this.ui.autoToggle.addEventListener("click", () => {
      if (this.autoRunning) {
        void this.toggleAuto();
      } else {
        this.setAutoMenuOpen(this.ui.autoMenu.hidden);
      }
    });
    this.ui.autoMenu.addEventListener("click", (event) => {
      const target = event.target instanceof HTMLElement
        ? event.target.closest<HTMLButtonElement>("[data-auto-option]")
        : null;
      const value = target?.dataset.autoOption;
      if (!value || !target || target.disabled) return;
      this.ui.autoCount.value = value;
      this.ui.autoCount.dispatchEvent(new Event("change"));
      this.setAutoMenuOpen(false);
      void this.toggleAuto();
    });
    document.addEventListener("pointerdown", (event) => {
      const root = this.ui.autoMenu.parentElement;
      if (root && event.target instanceof Node && !root.contains(event.target)) this.setAutoMenuOpen(false);
    });
    this.ui.turbo.addEventListener("click", () => {
      this.turbo = !this.turbo; localStorage.setItem("cascade8-turbo", String(this.turbo)); this.updateHud();
    });
    this.ui.sound.addEventListener("click", () => {
      this.audio.setMuted(!this.audio.muted); this.updateHud();
    });
    this.ui.bonusStart.addEventListener("click", () => {
      if (this.pendingRetriggerContinue) {
        const continueRetrigger = this.pendingRetriggerContinue;
        this.pendingRetriggerContinue = null;
        this.setBonusPrompt(false);
        continueRetrigger();
        return;
      }
      void this.spin();
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.setAutoMenuOpen(false);
        this.ui.setModal(null);
      }
      if (event.code === "Space" && !event.repeat && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault(); void this.spin();
      }
    });
  }

  get betCents() { return BETS_CENTS[this.betIndex]; }
  get isCurrentBetFree() { return isFreeBetCents(this.betCents); }
  get currentFreeSpinRawSymbolWin() { return this.freeSpinAccounting.rawSymbolWinCents; }
  get currentFreeSpinCombinedMultiplier() { return this.freeSpinAccounting.combinedCoreMultiplier; }
  get currentFreeSpinFinalWin() { return this.freeSpinAccounting.currentSpinWinCents; }
  get bonusCumulativeWinSoFar() { return this.freeSpinAccounting.cumulativeBonusWinCents; }
  private duration(value: number, freeSpin = false) {
    return getAnimationDuration(value, this.turbo, freeSpin);
  }
  private setState(state: ControllerState) {
    this.state = state;
    this.ui.spin.disabled = !this.walletReady || this.busy || this.autoRunning || (!this.pendingBonusResult && !canAffordBet(this.balanceCents, this.betCents));
  }
  private changeBet(direction: number) {
    if (this.busy || this.autoRunning) return;
    this.betIndex = Math.max(0, Math.min(BETS_CENTS.length - 1, this.betIndex + direction));
    this.audio.click(); this.updateHud();
  }
  private updateHud() {
    this.ui.balance.textContent = formatCredits(this.balanceCents);
    const formattedBet = `${formatCredits(this.betCents)}${this.isCurrentBetFree ? " FREE" : ""}`;
    this.ui.bet.textContent = formattedBet;
    document.querySelectorAll<HTMLElement>("[data-bet-display]").forEach((element) => {
      element.textContent = formattedBet;
    });
    this.ui.win.textContent = formatCredits(this.currentWinCents);
    this.ui.bonusWin.textContent = formatCredits(this.bonusWinCents);
    this.ui.freeSpins.textContent = String(this.freeSpinsLeft);
    this.updateStatusBadge();
    this.ui.turbo.classList.toggle("is-active", this.turbo);
    const soundLabel = this.ui.sound.querySelector<HTMLElement>(".sound-label-full");
    if (soundLabel) soundLabel.textContent = this.audio.muted ? "SOUND OFF" : "SOUND ON";
    this.ui.sound.setAttribute("aria-label", this.audio.muted ? "Turn sound on" : "Turn sound off");
    this.ui.sound.classList.toggle("is-active", !this.audio.muted);
    this.ui.spin.disabled = !this.walletReady || this.busy || this.autoRunning || (!this.pendingBonusResult && !canAffordBet(this.balanceCents, this.betCents));
    this.ui.betMinus.disabled = this.busy || this.betIndex === 0;
    this.ui.betPlus.disabled = this.busy || this.betIndex === BETS_CENTS.length - 1;
    this.ui.autoCount.disabled = this.busy || this.autoRunning || Boolean(this.pendingBonusResult);
    this.ui.autoToggle.disabled = (this.busy && !this.autoRunning) || Boolean(this.pendingBonusResult);
    this.ui.autoToggle.classList.toggle("is-running", this.autoRunning);
    this.ui.autoToggle.classList.toggle("is-stopping", this.autoStopping);
    this.ui.autoToggle.setAttribute("aria-label", this.autoRunning ? "Stop automatic spins" : "Choose automatic spin count");
    this.ui.autoMenu.querySelectorAll<HTMLButtonElement>("[data-auto-option]").forEach((option) => {
      const isSelected = option.dataset.autoOption === this.ui.autoCount.value;
      option.disabled = this.busy || this.autoRunning || Boolean(this.pendingBonusResult);
      option.setAttribute("aria-checked", String(isSelected));
      option.classList.toggle("is-selected", isSelected);
    });
    this.updateAutoStatus();
  }
  private updateStatusBadge() {
    const freeSpinActive = this.freeSpinsLeft > 0 && this.ui.boardWrap.classList.contains("free-spin-mode");
    const autoActive = !freeSpinActive && (this.autoRunning || this.autoStopping);
    const visible = freeSpinActive || autoActive;
    this.ui.gameStatusBadge.hidden = !visible;
    if (!visible) return;
    const isLastFreeSpin = freeSpinActive && this.freeSpinsLeft === 1;
    this.ui.gameStatusBadge.dataset.mode = freeSpinActive ? "free-spin" : "auto";
    this.ui.freeSpins.textContent = freeSpinActive
      ? isLastFreeSpin ? "LAST" : String(this.freeSpinsLeft)
      : String(this.autoRemaining);
    this.ui.gameStatusLabel.textContent = freeSpinActive
      ? isLastFreeSpin ? "FREE SPIN" : "FREE SPINS LEFT"
      : "AUTO SPINS LEFT";
  }
  updateForModal() { this.updateHud(); }
  private message(value: string) { this.ui.status.textContent = value; }

  async spin(fromAuto = false) {
    if (this.autoRunning && !fromAuto) return;
    if (!this.walletReady) {
      this.message("WALLET CONNECTION REQUIRED");
      return;
    }
    if (this.pendingBonusResult) {
      await this.startFreeSpins();
      return;
    }
    if (this.busy || !canAffordBet(this.balanceCents, this.betCents)) {
      if (!this.busy && !canAffordBet(this.balanceCents, this.betCents)) this.message("INSUFFICIENT DEMO CREDITS");
      return;
    }
     this.busy = true; this.currentWinCents = 0; this.bonusWinCents = 0; this.freeSpinsLeft = 0;
     this.resetTumbleWin();
    this.setBonusPrompt(false);
    this.setState("SPIN_INIT");
    this.audio.spin(); this.updateHud();
     let result: SpinResult;
     try {
       const serverSpin = await this.wallet.spin(this.betCents, crypto.randomUUID());
       result = serverSpin.result;
       this.balanceCents = serverSpin.wallet.balanceCents;
       this.updateHud();
     } catch (error) {
       this.busy = false;
       this.setState("IDLE");
       this.message(error instanceof Error && error.message === "INSUFFICIENT_SLOT_CREDITS"
         ? "INSUFFICIENT DEMO CREDITS"
         : "SLOT SERVER UNAVAILABLE");
       this.updateHud();
       return;
     }
    this.message("THE GATES ARE OPENING");
    this.setState("INITIAL_DROP");
    this.scene.renderBoard(result.initialBoard);
    if (result.scatterCount > 0) {
      this.audio.scatterAnticipation(result.scatterCount);
       this.audio.scatterArrival(result.scatterCount);
    }
     await this.scene.animateDrop(this.duration(ANIMATION.initialDrop), this.turbo);
    await this.playTumbles(result, false);
    this.currentWinCents = result.baseWinCents;
    this.updateHud();
    const baseMultiplier = result.baseWinCents / this.betCents;
    if (isLargeWin(baseMultiplier)) {
      await this.presentLargeWin(baseMultiplier, result.baseWinCents);
    }
     if (result.bonusTriggered && !result.maxWinReached) {
       if (fromAuto && this.autoRunning && !this.autoStopping) {
         this.pendingAutoResume = true;
       }
      this.pendingBonusResult = result;
      this.freeSpinsLeft = result.freeSpinsAwarded;
       this.bonusTriggerScatterCount = result.bonusTriggerScatterCount;
       this.setState("BONUS_TRIGGER_CEREMONY");
       this.message(`BONUS TRIGGER DETECTED // ${this.bonusTriggerScatterCount} SCATTERS`);
       const triggerBoard = result.tumbles.at(-1)?.boardAfterRefill ?? result.initialBoard;
       const triggerCells = triggerBoard.flatMap((row, rowIndex) =>
         row.flatMap((cell, col) => cell === "SCATTER" ? [{ row: rowIndex, col }] : []),
       );
       await this.scene.presentBonusTriggerCeremony(triggerCells, this.bonusTriggerScatterCount);
       this.audio.bonusUnlock(this.bonusTriggerScatterCount);
       this.scene.bonusUnlockFlash();
       await sleep(this.duration(360));
       this.setState("BONUS_AWARD_PRESENTATION");
       this.message(`${result.freeSpinsAwarded} FREE SPINS READY // ${this.bonusTriggerScatterCount} SCATTERS // PRESS SPIN`);
      this.setBonusPrompt(true);
      this.setState("BONUS_WAITING_FOR_START");
      this.busy = false;
      this.updateHud();
      return;
    }
    await this.finishSpin(result);
  }

  private async startFreeSpins() {
    const result = this.pendingBonusResult;
    if (!result) return;
    this.pendingBonusResult = null;
    this.busy = true;
    this.setBonusPrompt(false);
    this.scene.setFreeSpinMode(true);
    this.freeSpinAccounting = createFreeSpinAccounting();
    this.setFreeSpinPresentation(true);
    this.audio.crossfadeMusic(this.audio.musicVolume * 1.35);
    this.ui.boardWrap.classList.add("free-spin-mode");
    this.setState("BONUS_INTRO");
    this.message("BONUS REALM // FREE SPINS");
    let remaining = result.freeSpinsAwarded;
    let usedMultiplier = result.baseWinCents / this.betCents;
    let displayedBonusWinCents = 0;
    let index = 0;
    this.updateHud();
    while (remaining > 0 && usedMultiplier < MAX_WIN_MULTIPLIER) {
      if (index > 0) await sleep(this.duration(ANIMATION.spinPause, true));
      index += 1;
      const freeSpin = result.freeSpins[index - 1];
      if (!freeSpin) {
        this.busy = false;
        this.setState("IDLE");
        this.message("BONUS RESULT UNAVAILABLE");
        this.updateHud();
        return;
      }
       this.resetCurrentFreeSpinDisplay(index);
      usedMultiplier += freeSpin.finalWinMultiplier;
       displayedBonusWinCents = Math.round((usedMultiplier - result.baseWinCents / this.betCents) * this.betCents);
      this.freeSpinsLeft = remaining;
      this.setState("FREE_SPIN_PLAY"); this.updateHud();
      this.scene.renderBoard(freeSpin.initialBoard);
      if (freeSpin.scatterCount > 0) {
        this.audio.scatterAnticipation(freeSpin.scatterCount);
         this.audio.scatterArrival(freeSpin.scatterCount);
        this.audio.scatterCelebration(freeSpin.scatterCount);
      }
      await this.scene.animateDrop(this.duration(ANIMATION.initialDrop, true), false);
      await this.playTumbles({ ...result, tumbles: freeSpin.tumbles }, true);
      if (freeSpin.win === 0) {
        this.resolveZeroWinFreeSpin(freeSpin);
        await sleep(this.duration(260, true));
      } else {
        await this.presentCurrentFreeSpinResolution(freeSpin);
        if (isLargeWin(freeSpin.finalWinMultiplier)) {
          await this.presentLargeWin(freeSpin.finalWinMultiplier, freeSpin.win);
        }
        await sleep(this.duration(220, true));
        this.audio.freeSpinTransfer();
        await this.animateFreeSpinFlight(
          "transfer",
          this.freeSpinAccounting.currentSpinWinCents,
          this.ui.freeSpinFinalWin,
          this.ui.tumble,
          440,
        );
        this.freeSpinAccounting = settleFreeSpinAccounting(this.freeSpinAccounting);
        this.updateBonusTotalDisplay(true);
        await sleep(this.duration(360, true));
      }
       this.currentWinCents = Math.round(usedMultiplier * this.betCents);
       this.bonusWinCents = displayedBonusWinCents;
      remaining = remaining - 1 + freeSpin.retriggered;
      this.freeSpinsLeft = remaining;
      this.updateHud();
      if (freeSpin.retriggered) {
        await this.pauseForRetrigger(freeSpin);
      }
    }
    this.setState("BONUS_SUMMARY"); this.message(`BONUS COMPLETE // ${formatCredits(result.bonusWinCents)}`);
    this.audio.bonusComplete();
    await this.showBonusSummary(result);
    this.freeSpinsLeft = 0;
     this.setFreeSpinPresentation(false);
    this.scene.setFreeSpinMode(false);
    this.audio.crossfadeMusic(this.audio.musicVolume);
    this.ui.boardWrap.classList.remove("free-spin-mode");
    const resumeAuto = shouldResumeAutoSpin(this.pendingAutoResume, this.autoRemaining);
    this.pendingAutoResume = false;
    await this.finishSpin(result);
    if (resumeAuto) {
      this.autoRunning = true;
      this.autoStopping = false;
      this.message(`AUTO RESUMING // ${this.autoRemaining} SPINS LEFT`);
      this.updateHud();
      await this.runAuto();
    }
  }

  private async finishSpin(result: SpinResult) {
    this.currentWinCents = result.totalWinCents;
    if (result.maxWinReached) this.setState("MAX_WIN");
    else if (result.totalMultiplier >= 10) this.setState("BIG_WIN");
    this.setState("SPIN_COMPLETE"); this.message(result.totalWinCents ? "SPIN COMPLETE // COLLECTED" : "NO WIN // NEXT GATE AWAITS");
    this.busy = false; this.setState("IDLE"); this.updateHud();
  }

  private async toggleAuto() {
    if (this.autoRunning) {
      this.autoRunning = false;
      this.autoStopping = true;
      this.pendingAutoResume = false;
      this.message("AUTO STOPPING // CURRENT SPIN FINISHES");
      this.updateHud();
      return;
    }
    if (this.busy || this.pendingBonusResult || !canAffordBet(this.balanceCents, this.betCents)) {
      if (!canAffordBet(this.balanceCents, this.betCents)) this.message("INSUFFICIENT DEMO CREDITS");
      return;
    }
    this.autoRunning = true;
    this.autoStopping = false;
    this.pendingAutoResume = false;
    this.autoRemaining = Number(this.ui.autoCount.value);
    this.updateHud();
    await this.runAuto();
  }

  private setAutoMenuOpen(open: boolean) {
    if (open && (this.busy || this.autoRunning || this.pendingBonusResult)) return;
    this.ui.autoMenu.hidden = !open;
    this.ui.autoToggle.setAttribute("aria-expanded", String(open));
    this.ui.autoToggle.classList.toggle("is-open", open);
  }

  private async runAuto() {
    while (this.autoRunning && this.autoRemaining > 0) {
      if (!canAffordBet(this.balanceCents, this.betCents)) {
        this.autoRunning = false;
        this.message("AUTO STOPPED // INSUFFICIENT CREDITS");
        break;
      }
      await this.spin(true);
      this.autoRemaining -= 1;
      this.updateAutoStatus();
      if (this.pendingBonusResult) {
        this.autoRunning = false;
        this.message("AUTO PAUSED // PRESS START FREE SPINS");
        break;
      }
    }
    if (this.autoRunning) {
      this.autoRunning = false;
      this.message("AUTO COMPLETE // ALL SPINS FINISHED");
    }
    this.autoStopping = false;
    this.updateHud();
  }

  private updateAutoStatus() {
    const selected = Number(this.ui.autoCount.value);
    const freeSpinActive = this.freeSpinsLeft > 0 && this.ui.boardWrap.classList.contains("free-spin-mode");
    const isLastFreeSpin = freeSpinActive && this.freeSpinsLeft === 1;
    const action = this.autoRunning ? "STOP AUTO" : this.autoStopping ? "STOPPING" : "START AUTO";
    const desktopAction = this.autoRunning ? "STOP AUTO" : this.autoStopping ? "STOPPING" : "AUTO";
    const remainingActive = freeSpinActive || this.autoRunning || this.autoStopping;
    const displayedCount = freeSpinActive
      ? this.freeSpinsLeft
      : this.autoRunning || this.autoStopping ? this.autoRemaining : selected;
    this.ui.autoSelectionDesktop.textContent = freeSpinActive
      ? isLastFreeSpin ? "LAST FREE SPIN" : `${this.freeSpinsLeft} LEFT`
      : this.autoRunning || this.autoStopping
        ? `${this.autoRemaining} LEFT`
        : String(selected);
    this.ui.autoSelectionValue.textContent = isLastFreeSpin ? "LAST" : String(displayedCount);
    this.ui.autoSelectionLabel.textContent = isLastFreeSpin ? "FREE SPIN" : remainingActive ? "LEFT" : "";
    this.ui.autoActionDesktop.textContent = freeSpinActive ? "FREE SPINS" : desktopAction;
    this.ui.autoActionMobile.textContent = freeSpinActive ? "FREE SPINS" : action;
    this.ui.autoToggle.dataset.mode = freeSpinActive ? "free-spin" : "auto";
    this.ui.autoToggle.dataset.state = this.autoStopping ? "stopping" : this.autoRunning ? "running" : "ready";
    this.ui.autoToggle.classList.toggle("is-last-free-spin", isLastFreeSpin);
    this.ui.autoToggle.setAttribute(
      "aria-label",
      freeSpinActive
        ? isLastFreeSpin ? "Last free spin" : `Free spins: ${this.freeSpinsLeft} remaining`
        : this.autoRunning
          ? `Stop automatic spins: ${this.autoRemaining} remaining`
          : "Choose automatic spin count",
    );
    this.updateStatusBadge();
  }

  private async playTumbles(result: Pick<SpinResult, "tumbles">, isBonus: boolean) {
    for (let index = 0; index < result.tumbles.length; index += 1) {
      const tumble = result.tumbles[index];
      this.setState("EVALUATING");
      const winEvents = this.buildWinLabelEvents(tumble);
      const winningMessage = `${tumble.winningSymbols.map((symbol) => getSymbolDefinition(symbol).name).join(" + ")} RESONATE`;
       this.message(tumble.multiplierCores.length ? `${winningMessage} // CORES BANKED` : winningMessage);
      this.setState("WIN_HIGHLIGHT"); this.audio.win();
      await this.scene.highlightCells(tumble.winningCells, this.duration(ANIMATION.winHighlight, isBonus));
       this.setState("WIN_EXPLOSION");
      winEvents.forEach(() => this.audio.winLabel());
      await this.scene.burstCells(tumble.removedCells, this.duration(ANIMATION.burst, isBonus));
      void this.scene.presentWinLabels(winEvents, this.duration(ANIMATION.winLabel, isBonus));
      await this.showTumbleWin(tumble, index + 1, isBonus, winEvents);
      this.updateHud();
      this.setState("REFILL");
      this.setState("CASCADE_DROP");
       await this.scene.animateCascade(
         tumble.boardAfterRefill,
         tumble.removedCells,
         this.duration(ANIMATION.refill, isBonus),
         this.turbo && !isBonus,
       );
      this.message(index > 0 ? `TUMBLE ${index + 1} // RAW ${tumble.rawWinPoolAfter.toFixed(2)}x` : `WIN // RAW ${tumble.rawWinPoolAfter.toFixed(2)}x`);
    }
    const last = result.tumbles.at(-1);
    if (last) await this.presentSequenceSettlement(last, isBonus);
  }

  private setBonusPrompt(active: boolean, kind: "trigger" | "retrigger" = "trigger", awarded = this.freeSpinsLeft) {
    renderBonusCeremony(
      {
        overlay: this.ui.bonusOverlay,
        scatterRow: this.ui.bonusScatterRow,
        triggerLabel: this.ui.bonusTriggerLabel,
        title: this.ui.bonusTitle,
        support: this.ui.bonusSupport,
        instruction: this.ui.bonusInstruction,
        button: this.ui.bonusStart,
        spinCount: this.ui.bonusSpinCount,
      },
      active,
      {
        bonusTriggerScatterCount: this.bonusTriggerScatterCount,
        freeSpinsAwarded: awarded,
      },
      import.meta.env.BASE_URL,
      kind,
    );
     this.ui.spin.hidden = active;
     this.ui.bonusStart.disabled = !active;
    this.ui.boardWrap.classList.toggle("free-spin-ready", active);
     this.ui.spin.classList.remove("is-bonus");
     this.ui.spinLabel.textContent = "SPIN";
     this.ui.spin.querySelector("small")!.textContent = "ENTER THE CASCADE";
  }
  private resetTumbleWin() {
    this.ui.tumblePanel.className = "tumble-win-panel";
    this.ui.tumbleSymbolWin.textContent = "";
    this.ui.tumble.textContent = "—";
    this.ui.tumbleIncrement.textContent = "";
    this.ui.tumbleMeta.textContent = "";
    this.ui.tumbleSettlement.textContent = "";
  }
  private setFreeSpinPresentation(active: boolean) {
    this.ui.controlDeck.classList.toggle("is-free-spin-mode", active);
    this.ui.freeSpinCalculation.hidden = !active;
    this.ui.freeSpinCalculation.classList.remove("is-collecting", "is-resolving");
    this.ui.tumbleLabel.textContent = active ? "TOTAL BONUS WIN" : "TUMBLE WIN";
    if (active) {
      this.updateBonusTotalDisplay(false);
    } else {
      this.resetTumbleWin();
    }
  }
  private resetCurrentFreeSpinDisplay(index: number) {
    this.freeSpinAccounting = beginFreeSpinAccounting(this.freeSpinAccounting);
    this.ui.freeSpinMultiplyOperator.classList.remove("is-emphasized");
    this.ui.freeSpinEqualsOperator.classList.remove("is-emphasized");
    this.ui.freeSpinCalculation.dataset.spin = String(index);
    this.updateCurrentFreeSpinDisplay();
    this.updateBonusTotalDisplay(false);
  }
  private pulseFreeSpinValue(element: HTMLElement) {
    element.classList.remove("is-updating");
    void element.offsetWidth;
    element.classList.add("is-updating");
  }
  private pulseFreeSpinEquation() {
    [this.ui.freeSpinMultiplyOperator, this.ui.freeSpinEqualsOperator].forEach((element) => {
      element.classList.remove("is-emphasized");
      void element.offsetWidth;
      element.classList.add("is-emphasized");
    });
  }
  private multiplierLabel(value: number) {
    return `${Number.isInteger(value) ? value : value.toFixed(2)}x`;
  }
  private async animateFreeSpinFlight(
    kind: "raw" | "multiplier" | "transfer",
    amountCents: number,
    source: HTMLElement,
    target: HTMLElement,
    milliseconds: number,
  ) {
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const startX = sourceRect.left + sourceRect.width / 2;
    const startY = sourceRect.top + sourceRect.height / 2;
    const flight = document.createElement("span");
    flight.className = `free-spin-flight ${kind}`;
    flight.textContent = kind === "multiplier"
      ? `+${this.multiplierLabel(Math.max(1, amountCents))}`
      : `+${formatWinDetailCredits(amountCents)}`;
    flight.style.left = `${startX}px`;
    flight.style.top = `${startY}px`;
    flight.style.setProperty("--flight-x", `${targetRect.left + targetRect.width / 2 - startX}px`);
    flight.style.setProperty("--flight-y", `${targetRect.top + targetRect.height / 2 - startY}px`);
    flight.style.animationDuration = `${this.duration(milliseconds, true)}ms`;
    document.body.appendChild(flight);
    await sleep(this.duration(milliseconds, true));
    flight.remove();
    this.pulseFreeSpinValue(target);
  }
  private updateCurrentFreeSpinDisplay() {
    const raw = formatWinDetailCredits(this.freeSpinAccounting.rawSymbolWinCents);
    const multiplier = this.multiplierLabel(this.freeSpinAccounting.combinedCoreMultiplier);
    const final = formatWinDetailCredits(this.freeSpinAccounting.currentSpinWinCents);
    this.ui.freeSpinRawWin.textContent = raw;
    this.ui.freeSpinMultiplier.textContent = multiplier;
    this.ui.freeSpinFinalWin.textContent = final;
  }
  private resolveZeroWinFreeSpin(freeSpin: SpinResult["freeSpins"][number]) {
    this.freeSpinAccounting = resolveFreeSpinAccounting(
      this.freeSpinAccounting,
      freeSpin.rawWinMultiplier,
      freeSpin.combinedCoreMultiplier,
      0,
      this.betCents,
    );
    this.updateCurrentFreeSpinDisplay();
    this.ui.freeSpinCalculation.classList.remove("is-collecting", "is-resolving");
  }
  private updateBonusTotalDisplay(isIncrement: boolean) {
    this.ui.tumblePanel.className = `tumble-win-panel is-active is-free-total is-bonus${isIncrement ? " is-total-updated" : ""}`;
    this.ui.tumbleLabel.textContent = "TOTAL BONUS WIN";
    const totalCents = this.freeSpinAccounting.cumulativeBonusWinCents;
    const currentSpinCents = this.freeSpinAccounting.currentSpinWinCents;
    const previousTotalCents = totalCents - currentSpinCents;
    this.ui.tumble.textContent = formatTumbleCredits(totalCents);
    this.ui.tumbleSymbolWin.textContent = "";
    this.ui.tumbleIncrement.textContent = "";
    this.ui.tumbleMeta.textContent = "";
    this.ui.tumbleSettlement.textContent = "";
  }
  private updateTumbleEquation(rawAmountCents: number, multiplier: number, finalAmountCents: number) {
    if (multiplier <= 1) {
      this.ui.tumbleSettlement.textContent = "";
      return;
    }
    const formattedMultiplier = Number.isInteger(multiplier) ? String(multiplier) : multiplier.toFixed(2);
    this.ui.tumbleSettlement.textContent =
      `${formatTumbleCredits(rawAmountCents)} × ${formattedMultiplier} = ${formatTumbleCredits(finalAmountCents)}`;
  }
  private buildWinLabelEvents(tumble: SpinResult["tumbles"][number]): WinLabelEvent[] {
    return buildWinLabelEvents(
      tumble.boardBefore,
      tumble.winningSymbols,
      tumble.winningCells,
      tumble.payouts,
      this.betCents,
      formatCredits,
    );
  }
  private async showTumbleWin(
    tumble: SpinResult["tumbles"][number],
    tumbleIndex: number,
    isBonus: boolean,
    winEvents: readonly WinLabelEvent[],
  ) {
    if (isBonus) {
      for (const event of winEvents) {
        this.ui.freeSpinCalculation.classList.add("is-collecting");
        await this.animateFreeSpinFlight("raw", event.amountCents, this.ui.boardWrap, this.ui.freeSpinRawWin, 380);
        this.audio.freeSpinRawCollect();
        this.freeSpinAccounting = addFreeSpinSymbolWin(this.freeSpinAccounting, event.amountCents);
        this.updateCurrentFreeSpinDisplay();
        this.ui.freeSpinCalculation.classList.remove("is-collecting");
      }
      this.updateBonusTotalDisplay(false);
      return;
    }
    this.ui.tumblePanel.className = `tumble-win-panel is-active${isBonus ? " is-bonus" : ""}`;
    this.ui.tumbleLabel.textContent = "TUMBLE WIN";
    const rawAmountCents = Math.round(tumble.rawWinPoolAfter * this.betCents);
    this.ui.tumbleSymbolWin.textContent = "";
    this.ui.tumble.textContent = formatTumbleCredits(rawAmountCents);
    this.ui.tumbleIncrement.textContent = "";
    this.ui.tumbleMeta.textContent = "";
     this.ui.tumbleSettlement.textContent = "";
  }
  private async presentSequenceSettlement(tumble: SpinResult["tumbles"][number], isBonus: boolean) {
    if (tumble.finalPayoutMultiplier <= tumble.rawWinPoolAfter || !tumble.settlementCores.length) return;
    const rawAmountCents = Math.round(tumble.rawWinPoolAfter * this.betCents);
    const total = tumble.coreTotalMultiplier;
    if (isBonus) {
      this.ui.freeSpinCalculation.classList.add("is-collecting");
      this.freeSpinAccounting = { ...this.freeSpinAccounting, combinedCoreMultiplier: 0 };
      this.updateCurrentFreeSpinDisplay();
      let collectedTotal = 0;
      for (const core of tumble.settlementCores) {
        await this.scene.collectMultiplierCore(core, this.ui.freeSpinMultiplier, this.duration(430, true));
        this.audio.freeSpinMultiplierCollect(core.value);
        collectedTotal += core.value;
        this.freeSpinAccounting = { ...this.freeSpinAccounting, combinedCoreMultiplier: collectedTotal };
        this.updateCurrentFreeSpinDisplay();
        await sleep(this.duration(110, true));
      }
      this.freeSpinAccounting = { ...this.freeSpinAccounting, combinedCoreMultiplier: total };
      this.updateCurrentFreeSpinDisplay();
      this.ui.freeSpinCalculation.classList.remove("is-collecting");
      return;
    }
    this.ui.tumblePanel.className = `tumble-win-panel is-settling${isBonus ? " is-free-win" : ""}`;
    this.ui.tumbleLabel.textContent = "TUMBLE WIN";
    this.ui.tumbleSymbolWin.textContent = "";
    this.ui.tumbleIncrement.textContent = "";
    this.ui.tumbleMeta.textContent = "";
    this.ui.tumble.textContent = formatTumbleCredits(rawAmountCents);
     this.ui.tumbleSettlement.textContent = "";
    let collectedTotal = 0;
    for (const core of tumble.settlementCores) {
      await this.scene.collectMultiplierCore(core, this.ui.tumbleSettlement, this.duration(400, isBonus));
      this.audio.multiplierCoreCollect(core.value, false);
      collectedTotal += core.value;
      const collectedAmountCents = Math.round(tumble.rawWinPoolAfter * collectedTotal * this.betCents);
      this.ui.tumble.textContent = formatTumbleCredits(collectedAmountCents);
      this.updateTumbleEquation(rawAmountCents, collectedTotal, collectedAmountCents);
      await sleep(this.duration(105, isBonus));
    }
    const finalAmountCents = Math.round(tumble.finalPayoutMultiplier * this.betCents);
    this.ui.tumble.textContent = formatTumbleCredits(finalAmountCents);
    this.updateTumbleEquation(rawAmountCents, total, finalAmountCents);
    await sleep(this.duration(180, isBonus));
  }
  private async pauseForRetrigger(freeSpin: SpinResult["freeSpins"][number]) {
    const count = freeSpin.retriggerScatterCount;
    const board = freeSpin.retriggerBoard
      ?? freeSpin.tumbles.at(-1)?.boardAfterRefill
      ?? freeSpin.initialBoard;
    const scatterCells = board.flatMap((row, rowIndex) =>
      row.flatMap((cell, col) => cell === "SCATTER" ? [{ row: rowIndex, col }] : []),
    ).slice(0, count);
    if (count < 3 || !scatterCells.length) return;

    this.bonusTriggerScatterCount = count;
    this.setState("BONUS_TRIGGER_CEREMONY");
    this.message(`+${freeSpin.retriggered} FREE SPINS // ${count} SCATTERS`);
    await this.scene.presentBonusTriggerCeremony(scatterCells, count);
    this.audio.scatterCelebration(count);
    this.audio.bonusUnlock(count);
    this.scene.bonusUnlockFlash();
    this.setBonusPrompt(true, "retrigger", freeSpin.retriggered);
    this.setState("BONUS_WAITING_FOR_START");
    await new Promise<void>((resolve) => {
      this.pendingRetriggerContinue = resolve;
    });
    this.setState("FREE_SPIN_PLAY");
    this.message(`FREE SPIN ${freeSpin.index + 1} // CONTINUING`);
  }
  async previewTumbleSequence(withSettlement = false) {
    this.resetTumbleWin();
    const values = [1.2, 4, 8];
    for (let index = 0; index < values.length; index += 1) {
      this.ui.tumblePanel.className = "tumble-win-panel is-active";
      this.ui.tumbleLabel.textContent = "TUMBLE WIN";
      const amountCents = Math.round(values[index] * this.betCents);
      this.ui.tumble.textContent = formatTumbleCredits(amountCents);
      this.ui.tumbleSymbolWin.textContent = "";
      this.ui.tumbleIncrement.textContent = "";
      this.ui.tumbleMeta.textContent = "";
       this.ui.tumbleSettlement.textContent = "";
      await sleep(this.duration(520));
    }
    if (withSettlement) {
      this.ui.tumblePanel.className = "tumble-win-panel is-settling";
      this.ui.tumbleLabel.textContent = "TUMBLE WIN";
      const rawAmountCents = Math.round(8 * this.betCents);
      this.ui.tumble.textContent = formatTumbleCredits(rawAmountCents);
       this.ui.tumbleSettlement.textContent = "";
      await sleep(this.duration(380));
      const finalAmountCents = Math.round(280 * this.betCents);
      this.ui.tumble.textContent = formatTumbleCredits(finalAmountCents);
      this.updateTumbleEquation(rawAmountCents, 35, finalAmountCents);
      await sleep(this.duration(600));
    }
  }
  async previewWinLabels() {
    this.resetTumbleWin();
    const boards = [
      [...Array(8).fill("S1"), ...Array(8).fill("S6"), ...Array.from({ length: 14 }, (_, index) => index % 2 === 0 ? "S2" : "S3")],
      [...Array(10).fill("S7"), ...Array(20).fill("S3")],
    ].map((values) => Array.from({ length: 5 }, (_, row) => values.slice(row * 6, row * 6 + 6)) as Board);
    let rawTotalCents = 0;

    for (let index = 0; index < boards.length; index += 1) {
      const board = boards[index];
      const evaluation = evaluateBoard(board);
      const events = buildWinLabelEvents(
        board,
        evaluation.winningSymbols,
        evaluation.winningCells,
        evaluation.payouts,
        this.betCents,
        formatCredits,
      );
      this.scene.renderBoard(board, evaluation.winningCells);
      await this.scene.highlightCells(evaluation.winningCells, this.duration(ANIMATION.winHighlight));
      events.forEach(() => this.audio.winLabel());
      await this.scene.burstCells(evaluation.winningCells, this.duration(ANIMATION.burst));
      void this.scene.presentWinLabels(events, this.duration(ANIMATION.winLabel));
      rawTotalCents += Math.round(evaluation.rawPayoutMultiplier * this.betCents);
      this.ui.tumblePanel.className = "tumble-win-panel is-active";
      this.ui.tumbleLabel.textContent = "TUMBLE WIN";
      this.ui.tumble.textContent = formatTumbleCredits(rawTotalCents);
      this.ui.tumbleSymbolWin.textContent = "";
      this.ui.tumbleIncrement.textContent = "";
      this.ui.tumbleMeta.textContent = "";
       this.ui.tumbleSettlement.textContent = "";
      if (index < boards.length - 1) await sleep(this.duration(360));
    }
  }
  async previewFreeSpinAccounting() {
    this.freeSpinAccounting = createFreeSpinAccounting(40_000);
    this.setFreeSpinPresentation(true);
    this.resetCurrentFreeSpinDisplay(4);
    this.freeSpinAccounting = addFreeSpinSymbolWin(this.freeSpinAccounting, 2_000);
    await this.animateFreeSpinFlight("raw", 2_000, this.ui.boardWrap, this.ui.freeSpinRawWin, 380);
    this.audio.freeSpinRawCollect();
    this.updateCurrentFreeSpinDisplay();
    await sleep(this.duration(420, true));
    this.freeSpinAccounting = addFreeSpinSymbolWin(this.freeSpinAccounting, 3_000);
    await this.animateFreeSpinFlight("raw", 3_000, this.ui.boardWrap, this.ui.freeSpinRawWin, 380);
    this.audio.freeSpinRawCollect();
    this.updateCurrentFreeSpinDisplay();
    await sleep(this.duration(420, true));
    await this.animateFreeSpinFlight("multiplier", 5, this.ui.boardWrap, this.ui.freeSpinMultiplier, 420);
    this.audio.freeSpinMultiplierCollect(5);
    this.freeSpinAccounting = {
      ...this.freeSpinAccounting,
      combinedCoreMultiplier: 5,
    };
    this.updateCurrentFreeSpinDisplay();
    await sleep(this.duration(520, true));
    await this.animateFreeSpinFlight("multiplier", 10, this.ui.boardWrap, this.ui.freeSpinMultiplier, 420);
    this.audio.freeSpinMultiplierCollect(10);
    this.freeSpinAccounting = {
      ...this.freeSpinAccounting,
      combinedCoreMultiplier: 15,
    };
    this.updateCurrentFreeSpinDisplay();
    await sleep(this.duration(520, true));
    await this.presentCurrentFreeSpinResolution({
      rawWinMultiplier: 50,
      combinedCoreMultiplier: 15,
      win: 75_000,
    } as SpinResult["freeSpins"][number]);
    this.freeSpinAccounting = settleFreeSpinAccounting(this.freeSpinAccounting);
    this.audio.freeSpinTransfer();
    await this.animateFreeSpinFlight("transfer", 75_000, this.ui.freeSpinFinalWin, this.ui.tumble, 440);
    this.updateBonusTotalDisplay(true);
    await sleep(this.duration(360, true));
  }
  async previewMultiplierCollection() {
    const values = [5, 10, 500, 25];
    const positions = [[0, 0], [1, 1], [2, 2], [3, 3]];
    const cells: BoardCell[] = Array.from({ length: 30 }, () => "S2");
    const cores = values.map((value, index) => {
      const [row, col] = positions[index];
      const core = {
        kind: "MULTIPLIER_CORE" as const,
        value,
        id: `lab-core-${index + 1}`,
        arrivalSequence: index + 1,
      };
      cells[row * 6 + col] = core;
      return { row, col, value, id: core.id, arrivalSequence: core.arrivalSequence };
    });
    const board = Array.from({ length: 5 }, (_, row) => cells.slice(row * 6, row * 6 + 6)) as Board;
    this.scene.setFreeSpinMode(true);
    this.scene.renderBoard(board);
    this.setFreeSpinPresentation(true);
    this.resetCurrentFreeSpinDisplay(99);
    this.freeSpinAccounting = addFreeSpinSymbolWin(this.freeSpinAccounting, 5_000);
    this.freeSpinAccounting = { ...this.freeSpinAccounting, combinedCoreMultiplier: 0 };
    this.updateCurrentFreeSpinDisplay();
    this.ui.freeSpinCalculation.classList.add("is-collecting");
    let collectedTotal = 0;
    for (const core of cores) {
      await this.scene.collectMultiplierCore(core, this.ui.freeSpinMultiplier, this.duration(430, true));
      this.audio.freeSpinMultiplierCollect(core.value);
      collectedTotal += core.value;
      this.freeSpinAccounting = { ...this.freeSpinAccounting, combinedCoreMultiplier: collectedTotal };
      this.updateCurrentFreeSpinDisplay();
      await sleep(this.duration(150, true));
    }
    this.ui.freeSpinCalculation.classList.remove("is-collecting");
    await this.presentCurrentFreeSpinResolution({
      rawWinMultiplier: 50,
      combinedCoreMultiplier: 540,
      win: 2_700_000,
    } as SpinResult["freeSpins"][number]);
    this.freeSpinAccounting = settleFreeSpinAccounting(this.freeSpinAccounting);
    this.audio.freeSpinTransfer();
    await this.animateFreeSpinFlight("transfer", 2_700_000, this.ui.freeSpinFinalWin, this.ui.tumble, 440);
    this.updateBonusTotalDisplay(true);
    this.message("MULTIPLIER SEQUENCE // 5x → 10x → 500x → 25x // 540x");
  }
  async previewZeroWinFreeSpin() {
    this.freeSpinAccounting = createFreeSpinAccounting(40_000);
    this.setFreeSpinPresentation(true);
    this.resetCurrentFreeSpinDisplay(1);
    this.resolveZeroWinFreeSpin({
      rawWinMultiplier: 0,
      combinedCoreMultiplier: 1,
      win: 0,
    } as SpinResult["freeSpins"][number]);
    await sleep(this.duration(260, true));
    this.updateBonusTotalDisplay(false);
  }
  async previewBonusTriggerCeremony(count: number) {
    const scatterCount = Math.max(4, Math.min(6, count));
    const values = Array(30).fill("S2");
    const placements = [[0, 0], [1, 2], [2, 4], [3, 1], [4, 3], [0, 5]];
    placements.slice(0, scatterCount).forEach(([row, col]) => { values[row * 6 + col] = "SCATTER"; });
    const board = Array.from({ length: 5 }, (_, row) => values.slice(row * 6, row * 6 + 6)) as Board;
    const cells = placements.slice(0, scatterCount).map(([row, col]) => ({ row, col }));
    this.bonusTriggerScatterCount = scatterCount;
    this.freeSpinsLeft = scatterCount === 6 ? 15 : scatterCount === 5 ? 12 : 10;
    this.scene.renderBoard(board);
    this.setState("BONUS_TRIGGER_CEREMONY");
    this.message(`BONUS TRIGGER DETECTED // ${scatterCount} SCATTERS`);
    await this.scene.animateDrop(this.duration(ANIMATION.initialDrop));
    await this.scene.presentBonusTriggerCeremony(cells, scatterCount);
    this.audio.bonusUnlock(scatterCount);
    this.scene.bonusUnlockFlash();
    await sleep(this.duration(360));
    this.setBonusPrompt(true);
    this.setState("BONUS_WAITING_FOR_START");
  }
  async previewFreeSpinRetriggerCeremony(count: number) {
    const scatterCount = Math.max(3, Math.min(6, count));
    const values = Array(30).fill("S2");
    const placements = [[0, 0], [1, 2], [2, 4], [3, 1], [4, 3], [0, 5]];
    placements.slice(0, scatterCount).forEach(([row, col]) => { values[row * 6 + col] = "SCATTER"; });
    const board = Array.from({ length: 5 }, (_, row) => values.slice(row * 6, row * 6 + 6)) as Board;
    const cells = placements.slice(0, scatterCount).map(([row, col]) => ({ row, col }));
    this.bonusTriggerScatterCount = scatterCount;
    this.freeSpinsLeft = 5;
    this.scene.renderBoard(board);
    this.setState("BONUS_TRIGGER_CEREMONY");
    await this.scene.animateDrop(this.duration(ANIMATION.initialDrop, true));
    await this.scene.presentBonusTriggerCeremony(cells, scatterCount);
    this.audio.scatterCelebration(scatterCount);
    this.audio.bonusUnlock(scatterCount);
    this.scene.bonusUnlockFlash();
    await sleep(this.duration(360, true));
    this.pendingRetriggerContinue = () => {};
    this.setBonusPrompt(true, "retrigger", 5);
    this.setState("BONUS_WAITING_FOR_START");
  }
  previewBaseLargeWin() {
    void this.presentLargeWin(25, Math.round(this.betCents * 25));
  }
  previewBonusLargeWin(amountCents = 25_000) {
    void this.presentLargeWin(amountCents / this.betCents, amountCents);
  }
  private async presentLargeWin(multiplier: number, amountCents: number) {
    const maxWin = isMaxWin(multiplier, MAX_WIN_MULTIPLIER);
    this.setState(maxWin ? "MAX_WIN" : "BIG_WIN");
    this.message(`${maxWin ? "MAX WIN" : winTier(multiplier)} // ${multiplier.toFixed(2)}x`);
    this.scene.sparkle();
    this.audio.bigWin();
    this.audio.duckMusic(true);
    try {
      await this.showBigWin(multiplier, amountCents, maxWin ? "MAX WIN" : undefined);
    } finally {
      this.audio.duckMusic(false);
    }
  }
  private async presentCurrentFreeSpinResolution(freeSpin: SpinResult["freeSpins"][number]) {
    this.freeSpinAccounting = resolveFreeSpinAccounting(
      this.freeSpinAccounting,
      freeSpin.rawWinMultiplier,
      freeSpin.combinedCoreMultiplier,
      0,
      this.betCents,
    );
    this.ui.freeSpinCalculation.classList.add("is-resolving");
    this.updateCurrentFreeSpinDisplay();
    await sleep(this.duration(360, true));
    this.pulseFreeSpinEquation();
    this.audio.freeSpinResolve();
    await sleep(this.duration(260, true));
    const target = freeSpin.win;
    await animateValue(0, target, this.duration(720, true), (value) => {
      this.freeSpinAccounting = {
        ...this.freeSpinAccounting,
        currentSpinWinCents: Math.round(value),
      };
      this.ui.freeSpinFinalWin.textContent = formatWinDetailCredits(Math.round(value));
    });
    this.freeSpinAccounting = resolveFreeSpinAccounting(
      this.freeSpinAccounting,
      freeSpin.rawWinMultiplier,
      freeSpin.combinedCoreMultiplier,
      target,
      this.betCents,
    );
    this.updateCurrentFreeSpinDisplay();
    this.ui.freeSpinCalculation.classList.remove("is-resolving");
  }
  showBigWin(multiplier: number, amountCents: number, forcedTier?: string) {
    return new Promise<void>((resolve) => {
      const overlay = this.ui.bigWinOverlay;
      const tier = forcedTier ?? winTier(multiplier);
      const tierClass = tier.split(" ")[0].toLowerCase();
      overlay.className = "big-win-overlay is-visible";
      overlay.innerHTML = `<div class="big-win-card tier-${tierClass}"><span class="big-win-kicker">REWARD CEREMONY</span><div class="big-win-tier"><i>✦</i><span>${tier}</span><i>✦</i></div><div class="big-win-amount-wrap"><strong class="big-win-amount is-counting">$0.00</strong></div><div class="big-win-summary"><span>TOTAL WIN</span><b>${multiplier.toFixed(2)}x BET</b></div><button class="big-win-action" type="button">TAP TO SPEED UP</button></div>`;
      let counting = true;
      let closed = false;
      let value = 0;
      const target = amountCents / 100;
      const button = overlay.querySelector("button") as HTMLButtonElement;
      const card = overlay.querySelector(".big-win-card") as HTMLElement;
      const amount = overlay.querySelector(".big-win-amount") as HTMLElement;
       const responsiveAmount = mountResponsiveWinAmount(amount, formatCredits(amountCents), {
         maxFontSize: 148,
         minFontSize: 22,
       });
      const finishCounting = () => {
        counting = false;
        value = target;
        amount.textContent = formatCredits(Math.round(value * 100));
        amount.classList.remove("is-counting");
        amount.classList.add("is-complete");
        card.classList.add("is-complete");
        button.textContent = "TAP TO CONTINUE";
        button.classList.add("is-ready");
      };
      const close = () => {
        if (closed) return;
        closed = true;
         responsiveAmount.destroy();
        overlay.removeEventListener("pointerdown", onPointer);
        overlay.classList.remove("is-visible");
        overlay.innerHTML = "";
        resolve();
      };
      const onPointer = () => { if (counting) finishCounting(); else close(); };
      overlay.addEventListener("pointerdown", onPointer);
      const tick = () => {
        if (closed || !counting) return;
         value = Math.min(target, value + Math.max(target / 36, 0.01));
         amount.textContent = formatCredits(Math.round(value * 100));
        if (value >= target) finishCounting(); else window.setTimeout(tick, 42);
      };
      tick();
    });
  }
  private showBonusSummary(result: SpinResult) {
    return new Promise<void>((resolve) => {
      const overlay = this.ui.bonusSummaryOverlay;
      overlay.className = "bonus-summary-overlay is-visible";
       const formattedTotal = formatCredits(result.bonusWinCents);
       overlay.innerHTML = `<div class="bonus-summary-card"><span class="bonus-eyebrow">GOLDEN REALM</span><h2>BONUS COMPLETE</h2><span class="summary-label">TOTAL BONUS WIN</span><div class="summary-total responsive-win-amount">${formattedTotal}</div><small>${result.freeSpins.length} FREE SPINS // ${result.freeSpins.reduce((sum, spin) => sum + spin.tumbles.length, 0)} TUMBLES</small><button type="button">CONTINUE</button></div>`;
       const amount = overlay.querySelector(".summary-total") as HTMLElement;
       const responsiveAmount = mountResponsiveWinAmount(amount, formattedTotal, {
         maxFontSize: 118,
         minFontSize: 22,
       });
       const close = () => {
         responsiveAmount.destroy();
         overlay.classList.remove("is-visible");
         overlay.innerHTML = "";
         resolve();
       };
      overlay.querySelector("button")?.addEventListener("click", close, { once: true });
    });
  }
}

export function formatCredits(cents: number) {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: Math.abs(dollars) >= 10_000 ? 0 : 2,
    maximumFractionDigits: Math.abs(dollars) >= 10_000 ? 0 : 2,
  })}`;
}

export function formatTumbleCredits(cents: number) {
  return formatWinDetailCredits(cents);
}

export function formatWinDetailCredits(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function isFreeBetCents(betCents: number) {
  return betCents === FREE_BET_CENTS;
}

export function canAffordBet(balanceCents: number, betCents: number) {
  return isFreeBetCents(betCents) || balanceCents >= betCents;
}
