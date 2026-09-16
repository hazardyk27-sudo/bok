import {
  EUROPEAN_WHEEL_ORDER,
  FALLBACK_OUTER_RADIUS_RATIO,
  FALLBACK_POCKET_RADIUS_RATIO,
  getWheelAngle,
  getWheelLandingPlan,
} from "./rouletteGeometry";

type RoulettePhase = "OPEN" | "LAST_CALL" | "LOCKED" | "SPINNING" | "RESULT" | "MULTIPLIER_REVEAL" | "SETTLING" | "INTERMISSION";
type RouletteMultiplier = 50 | 100 | 150 | 200 | 250 | 300 | 400 | 500;
type RouletteBetType = "STRAIGHT" | "SPLIT" | "STREET" | "CORNER" | "SIX_LINE" | "DOZEN" | "COLUMN" | "RED" | "BLACK" | "ODD" | "EVEN" | "LOW" | "HIGH";
type RouletteSelection = { key: string; type: RouletteBetType; numbers: number[]; stakeCents: number; label: string };
type RouletteSnapshot = {
  serverTime: string;
  coordinator: "leader" | "standby";
  wallet: { sessionId: string; balanceCents: number; lastPayoutCents: number };
  round: {
    id: string;
    sequence: number;
    phase: RoulettePhase;
    phaseStartedAt: string;
    nextTransitionAt: string;
    bettingClosesAt: string;
    countdownMs: number;
    commitmentHash: string;
    winningNumber: number | null;
    luckyNumbers: number[];
    revealedMultipliers: RouletteMultiplier[];
    multipliersTotal: number;
    version: number;
    bets: Array<{
      type: RouletteBetType;
      numbers: number[];
      stakeCents: number;
      status: "ACCEPTED" | "WON" | "LOST";
      payoutCents: number;
      label: string;
    }>;
  };
};

export type RouletteAnimationSnapshot = Pick<RouletteSnapshot["round"], "id" | "phase" | "winningNumber">;

export function isRouletteResultSettled(
  snapshot: Pick<RouletteAnimationSnapshot, "id" | "winningNumber">,
  settledResultKey: string,
) {
  return snapshot.winningNumber !== null && settledResultKey === `${snapshot.id}:${snapshot.winningNumber}`;
}

export function getRouletteAnimationTransition(
  previous: RouletteAnimationSnapshot | null,
  next: RouletteAnimationSnapshot,
) {
  const startsSpin = next.phase === "SPINNING"
    && (previous?.phase !== "SPINNING" || previous.id !== next.id);
  const finishesSpin = next.winningNumber !== null
    && (previous?.winningNumber === null || previous?.id !== next.id || previous === null);

  return {
    startsSpin,
    winningNumber: finishesSpin ? next.winningNumber : null,
  };
}

const API_BASE = "/api/roulette";

export const ROULETTE_MOTION_TIMINGS = {
  rotorOrbitMs: 2050,
  ballOrbitMs: 980,
  landingDurationMs: 6100,
  resultRevealDelayMs: 6000,
  resultRevealDurationMs: 550,
} as const;
const PHASE_LABELS: Record<RoulettePhase, string> = {
  OPEN: "BAHİSLER AÇIK", LAST_CALL: "SON ÇAĞRI", LOCKED: "MASA KİLİTLENDİ",
  SPINNING: "ÇARK DÖNÜYOR", RESULT: "KAZANAN SAYI", MULTIPLIER_REVEAL: "MULTIPLIER REVEAL",
  SETTLING: "ÖDEME YAPILIYOR", INTERMISSION: "YENİ ROUND HAZIRLANIYOR",
};
const PHASE_ANNOUNCEMENT_LABELS: Record<RoulettePhase, string> = {
  OPEN: "Bahisler açık", LAST_CALL: "Son çağrı, bahisler kapanıyor",
  LOCKED: "Bahisler kapandı", SPINNING: "Çark dönüyor",
  RESULT: "Kazanan sayı açıklanıyor", MULTIPLIER_REVEAL: "Çarpanlar açıklanıyor",
  SETTLING: "Ödeme yapılıyor", INTERMISSION: "Yeni round hazırlanıyor",
};
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const MAX_BET_PER_AREA = 10_000;
const WHEEL_LANDING_DURATION_MS = ROULETTE_MOTION_TIMINGS.landingDurationMs;
const BALL_LANDING_DURATION_MS = ROULETTE_MOTION_TIMINGS.resultRevealDelayMs;
const formatCredits = (cents: number) => (cents / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatCountdown = (milliseconds: number) => {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

export function getRouletteResultResumeAction(
  phase: RouletteAnimationSnapshot["phase"],
  elapsedMs: number,
) {
  return phase === "RESULT" && Number.isFinite(elapsedMs) && elapsedMs < BALL_LANDING_DURATION_MS
    ? "resume"
    : "settle";
}

export type RouletteVisibilityResumeAction = "start-spin" | "resume-result" | "settle-result" | "noop";

export function getRouletteVisibilityResumeAction(
  snapshot: Pick<RouletteAnimationSnapshot, "phase" | "winningNumber">,
  elapsedMs: number,
): RouletteVisibilityResumeAction {
  if (snapshot.winningNumber === null) return snapshot.phase === "SPINNING" ? "start-spin" : "noop";
  return getRouletteResultResumeAction(snapshot.phase, elapsedMs) === "resume"
    ? "resume-result"
    : "settle-result";
}

export type RouletteAnimationLifecycleAction =
  | "start-spin"
  | "resume-spin"
  | "start-landing"
  | "resume-landing"
  | "settle"
  | "noop";

export function getRouletteAnimationLifecycleAction(
  previous: RouletteAnimationSnapshot | null,
  next: RouletteAnimationSnapshot,
  options: {
    visibilityResume: boolean;
    elapsedMs: number;
    activeSpinRoundId: string;
    animatedResultKey: string;
    settledResultKey: string;
  },
): { action: RouletteAnimationLifecycleAction; resultKey: string } {
  const resultKey = next.winningNumber === null ? "" : `${next.id}:${next.winningNumber}`;
  if (options.visibilityResume) {
    const resumeAction = getRouletteVisibilityResumeAction(next, options.elapsedMs);
    if (resumeAction === "start-spin") {
      return { action: options.activeSpinRoundId === next.id ? "resume-spin" : "start-spin", resultKey };
    }
    if (resumeAction === "resume-result") {
      if (options.settledResultKey === resultKey) return { action: "noop", resultKey };
      return { action: options.animatedResultKey === resultKey ? "resume-landing" : "start-landing", resultKey };
    }
    if (resumeAction === "settle-result") {
      return { action: options.settledResultKey === resultKey ? "noop" : "settle", resultKey };
    }
    return { action: "noop", resultKey };
  }

  const transition = getRouletteAnimationTransition(previous, next);
  if (transition.startsSpin) {
    return { action: options.activeSpinRoundId === next.id ? "resume-spin" : "start-spin", resultKey };
  }
  if (transition.winningNumber !== null && resultKey) {
    if (options.animatedResultKey === resultKey || options.settledResultKey === resultKey) {
      return { action: "noop", resultKey };
    }
    return { action: "start-landing", resultKey };
  }
  return { action: "noop", resultKey };
}

export function getRouletteLiveSummary(snapshot: Pick<RouletteSnapshot, "round">) {
  const { round } = snapshot;
  const result = round.winningNumber === null
    ? "Kazanan sayı henüz açıklanmadı."
    : `Kazanan sayı: ${round.winningNumber}.`;
  return `Round ${String(round.sequence).padStart(6, "0")}. ${PHASE_ANNOUNCEMENT_LABELS[round.phase]}. ${result}`;
}

class RouletteVoice {
  private enabled = false;
  private lastPhrase = "";
  private audioContext?: AudioContext;
  private spinTimer?: number;

  unlock() {
    this.enabled = true;
    this.ensureAudio();
    void this.audioContext?.resume();
    window.speechSynthesis?.cancel();
    this.cue("unlock");
    this.speak("Ses açıldı");
  }
  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      window.speechSynthesis?.cancel();
      this.stopSpin();
    } else {
      this.ensureAudio();
      void this.audioContext?.resume();
      this.cue("phase");
      this.speak("Türkçe seslendirme açık");
    }
    return this.enabled;
  }
  startSpin() {
    if (!this.enabled) return;
    this.stopSpin();
    this.cue("spin");
    this.spinTimer = window.setInterval(() => this.cue("tick"), 340);
  }
  stopSpin() {
    if (this.spinTimer) window.clearInterval(this.spinTimer);
    this.spinTimer = undefined;
  }
  cue(kind: "unlock" | "phase" | "spin" | "tick" | "bounce" | "reveal" | "land") {
    if (!this.enabled) return;
    const context = this.ensureAudio();
    if (!context) return;
    const now = context.currentTime;
    const presets = {
      unlock: [440, 0.11, 0.045, "sine"],
      phase: [220, 0.16, 0.035, "triangle"],
      spin: [92, 0.24, 0.028, "sawtooth"],
      tick: [132 + Math.random() * 34, 0.045, 0.018, "triangle"],
      bounce: [310, 0.07, 0.035, "square"],
      reveal: [520, 0.2, 0.05, "triangle"],
      land: [174, 0.3, 0.055, "sine"],
    } as const;
    const [frequency, duration, volume, type] = presets[kind];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, frequency * .72), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + .012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
  }
  private ensureAudio() {
    if (this.audioContext) return this.audioContext;
    const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return undefined;
    this.audioContext = new Context();
    return this.audioContext;
  }
  speak(phrase: string) {
    if (!this.enabled || !window.speechSynthesis || phrase === this.lastPhrase) return;
    this.lastPhrase = phrase;
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = "tr-TR";
    utterance.rate = 1.03;
    utterance.pitch = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
}

