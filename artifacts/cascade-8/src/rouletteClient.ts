import {
  EUROPEAN_WHEEL_ORDER,
  FALLBACK_OUTER_RADIUS_RATIO,
  FALLBACK_POCKET_RADIUS_RATIO,
  getWheelAngle,
} from "./rouletteGeometry";
import { RoulettePhysicsReplay } from "./roulettePhysicsReplay";

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
  rotorOrbitMs: 4700,
  ballOrbitMs: 2600,
  landingDurationMs: 2800,
  resultRevealDelayMs: 2800,
  resultRevealDurationMs: 500,
} as const;

export type RouletteMotionProfile = {
  initialBallAngle: number;
  rotorOrbitMs: number;
  ballOrbitMs: number;
  outerTrackTurns: number;
  landingOuterTurns: number;
  deflectorIndex: number;
  bounceCount: number;
  bounceRhythm: number;
  settleDurationMs: number;
};

function hashMotionSeed(roundId: string) {
  return [...roundId].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 7);
}

export function getRouletteMotionProfile(roundId: string): RouletteMotionProfile {
  const seed = hashMotionSeed(roundId);
  const next = (offset: number, modulus: number) => Math.floor(seed / 2 ** offset) % modulus;
  const outerTrackTurns = 4 + next(8, 2);
  return {
    initialBallAngle: next(0, 360),
    rotorOrbitMs: 4_450 + next(3, 4) * 250,
    ballOrbitMs: Math.round(11_500 / outerTrackTurns),
    outerTrackTurns,
    landingOuterTurns: 1 + next(23, 2),
    deflectorIndex: next(11, 8),
    bounceCount: 2 + next(14, 4),
    bounceRhythm: 155 + next(17, 5) * 24,
    settleDurationMs: 620 + next(20, 5) * 44,
  };
}
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
const TURKISH_ROULETTE_NUMBERS = [
  "sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz",
  "on", "on bir", "on iki", "on üç", "on dört", "on beş", "on altı", "on yedi",
  "on sekiz", "on dokuz", "yirmi", "yirmi bir", "yirmi iki", "yirmi üç", "yirmi dört",
  "yirmi beş", "yirmi altı", "yirmi yedi", "yirmi sekiz", "yirmi dokuz", "otuz",
  "otuz bir", "otuz iki", "otuz üç", "otuz dört", "otuz beş", "otuz altı",
] as const;
const MAX_BET_PER_AREA = 10_000;
const WHEEL_LANDING_DURATION_MS = ROULETTE_MOTION_TIMINGS.landingDurationMs;
const BALL_LANDING_DURATION_MS = ROULETTE_MOTION_TIMINGS.resultRevealDelayMs;
const formatCredits = (cents: number) => (cents / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatCountdown = (milliseconds: number) => {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

export function getRouletteColorLabel(number: number) {
  if (number === 0) return "yeşil";
  return RED_NUMBERS.has(number) ? "kırmızı" : "siyah";
}

export function getRouletteResultAnnouncement(number: number) {
  const spokenNumber = TURKISH_ROULETTE_NUMBERS[number] ?? String(number);
  return `${spokenNumber}, ${getRouletteColorLabel(number)}.`;
}

export function getRoulettePhaseAnnouncement(phase: RoulettePhase) {
  const announcements: Partial<Record<RoulettePhase, string>> = {
    OPEN: "Bahisler açıldı.",
    LAST_CALL: "Son bahisler.",
    LOCKED: "Bahisler kapandı.",
    MULTIPLIER_REVEAL: "Çarpanlar açıklanıyor.",
  };
  return announcements[phase] ?? null;
}

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

type RouletteCue = "unlock" | "phase" | "spin" | "roll" | "fret" | "deflector" | "reveal" | "land" | "settle";

class RouletteVoice {
  private enabled = false;
  private lastPhrase = "";
  private audioContext?: AudioContext;
  private spinTimer?: number;
  private wheelBed?: AudioBufferSourceNode;
  private wheelBedGain?: GainNode;

  unlock() {
    const firstUnlock = !this.unlocked;
    const context = this.ensureAudio();
    if (context) {
      this.unlocked = true;
      if (firstUnlock) this.enabled = true;
    }
    void this.audioContext?.resume();
    return this.enabled;
  }

  private unlocked = false;

  toggle() {
    const wasUnlocked = this.unlocked;
    const wasEnabled = this.enabled;
    this.unlock();
    if (wasUnlocked) this.enabled = !wasEnabled;
    if (!this.enabled) {
      window.speechSynthesis?.cancel();
      this.stopSpin();
    } else {
      void this.audioContext?.resume();
      this.cue("phase");
      this.speak("Sesli uyarılar açık.");
    }
    return this.enabled;
  }

  startSpin(ballOrbitMs: number) {
    if (!this.enabled || !this.unlocked) return;
    this.stopSpin();
    const context = this.ensureAudio();
    if (!context) return;
    this.startWheelBed(context);
    this.cue("spin");
    const speedFactor = Math.min(1.35, Math.max(.72, 2_900 / Math.max(1, ballOrbitMs)));
    const pulseMs = Math.max(280, Math.min(620, Math.round(ballOrbitMs / 5)));
    this.cue("roll", speedFactor);
    this.spinTimer = window.setInterval(() => this.cue("roll", speedFactor), pulseMs);
  }

  stopSpin() {
    if (this.spinTimer) window.clearInterval(this.spinTimer);
    this.spinTimer = undefined;
    this.wheelBed?.stop();
    this.wheelBed = undefined;
    this.wheelBedGain = undefined;
  }

  cue(kind: RouletteCue, intensity = 1) {
    if (!this.enabled || !this.unlocked) return;
    const context = this.ensureAudio();
    if (!context) return;
    const now = context.currentTime;
    const level = Math.min(1.5, Math.max(.45, intensity));
    if (kind === "roll") {
      this.playNoise(context, .11, .012 * level, 850, "lowpass");
      this.playTone(context, 176 * level, .07, .009 * level, "triangle");
      return;
    }
    if (kind === "fret") {
      this.playNoise(context, .045, .042 * level, 2_300, "bandpass");
      this.playTone(context, 640, .055, .026 * level, "square");
      return;
    }
    if (kind === "deflector") {
      this.playNoise(context, .12, .072 * level, 1_150, "bandpass");
      this.playTone(context, 520, .13, .05 * level, "triangle", 760);
      return;
    }
    if (kind === "reveal") {
      this.playNoise(context, .16, .05 * level, 2_800, "highpass");
      this.playTone(context, 980, .2, .046 * level, "sawtooth", 180);
      return;
    }
    if (kind === "settle") {
      this.playNoise(context, .08, .025 * level, 1_400, "bandpass");
      this.playTone(context, 184, .34, .06 * level, "sine", 128);
      this.playTone(context, 548, .22, .028 * level, "sine", 470);
      return;
    }
    if (kind === "land") {
      this.playTone(context, 286, .18, .042 * level, "sine", 176);
      return;
    }
    const presets = {
      unlock: [440, 0.11, 0.04, "sine"],
      phase: [220, 0.16, 0.035, "triangle"],
      spin: [92, 0.24, 0.025, "sawtooth"],
    } as const;
    const [frequency, duration, volume, type] = presets[kind as "unlock" | "phase" | "spin"];
    this.playTone(context, frequency, duration, volume * level, type);
  }

  multiplierReveal(value: RouletteMultiplier, index: number, total: number) {
    if (!this.enabled || !this.unlocked) return;
    const context = this.ensureAudio();
    if (!context) return;
    const now = context.currentTime;
    const baseFrequency = value >= 500 ? 720 : value >= 400 ? 640 : value >= 300 ? 570 : value >= 200 ? 500 : 430;
    const progress = index / Math.max(1, total - 1);
    const strength = value >= 500 ? 1.45 : value >= 400 ? 1.25 : value >= 300 ? 1.1 : value >= 200 ? .95 : .82;
    this.cue("reveal", strength);
    const volume = (.035 + progress * .025 + (value >= 300 ? .015 : 0)) * strength;
    [0, .075, .15].forEach((offset, toneIndex) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const frequency = baseFrequency * (1 + toneIndex * .24 + progress * .08);
      const duration = .22 + progress * .08;
      oscillator.type = toneIndex === 2 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, now + offset);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(60, frequency * .72), now + offset + duration);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(volume / (toneIndex + 1), now + offset + .012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + duration + .02);
    });
  }

  private startWheelBed(context: AudioContext) {
    const buffer = this.createNoiseBuffer(context, 1.2);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(460, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.026, context.currentTime + .18);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
    this.wheelBed = source;
    this.wheelBedGain = gain;
  }

  private playTone(
    context: AudioContext,
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    endFrequency = frequency * .72,
  ) {
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(35, frequency), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, endFrequency), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + .012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .025);
  }

  private playNoise(
    context: AudioContext,
    duration: number,
    volume: number,
    frequency: number,
    filterType: BiquadFilterType,
  ) {
    const now = context.currentTime;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.createNoiseBuffer(context, duration);
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, now);
    filter.Q.setValueAtTime(filterType === "bandpass" ? 1.8 : .7, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + .004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(now);
    source.stop(now + duration + .025);
  }

  private createNoiseBuffer(context: AudioContext, duration: number) {
    const frameCount = Math.max(1, Math.ceil(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private ensureAudio() {
    if (this.audioContext) return this.audioContext;
    const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return undefined;
    this.audioContext = new Context();
    return this.audioContext;
  }
  speak(phrase: string) {
    if (!this.enabled || !this.unlocked || !window.speechSynthesis || phrase === this.lastPhrase) return;
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

  private physicsReplay?: RoulettePhysicsReplay;

  private activeSpinRoundId = "";


  private ballDropTimer?: number;

  private ballSoundTimers: number[] = [];

  private deflectorHitTimer?: number;

  private resultAnnouncementTimer?: number;

  private announcedResultKey = "";

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
    const physicsCanvas = this.root.querySelector<HTMLCanvasElement>("[data-physics-wheel]");
    if (physicsCanvas) {
      void RoulettePhysicsReplay.create(physicsCanvas)
        .then((replay) => { this.physicsReplay = replay; })
        .catch((error) => {
          physicsCanvas.dataset.error = error instanceof Error ? error.message : "PHYSICS_REPLAY_UNAVAILABLE";
          console.warn("3D physics replay unavailable; keeping the existing wheel fallback.", error);
        });
    }
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
    if (this.resultAnnouncementTimer) window.clearTimeout(this.resultAnnouncementTimer);
    this.socket?.close();
    this.physicsReplay?.destroy();
  }

  private bind() {
    this.root.querySelectorAll<HTMLButtonElement>(".table-bet").forEach((button) => {
      button.addEventListener("click", () => {
        this.updateSoundButtons(this.voice.unlock());
        this.addSelection(button);
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-stake]").forEach((button) => {
      button.addEventListener("click", () => {
        this.updateSoundButtons(this.voice.unlock());
        this.selectedChipCents = Number(button.dataset.stake);
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='undo']").forEach((button) => button.addEventListener("click", () => this.undo()));
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='clear']").forEach((button) => button.addEventListener("click", () => this.clearSelections()));
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='rebet']").forEach((button) => button.addEventListener("click", () => this.rebet()));
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='double']").forEach((button) => button.addEventListener("click", () => this.doubleSelections()));
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='racetrack']").forEach((button) => button.addEventListener("click", () => this.toggleRacetrack()));
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='neighbors']").forEach((button) => button.addEventListener("click", () => this.toggleNeighbors()));
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='menu']").forEach((button) => button.addEventListener("click", () => { window.location.href = "/"; }));
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='sound']").forEach((button) => button.addEventListener("click", () => {
      const enabled = this.voice.toggle();
      if (enabled && this.snapshot?.round.phase === "SPINNING") {
        this.voice.startSpin(getRouletteMotionProfile(this.snapshot.round.id).ballOrbitMs);
      }
      this.updateSoundButtons(enabled);
    }));
    this.root.querySelector<HTMLButtonElement>("[data-action='refresh']")?.addEventListener("click", () => void this.load());
    this.root.querySelectorAll<HTMLButtonElement>("[data-action^='drawer-']").forEach((button) => button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "drawer-close") this.closeDrawers();
      else if (action) this.toggleDrawer(action.replace("drawer-", ""));
    }));
  }

  private updateSoundButtons(enabled: boolean) {
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='sound']").forEach((soundButton) => {
      soundButton.classList.toggle("is-active", enabled);
      const label = soundButton.querySelector("span");
      if (label) label.textContent = enabled ? "SES AÇIK" : "SESİ AÇ";
      const small = soundButton.querySelector("small");
      if (small) small.textContent = enabled ? "AÇIK" : "SES";
    });
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
      this.announcedResultKey = "";
      if (this.resultAnnouncementTimer) window.clearTimeout(this.resultAnnouncementTimer);
      this.resultAnnouncementTimer = undefined;
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
    const previousRevealCount = previous?.round.revealedMultipliers.length ?? 0;
    const newRevealIndex = next.round.revealedMultipliers.length > previousRevealCount
      ? next.round.revealedMultipliers.length - 1
      : -1;
    const newRevealValue = newRevealIndex >= 0 ? next.round.revealedMultipliers[newRevealIndex] : undefined;
    this.render();
    if (newRevealIndex >= 0 && newRevealValue) this.playMultiplierReveal(newRevealIndex, newRevealValue);
  }

  private announcePhase(snapshot: RouletteSnapshot) {
    const phrase = getRoulettePhaseAnnouncement(snapshot.round.phase);
    if (phrase) this.voice.speak(phrase);
    if (snapshot.round.phase === "MULTIPLIER_REVEAL") this.voice.cue("reveal");
    if (snapshot.round.phase !== "SPINNING") this.voice.stopSpin();
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
      button.classList.remove("is-multiplier-low", "is-multiplier-mid", "is-multiplier-high", "is-multiplier-ultra");
      if (value) {
        const tier = value >= 500 ? "ultra" : value >= 300 ? "high" : value >= 150 ? "mid" : "low";
        button.classList.add(`is-multiplier-${tier}`);
      }
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
      ? round.revealedMultipliers.map((value, index) => {
        const tier = value >= 500 ? "ultra" : value >= 300 ? "high" : value >= 150 ? "mid" : "low";
        return `<span class="multiplier-chip is-${tier} ${lucky.has(round.luckyNumbers[index]) ? "is-lucky" : ""}" style="--reveal-index:${index}">${value}x</span>`;
      }).join("")
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
      .filter((target) => {
        const rect = target.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .sort((a, b) => Number(b.closest(".roulette-mobile-table") !== null) - Number(a.closest(".roulette-mobile-table") !== null));
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
    strike.style.setProperty("--strike-start-x", `${sourceX}px`);
    strike.style.setProperty("--strike-start-y", `${sourceY}px`);
    strike.style.setProperty("--strike-target-x", `${x}px`);
    strike.style.setProperty("--strike-target-y", `${y}px`);
    strike.style.setProperty("--strike-length", `${Math.hypot(x - sourceX, y - sourceY)}px`);
    strike.style.setProperty("--strike-angle", `${Math.atan2(y - sourceY, x - sourceX)}rad`);
    strike.style.setProperty("--strike-index", String(index));
    const impact = document.createElement("span");
    impact.className = `multiplier-impact${value >= 300 ? " is-major" : ""}`;
    impact.style.setProperty("--impact-x", `${x}px`);
    impact.style.setProperty("--impact-y", `${y}px`);
    effects.append(strike, impact);
    target.classList.add("is-multiplier-impact");
    this.voice.multiplierReveal(value, index, this.snapshot?.round.multipliersTotal ?? 1);
    window.setTimeout(() => {
      strike.remove();
      impact.remove();
      target.classList.remove("is-multiplier-impact");
    }, value >= 300 ? 1450 : 1050);
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
    const profile = getRouletteMotionProfile(roundId);
    const { rotorOrbitMs, ballOrbitMs } = profile;
    const phaseElapsed = Math.max(0, Date.now() + this.serverOffsetMs - Date.parse(this.snapshot?.round.phaseStartedAt ?? ""));
    if (this.activeSpinRoundId === roundId && this.wheelAnimation && this.ballAnimation) {
      this.wheelAnimation.currentTime = phaseElapsed % rotorOrbitMs;
      this.ballAnimation.currentTime = phaseElapsed % ballOrbitMs;
      this.wheelAnimation.play();
      this.ballAnimation.play();
      this.voice.startSpin(profile.ballOrbitMs);
      return;
    }
    this.activeSpinRoundId = roundId;
    if (this.ballDropTimer) window.clearTimeout(this.ballDropTimer);
    this.ballDropTimer = undefined;
    if (this.deflectorHitTimer) window.clearTimeout(this.deflectorHitTimer);
    this.deflectorHitTimer = undefined;
    this.wheelAnimation?.cancel();
    this.ballAnimation?.cancel();
    this.settledResultKey = "";
    this.updateLabelOrientations(wheel, 0);
    rotor.style.transform = "rotate(0deg)";
    wheel.classList.add("is-spinning");
    this.voice.startSpin(profile.ballOrbitMs);
    if (this.physicsReplay) {
      void this.physicsReplay.startLoop(roundId, phaseElapsed).catch((error) => {
        const physicsCanvas = this.root.querySelector<HTMLCanvasElement>("[data-physics-wheel]");
        if (physicsCanvas) {
          physicsCanvas.dataset.error =
            error instanceof Error ? error.message : "PHYSICS_REPLAY_UNAVAILABLE";
        }
        console.warn("Authoritative roulette replay could not start.", error);
      });
    }
    const { outerRadius } = this.readWheelRadii(wheel);
    ball.style.transform = `rotate(${profile.initialBallAngle}deg) translateY(-${outerRadius}px)`;
    if (this.prefersReducedMotion()) {
      this.stopLabelOrientationSync();
      wheel.classList.remove("is-spinning");
      this.updateLabelOrientations(wheel, 0);
      ball.style.transform = `rotate(0deg) translateY(-${outerRadius}px)`;
      return;
    }
    this.wheelAnimation = rotor.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
      { duration: rotorOrbitMs, iterations: Infinity, easing: "linear" },
    );
    const orbitTransform = (angle: number, radius: number) =>
      `rotate(${angle}deg) translateY(-${radius}px)`;
    this.ballAnimation = ball.animate(
      [
        { transform: orbitTransform(profile.initialBallAngle, outerRadius), offset: 0 },
        { transform: orbitTransform(profile.initialBallAngle - 82, outerRadius + 3), offset: .23, easing: "cubic-bezier(.4,0,.6,1)" },
        { transform: orbitTransform(profile.initialBallAngle - 180, outerRadius - 2), offset: .5, easing: "cubic-bezier(.4,0,.6,1)" },
        { transform: orbitTransform(profile.initialBallAngle - 278, outerRadius + 2), offset: .77, easing: "cubic-bezier(.4,0,.6,1)" },
        { transform: orbitTransform(profile.initialBallAngle - 360, outerRadius), offset: 1 },
      ],
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

  private finishWheelSpinAt(winningNumber: number, _animationElapsedMs: number) {
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

    if (this.physicsReplay) {
      this.ballAnimation?.cancel();
      this.wheelAnimation?.cancel();
      wheel.classList.remove("is-spinning");
      const roundId = this.snapshot?.round.id ?? "";
      void this.physicsReplay
        .playTo(roundId, winningNumber, () => {
          if (this.animatedResultKey !== resultKey) return;
          this.settledResultKey = resultKey;
          this.voice.cue("settle");
          this.announceSettledResult();
          this.render();
        })
        .catch((error) => {
          const physicsCanvas =
            this.root.querySelector<HTMLCanvasElement>("[data-physics-wheel]");
          if (physicsCanvas) {
            physicsCanvas.dataset.error =
              error instanceof Error
                ? error.message
                : "PHYSICS_REPLAY_UNAVAILABLE";
          }
          if (this.animatedResultKey !== resultKey) return;
          this.settledResultKey = resultKey;
          this.announceSettledResult();
          this.render();
        });
      return;
    }

    this.clearBallSoundTimers();
    if (this.ballDropTimer) window.clearTimeout(this.ballDropTimer);
    this.ballDropTimer = undefined;
    this.ballAnimation?.cancel();
    this.wheelAnimation?.cancel();
    this.stopLabelOrientationSync();
    wheel.classList.remove("is-spinning");
    this.settledResultKey = resultKey;
    this.voice.cue("settle");
    this.announceSettledResult();
    this.render();
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
    if (this.physicsReplay) {
      this.ballAnimation?.cancel();
      this.wheelAnimation?.cancel();
      wheel.classList.remove("is-spinning");
      const roundId = this.snapshot?.round.id ?? "";
      void this.physicsReplay
        .settle(roundId, winningNumber)
        .then(() => {
          if (this.settledResultKey === resultKey) return;
          this.wheelAnimation = undefined;
          this.ballAnimation = undefined;
          this.settledResultKey = resultKey;
          this.announceSettledResult();
          this.render();
        })
        .catch((error) => {
          const physicsCanvas = this.root.querySelector<HTMLCanvasElement>("[data-physics-wheel]");
          if (physicsCanvas) {
            physicsCanvas.dataset.error =
              error instanceof Error ? error.message : "PHYSICS_REPLAY_UNAVAILABLE";
          }
          this.wheelAnimation = undefined;
          this.ballAnimation = undefined;
          this.settledResultKey = resultKey;
          this.announceSettledResult();
          this.render();
        });
      return;
    }
    this.ballAnimation?.cancel();
    this.wheelAnimation?.cancel();
    wheel.classList.remove("is-spinning");
    this.stopLabelOrientationSync();
    this.wheelAnimation = undefined;
    this.ballAnimation = undefined;
    this.settledResultKey = resultKey;
    this.announceSettledResult();
    this.render();
  }

  private announceSettledResult() {
    const round = this.snapshot?.round;
    if (!round || round.winningNumber === null) return;
    const resultKey = `${round.id}:${round.winningNumber}`;
    if (this.announcedResultKey === resultKey) return;
    this.announcedResultKey = resultKey;
    this.voice.speak(getRouletteResultAnnouncement(round.winningNumber));
    const multiplierIndex = round.luckyNumbers.indexOf(round.winningNumber);
    const multiplier = multiplierIndex >= 0 ? round.revealedMultipliers[multiplierIndex] : undefined;
    if (multiplier === undefined) return;
    this.resultAnnouncementTimer = window.setTimeout(() => {
      this.resultAnnouncementTimer = undefined;
      if (this.snapshot?.round.id === round.id && this.snapshot.round.winningNumber === round.winningNumber) {
        this.voice.speak(`Kazanan sayıda ${multiplier} çarpan.`);
      }
    }, 1_050);
  }

  private clearBallSoundTimers() {
    this.ballSoundTimers.forEach((timer) => window.clearTimeout(timer));
    this.ballSoundTimers = [];
  }

  private readTransformValues(element: HTMLElement) {
    const transform = getComputedStyle(element).transform;
    if (!transform || transform === "none") return null;
    const matrixMatch = transform.match(/matrix(?:3d)?\(([^)]+)\)/);
    const values = matrixMatch?.[1].split(",").map(Number);
    return values && (values.length === 6 || values.length === 16) && values.every(Number.isFinite) ? values : null;
  }

  private startLabelOrientationSync() {}

  private updateLabelOrientations(wheel: HTMLElement, _rotorRotation: number) {
    wheel.querySelectorAll<HTMLElement>(".wheel-number-label").forEach((label) => {
      const labelBody = label.querySelector<HTMLElement>("b");
      labelBody?.style.setProperty("--label-flip", "0deg");
    });
  }

  private stopLabelOrientationSync() {}

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
