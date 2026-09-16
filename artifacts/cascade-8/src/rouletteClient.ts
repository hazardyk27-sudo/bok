import {
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
    countdownMs: number;
    commitmentHash: string;
    winningNumber: number | null;
    luckyNumbers: number[];
    revealedMultipliers: RouletteMultiplier[];
    multipliersTotal: number;
    version: number;
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
const WHEEL_LANDING_DURATION_MS = 3900;
const BALL_LANDING_DURATION_MS = 3850;
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
  unlock() { this.enabled = true; window.speechSynthesis?.cancel(); this.speak("Ses açıldı"); }
  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) window.speechSynthesis?.cancel();
    else this.speak("Türkçe seslendirme açık");
    return this.enabled;
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
  private selections = new Map<string, RouletteSelection>();
  private lastPlacedSelections: RouletteSelection[] = [];
  private undoStack: string[] = [];
  private betStatus = "";
  private roundId = "";
  private statusTimer?: number;
  private voice = new RouletteVoice();
  private ballAnimation?: Animation;
  private wheelAnimation?: Animation;
  private labelSyncFrame?: number;
  private ballDropTimer?: number;
  private animatedResultKey = "";
  private settledResultKey = "";
  private liveSummaryKey = "";
  private wasDocumentHidden = false;
  private visibilityResumePending = false;
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
    document.removeEventListener("visibilitychange", this.visibilityChangeHandler);
    this.stopLabelOrientationSync();
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
    this.root.querySelector<HTMLButtonElement>("[data-action='bet']")?.addEventListener("click", () => void this.placeBets());
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='undo']").forEach((button) => button.addEventListener("click", () => this.undo()));
    this.root.querySelector<HTMLButtonElement>("[data-action='clear']")?.addEventListener("click", () => this.clearSelections());
    this.root.querySelector<HTMLButtonElement>("[data-action='rebet']")?.addEventListener("click", () => this.rebet());
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
    const existing = this.selections.get(key);
    this.selections.set(key, {
      key,
      type,
      numbers,
      label,
      stakeCents: Math.min(MAX_BET_PER_AREA, (existing?.stakeCents ?? 0) + this.selectedChipCents),
    });
    this.betStatus = "";
    this.render();
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
    this.root.classList.toggle("is-wheel-spinning", next.round.phase === "SPINNING");
    this.root.classList.toggle("is-multiplier-reveal", next.round.phase === "MULTIPLIER_REVEAL");
    this.serverOffsetMs = Date.parse(next.serverTime) - Date.now();
    if (this.roundId !== next.round.id) {
      this.roundId = next.round.id;
      this.selections.clear();
      this.undoStack = [];
      this.betStatus = "";
    }
    const phaseChanged = previous?.round.phase !== next.round.phase;
    if (phaseChanged) {
      this.announcePhase(next);
      if (next.round.phase === "SETTLING" || next.round.phase === "INTERMISSION") void this.load();
    }
    const animationTransition = getRouletteAnimationTransition(previous?.round ?? null, next.round);
    const resumingFromBackground = this.visibilityResumePending;
    if (animationTransition.startsSpin || (resumingFromBackground && next.round.phase === "SPINNING")) this.startWheelSpin();
    if (resumingFromBackground && next.round.winningNumber !== null) {
      this.resumeResultPresentation(next.round.winningNumber, next.round.phase, next.round.phaseStartedAt);
    } else if (animationTransition.winningNumber !== null) {
      this.finishWheelSpin(animationTransition.winningNumber);
    }
    if (animationTransition.winningNumber !== null) this.voice.speak(`${animationTransition.winningNumber} numara kazandı`);
    if ((previous?.round.revealedMultipliers.length ?? 0) < next.round.revealedMultipliers.length) {
      const value = next.round.revealedMultipliers.at(-1);
      if (value) this.voice.speak(`${value} çarpan`);
    }
    this.render();
  }

  private announcePhase(snapshot: RouletteSnapshot) {
    if (snapshot.round.phase === "OPEN") this.voice.speak("Bahisler açıldı");
    if (snapshot.round.phase === "LAST_CALL") this.voice.speak("Son çağrı, bahisler kapanıyor");
    if (snapshot.round.phase === "LOCKED") this.voice.speak("Bahisler kapandı");
    if (snapshot.round.phase === "SPINNING") this.voice.speak("Çark dönüyor");
    if (snapshot.round.phase === "RESULT") this.voice.speak("Kazanan sayı açıklanıyor");
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
    this.root.querySelector<HTMLButtonElement>("[data-action='bet']")!.disabled = !bettingOpen || !this.selections.size || wallet.balanceCents < totalStakeCents;
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='undo']").forEach((button) => { button.disabled = !this.undoStack.length; });
    this.root.querySelector<HTMLButtonElement>("[data-action='clear']")!.disabled = !this.selections.size;
    this.root.querySelector<HTMLButtonElement>("[data-action='rebet']")!.disabled = !this.lastPlacedSelections.length || !bettingOpen;
    this.root.querySelector<HTMLElement>("[data-bet-status]")!.textContent = this.betStatus || (bettingOpen ? (round.phase === "LAST_CALL" ? "SON ÇAĞRI // CHIPLERİ MASAYA KOY" : "CHIP SEÇ // BİR VEYA DAHA FAZLA ALAN SEÇ") : "BU ROUND İÇİN BAHİSLER KAPALI");
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
      button.classList.toggle("has-multiplier", Boolean(value));
      button.classList.toggle("is-high-multiplier", Boolean(value && value >= 300));
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

  private renderCountdown() {
    if (!this.snapshot) return;
    const remaining = Date.parse(this.snapshot.round.nextTransitionAt) - (Date.now() + this.serverOffsetMs);
    this.root.querySelector<HTMLElement>("[data-countdown]")!.textContent = formatCountdown(remaining);
    this.root.querySelector<HTMLElement>("[data-progress]")!.style.setProperty("--countdown-progress", `${Math.max(0, Math.min(100, 100 - (remaining / Math.max(1, this.snapshot.round.countdownMs)) * 100))}%`);
  }

  private async placeBets() {
    if (!this.selections.size) return;
    this.voice.unlock();
    const button = this.root.querySelector<HTMLButtonElement>("[data-action='bet']")!;
    button.disabled = true;
    try {
      const bets = [...this.selections.values()].map(({ type, numbers, stakeCents, label }) => ({ type, numbers, stakeCents, label }));
      const response = await fetch(`${API_BASE}/bets`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bets, idempotencyKey: `${crypto.randomUUID()}-${Date.now()}` }),
      });
      const data = await response.json() as { wallet?: { balanceCents: number }; error?: string; bets?: unknown[]; totalStakeCents?: number };
      if (!response.ok) throw new Error(data.error ?? "Bahisler kabul edilmedi");
      this.lastPlacedSelections = bets.map((bet) => ({ ...bet, key: `${bet.type}:${bet.numbers.join("-")}` }));
      this.betStatus = `${data.bets?.length ?? bets.length} BAHİS KABUL // TOPLAM ${formatCredits(data.totalStakeCents ?? 0)}`;
      this.selections.clear();
      this.undoStack = [];
      if (this.snapshot && data.wallet) this.snapshot.wallet.balanceCents = data.wallet.balanceCents;
      this.render();
    } catch (error) {
      this.betStatus = error instanceof Error ? error.message : "BAHİSLER KABUL EDİLMEDİ";
      this.root.querySelector<HTMLElement>("[data-bet-status]")!.textContent = this.betStatus;
      button.disabled = false;
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
    if (this.ballDropTimer) window.clearTimeout(this.ballDropTimer);
    this.ballDropTimer = undefined;
    this.wheelAnimation?.cancel();
    this.ballAnimation?.cancel();
    this.settledResultKey = "";
    wheel.style.setProperty("--label-counter-angle", "0deg");
    rotor.style.transform = "rotate(0deg)";
    wheel.classList.add("is-spinning");
    const { outerRadius } = this.readWheelRadii(wheel);
    if (this.prefersReducedMotion()) {
      this.stopLabelOrientationSync();
      wheel.classList.remove("is-spinning");
      ball.style.transform = `rotate(0deg) translateY(-${outerRadius}px)`;
      return;
    }
    this.wheelAnimation = rotor.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
      { duration: 1450, iterations: Infinity, easing: "linear" },
    );
    this.ballAnimation = ball.animate(
      [{ transform: `rotate(0deg) translateY(-${outerRadius}px)` }, { transform: `rotate(-360deg) translateY(-${outerRadius}px)` }],
      { duration: 620, iterations: Infinity, easing: "linear" },
    );
    const phaseElapsed = Math.max(0, Date.now() + this.serverOffsetMs - Date.parse(this.snapshot?.round.phaseStartedAt ?? ""));
    this.wheelAnimation.currentTime = phaseElapsed % 1450;
    this.ballAnimation.currentTime = phaseElapsed % 620;
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
    if (this.ballDropTimer) window.clearTimeout(this.ballDropTimer);
    this.ballDropTimer = undefined;
    const currentRotation = this.readRotation(rotor);
    const currentBallAngle = this.readBallAngle(ball);
    this.ballAnimation?.cancel();
    this.wheelAnimation?.cancel();
    wheel.classList.remove("is-spinning");
    const plan = getWheelLandingPlan(winningNumber, currentRotation, this.readWheelRadii(wheel));
    const { finalRotation, finalLabelAngle, outerRadius, pocketRadius } = plan;
    if (this.prefersReducedMotion()) {
      this.stopLabelOrientationSync();
      this.wheelAnimation = undefined;
      this.ballAnimation = undefined;
      rotor.style.transform = `rotate(${finalRotation}deg)`;
      wheel.style.setProperty("--label-counter-angle", finalLabelAngle);
      ball.style.transform = `rotate(-1440deg) translateY(-${pocketRadius}px)`;
      this.settledResultKey = resultKey;
      return;
    }
    const wheelDelta = finalRotation - currentRotation;
    this.wheelAnimation = rotor.animate(
      [
        { transform: `rotate(${currentRotation}deg)` },
        { transform: `rotate(${currentRotation + wheelDelta * .62}deg)`, offset: .55 },
        { transform: `rotate(${finalRotation}deg)` },
      ],
      { duration: 3900, easing: "linear", fill: "forwards" },
    );
    this.startLabelOrientationSync();
    this.wheelAnimation.currentTime = Math.min(Math.max(0, animationElapsedMs), WHEEL_LANDING_DURATION_MS);
    this.wheelAnimation.finished.then(() => {
      if (this.animatedResultKey !== resultKey) return;
      this.stopLabelOrientationSync();
      wheel.style.setProperty("--label-counter-angle", finalLabelAngle);
    }).catch(() => undefined);
    const finalBallAngle = -1440;
    const ballDelta = finalBallAngle - currentBallAngle;
    const outer = ball.animate(
      [
        { transform: `rotate(${currentBallAngle}deg) translateY(-${outerRadius}px)` },
        { transform: `rotate(${currentBallAngle + ballDelta * .55}deg) translateY(-${outerRadius}px)`, offset: .55 },
        { transform: `rotate(${currentBallAngle + ballDelta * .72}deg) translateY(-${outerRadius - 4}px)`, offset: .72 },
        { transform: `rotate(${currentBallAngle + ballDelta * .88}deg) translateY(-${pocketRadius + 5}px)`, offset: .88 },
        { transform: `rotate(${finalBallAngle}deg) translateY(-${pocketRadius}px)` },
      ],
      { duration: BALL_LANDING_DURATION_MS, easing: "linear", fill: "forwards" },
    );
    this.ballAnimation = outer;
    this.ballAnimation.currentTime = Math.min(Math.max(0, animationElapsedMs), BALL_LANDING_DURATION_MS);
    outer.finished.then(() => {
      if (this.animatedResultKey !== resultKey) return;
      this.settledResultKey = resultKey;
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
    const currentRotation = this.readRotation(rotor);
    this.ballAnimation?.cancel();
    this.wheelAnimation?.cancel();
    wheel.classList.remove("is-spinning");
    const { finalRotation, finalLabelAngle, pocketRadius } = getWheelLandingPlan(winningNumber, currentRotation, this.readWheelRadii(wheel));
    this.stopLabelOrientationSync();
    this.wheelAnimation = undefined;
    this.ballAnimation = undefined;
    rotor.style.transform = `rotate(${finalRotation}deg)`;
    wheel.style.setProperty("--label-counter-angle", finalLabelAngle);
    ball.style.transform = `rotate(-1440deg) translateY(-${pocketRadius}px)`;
    this.settledResultKey = resultKey;
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