export class RouletteClient {
  private snapshot: RouletteSnapshot | null = null;

  private serverOffsetMs = 0;

  private socket?: WebSocket;

  private selectedChipCents = 100;

  private neighborMode = false;

  private selections = new Map<string, RouletteSelection>();

  private lastPlacedSelections: RouletteSelection[] = [];

  private undoStack: string[] = [];

  private betStatus = "";

  private roundId = "";

  private statusTimer?: number;

  private voice = new RouletteVoice();

  private ballAnimation?: Animation;

  private wheelAnimation?: Animation;

  private activeSpinRoundId = "";

  private labelSyncFrame?: number;

  private ballDropTimer?: number;

  private ballSoundTimers: number[] = [];

  private animatedResultKey = "";

  private settledResultKey = "";

  private liveSummaryKey = "";

  private wasDocumentHidden = false;

  private visibilityResumePending = false;

  private betSubmissionRoundId = "";

  private betSubmissionInFlightRoundId = "";

  private acceptedBetsRoundId = "";

  private betLockTimer?: number;

  private betLockTimerRoundId = "";

  private readonly root: HTMLElement;

  private readonly visibilityChangeHandler = () => {
    if (document.visibilityState === "hidden") {
      this.wasDocumentHidden = true;
      return;
    }
    if (!this.wasDocumentHidden) return;
    this.wasDocumentHidden = false;
    this.visibilityResumePending = true;
    void this.load().finally(() => {
      this.visibilityResumePending = false;
    });
  };

  constructor(root: HTMLElement) {
    this.root = root;
    applyRouletteMotionTimingContract(root);
    this.wasDocumentHidden = document.visibilityState === "hidden";
    document.addEventListener("visibilitychange", this.visibilityChangeHandler);
    this.setConnection("SENKRON BAŞLATILIYOR", false);
    this.bind();
    void this.load();
    this.connect();
    this.statusTimer = window.setInterval(() => this.renderCountdown(), 200);
  }

  destroy() {
    if (this.statusTimer) window.clearInterval(this.statusTimer);
    if (this.betLockTimer) window.clearTimeout(this.betLockTimer);
    this.betLockTimer = undefined;
    this.betLockTimerRoundId = "";
    document.removeEventListener("visibilitychange", this.visibilityChangeHandler);
    this.stopLabelOrientationSync();
    this.voice.stopSpin();
    this.clearBallSoundTimers();
    this.socket?.close();
  }

