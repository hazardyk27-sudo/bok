import { ANIMATION, BETS_CENTS, MAX_WIN_MULTIPLIER, STARTING_BALANCE_CENTS, getSymbolDefinition } from "../config/GameConfig";
import { CryptoRNG } from "../engine/RNG";
import { playBaseSpin, playFreeSpin } from "../engine/SlotEngine";
import type { SpinResult } from "../engine/types";
import { AudioManager } from "./AudioManager";
import { GameScene } from "./GameScene";

type ControllerState = "BOOT" | "IDLE" | "SPIN_INIT" | "INITIAL_DROP" | "EVALUATING" | "WIN_HIGHLIGHT" | "WIN_EXPLOSION" | "GRAVITY" | "REFILL" | "CASCADE_DROP" | "BONUS_AWARD_PRESENTATION" | "BONUS_WAITING_FOR_START" | "BONUS_INTRO" | "FREE_SPIN_PLAY" | "CORE_REVEAL" | "BIG_WIN" | "MAX_WIN" | "BONUS_SUMMARY" | "SPIN_COMPLETE";

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class GameController {
  state: ControllerState = "BOOT";
  balanceCents = STARTING_BALANCE_CENTS;
  betIndex = 2;
  currentWinCents = 0;
  bonusWinCents = 0;
  turbo = localStorage.getItem("cascade8-turbo") === "true";
  reducedMotion = localStorage.getItem("cascade8-reduced-motion") === "true";
  freeSpinsLeft = 0;
  private busy = false;
  private pendingBonusResult: SpinResult | null = null;
  private pendingBonusSource: CryptoRNG | null = null;
  private autoRunning = false;
  private autoRemaining = 0;
  readonly audio = new AudioManager();
  private readonly scene: GameScene;
  private readonly ui: {
    balance: HTMLElement; bet: HTMLElement; win: HTMLElement; bonusWin: HTMLElement; freeSpins: HTMLElement;
    tumble: HTMLElement; status: HTMLElement; spin: HTMLButtonElement; spinLabel: HTMLElement; betMinus: HTMLButtonElement; betPlus: HTMLButtonElement;
    autoCount: HTMLSelectElement; autoStart: HTMLButtonElement; autoStatus: HTMLElement;
     turbo: HTMLButtonElement; sound: HTMLButtonElement; bonusOverlay: HTMLElement; tumbleSymbolWin: HTMLElement; tumbleIncrement: HTMLElement; tumbleMeta: HTMLElement; tumbleSettlement: HTMLElement; tumblePanel: HTMLElement; bigWinOverlay: HTMLElement; bonusSummaryOverlay: HTMLElement; boardWrap: HTMLElement;
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
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.ui.setModal(null);
      if (event.code === "Space" && !event.repeat && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault(); void this.spin();
      }
    });
  }

  get betCents() { return BETS_CENTS[this.betIndex]; }
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
      this.setState("BONUS_AWARD_PRESENTATION");
      this.message(`${result.freeSpinsAwarded} FREE SPINS READY // PRESS SPIN`);
      this.audio.bonus();
      this.audio.scatterCelebration(result.scatterCount);
      this.scene.sparkle();
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
    this.audio.crossfadeMusic(this.audio.musicVolume * 1.35);
    this.ui.boardWrap.classList.add("free-spin-mode");
    this.setState("BONUS_INTRO");
    this.message("BONUS REALM // FREE SPINS");
    await sleep(this.duration(700));
    let remaining = result.freeSpinsAwarded;
    let usedMultiplier = result.totalMultiplier;
    let index = 0;
    this.updateHud();
    while (remaining > 0 && usedMultiplier < MAX_WIN_MULTIPLIER) {
      index += 1;
      const freeSpin = playFreeSpin(index, this.betCents, source, MAX_WIN_MULTIPLIER - usedMultiplier);
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
      this.currentWinCents = result.totalWinCents;
      this.bonusWinCents = result.bonusWinCents;
      remaining = remaining - 1 + freeSpin.retriggered;
      this.freeSpinsLeft = remaining;
      this.updateHud();
      if (freeSpin.retriggered) {
        this.message(`+${freeSpin.retriggered} FREE SPINS`);
        this.updateHud();
        await sleep(this.duration(450));
      }
    }
    this.setState("BONUS_SUMMARY"); this.message(`BONUS COMPLETE // ${formatCredits(result.bonusWinCents)}`);
    this.audio.bonusComplete();
    await this.showBonusSummary(result);
    this.freeSpinsLeft = 0;
    this.scene.setFreeSpinMode(false);
    this.audio.crossfadeMusic(this.audio.musicVolume);
    this.ui.boardWrap.classList.remove("free-spin-mode");
    await this.finishSpin(result);
  }

  private async finishSpin(result: SpinResult) {
    this.currentWinCents = result.totalWinCents;
    if (result.maxWinReached) { this.setState("MAX_WIN"); this.message("MAX WIN // 5000x"); this.scene.sparkle(); await this.showBigWin(MAX_WIN_MULTIPLIER, result.totalWinCents, "MAX WIN"); }
    else if (result.totalMultiplier >= 10) {
      this.setState("BIG_WIN"); this.message(`${winTier(result.totalMultiplier)} // ${result.totalMultiplier.toFixed(2)}x`);
      this.scene.sparkle(); this.audio.bigWin(); this.audio.duckMusic(true);
      await this.showBigWin(result.totalMultiplier, result.totalWinCents);
      this.audio.duckMusic(false);
    }
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
      if (this.autoRunning) await sleep(this.duration(250));
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
      this.message(tumble.multiplierCores.length ? "MULTIPLIER CORES ARE CHARGING" : winningMessage);
      this.setState("WIN_HIGHLIGHT"); this.audio.win();
      await this.scene.highlightCells(tumble.winningCells, this.duration(ANIMATION.winHighlight));
      this.setState(tumble.multiplierCores.length ? "CORE_REVEAL" : "WIN_EXPLOSION");
      if (tumble.multiplierCores.length) {
        this.message(`${tumble.multiplierCores.map((core) => `${core.value}x`).join(" + ")} // CORE TOTAL ${tumble.coreTotalMultiplier}x`);
      this.audio.core(tumble.coreTotalMultiplier, isBonus);
        await this.scene.activateMultiplierCores(tumble.multiplierCores.map((core) => core.value), this.duration(ANIMATION.freeSpinPause));
        await sleep(this.duration(ANIMATION.freeSpinPause));
      }
      await this.scene.burstCells(tumble.removedCells, this.duration(ANIMATION.burst));
       this.showTumbleWin(tumble, index + 1, isBonus);
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
  private setBonusPrompt(active: boolean) {
    this.ui.bonusOverlay.hidden = !active;
    this.ui.boardWrap.classList.toggle("free-spin-ready", active);
    this.ui.spin.classList.toggle("is-bonus", active);
    this.ui.spinLabel.textContent = active ? "START FREE SPINS" : "SPIN";
    this.ui.spin.querySelector("small")!.textContent = active ? "ENTER THE GOLDEN REALM" : "ENTER THE CASCADE";
  }
  private resetTumbleWin() {
    this.ui.tumblePanel.className = "tumble-win-panel";
    this.ui.tumbleSymbolWin.textContent = "";
    this.ui.tumble.textContent = "—";
    this.ui.tumbleIncrement.textContent = "";
    this.ui.tumbleMeta.textContent = "GOOD LUCK";
    this.ui.tumbleSettlement.innerHTML = "";
  }
  private showTumbleWin(tumble: SpinResult["tumbles"][number], tumbleIndex: number, isBonus: boolean) {
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
    this.ui.tumblePanel.className = `tumble-win-panel is-settling${isBonus ? " is-free-win" : ""}`;
    this.ui.tumbleSymbolWin.textContent = "";
    await this.scene.activateMultiplierCores(tumble.settlementCores.map((core) => core.value), this.duration(260));
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
  showBigWin(multiplier: number, amountCents: number, forcedTier?: string) {
    return new Promise<void>((resolve) => {
      const overlay = this.ui.bigWinOverlay;
      const tier = forcedTier ?? winTier(multiplier);
      overlay.className = "big-win-overlay is-visible";
      overlay.innerHTML = `<div class="big-win-card"><span>${tier}</span><strong>0.00</strong><small>${multiplier.toFixed(2)}x TOTAL WIN</small><button type="button">TAP TO SPEED UP</button></div>`;
      let counting = true;
      let closed = false;
      let value = 0;
      const target = amountCents / 100;
      const button = overlay.querySelector("button") as HTMLButtonElement;
      const finishCounting = () => {
        counting = false;
        value = target;
        (overlay.querySelector("strong") as HTMLElement).textContent = formatCredits(Math.round(value * 100));
        button.textContent = "TAP TO CONTINUE";
      };
      const close = () => {
        if (closed) return;
        closed = true;
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
        (overlay.querySelector("strong") as HTMLElement).textContent = value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (value >= target) finishCounting(); else window.setTimeout(tick, 42);
      };
      tick();
    });
  }
  private showBonusSummary(result: SpinResult) {
    return new Promise<void>((resolve) => {
      const overlay = this.ui.bonusSummaryOverlay;
      overlay.className = "bonus-summary-overlay is-visible";
      overlay.innerHTML = `<div class="bonus-summary-card"><span>GOLDEN REALM</span><h2>BONUS COMPLETE</h2><div class="summary-total">${formatCredits(result.bonusWinCents)}</div><small>${result.freeSpins.length} FREE SPINS // ${result.freeSpins.reduce((sum, spin) => sum + spin.tumbles.length, 0)} TUMBLES</small><button type="button">CONTINUE</button></div>`;
      const close = () => { overlay.classList.remove("is-visible"); overlay.innerHTML = ""; resolve(); };
      overlay.querySelector("button")?.addEventListener("click", close, { once: true });
    });
  }
  resetDemo() { this.balanceCents = STARTING_BALANCE_CENTS; this.persistBalance(); this.updateHud(); this.message("DEMO BALANCE RESET TO 10,000.00"); }
}

export function formatCredits(cents: number) {
  return (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function winTier(multiplier: number) {
  if (multiplier >= 500) return "COLOSSAL WIN";
  if (multiplier >= 100) return "LEGENDARY WIN";
  if (multiplier >= 50) return "EPIC WIN";
  if (multiplier >= 25) return "MEGA WIN";
  return "BIG WIN";
}