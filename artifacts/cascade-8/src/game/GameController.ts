import { ANIMATION, BETS_CENTS, STARTING_BALANCE_CENTS } from "../config/GameConfig";
import { CryptoRNG } from "../engine/RNG";
import { playSpin } from "../engine/SlotEngine";
import type { SpinResult } from "../engine/types";
import { AudioManager } from "./AudioManager";
import { GameScene } from "./GameScene";

type ControllerState = "BOOT" | "IDLE" | "SPIN_INIT" | "INITIAL_DROP" | "EVALUATING" | "WIN_HIGHLIGHT" | "WIN_EXPLOSION" | "GRAVITY" | "REFILL" | "CASCADE_DROP" | "BONUS_TRIGGER" | "BONUS_INTRO" | "FREE_SPIN_PLAY" | "CRYSTAL_REVEAL" | "BIG_WIN" | "MAX_WIN" | "BONUS_SUMMARY" | "SPIN_COMPLETE";

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
  readonly audio = new AudioManager();
  private readonly scene: GameScene;
  private readonly ui: {
    balance: HTMLElement; bet: HTMLElement; win: HTMLElement; bonusWin: HTMLElement; freeSpins: HTMLElement;
    tumble: HTMLElement; status: HTMLElement; spin: HTMLButtonElement; betMinus: HTMLButtonElement; betPlus: HTMLButtonElement;
    turbo: HTMLButtonElement; sound: HTMLButtonElement; setModal: (name: string | null) => void;
  };

  constructor(scene: GameScene, ui: GameController["ui"]) {
    this.scene = scene;
    this.ui = ui;
    this.balanceCents = Number(localStorage.getItem("cascade8-balance") ?? STARTING_BALANCE_CENTS);
    this.state = "IDLE";
    this.bind();
    this.updateHud();
  }

  private bind() {
    this.ui.spin.addEventListener("click", () => void this.spin());
    this.ui.betMinus.addEventListener("click", () => this.changeBet(-1));
    this.ui.betPlus.addEventListener("click", () => this.changeBet(1));
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
  private duration(value: number) { return this.reducedMotion ? 40 : this.turbo ? Math.round(value * 0.45) : value; }
  private setState(state: ControllerState) { this.state = state; this.ui.spin.disabled = this.busy || this.balanceCents < this.betCents; }
  private changeBet(direction: number) {
    if (this.busy) return;
    this.betIndex = Math.max(0, Math.min(BETS_CENTS.length - 1, this.betIndex + direction));
    this.audio.click(); this.updateHud();
  }
  private updateHud() {
    this.ui.balance.textContent = formatCredits(this.balanceCents);
    this.ui.bet.textContent = formatCredits(this.betCents);
    this.ui.win.textContent = formatCredits(this.currentWinCents);
    this.ui.bonusWin.textContent = formatCredits(this.bonusWinCents);
    this.ui.freeSpins.textContent = String(this.freeSpinsLeft);
    this.ui.turbo.classList.toggle("is-active", this.turbo);
    this.ui.sound.textContent = this.audio.muted ? "Sound off" : "Sound on";
    this.ui.sound.classList.toggle("is-active", !this.audio.muted);
    this.ui.spin.disabled = this.busy || this.balanceCents < this.betCents;
    this.ui.betMinus.disabled = this.busy || this.betIndex === 0;
    this.ui.betPlus.disabled = this.busy || this.betIndex === BETS_CENTS.length - 1;
  }
  updateForModal() { this.updateHud(); }
  private message(value: string) { this.ui.status.textContent = value; }

  async spin() {
    if (this.busy || this.balanceCents < this.betCents) {
      if (!this.busy && this.balanceCents < this.betCents) this.message("INSUFFICIENT DEMO CREDITS");
      return;
    }
    this.busy = true; this.currentWinCents = 0; this.bonusWinCents = 0; this.freeSpinsLeft = 0;
    this.setState("SPIN_INIT"); this.balanceCents -= this.betCents; this.persistBalance(); this.audio.spin(); this.updateHud();
    const result = playSpin(this.betCents, new CryptoRNG());
    this.message("THE GATES ARE OPENING");
    this.setState("INITIAL_DROP");
    this.scene.renderBoard(result.initialBoard);
    await this.scene.animateDrop(this.duration(ANIMATION.initialDrop));
    await this.playTumbles(result, false);
    if (result.bonusTriggered && !result.maxWinReached) {
      this.setState("BONUS_TRIGGER"); this.message(`${result.freeSpinsAwarded} FREE SPINS AWARDED`); this.audio.bonus(); this.scene.sparkle();
      await sleep(this.duration(700)); this.freeSpinsLeft = result.freeSpins.length; this.updateHud();
      this.setState("BONUS_INTRO"); this.message("BONUS REALM // FREE SPINS");
      await sleep(this.duration(500));
      for (const freeSpin of result.freeSpins) {
        this.freeSpinsLeft = result.freeSpins.length - freeSpin.index + 1;
        this.setState("FREE_SPIN_PLAY"); this.updateHud();
        this.scene.renderBoard(freeSpin.initialBoard);
        await this.scene.animateDrop(this.duration(ANIMATION.initialDrop));
        await this.playTumbles({ ...result, tumbles: freeSpin.tumbles }, true);
        if (freeSpin.retriggered) {
          this.message(`+${freeSpin.retriggered} FREE SPINS`);
          this.freeSpinsLeft += freeSpin.retriggered;
          this.updateHud();
          await sleep(this.duration(450));
        }
      }
      this.setState("BONUS_SUMMARY"); this.message(`BONUS COMPLETE // ${formatCredits(result.bonusWinCents)}`);
      await sleep(this.duration(900)); this.freeSpinsLeft = 0;
    }
    this.currentWinCents = result.totalWinCents;
    if (result.maxWinReached) { this.setState("MAX_WIN"); this.message("MAX WIN // 5000x"); this.scene.sparkle(); await sleep(this.duration(900)); }
    else if (result.totalMultiplier >= 10) { this.setState("BIG_WIN"); this.message(`${winTier(result.totalMultiplier)} // ${result.totalMultiplier.toFixed(2)}x`); this.scene.sparkle(); await sleep(this.duration(700)); }
    this.balanceCents += result.totalWinCents; this.persistBalance();
    this.setState("SPIN_COMPLETE"); this.message(result.totalWinCents ? "SPIN COMPLETE // COLLECTED" : "NO WIN // NEXT GATE AWAITS");
    this.busy = false; this.setState("IDLE"); this.updateHud();
  }

  private async playTumbles(result: Pick<SpinResult, "tumbles">, isBonus: boolean) {
    for (let index = 0; index < result.tumbles.length; index += 1) {
      const tumble = result.tumbles[index];
      this.setState("EVALUATING");
      this.ui.tumble.textContent = index === 0 ? "—" : `TUMBLE ${index + 1}`;
      this.scene.renderBoard(tumble.boardBefore, tumble.winningCells);
      this.message(isBonus && tumble.crystals.length ? "CRYSTALS ARE GATHERING" : `${tumble.winningSymbols.join(" + ")} RESONATE`);
      this.setState("WIN_HIGHLIGHT"); this.audio.win();
      await this.scene.highlightCells(tumble.winningCells, this.duration(ANIMATION.winHighlight));
      this.setState(tumble.crystals.length ? "CRYSTAL_REVEAL" : "WIN_EXPLOSION");
      if (tumble.crystals.length) {
        this.message(`${tumble.crystals.join("x + ")}x // TOTAL ${tumble.crystalTotalMultiplier}x`);
        await sleep(this.duration(ANIMATION.freeSpinPause));
      }
      await this.scene.burstCells(tumble.winningCells, this.duration(ANIMATION.burst));
      this.currentWinCents += Math.round(tumble.finalPayoutMultiplier * this.betCents);
      if (isBonus) this.bonusWinCents += Math.round(tumble.finalPayoutMultiplier * this.betCents);
      this.updateHud();
      this.setState("REFILL");
      this.scene.renderBoard(tumble.boardAfterRefill);
      this.setState("CASCADE_DROP");
      await this.scene.animateDrop(this.duration(ANIMATION.refill));
      this.message(index > 0 ? `TUMBLE ${index + 1} // ${formatCredits(this.currentWinCents)}` : `WIN // ${formatCredits(this.currentWinCents)}`);
    }
  }

  private persistBalance() { localStorage.setItem("cascade8-balance", String(this.balanceCents)); }
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