  private bind() {
    this.root.querySelectorAll<HTMLButtonElement>(".table-bet").forEach((button) => {
      button.addEventListener("click", () => {
        this.voice.unlock();
        this.addSelection(button);
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-stake]").forEach((button) => {
      button.addEventListener("click", () => {
        this.voice.unlock();
        this.selectedChipCents = Number(button.dataset.stake);
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='undo']").forEach((button) => button.addEventListener("click", () => this.undo()));
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='clear']").forEach((button) => button.addEventListener("click", () => this.clearSelections()));
    this.root.querySelector<HTMLButtonElement>("[data-action='rebet']")?.addEventListener("click", () => this.rebet());
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='double']").forEach((button) => button.addEventListener("click", () => this.doubleSelections()));
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='racetrack']").forEach((button) => button.addEventListener("click", () => this.toggleRacetrack()));
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='neighbors']").forEach((button) => button.addEventListener("click", () => this.toggleNeighbors()));
    this.root.querySelector<HTMLButtonElement>("[data-action='menu']")?.addEventListener("click", () => { window.location.href = "/"; });
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='sound']").forEach((button) => button.addEventListener("click", () => {
      const enabled = this.voice.toggle();
      this.root.querySelectorAll<HTMLButtonElement>("[data-action='sound']").forEach((soundButton) => {
        soundButton.classList.toggle("is-active", enabled);
        const label = soundButton.querySelector("span");
        if (label) label.textContent = enabled ? "SES AÇIK" : "SESİ AÇ";
        const small = soundButton.querySelector("small");
        if (small) small.textContent = enabled ? "AÇIK" : "SES";
      });
    }));
    this.root.querySelector<HTMLButtonElement>("[data-action='refresh']")?.addEventListener("click", () => void this.load());
    this.root.querySelectorAll<HTMLButtonElement>("[data-action^='drawer-']").forEach((button) => button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "drawer-close") this.closeDrawers();
      else if (action) this.toggleDrawer(action.replace("drawer-", ""));
    }));
  }

  private serializeSelections() {
    return JSON.stringify([...this.selections.values()]);
  }

  private saveUndoPoint() {
    this.undoStack.push(this.serializeSelections());
    if (this.undoStack.length > 30) this.undoStack.shift();
  }

  private addSelection(button: HTMLButtonElement) {
    if (!this.snapshot || !["OPEN", "LAST_CALL"].includes(this.snapshot.round.phase)) return;
    const key = button.dataset.betKey;
    const type = button.dataset.betType as RouletteBetType | undefined;
    const numbers = (button.dataset.betNumbers ?? "").split(",").filter(Boolean).map(Number);
    const label = button.dataset.betLabel ?? key ?? "Bahis";
    if (!key || !type || !numbers.length) return;
    this.saveUndoPoint();
    const buttons = this.neighborMode && button.closest("[data-racetrack-panel]")
      ? this.getNeighborButtons(numbers[0])
      : [button];
    buttons.forEach((target) => {
      const targetKey = target.dataset.betKey;
      const targetType = target.dataset.betType as RouletteBetType | undefined;
      const targetNumbers = (target.dataset.betNumbers ?? "").split(",").filter(Boolean).map(Number);
      const targetLabel = target.dataset.betLabel ?? targetKey ?? "Bahis";
      if (!targetKey || !targetType || !targetNumbers.length) return;
      const existing = this.selections.get(targetKey);
      this.selections.set(targetKey, {
        key: targetKey,
        type: targetType,
        numbers: targetNumbers,
        label: targetLabel,
        stakeCents: Math.min(MAX_BET_PER_AREA, (existing?.stakeCents ?? 0) + this.selectedChipCents),
      });
    });
    this.betStatus = "";
    this.render();
  }

  private getNeighborButtons(number: number) {
    const index = EUROPEAN_WHEEL_ORDER.indexOf(number as typeof EUROPEAN_WHEEL_ORDER[number]);
    if (index < 0) return [];
    return [-2, -1, 0, 1, 2].map((offset) => {
      const value = EUROPEAN_WHEEL_ORDER[(index + offset + EUROPEAN_WHEEL_ORDER.length) % EUROPEAN_WHEEL_ORDER.length];
      return this.root.querySelector<HTMLButtonElement>(`.roulette-racetrack [data-bet-key="straight:${value}"]`);
    }).filter((button): button is HTMLButtonElement => Boolean(button));
  }

  private undo() {
    const previous = this.undoStack.pop();
    if (previous === undefined) return;
    const restored = JSON.parse(previous) as RouletteSelection[];
    this.selections = new Map(restored.map((selection) => [selection.key, selection] as [string, RouletteSelection]));
    this.betStatus = "";
    this.render();
  }

  private clearSelections() {
    if (!this.selections.size) return;
    this.saveUndoPoint();
    this.selections.clear();
    this.betStatus = "";
    this.render();
  }

  private rebet() {
    if (!this.snapshot || !["OPEN", "LAST_CALL"].includes(this.snapshot.round.phase) || !this.lastPlacedSelections.length) return;
    this.saveUndoPoint();
    this.selections = new Map(this.lastPlacedSelections.map((selection) => [selection.key, { ...selection }] as [string, RouletteSelection]));
    this.betStatus = "SON BAHİS MASAYA GERİ YERLEŞTİRİLDİ";
    this.render();
  }

  private doubleSelections() {
    if (!this.selections.size || !this.snapshot || !["OPEN", "LAST_CALL"].includes(this.snapshot.round.phase)) return;
    this.saveUndoPoint();
    this.selections.forEach((selection) => {
      selection.stakeCents = Math.min(MAX_BET_PER_AREA, selection.stakeCents * 2);
    });
    this.betStatus = "TÜM CHIPLER ×2 ARTIRILDI";
    this.render();
  }

  private toggleRacetrack() {
    const panel = this.root.querySelector<HTMLElement>("[data-racetrack-panel]");
    if (!panel) return;
    const open = panel.hidden;
    panel.hidden = !open;
    panel.setAttribute("aria-hidden", String(!open));
    this.root.classList.toggle("is-racetrack-open", open);
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='racetrack']").forEach((button) => {
      button.setAttribute("aria-pressed", String(open));
    });
  }

  private toggleNeighbors() {
    this.neighborMode = !this.neighborMode;
    this.root.classList.toggle("is-neighbor-mode", this.neighborMode);
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='neighbors']").forEach((button) => {
      button.setAttribute("aria-pressed", String(this.neighborMode));
    });
    this.betStatus = this.neighborMode ? "KOMŞU MODU // 5’Lİ CLUSTER HAZIR" : "KOMŞU MODU KAPALI";
    this.render();
  }

  private async load() {
    try {
      const response = await fetch(`${API_BASE}/snapshot`, { credentials: "same-origin", signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error("snapshot");
      this.applySnapshot(await response.json() as RouletteSnapshot);
      const historyResponse = await fetch(`${API_BASE}/history?limit=12`, { credentials: "same-origin", signal: AbortSignal.timeout(7000) });
      if (historyResponse.ok) {
        this.renderHistory((await historyResponse.json() as { results: Array<{ sequence: number; winningNumber: number; luckyNumbers: number[]; multipliers: number[] }> }).results);
      }
    } catch {
      this.setConnection("BAĞLANTI BEKLENİYOR", false);
    }
  }

  private connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(`${protocol}//${window.location.host}/api/roulette/ws`);
    this.socket.addEventListener("open", () => this.setConnection("CANLI SENKRON", true));
    this.socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data as string) as { snapshot?: RouletteSnapshot };
        if (message.snapshot) this.applySnapshot(message.snapshot);
      } catch {
        this.setConnection("SENKRON PAKETİ HATALI", false);
      }
    });
    this.socket.addEventListener("close", () => {
      this.setConnection("YENİDEN BAĞLANIYOR", false);
      window.setTimeout(() => this.connect(), 1800);
    });
    this.socket.addEventListener("error", () => this.setConnection("BAĞLANTI KESİLDİ", false));
  }

  private applySnapshot(next: RouletteSnapshot) {
    const previous = this.snapshot;
    if (previous?.round.id === next.round.id && next.wallet.lastPayoutCents === 0) {
      next.wallet.lastPayoutCents = previous.wallet.lastPayoutCents;
    }
    this.snapshot = next;
    this.root.dataset.phase = next.round.phase.toLowerCase();
    this.root.classList.remove("is-betting-phase", "is-wheel-phase", "is-multiplier-reveal");
    this.root.classList.add(`phase-${next.round.phase.toLowerCase()}`);
    this.root.classList.toggle("is-betting-phase", next.round.phase === "OPEN" || next.round.phase === "LAST_CALL");
    this.root.classList.toggle("is-wheel-phase", ["SPINNING", "RESULT"].includes(next.round.phase));
    this.root.classList.toggle("is-wheel-spinning", next.round.phase === "SPINNING");
    this.root.classList.toggle("is-multiplier-reveal", next.round.phase === "MULTIPLIER_REVEAL");
    this.serverOffsetMs = Date.parse(next.serverTime) - Date.now();
    if (this.roundId !== next.round.id) {
      if (this.betLockTimer) window.clearTimeout(this.betLockTimer);
      this.betLockTimer = undefined;
      this.betLockTimerRoundId = "";
      this.roundId = next.round.id;
      this.selections.clear();
      this.undoStack = [];
      this.betStatus = "";
      this.acceptedBetsRoundId = "";
    }
    this.hydrateAcceptedBets(next.round.bets);
    this.scheduleBetSubmission(next);
    const phaseChanged = previous?.round.phase !== next.round.phase;
    if (phaseChanged) {
      this.announcePhase(next);
      if (next.round.phase === "SETTLING" || next.round.phase === "INTERMISSION") void this.load();
    }
    const resumingFromBackground = this.visibilityResumePending;
    const elapsed = Date.now() + this.serverOffsetMs - Date.parse(next.round.phaseStartedAt);
    const lifecycleAction = getRouletteAnimationLifecycleAction(
      previous?.round ?? null,
      next.round,
      {
        visibilityResume: resumingFromBackground,
        elapsedMs: elapsed,
        activeSpinRoundId: this.activeSpinRoundId,
        animatedResultKey: this.animatedResultKey,
        settledResultKey: this.settledResultKey,
      },
    );
    if (lifecycleAction.action === "start-spin" || lifecycleAction.action === "resume-spin") {
      this.startWheelSpin();
    } else if (lifecycleAction.action === "start-landing" && next.round.winningNumber !== null) {
      if (next.round.phase === "RESULT") this.finishWheelSpinAt(next.round.winningNumber, Math.max(0, elapsed));
      else this.settleWheelSpinImmediately(next.round.winningNumber);
    } else if (lifecycleAction.action === "resume-landing" && next.round.winningNumber !== null) {
      this.resumeResultPresentation(next.round.winningNumber, next.round.phase, next.round.phaseStartedAt);
    } else if (lifecycleAction.action === "settle" && next.round.winningNumber !== null) {
      this.settleWheelSpinImmediately(next.round.winningNumber);
    }
    const animationTransition = getRouletteAnimationTransition(previous?.round ?? null, next.round);
    if (animationTransition.winningNumber !== null) this.voice.speak(`${animationTransition.winningNumber} numara kazandı`);
    const previousRevealCount = previous?.round.revealedMultipliers.length ?? 0;
    const newRevealIndex = next.round.revealedMultipliers.length > previousRevealCount
      ? next.round.revealedMultipliers.length - 1
      : -1;
    const newRevealValue = newRevealIndex >= 0 ? next.round.revealedMultipliers[newRevealIndex] : undefined;
    if (newRevealValue) this.voice.speak(`${newRevealValue} çarpan`);
    this.render();
    if (newRevealIndex >= 0 && newRevealValue) this.playMultiplierReveal(newRevealIndex, newRevealValue);
  }

  private announcePhase(snapshot: RouletteSnapshot) {
    if (snapshot.round.phase === "OPEN") this.voice.speak("Bahisler açıldı");
    if (snapshot.round.phase === "LAST_CALL") this.voice.speak("Son çağrı, bahisler kapanıyor");
    if (snapshot.round.phase === "LOCKED") this.voice.speak("Bahisler kapandı");
    if (snapshot.round.phase === "MULTIPLIER_REVEAL") {
      this.voice.cue("reveal");
      this.voice.speak("Özel çarpanlar açıklanıyor");
    }
    if (snapshot.round.phase === "SPINNING") this.voice.speak("Çark dönüyor");
    if (snapshot.round.phase === "RESULT") this.voice.speak("Kazanan sayı açıklanıyor");
    if (snapshot.round.phase === "SPINNING") this.voice.startSpin();
    else this.voice.stopSpin();
  }

  private render() {
    if (!this.snapshot) return;
    const { round, wallet } = this.snapshot;
    const resultSettled = isRouletteResultSettled(round, this.settledResultKey);
    const bettingOpen = round.phase === "OPEN" || round.phase === "LAST_CALL";
    const totalStakeCents = [...this.selections.values()].reduce((sum, bet) => sum + bet.stakeCents, 0);
    const liveSummary = this.root.querySelector<HTMLElement>("[data-roulette-summary]");
    const liveSummaryKey = `${round.id}:${round.phase}:${round.winningNumber ?? "pending"}`;
    if (liveSummary && liveSummaryKey !== this.liveSummaryKey) {
      liveSummary.textContent = getRouletteLiveSummary(this.snapshot);
      this.liveSummaryKey = liveSummaryKey;
    }
    this.root.querySelector<HTMLElement>("[data-phase]")!.textContent = PHASE_LABELS[round.phase];
    this.root.querySelector<HTMLElement>("[data-round]")!.textContent = `ROUND ${String(round.sequence).padStart(6, "0")}`;
    this.root.querySelector<HTMLElement>("[data-balance]")!.textContent = formatCredits(wallet.balanceCents);
    this.root.querySelector<HTMLElement>("[data-commitment]")!.textContent = round.commitmentHash.slice(0, 18).toUpperCase();
    this.root.querySelector<HTMLElement>("[data-total-stake]")!.textContent = formatCredits(totalStakeCents);
    this.root.querySelector<HTMLElement>("[data-bet-count]")!.textContent = `${this.selections.size} ALAN`;
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='undo']").forEach((button) => { button.disabled = !this.undoStack.length || !bettingOpen; });
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='clear']").forEach((button) => { button.disabled = !this.selections.size || !bettingOpen; });
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='double']").forEach((button) => { button.disabled = !this.selections.size || !bettingOpen; });
    this.root.querySelector<HTMLButtonElement>("[data-action='rebet']")!.disabled = !this.lastPlacedSelections.length || !bettingOpen;
    this.root.querySelector<HTMLElement>("[data-bet-status]")!.textContent = this.betStatus || (bettingOpen ? (round.phase === "LAST_CALL" ? "SON ÇAĞRI // SAYAÇ SIFIRLANINCA MASA KİLİTLENİR" : "CHIP SEÇ // SAYAÇ SIFIRLANINCA MASA OTOMATİK GÖNDERİLİR") : "BAHİSLER KAPALI // GEÇ KALAN CHIPLER REDDEDİLİR");
    this.root.querySelectorAll<HTMLButtonElement>(".table-bet").forEach((button) => {
      const selection = this.selections.get(button.dataset.betKey ?? "");
      button.disabled = !bettingOpen;
      button.classList.toggle("is-occupied", Boolean(selection));
      const chip = button.querySelector<HTMLElement>(".table-chip");
      if (chip) {
        chip.hidden = !selection;
        chip.textContent = selection ? formatCredits(selection.stakeCents) : "";
      }
    });
    this.root.querySelectorAll<HTMLButtonElement>(".table-bet[data-bet-type='STRAIGHT']").forEach((button) => {
      const number = Number((button.dataset.betNumbers ?? "").split(",")[0]);
      const revealIndex = round.luckyNumbers.indexOf(number);
      const value = revealIndex >= 0 ? round.revealedMultipliers[revealIndex] : undefined;
      const badge = button.querySelector<HTMLElement>(".multiplier-badge");
      if (!badge) return;
      badge.hidden = !value;
      badge.textContent = value ? `${value}x` : "";
      button.dataset.multiplierIndex = value ? String(revealIndex) : "";
      button.dataset.multiplierValue = value ? String(value) : "";
      button.classList.toggle("has-multiplier", Boolean(value));
      button.classList.toggle("is-high-multiplier", Boolean(value && value >= 300));
      button.classList.toggle("is-multiplier-target", revealIndex >= 0);
      button.classList.toggle("is-multiplier-active", Boolean(value && revealIndex === round.revealedMultipliers.length - 1 && round.phase === "MULTIPLIER_REVEAL"));
    });
    this.root.querySelectorAll<HTMLElement>(".wheel-pocket").forEach((pocket) => {
      pocket.classList.toggle("is-winning", resultSettled && Number(pocket.dataset.wheelNumber) === round.winningNumber);
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-stake]").forEach((button) => button.classList.toggle("is-selected", Number(button.dataset.stake) === this.selectedChipCents));
    this.root.querySelector<HTMLElement>("[data-selected-bets]")!.innerHTML = this.selections.size
      ? [...this.selections.values()].map((bet) => `<span class="selected-bet-pill"><b>${bet.label}</b><strong>${formatCredits(bet.stakeCents)}</strong></span>`).join("")
      : `<span class="muted-copy">Chip seç ve masada bir veya daha fazla alana dokun</span>`;
    this.root.querySelectorAll<HTMLElement>("[data-winning-number]").forEach((element) => {
      element.textContent = resultSettled ? String(round.winningNumber) : "?";
      element.classList.toggle("is-visible", resultSettled);
    });
    this.root.querySelector<HTMLElement>("[data-wheel]")!.classList.toggle("is-spinning", round.phase === "SPINNING");
    const winningAngle = round.winningNumber === null ? 0 : getWheelAngle(round.winningNumber);
    this.root.querySelector<HTMLElement>("[data-wheel]")!.style.setProperty("--winning-angle", `${winningAngle}deg`);
    const lucky = new Set(round.luckyNumbers);
    this.root.querySelector<HTMLElement>("[data-lucky-list]")!.innerHTML = round.luckyNumbers.length
      ? round.luckyNumbers.map((number) => `<span class="lucky-chip">${number}</span>`).join("")
      : `<span class="muted-copy">Sonuçtan sonra açıklanacak</span>`;
    this.root.querySelector<HTMLElement>("[data-multiplier-list]")!.innerHTML = round.revealedMultipliers.length
      ? round.revealedMultipliers.map((value, index) => `<span class="multiplier-chip ${lucky.has(round.luckyNumbers[index]) ? "is-lucky" : ""}" style="--reveal-index:${index}">${value}x</span>`).join("")
      : `<span class="muted-copy">Tek tek reveal bekleniyor</span>`;
    this.root.querySelector<HTMLElement>("[data-reveal-count]")!.textContent = `${round.revealedMultipliers.length}/${round.multipliersTotal}`;
    const resultVisible = resultSettled && ["RESULT", "SETTLING", "INTERMISSION"].includes(round.phase);
    const overlay = this.root.querySelector<HTMLElement>("[data-result-overlay]");
    if (overlay) {
      overlay.classList.toggle("is-visible", resultVisible);
      overlay.querySelector<HTMLElement>("[data-overlay-winning]")!.textContent = resultVisible ? String(round.winningNumber) : "?";
      overlay.querySelector<HTMLElement>("[data-overlay-payout]")!.textContent = wallet.lastPayoutCents > 0
        ? `KAZANÇ +${formatCredits(wallet.lastPayoutCents)}`
        : "KAZANAN SAYI";
    }
    this.renderCountdown();
  }

  private playMultiplierReveal(index: number, value: RouletteMultiplier) {
    const number = this.snapshot?.round.luckyNumbers[index];
    if (number === undefined) return;
    const effects = this.root.querySelector<HTMLElement>("[data-multiplier-effects]");
    const targets = [...this.root.querySelectorAll<HTMLElement>(`.table-bet[data-bet-key="straight:${number}"]`)]
      .filter((target) => target.getBoundingClientRect().width > 0);
    const target = targets[0];
    if (!effects || !target) return;
    const sourceRect = effects.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const x = targetRect.left + targetRect.width / 2 - sourceRect.left;
    const y = targetRect.top + targetRect.height / 2 - sourceRect.top;
    const sourceX = sourceRect.width / 2;
    const sourceY = 5;
    const strike = document.createElement("span");
    strike.className = `multiplier-strike${value >= 300 ? " is-major" : ""}`;
    strike.style.setProperty("--strike-x", `${x}px`);
    strike.style.setProperty("--strike-y", `${y}px`);
    strike.style.setProperty("--strike-length", `${Math.hypot(x - sourceX, y - sourceY)}px`);
    strike.style.setProperty("--strike-angle", `${Math.atan2(y - sourceY, x - sourceX)}rad`);
    strike.style.setProperty("--strike-index", String(index));
    effects.append(strike);
    target.classList.add("is-multiplier-impact");
    this.voice.cue(value >= 300 ? "reveal" : "bounce");
    window.setTimeout(() => {
      strike.remove();
      target.classList.remove("is-multiplier-impact");
    }, value >= 300 ? 1250 : 850);
  }

  private renderCountdown() {
    if (!this.snapshot) return;
    const remaining = Date.parse(this.snapshot.round.nextTransitionAt) - (Date.now() + this.serverOffsetMs);
    this.root.querySelector<HTMLElement>("[data-countdown]")!.textContent = formatCountdown(remaining);
    this.root.querySelector<HTMLElement>("[data-progress]")!.style.setProperty("--countdown-progress", `${Math.max(0, Math.min(100, 100 - (remaining / Math.max(1, this.snapshot.round.countdownMs)) * 100))}%`);
  }

  private hydrateAcceptedBets(bets: RouletteSnapshot["round"]["bets"]) {
    if (!bets.length || this.selections.size) return;
    const restored = bets.map((bet) => ({
      key: this.selectionKey(bet.type, bet.numbers),
      type: bet.type,
      numbers: [...bet.numbers],
      stakeCents: bet.stakeCents,
      label: bet.label,
    }));
    this.selections = new Map(restored.map((selection) => [selection.key, selection] as [string, RouletteSelection]));
    this.lastPlacedSelections = restored.map((selection) => ({ ...selection, numbers: [...selection.numbers] }));
    this.undoStack = [];
    this.acceptedBetsRoundId = this.snapshot?.round.id ?? "";
  }

  private scheduleBetSubmission(snapshot: RouletteSnapshot) {
    if (!["OPEN", "LAST_CALL"].includes(snapshot.round.phase)) return;
    if (this.acceptedBetsRoundId === snapshot.round.id) return;
    if (this.betLockTimerRoundId === snapshot.round.id) return;
    const closesAt = Date.parse(snapshot.round.bettingClosesAt);
    if (!Number.isFinite(closesAt)) return;
    const delay = closesAt - (Date.now() + this.serverOffsetMs);
    if (delay < -250) return;
    this.betLockTimerRoundId = snapshot.round.id;
    this.betLockTimer = window.setTimeout(() => {
      this.betLockTimer = undefined;
      this.betLockTimerRoundId = "";
      void this.placeBets(snapshot.round.id);
    }, Math.max(0, delay - 75));
  }

  private selectionKey(type: RouletteBetType, numbers: number[]) {
    return `${type.toLowerCase()}:${numbers.join("-")}`;
  }

  private async placeBets(roundId: string) {
    if (!this.snapshot || this.snapshot.round.id !== roundId || !this.selections.size) return;
    if (!["OPEN", "LAST_CALL"].includes(this.snapshot.round.phase)) {
      this.betStatus = "BAHİSLER KAPANDI // GEÇ KALAN CHIPLER REDDEDİLDİ";
      this.render();
      return;
    }
    if (this.betSubmissionRoundId === roundId || this.betSubmissionInFlightRoundId === roundId) return;
    this.betSubmissionRoundId = roundId;
    this.betSubmissionInFlightRoundId = roundId;
    const bets = [...this.selections.values()].map(({ type, numbers, stakeCents, label }) => ({ type, numbers, stakeCents, label }));
    this.betStatus = "BAHİSLER KİLİTLENİYOR // SERVER’A GÖNDERİLİYOR";
    this.render();
    try {
      const response = await fetch(`${API_BASE}/bets`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bets, idempotencyKey: `${crypto.randomUUID()}-${Date.now()}` }),
      });
      const data = await response.json() as { wallet?: { balanceCents: number }; error?: string; bets?: unknown[]; totalStakeCents?: number };
      if (!response.ok) throw new Error(data.error ?? "Bahisler kabul edilmedi");
      this.lastPlacedSelections = bets.map((bet) => ({ ...bet, key: this.selectionKey(bet.type, bet.numbers) }));
      this.acceptedBetsRoundId = roundId;
      this.betStatus = `${data.bets?.length ?? bets.length} BAHİS KABUL // TOPLAM ${formatCredits(data.totalStakeCents ?? 0)}`;
      this.undoStack = [];
      if (this.snapshot && data.wallet) this.snapshot.wallet.balanceCents = data.wallet.balanceCents;
      if (this.snapshot?.round.id === roundId) this.render();
    } catch (error) {
      if (this.snapshot?.round.id === roundId) {
        this.betStatus = error instanceof Error ? error.message : "BAHİSLER KABUL EDİLMEDİ";
        this.render();
      }
    } finally {
      if (this.betSubmissionInFlightRoundId === roundId) this.betSubmissionInFlightRoundId = "";
    }
  }

  private renderHistory(results: Array<{ sequence: number; winningNumber: number; luckyNumbers: number[]; multipliers: number[] }>) {
    const target = this.root.querySelector<HTMLElement>("[data-history]");
    const historyMarkup = results.map((result) => `
      <span class="mobile-result-chip ${result.winningNumber === 0 ? "is-zero" : RED_NUMBERS.has(result.winningNumber) ? "is-red" : "is-black"}">
        <b>${result.winningNumber}</b><small>${result.multipliers[0] ? `${result.multipliers[0]}x` : ""}</small>
      </span>
    `).join("") || `<span class="muted-copy">İlk sonuç bekleniyor</span>`;
    const mobileTarget = this.root.querySelector<HTMLElement>(".mobile-results-list");
    if (mobileTarget) mobileTarget.innerHTML = historyMarkup;
    const historyRows = results.map((result) => `
      <div class="history-row">
        <span>#${String(result.sequence).padStart(6, "0")}</span>
        <strong class="${result.winningNumber === 0 ? "is-zero" : RED_NUMBERS.has(result.winningNumber) ? "is-red" : "is-black"}">${result.winningNumber}</strong>
        <span>${result.luckyNumbers.length} LUCKY</span>
        <span>${result.multipliers.map((value) => `${value}x`).join(" · ")}</span>
      </div>
    `).join("") || `<span class="muted-copy">İlk sonuç bekleniyor</span>`;
    if (target) target.innerHTML = historyRows;
    const drawerTarget = this.root.querySelector<HTMLElement>("[data-history-drawer]");
    if (drawerTarget) drawerTarget.innerHTML = historyRows;
  }

  private toggleDrawer(name: string) {
    this.root.querySelectorAll<HTMLElement>("[data-drawer]").forEach((drawer) => {
      const open = drawer.dataset.drawer === name && drawer.getAttribute("aria-hidden") === "true";
      drawer.setAttribute("aria-hidden", String(!open));
    });
  }

  private closeDrawers() {
    this.root.querySelectorAll<HTMLElement>("[data-drawer]").forEach((drawer) => drawer.setAttribute("aria-hidden", "true"));
  }

  private startWheelSpin() {
    const wheel = this.root.querySelector<HTMLElement>("[data-wheel]");
    const rotor = wheel?.querySelector<HTMLElement>(".wheel-rotor");
    const ball = this.root.querySelector<HTMLElement>(".wheel-ball");
    if (!wheel || !rotor || !ball) return;
    const roundId = this.snapshot?.round.id ?? "";
    if (!roundId) return;
    const { rotorOrbitMs, ballOrbitMs } = ROULETTE_MOTION_TIMINGS;
    const phaseElapsed = Math.max(0, Date.now() + this.serverOffsetMs - Date.parse(this.snapshot?.round.phaseStartedAt ?? ""));
    if (this.activeSpinRoundId === roundId && this.wheelAnimation && this.ballAnimation) {
      this.wheelAnimation.currentTime = phaseElapsed % rotorOrbitMs;
      this.ballAnimation.currentTime = phaseElapsed % ballOrbitMs;
      this.wheelAnimation.play();
      this.ballAnimation.play();
      this.voice.startSpin();
      return;
    }
    this.activeSpinRoundId = roundId;
    if (this.ballDropTimer) window.clearTimeout(this.ballDropTimer);
    this.ballDropTimer = undefined;
    this.wheelAnimation?.cancel();
    this.ballAnimation?.cancel();
    this.settledResultKey = "";
    wheel.style.setProperty("--label-counter-angle", "0deg");
    rotor.style.transform = "rotate(0deg)";
    wheel.classList.add("is-spinning");
    this.voice.startSpin();
    const { outerRadius } = this.readWheelRadii(wheel);
    if (this.prefersReducedMotion()) {
      this.stopLabelOrientationSync();
      wheel.classList.remove("is-spinning");
      ball.style.transform = `rotate(0deg) translateY(-${outerRadius}px)`;
      return;
    }
    this.wheelAnimation = rotor.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
      { duration: rotorOrbitMs, iterations: Infinity, easing: "linear" },
    );
    this.ballAnimation = ball.animate(
      [{ transform: `rotate(0deg) translateY(-${outerRadius}px)` }, { transform: `rotate(-360deg) translateY(-${outerRadius}px)` }],
      { duration: ballOrbitMs, iterations: Infinity, easing: "linear" },
    );
    this.wheelAnimation.currentTime = phaseElapsed % rotorOrbitMs;
    this.ballAnimation.currentTime = phaseElapsed % ballOrbitMs;
    this.startLabelOrientationSync();
  }

  private finishWheelSpin(winningNumber: number) {
    this.finishWheelSpinAt(winningNumber, 0);
  }

  private resumeResultPresentation(winningNumber: number, phase: RoulettePhase, phaseStartedAt: string) {
    const rawElapsed = Date.now() + this.serverOffsetMs - Date.parse(phaseStartedAt);
    const elapsed = Number.isFinite(rawElapsed) ? Math.max(0, rawElapsed) : BALL_LANDING_DURATION_MS;
    if (getRouletteResultResumeAction(phase, elapsed) === "settle") {
      this.settleWheelSpinImmediately(winningNumber);
      return;
    }
    const resultKey = `${this.snapshot?.round.id}:${winningNumber}`;
    if (this.animatedResultKey !== resultKey) {
      this.finishWheelSpinAt(winningNumber, elapsed);
      return;
    }
    if (this.wheelAnimation) this.wheelAnimation.currentTime = Math.min(elapsed, WHEEL_LANDING_DURATION_MS);
    if (this.ballAnimation) this.ballAnimation.currentTime = Math.min(elapsed, BALL_LANDING_DURATION_MS);
  }

  private finishWheelSpinAt(winningNumber: number, animationElapsedMs: number) {
    const wheel = this.root.querySelector<HTMLElement>("[data-wheel]");
    const rotor = wheel?.querySelector<HTMLElement>(".wheel-rotor");
    const ball = this.root.querySelector<HTMLElement>(".wheel-ball");
    if (!wheel || !rotor || !ball) return;
    const resultKey = `${this.snapshot?.round.id}:${winningNumber}`;
    if (this.animatedResultKey === resultKey) return;
    this.animatedResultKey = resultKey;
    this.settledResultKey = "";
    this.activeSpinRoundId = "";
    this.voice.stopSpin();
    this.clearBallSoundTimers();
    if (this.ballDropTimer) window.clearTimeout(this.ballDropTimer);
    this.ballDropTimer = undefined;
    const currentRotation = this.readRotation(rotor);
    const currentBallAngle = this.readBallAngle(ball);
    this.ballAnimation?.cancel();
    this.wheelAnimation?.cancel();
    wheel.classList.remove("is-spinning");
    const plan = getWheelLandingPlan(winningNumber, currentRotation, this.readWheelRadii(wheel));
    const { finalRotation, finalLabelAngle, outerRadius, pocketRadius } = plan;
    const finalPocketRadius = Math.max(0, pocketRadius - Math.max(9, outerRadius * .025));
    if (this.prefersReducedMotion()) {
      this.stopLabelOrientationSync();
      this.wheelAnimation = undefined;
      this.ballAnimation = undefined;
      rotor.style.transform = `rotate(${finalRotation}deg)`;
      wheel.style.setProperty("--label-counter-angle", finalLabelAngle);
      ball.style.transform = `rotate(-1440deg) translateY(-${finalPocketRadius}px)`;
      this.settledResultKey = resultKey;
      this.voice.cue("land");
      return;
    }
    const { landingDurationMs, resultRevealDelayMs } = ROULETTE_MOTION_TIMINGS;
    const wheelDelta = finalRotation - currentRotation;
    this.wheelAnimation = rotor.animate(
      [
        { transform: `rotate(${currentRotation}deg)` },
        { transform: `rotate(${currentRotation + wheelDelta * .62}deg)`, offset: .55 },
        { transform: `rotate(${finalRotation}deg)` },
      ],
      { duration: landingDurationMs, easing: "linear", fill: "forwards" },
    );
    this.startLabelOrientationSync();
    this.wheelAnimation.currentTime = Math.min(Math.max(0, animationElapsedMs), landingDurationMs);
    this.wheelAnimation.finished.then(() => {
      if (this.animatedResultKey !== resultKey) return;
      this.stopLabelOrientationSync();
      wheel.style.setProperty("--label-counter-angle", finalLabelAngle);
    }).catch(() => undefined);
    const profileSeed = [...resultKey].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, 7);
    const extraTurns = 3 + (profileSeed % 2);
    const deflectorCount = 2 + (profileSeed % 3);
    const pocketSkip = 3 + (profileSeed % 6);
    const finalBallAngle = -1440 - extraTurns * 360;
    const ballDelta = finalBallAngle - currentBallAngle;
    const deflectorHitAngle = currentBallAngle + ballDelta * .54;
    const secondDeflectorAngle = currentBallAngle + ballDelta * .63;
    const innerTrackRadius = pocketRadius + (outerRadius - pocketRadius) * .58;
    const outer = ball.animate(
      [
        { transform: `rotate(${currentBallAngle}deg) translateY(-${outerRadius}px)`, offset: 0 },
        { transform: `rotate(${currentBallAngle + ballDelta * .13}deg) translateY(-${outerRadius + 3}px)`, offset: .13 },
        { transform: `rotate(${currentBallAngle + ballDelta * .28}deg) translateY(-${outerRadius - 1}px)`, offset: .28 },
        { transform: `rotate(${currentBallAngle + ballDelta * .42}deg) translateY(-${outerRadius + 2}px)`, offset: .42 },
        { transform: `rotate(${deflectorHitAngle}deg) translateY(-${outerRadius - 12 - deflectorCount}px)`, offset: .54 },
        { transform: `rotate(${deflectorHitAngle + ballDelta * .035}deg) translateY(-${outerRadius + 4}px)`, offset: .58 },
        { transform: `rotate(${secondDeflectorAngle}deg) translateY(-${outerRadius - 8}px)`, offset: .63 },
        { transform: `rotate(${secondDeflectorAngle + ballDelta * .035}deg) translateY(-${outerRadius + 1}px)`, offset: .67 },
        { transform: `rotate(${currentBallAngle + ballDelta * .72}deg) translateY(-${innerTrackRadius}px)`, offset: .72 },
         { transform: `rotate(${finalBallAngle - pocketSkip * 9.7297}deg) translateY(-${finalPocketRadius + 22}px)`, offset: .79 },
         { transform: `rotate(${finalBallAngle - pocketSkip * 4.1}deg) translateY(-${finalPocketRadius - 3}px)`, offset: .84 },
         { transform: `rotate(${finalBallAngle + 2.8}deg) translateY(-${finalPocketRadius + 14}px)`, offset: .89 },
         { transform: `rotate(${finalBallAngle - 1.8}deg) translateY(-${finalPocketRadius - 2}px)`, offset: .94 },
         { transform: `rotate(${finalBallAngle + 1.1}deg) translateY(-${finalPocketRadius + 6}px)`, offset: .97 },
         { transform: `rotate(${finalBallAngle}deg) translateY(-${finalPocketRadius}px)`, offset: 1 },
      ],
      { duration: resultRevealDelayMs, easing: "cubic-bezier(.16,.72,.2,1)", fill: "forwards" },
    );
    this.ballAnimation = outer;
    this.ballAnimation.currentTime = Math.min(Math.max(0, animationElapsedMs), BALL_LANDING_DURATION_MS);
    this.scheduleBallSounds(resultKey);
    outer.finished.then(() => {
      if (this.animatedResultKey !== resultKey) return;
      this.settledResultKey = resultKey;
      this.voice.cue("land");
      this.render();
    }).catch(() => undefined);
  }

  private settleWheelSpinImmediately(winningNumber: number) {
    const wheel = this.root.querySelector<HTMLElement>("[data-wheel]");
    const rotor = wheel?.querySelector<HTMLElement>(".wheel-rotor");
    const ball = this.root.querySelector<HTMLElement>(".wheel-ball");
    if (!wheel || !rotor || !ball) return;
    const resultKey = `${this.snapshot?.round.id}:${winningNumber}`;
    if (this.settledResultKey === resultKey) return;
    if (this.ballDropTimer) window.clearTimeout(this.ballDropTimer);
    this.ballDropTimer = undefined;
    this.animatedResultKey = resultKey;
    this.activeSpinRoundId = "";
    this.voice.stopSpin();
    this.clearBallSoundTimers();
    const currentRotation = this.readRotation(rotor);
    this.ballAnimation?.cancel();
    this.wheelAnimation?.cancel();
    wheel.classList.remove("is-spinning");
    const { finalRotation, finalLabelAngle, outerRadius, pocketRadius } = getWheelLandingPlan(winningNumber, currentRotation, this.readWheelRadii(wheel));
    const finalPocketRadius = Math.max(0, pocketRadius - Math.max(9, outerRadius * .025));
    this.stopLabelOrientationSync();
    this.wheelAnimation = undefined;
    this.ballAnimation = undefined;
    rotor.style.transform = `rotate(${finalRotation}deg)`;
    wheel.style.setProperty("--label-counter-angle", finalLabelAngle);
    ball.style.transform = `rotate(-1440deg) translateY(-${finalPocketRadius}px)`;
    this.settledResultKey = resultKey;
    this.render();
  }

  private scheduleBallSounds(resultKey: string) {
    this.clearBallSoundTimers();
    const duration = ROULETTE_MOTION_TIMINGS.resultRevealDelayMs;
    [0.54, 0.63, 0.79, 0.89, 0.97].forEach((progress, index) => {
      const delay = Math.round(duration * progress);
      this.ballSoundTimers.push(window.setTimeout(() => {
        if (this.animatedResultKey === resultKey) this.voice.cue(index === 4 ? "land" : "bounce");
      }, delay));
    });
  }

  private clearBallSoundTimers() {
    this.ballSoundTimers.forEach((timer) => window.clearTimeout(timer));
    this.ballSoundTimers = [];
  }

  private readRotation(element: HTMLElement) {
    const values = this.readTransformValues(element);
    if (!values) return 0;
    const [a, b] = values.length === 16 ? values : [values[0], values[1]];
    return Math.atan2(b, a) * 180 / Math.PI;
  }

  private readBallAngle(element: HTMLElement) {
    const values = this.readTransformValues(element);
    if (!values) return 0;
    const translateX = values.length === 16 ? values[12] : values[4];
    const translateY = values.length === 16 ? values[13] : values[5];
    if (!Number.isFinite(translateX) || !Number.isFinite(translateY) || Math.hypot(translateX, translateY) < 1) return 0;
    return Math.atan2(translateX, -translateY) * 180 / Math.PI;
  }

  private readTransformValues(element: HTMLElement) {
    const transform = getComputedStyle(element).transform;
    if (!transform || transform === "none") return null;
    const matrixMatch = transform.match(/matrix(?:3d)?\(([^)]+)\)/);
    const values = matrixMatch?.[1].split(",").map(Number);
    return values && (values.length === 6 || values.length === 16) && values.every(Number.isFinite) ? values : null;
  }

  private startLabelOrientationSync() {
    this.stopLabelOrientationSync();
    const sync = () => {
      const wheel = this.root.querySelector<HTMLElement>("[data-wheel]");
      const rotor = wheel?.querySelector<HTMLElement>(".wheel-rotor");
      if (!wheel || !rotor) return;
      wheel.style.setProperty("--label-counter-angle", `${this.readRotation(rotor)}deg`);
      this.labelSyncFrame = window.requestAnimationFrame(sync);
    };
    sync();
  }

  private stopLabelOrientationSync() {
    if (this.labelSyncFrame !== undefined) {
      window.cancelAnimationFrame(this.labelSyncFrame);
      this.labelSyncFrame = undefined;
    }
  }

  private prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }

  private readWheelRadii(wheel: HTMLElement) {
    const readRadius = (variable: string, fallbackRatio: number) => {
      const probe = document.createElement("span");
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.pointerEvents = "none";
      probe.style.width = `var(${variable})`;
      probe.style.height = "0";
      wheel.append(probe);
      const resolvedValue = probe.getBoundingClientRect().width;
      probe.remove();
      return resolvedValue > 0 ? resolvedValue : wheel.clientWidth * fallbackRatio;
    };
    return {
      outerRadius: readRadius("--ball-radius", FALLBACK_OUTER_RADIUS_RATIO),
      pocketRadius: readRadius("--pocket-radius", FALLBACK_POCKET_RADIUS_RATIO),
    };
  }

  private setConnection(label: string, live: boolean) {
    const element = this.root.querySelector<HTMLElement>("[data-connection]");
    if (!element) return;
    element.textContent = label;
    element.classList.toggle("is-live", live);
  }
}

