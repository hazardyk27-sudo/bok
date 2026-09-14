import { ANIMATION, BETS_CENTS, MAX_WIN_MULTIPLIER, STARTING_BALANCE_CENTS, getSymbolDefinition } from "../config/GameConfig";
import { CryptoRNG } from "../engine/RNG";
import {
  addFreeSpinSymbolWin,
  beginFreeSpinAccounting,
  createFreeSpinAccounting,
  playBaseSpin,
  playFreeSpin,
  resolveFreeSpinAccounting,
  settleFreeSpinAccounting,
} from "../engine/SlotEngine";
import type { Board, SpinResult } from "../engine/types";
import { AudioManager } from "./AudioManager";
import { renderBonusCeremony } from "./bonusCeremony";
import { GameScene } from "./GameScene";
import { mountResponsiveWinAmount } from "./ResponsiveWinAmount";

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
  reducedMotion = localStorage.getItem("cascade8-reduced-motion") === "true";
  freeSpinsLeft = 0;
  bonusTriggerScatterCount = 0;
  private busy = false;
  private pendingBonusResult: SpinResult | null = null;
  private pendingBonusSource: CryptoRNG | null = null;
  private pendingRetriggerContinue: (() => void) | null = null;
  private autoRunning = false;
  private autoRemaining = 0;
  readonly audio = new AudioManager();
  private readonly scene: GameScene;
  private readonly ui: {
    balance: HTMLElement; bet: HTMLElement; win: HTMLElement; bonusWin: HTMLElement; freeSpins: HTMLElement;
    tumble: HTMLElement; status: HTMLElement; spin: HTMLButtonElement; spinLabel: HTMLElement; betMinus: HTMLButtonElement; betPlus: HTMLButtonElement;
    autoCount: HTMLSelectElement; autoStart: HTMLButtonElement; autoStatus: HTMLElement;
     turbo: HTMLButtonElement; sound: HTMLButtonElement; bonusOverlay: HTMLElement; bonusStart: HTMLButtonElement; bonusSpinCount: HTMLElement; bonusScatterRow: HTMLElement; bonusTriggerLabel: HTMLElement; bonusTitle: HTMLElement; bonusSupport: HTMLElement; bonusInstruction: HTMLElement; freeSpinCalculation: HTMLElement; freeSpinRawWin: HTMLElement; freeSpinMultiplier: HTMLElement; freeSpinFinalWin: HTMLElement; freeSpinMultiplyOperator: HTMLElement; freeSpinEqualsOperator: HTMLElement; tumbleLabel: HTMLElement; tumbleSymbolWin: HTMLElement; tumbleIncrement: HTMLElement; tumbleMeta: HTMLElement; tumbleSettlement: HTMLElement; tumblePanel: HTMLElement; bigWinOverlay: HTMLElement; bonusSummaryOverlay: HTMLElement; boardWrap: HTMLElement;
    setModal: (name: string | null) => void;
  };

  constructor(scene: GameScene, ui: GameController["ui"]) {
    this.scene = scene;
    this.ui = ui;
    this.balanceCents = Number(localStorage.getItem("cascade8-balance") ?? STARTING_BALANCE_CENTS);
    this.state = "IDLE";
    this.bind();
    this.audio.startMusic();
    this.updateHud();
  }

  private bind() {
    this.ui.spin.addEventListener("click", () => void this.spin());
    this.ui.betMinus.addEventListener("click", () => this.changeBet(-1));
    this.ui.betPlus.addEventListener("click", () => this.changeBet(1));
    this.ui.autoCount.addEventListener("change", () => this.updateAutoStatus());
    this.ui.autoStart.addEventListener("click", () => void this.toggleAuto());
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
      if (event.key === "Escape") this.ui.setModal(null);
      if (event.code === "Space" && !event.repeat && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault(); void this.spin();
      }
    });
  }

  get betCents() { return BETS_CENTS[this.betIndex]; }
  get currentFreeSpinRawSymbolWin() { return this.freeSpinAccounting.rawSymbolWinCents; }
  get currentFreeSpinCombinedMultiplier() { return this.freeSpinAccounting.combinedCoreMultiplier; }
  get currentFreeSpinFinalWin() { return this.freeSpinAccounting.currentSpinWinCents; }
  get bonusCumulativeWinSoFar() { return this.freeSpinAccounting.cumulativeBonusWinCents; }
  private duration(value: number) {
    if (this.reducedMotion) return 40;
    const slowed = Math.round(value * 1.15);
    return this.turbo ? Math.round(slowed * 0.45) : slowed;
  }
  private setState(state: ControllerState) {
    this.state = state;
    this.ui.spin.disabled = this.busy || this.autoRunning || (!this.pendingBonusResult && this.balanceCents < this.betCents);
  }
  private changeBet(direction: number) {
    if (this.busy || this.autoRunning) return;
    this.betIndex = Math.max(0, Math.min(BETS_CENTS.length - 1, this.betIndex + direction));
    this.audio.click(); this.updateHud();
  }
  private updateHud() {
    this.ui.balance.textContent = formatCredits(this.balanceCents);
    this.ui.bet.textContent = formatCredits(this.betCents);
    document.querySelectorAll<HTMLElement>("[data-bet-display]").forEach((element) => {
      element.textContent = formatCredits(this.betCents);
    });
    this.ui.win.textContent = formatCredits(this.currentWinCents);
    this.ui.bonusWin.textContent = formatCredits(this.bonusWinCents);
    this.ui.freeSpins.textContent = String(this.freeSpinsLeft);
    this.ui.turbo.classList.toggle("is-active", this.turbo);
    this.ui.sound.textContent = this.audio.muted ? "Sound off" : "Sound on";
    this.ui.sound.classList.toggle("is-active", !this.audio.muted);
    this.ui.spin.disabled = this.busy || this.autoRunning || (!this.pendingBonusResult && this.balanceCents < this.betCents);
    this.ui.betMinus.disabled = this.busy || this.betIndex === 0;
    this.ui.betPlus.disabled = this.busy || this.betIndex === BETS_CENTS.length - 1;
    this.ui.autoCount.disabled = this.busy || this.autoRunning || Boolean(this.pendingBonusResult);
    this.ui.autoStart.disabled = (this.busy && !this.autoRunning) || Boolean(this.pendingBonusResult);
    this.ui.autoStart.textContent = this.autoRunning ? "STOP" : "START AUTO";
    this.ui.autoStart.classList.toggle("is-running", this.autoRunning);
    this.updateAutoStatus();
  }
  updateForModal() { this.updateHud(); }
  private message(value: string) { this.ui.status.textContent = value; }

  async spin(fromAuto = false) {
    if (this.autoRunning && !fromAuto) return;
    if (this.pendingBonusResult) {
      await this.startFreeSpins();
      return;
    }
    if (this.busy || this.balanceCents < this.betCents) {
      if (!this.busy && this.balanceCents < this.betCents) this.message("INSUFFICIENT DEMO CREDITS");
      return;
    }
     this.busy = true; this.currentWinCents = 0; this.bonusWinCents = 0; this.freeSpinsLeft = 0;
     this.resetTumbleWin();
    this.setBonusPrompt(false);
    this.setState("SPIN_INIT"); this.balanceCents -= this.betCents; this.persistBalance(); this.audio.spin(); this.updateHud();
    const source = new CryptoRNG();
    const result = playBaseSpin(this.betCents, source);
    this.message("THE GATES ARE OPENING");
    this.setState("INITIAL_DROP");
    this.scene.renderBoard(result.initialBoard);
    if (result.scatterCount > 0) {
      this.audio.scatterAnticipation(result.scatterCount);
       this.audio.scatterArrival(result.scatterCount);
    }
    await this.scene.animateDrop(this.duration(ANIMATION.initialDrop));
    await this.playTumbles(result, false);
    this.currentWinCents = result.baseWinCents;
    this.updateHud();
     if (result.bonusTriggered && !result.maxWinReached) {
      this.pendingBonusResult = result;
      this.pendingBonusSource = source;
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
    const source = this.pendingBonusSource;
    if (!result || !source) return;
    this.pendingBonusResult = null;
    this.pendingBonusSource = null;
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
    let usedMultiplier = result.totalMultiplier;
    let index = 0;
    this.updateHud();
    while (remaining > 0 && usedMultiplier < MAX_WIN_MULTIPLIER) {
      if (index > 0) await sleep(this.duration(ANIMATION.spinPause));
      index += 1;
      const freeSpin = playFreeSpin(index, this.betCents, source, MAX_WIN_MULTIPLIER - usedMultiplier);
       this.resetCurrentFreeSpinDisplay(index);
      result.freeSpins.push(freeSpin);
      result.totalMultiplierEvents.push(...freeSpin.tumbles.map((tumble) => tumble.finalPayoutMultiplier));
      usedMultiplier += freeSpin.finalWinMultiplier;
      result.bonusRawWinMultiplier += freeSpin.rawWinMultiplier;
      result.bonusWinCents = Math.round((usedMultiplier - result.baseWinCents / this.betCents) * this.betCents);
      result.totalMultiplier = usedMultiplier;
      result.totalWinCents = Math.round(usedMultiplier * this.betCents);
      result.maxWinReached = usedMultiplier >= MAX_WIN_MULTIPLIER;
      this.freeSpinsLeft = remaining;
      this.setState("FREE_SPIN_PLAY"); this.updateHud();
      this.scene.renderBoard(freeSpin.initialBoard);
      if (freeSpin.scatterCount > 0) {
        this.audio.scatterAnticipation(freeSpin.scatterCount);
         this.audio.scatterArrival(freeSpin.scatterCount);
        this.audio.scatterCelebration(freeSpin.scatterCount);
      }
      await this.scene.animateDrop(this.duration(ANIMATION.initialDrop));
      await this.playTumbles({ ...result, tumbles: freeSpin.tumbles }, true);
      if (freeSpin.win === 0) {
        this.resolveZeroWinFreeSpin(freeSpin);
        await sleep(this.duration(260));
      } else {
        await this.presentCurrentFreeSpinResolution(freeSpin);
        if (freeSpin.finalWinMultiplier >= 10) {
          this.setState(freeSpin.finalWinMultiplier >= MAX_WIN_MULTIPLIER ? "MAX_WIN" : "BIG_WIN");
          this.message(`${freeSpin.finalWinMultiplier >= MAX_WIN_MULTIPLIER ? "MAX WIN" : winTier(freeSpin.finalWinMultiplier)} // ${freeSpin.finalWinMultiplier.toFixed(2)}x`);
          this.scene.sparkle();
          this.audio.bigWin();
          this.audio.duckMusic(true);
          await this.showBigWin(
            freeSpin.finalWinMultiplier,
            freeSpin.win,
            freeSpin.finalWinMultiplier >= MAX_WIN_MULTIPLIER ? "MAX WIN" : undefined,
          );
          this.audio.duckMusic(false);
        }
        await sleep(this.duration(220));
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
        await sleep(this.duration(360));
      }
      this.currentWinCents = result.totalWinCents;
      this.bonusWinCents = result.bonusWinCents;
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
    await this.finishSpin(result);
  }

  private async finishSpin(result: SpinResult) {
    this.currentWinCents = result.totalWinCents;
    if (result.maxWinReached) this.setState("MAX_WIN");
    else if (result.totalMultiplier >= 10) this.setState("BIG_WIN");
    this.balanceCents += result.totalWinCents; this.persistBalance();
    this.setState("SPIN_COMPLETE"); this.message(result.totalWinCents ? "SPIN COMPLETE // COLLECTED" : "NO WIN // NEXT GATE AWAITS");
    this.busy = false; this.setState("IDLE"); this.updateHud();
  }

  private async toggleAuto() {
    if (this.autoRunning) {
      this.autoRunning = false;
      this.message("AUTO STOPPING // CURRENT SPIN FINISHES");
      this.updateHud();
      return;
    }
    if (this.busy || this.pendingBonusResult || this.balanceCents < this.betCents) {
      if (this.balanceCents < this.betCents) this.message("INSUFFICIENT DEMO CREDITS");
      return;
    }
    this.autoRunning = true;
    this.autoRemaining = Number(this.ui.autoCount.value);
    this.updateHud();
    await this.runAuto();
  }

  private async runAuto() {
    while (this.autoRunning && this.autoRemaining > 0) {
      if (this.balanceCents < this.betCents) {
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
      if (this.autoRunning) await sleep(this.duration(ANIMATION.spinPause));
    }
    if (this.autoRunning) {
      this.autoRunning = false;
      this.message("AUTO COMPLETE // ALL SPINS FINISHED");
    }
    this.updateHud();
  }

  private updateAutoStatus() {
    if (!this.ui.autoStatus) return;
    const selected = Number(this.ui.autoCount.value);
    this.ui.autoStatus.textContent = this.autoRunning
      ? `${this.autoRemaining} LEFT / BET ${formatCredits(this.betCents)}`
      : `BET ${formatCredits(this.betCents)} / ${selected} READY`;
  }

  private async playTumbles(result: Pick<SpinResult, "tumbles">, isBonus: boolean) {
    for (let index = 0; index < result.tumbles.length; index += 1) {
      const tumble = result.tumbles[index];
      this.setState("EVALUATING");
      this.scene.renderBoard(tumble.boardBefore, tumble.winningCells);
      const winningMessage = `${tumble.winningSymbols.map((symbol) => getSymbolDefinition(symbol).name).join(" + ")} RESONATE`;
       this.message(tumble.multiplierCores.length ? `${winningMessage} // CORES BANKED` : winningMessage);
      this.setState("WIN_HIGHLIGHT"); this.audio.win();
      await this.scene.highlightCells(tumble.winningCells, this.duration(ANIMATION.winHighlight));
       this.setState("WIN_EXPLOSION");
      await this.scene.burstCells(tumble.removedCells, this.duration(ANIMATION.burst));
      await this.showTumbleWin(tumble, index + 1, isBonus);
      this.updateHud();
      this.setState("REFILL");
      this.setState("CASCADE_DROP");
      await this.scene.animateCascade(tumble.boardAfterRefill, tumble.removedCells, this.duration(ANIMATION.refill));
      this.message(index > 0 ? `TUMBLE ${index + 1} // RAW ${tumble.rawWinPoolAfter.toFixed(2)}x` : `WIN // RAW ${tumble.rawWinPoolAfter.toFixed(2)}x`);
    }
    const last = result.tumbles.at(-1);
    if (last) await this.presentSequenceSettlement(last, isBonus);
  }

  private persistBalance() { localStorage.setItem("cascade8-balance", String(this.balanceCents)); }
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
    this.ui.tumbleMeta.textContent = "GOOD LUCK";
    this.ui.tumbleSettlement.innerHTML = "";
  }
  private setFreeSpinPresentation(active: boolean) {
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
      : `+${formatCredits(amountCents)}`;
    flight.style.left = `${startX}px`;
    flight.style.top = `${startY}px`;
    flight.style.setProperty("--flight-x", `${targetRect.left + targetRect.width / 2 - startX}px`);
    flight.style.setProperty("--flight-y", `${targetRect.top + targetRect.height / 2 - startY}px`);
    flight.style.animationDuration = `${this.duration(milliseconds)}ms`;
    document.body.appendChild(flight);
    await sleep(this.duration(milliseconds));
    flight.remove();
    this.pulseFreeSpinValue(target);
  }
  private updateCurrentFreeSpinDisplay() {
    const raw = formatCredits(this.freeSpinAccounting.rawSymbolWinCents);
    const multiplier = this.multiplierLabel(this.freeSpinAccounting.combinedCoreMultiplier);
    const final = formatCredits(this.freeSpinAccounting.currentSpinWinCents);
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
    this.ui.tumblePanel.className = `tumble-win-panel is-active is-free-total${isIncrement ? " is-total-updated" : ""}`;
    this.ui.tumbleLabel.textContent = "TOTAL BONUS WIN";
     this.ui.tumble.textContent = formatCredits(this.freeSpinAccounting.cumulativeBonusWinCents);
    this.ui.tumbleSymbolWin.textContent = "";
    this.ui.tumbleIncrement.textContent = isIncrement
      ? `+${formatCredits(this.freeSpinAccounting.currentSpinWinCents)}  //  THIS SPIN`
      : "";
    this.ui.tumbleMeta.textContent = "BONUS TOTAL // RUNNING WIN";
    this.ui.tumbleSettlement.innerHTML = "";
  }
  private async showTumbleWin(tumble: SpinResult["tumbles"][number], tumbleIndex: number, isBonus: boolean) {
    if (isBonus) {
      const rawIncrement = Math.round(tumble.rawPayoutMultiplier * this.betCents);
      this.ui.freeSpinCalculation.classList.add("is-collecting");
      await this.animateFreeSpinFlight("raw", rawIncrement, this.ui.boardWrap, this.ui.freeSpinRawWin, 380);
      this.audio.freeSpinRawCollect();
      this.freeSpinAccounting = addFreeSpinSymbolWin(
         this.freeSpinAccounting,
        rawIncrement,
      );
      this.updateCurrentFreeSpinDisplay();
      this.ui.freeSpinCalculation.classList.remove("is-collecting");
      this.updateBonusTotalDisplay(false);
      return;
    }
    this.ui.tumblePanel.className = `tumble-win-panel is-active${isBonus ? " is-free-win" : ""}`;
    this.ui.tumbleSymbolWin.textContent = tumble.winningSymbols
      .map((symbol) => `${getSymbolDefinition(symbol).name} +${formatCredits(Math.round((tumble.payouts[symbol] ?? 0) * this.betCents))}`)
      .join("  ·  ");
    this.ui.tumble.textContent = formatCredits(Math.round(tumble.rawWinPoolAfter * this.betCents));
    this.ui.tumbleIncrement.textContent = `+${formatCredits(Math.round(tumble.rawPayoutMultiplier * this.betCents))}  //  ${tumble.rawPayoutMultiplier.toFixed(2)}x`;
    this.ui.tumbleMeta.textContent = `TUMBLE ${tumbleIndex}  //  RAW POOL ${tumble.rawWinPoolAfter.toFixed(2)}x`;
  }
  private async presentSequenceSettlement(tumble: SpinResult["tumbles"][number], isBonus: boolean) {
    if (tumble.finalPayoutMultiplier <= tumble.rawWinPoolAfter || !tumble.settlementCores.length) return;
    const rawAmount = formatCredits(Math.round(tumble.rawWinPoolAfter * this.betCents));
    const coreText = tumble.settlementCores.map((core) => `${core.value}x`).join(" + ");
    const total = tumble.coreTotalMultiplier;
    if (isBonus) {
      const coreValues = tumble.settlementCores.map((core) => core.value);
      await this.scene.activateMultiplierCores(coreValues, this.duration(360));
      this.audio.core(total, true);
      await Promise.all(coreValues.map((value) =>
        this.animateFreeSpinFlight("multiplier", value, this.ui.boardWrap, this.ui.freeSpinMultiplier, 360),
      ));
      this.freeSpinAccounting = { ...this.freeSpinAccounting, combinedCoreMultiplier: total };
      this.updateCurrentFreeSpinDisplay();
      await sleep(this.duration(160));
      for (const core of tumble.settlementCores) {
        await this.scene.dissolveMultiplierCore(core.value, this.duration(220));
      }
      return;
    }
    this.ui.tumblePanel.className = `tumble-win-panel is-settling${isBonus ? " is-free-win" : ""}`;
    this.ui.tumbleSymbolWin.textContent = "";
    await this.scene.activateMultiplierCores(tumble.settlementCores.map((core) => core.value), this.duration(260));
    this.audio.core(total, false);
    this.ui.tumbleSettlement.innerHTML = `<span>CORES ACTIVATE</span><strong>${coreText}</strong><small>TOTAL MULTIPLIER ${total}x</small>`;
    await sleep(this.duration(380));
    this.ui.tumbleSettlement.innerHTML = `<span>SEQUENCE CALCULATION</span><strong>${rawAmount} × ${total}</strong><small>RAW TUMBLE WIN × TOTAL MULTIPLIER</small>`;
    await sleep(this.duration(470));
    this.ui.tumble.textContent = formatCredits(Math.round(tumble.finalPayoutMultiplier * this.betCents));
    this.ui.tumbleIncrement.textContent = `FINAL +${formatCredits(Math.round(tumble.finalPayoutMultiplier * this.betCents))}`;
    this.ui.tumbleMeta.textContent = `FINAL TUMBLE WIN  //  ${tumble.finalPayoutMultiplier.toFixed(2)}x`;
    this.ui.tumbleSettlement.innerHTML = "";
    await sleep(this.duration(420));
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
      const increment = index === 0 ? values[0] : values[index] - values[index - 1];
      this.ui.tumblePanel.className = "tumble-win-panel is-active";
      this.ui.tumbleSymbolWin.textContent = "SYMBOL WIN PREVIEW";
      this.ui.tumble.textContent = formatCredits(Math.round(values[index] * this.betCents));
      this.ui.tumbleIncrement.textContent = `+${formatCredits(Math.round(increment * this.betCents))}  //  ${increment.toFixed(2)}x`;
      this.ui.tumbleMeta.textContent = `TUMBLE ${index + 1}  //  RAW POOL ${values[index].toFixed(2)}x`;
      await sleep(this.duration(520));
    }
    if (withSettlement) {
      this.ui.tumblePanel.className = "tumble-win-panel is-settling";
      this.ui.tumbleSettlement.innerHTML = `<span>CORES ACTIVATE</span><strong>10x + 25x</strong><small>TOTAL MULTIPLIER 35x</small>`;
      await sleep(this.duration(380));
      this.ui.tumbleSettlement.innerHTML = `<span>SEQUENCE CALCULATION</span><strong>8.00 × 35</strong><small>FINAL TUMBLE WIN 280.00x</small>`;
      await sleep(this.duration(600));
      this.ui.tumbleSettlement.innerHTML = "";
      this.ui.tumbleMeta.textContent = "FINAL TUMBLE WIN  //  280.00x";
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
    await sleep(this.duration(420));
    this.freeSpinAccounting = addFreeSpinSymbolWin(this.freeSpinAccounting, 3_000);
    await this.animateFreeSpinFlight("raw", 3_000, this.ui.boardWrap, this.ui.freeSpinRawWin, 380);
    this.audio.freeSpinRawCollect();
    this.updateCurrentFreeSpinDisplay();
    await sleep(this.duration(420));
    await this.animateFreeSpinFlight("multiplier", 5, this.ui.boardWrap, this.ui.freeSpinMultiplier, 420);
    this.audio.freeSpinMultiplierCollect(5);
    this.freeSpinAccounting = {
      ...this.freeSpinAccounting,
      combinedCoreMultiplier: 5,
    };
    this.updateCurrentFreeSpinDisplay();
    await sleep(this.duration(520));
    await this.animateFreeSpinFlight("multiplier", 10, this.ui.boardWrap, this.ui.freeSpinMultiplier, 420);
    this.audio.freeSpinMultiplierCollect(10);
    this.freeSpinAccounting = {
      ...this.freeSpinAccounting,
      combinedCoreMultiplier: 15,
    };
    this.updateCurrentFreeSpinDisplay();
    await sleep(this.duration(520));
    await this.presentCurrentFreeSpinResolution({
      rawWinMultiplier: 50,
      combinedCoreMultiplier: 15,
      win: 75_000,
    } as SpinResult["freeSpins"][number]);
    this.freeSpinAccounting = settleFreeSpinAccounting(this.freeSpinAccounting);
    this.audio.freeSpinTransfer();
    await this.animateFreeSpinFlight("transfer", 75_000, this.ui.freeSpinFinalWin, this.ui.tumble, 440);
    this.updateBonusTotalDisplay(true);
    await sleep(this.duration(360));
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
    await sleep(this.duration(260));
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
    await this.scene.animateDrop(this.duration(ANIMATION.initialDrop));
    await this.scene.presentBonusTriggerCeremony(cells, scatterCount);
    this.audio.scatterCelebration(scatterCount);
    this.audio.bonusUnlock(scatterCount);
    this.scene.bonusUnlockFlash();
    await sleep(this.duration(360));
    this.pendingRetriggerContinue = () => {};
    this.setBonusPrompt(true, "retrigger", 5);
    this.setState("BONUS_WAITING_FOR_START");
  }
  previewBaseLargeWin() {
    this.ui.bigWinOverlay.className = "big-win-overlay";
    this.ui.bigWinOverlay.innerHTML = "";
    this.message("BASE GAME LARGE WIN // COLLECTED WITHOUT OVERLAY");
  }
  previewBonusLargeWin(amountCents = 25_000) {
    this.scene.sparkle();
    this.audio.bigWin();
    void this.showBigWin(amountCents / this.betCents, amountCents);
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
    await sleep(this.duration(360));
    this.pulseFreeSpinEquation();
    this.audio.freeSpinResolve();
    await sleep(this.duration(260));
    const target = freeSpin.win;
    await animateValue(0, target, this.duration(720), (value) => {
      this.freeSpinAccounting = {
        ...this.freeSpinAccounting,
        currentSpinWinCents: Math.round(value),
      };
      this.ui.freeSpinFinalWin.textContent = formatCredits(Math.round(value));
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
      overlay.innerHTML = `<div class="big-win-card tier-${tierClass}"><span class="big-win-kicker">REWARD CEREMONY</span><div class="big-win-tier"><i>✦</i><span>${tier}</span><i>✦</i></div><div class="big-win-amount-wrap"><strong class="big-win-amount is-counting">0.00</strong></div><div class="big-win-summary"><span>TOTAL WIN</span><b>${multiplier.toFixed(2)}x BET</b></div><button class="big-win-action" type="button">TAP TO SPEED UP</button></div>`;
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
  resetDemo() { this.balanceCents = STARTING_BALANCE_CENTS; this.persistBalance(); this.updateHud(); this.message("DEMO BALANCE RESET TO 10,000.00"); }
}

export function formatCredits(cents: number) {
  return (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function winTier(multiplier: number) {
  if (multiplier >= 500) return "SUPER WIN";
  if (multiplier >= 100) return "LEGENDARY WIN";
  if (multiplier >= 50) return "EPIC WIN";
  if (multiplier >= 25) return "MEGA WIN";
  return "BIG WIN";
}