export function applyRouletteMotionTimingContract(element: HTMLElement) {
  element.style.setProperty(ROULETTE_MOTION_CSS_VARIABLES.rotorOrbit, `${ROULETTE_MOTION_TIMINGS.rotorOrbitMs}ms`);
  element.style.setProperty(ROULETTE_MOTION_CSS_VARIABLES.ballOrbit, `${ROULETTE_MOTION_TIMINGS.ballOrbitMs}ms`);
  element.style.setProperty(ROULETTE_MOTION_CSS_VARIABLES.landing, `${ROULETTE_MOTION_TIMINGS.landingDurationMs}ms`);
  element.style.setProperty(ROULETTE_MOTION_CSS_VARIABLES.resultRevealDelay, `${ROULETTE_MOTION_TIMINGS.resultRevealDelayMs}ms`);
  element.style.setProperty(ROULETTE_MOTION_CSS_VARIABLES.resultReveal, `${ROULETTE_MOTION_TIMINGS.resultRevealDurationMs}ms`);
}

export const ROULETTE_MOTION_CSS_VARIABLES = {
  rotorOrbit: "--roulette-rotor-orbit-duration",
  ballOrbit: "--roulette-ball-orbit-duration",
  landing: "--roulette-landing-duration",
  resultRevealDelay: "--roulette-result-reveal-delay",
  resultReveal: "--roulette-result-reveal-duration",
} as const;
