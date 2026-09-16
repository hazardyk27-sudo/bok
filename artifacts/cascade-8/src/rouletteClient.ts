type RoulettePhase = "OPEN" | "LAST_CALL" | "LOCKED" | "SPINNING" | "RESULT" | "MULTIPLIER_REVEAL" | "SETTLING" | "INTERMISSION";
type RouletteMultiplier = 50 | 100 | 150 | 200 | 250 | 300 | 400 | 500;
type RouletteSnapshot = {
  serverTime: string;
  coordinator: "leader" | "standby";
  wallet: { sessionId: string; balanceCents: number };
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

const API_BASE = "/api/roulette";
const PHASE_LABELS: Record<RoulettePhase, string> = {
  OPEN: "BAHİSLER AÇIK",
  LAST_CALL: "SON ÇAĞRI",
  LOCKED: "MASA KİLİTLENDİ",
  SPINNING: "ÇARK DÖNÜYOR",
  RESULT: "KAZANAN SAYI",
  MULTIPLIER_REVEAL: "MULTIPLIER REVEAL",
  SETTLING: "ÖDEME YAPILIYOR",
  INTERMISSION: "YENİ ROUND HAZIRLANIYOR",
};
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const formatCredits = (cents: number) => (cents / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatCountdown = (milliseconds: number) => {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

class RouletteVoice {
  private enabled = false;
  private lastPhrase = "";

  unlock() {
    this.enabled = true;
    window.speechSynthesis?.cancel();
    this.speak("Ses açıldı");
  }

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
  private selectedNumber: number | null = null;
  private stakeCents = 100;
  private betStatus = "";
  private roundId = "";
  private statusTimer?: number;
  private voice = new RouletteVoice();
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.setConnection("SENKRON BAŞLATILIYOR", false);
    this.bind();
    void this.load();
    this.connect();
    this.statusTimer = window.setInterval(() => this.renderCountdown(), 200);
  }

  destroy() {
    if (this.statusTimer) window.clearInterval(this.statusTimer);
    this.socket?.close();
  }

  private bind() {
    this.root.querySelectorAll<HTMLButtonElement>("[data-number]").forEach((button) => {
      button.addEventListener("click", () => {
        this.voice.unlock();
        this.selectedNumber = Number(button.dataset.number);
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-stake]").forEach((button) => {
      button.addEventListener("click", () => {
        this.voice.unlock();
        this.stakeCents = Number(button.dataset.stake);
        this.render();
      });
      button.classList.toggle("is-selected", Number(button.dataset.stake) === this.stakeCents);
    });
    this.root.querySelector<HTMLButtonElement>("[data-action='bet']")?.addEventListener("click", () => void this.placeBet());
    this.root.querySelector<HTMLButtonElement>("[data-action='sound']")?.addEventListener("click", (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.classList.toggle("is-active", this.voice.toggle());
      button.querySelector("span")!.textContent = button.classList.contains("is-active") ? "SES AÇIK" : "SESİ AÇ";
    });
    this.root.querySelector<HTMLButtonElement>("[data-action='refresh']")?.addEventListener("click", () => void this.load());
  }

  private async load() {
    try {
      const response = await fetch(`${API_BASE}/snapshot`, { credentials: "same-origin", signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error("snapshot");
      this.applySnapshot(await response.json() as RouletteSnapshot);
      const historyResponse = await fetch(`${API_BASE}/history?limit=12`, { credentials: "same-origin", signal: AbortSignal.timeout(7000) });
      if (historyResponse.ok) this.renderHistory((await historyResponse.json() as { results: Array<{ sequence: number; winningNumber: number; luckyNumbers: number[]; multipliers: number[] }> }).results);
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
    this.snapshot = next;
    this.serverOffsetMs = Date.parse(next.serverTime) - Date.now();
    if (this.roundId !== next.round.id) {
      this.roundId = next.round.id;
      this.selectedNumber = null;
      this.betStatus = "";
    }
    if (previous?.round.phase !== next.round.phase) this.announcePhase(next);
    if (previous?.round.winningNumber === null && next.round.winningNumber !== null) {
      this.voice.speak(`${next.round.winningNumber} numara kazandı`);
    }
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
    const bettingOpen = round.phase === "OPEN" || round.phase === "LAST_CALL";
    this.root.querySelector<HTMLElement>("[data-phase]")!.textContent = PHASE_LABELS[round.phase];
    this.root.querySelector<HTMLElement>("[data-round]")!.textContent = `ROUND ${String(round.sequence).padStart(6, "0")}`;
    this.root.querySelector<HTMLElement>("[data-balance]")!.textContent = formatCredits(wallet.balanceCents);
    this.root.querySelector<HTMLElement>("[data-commitment]")!.textContent = round.commitmentHash.slice(0, 18).toUpperCase();
    this.root.querySelector<HTMLElement>("[data-selected-number]")!.textContent = this.selectedNumber === null ? "—" : String(this.selectedNumber);
    this.root.querySelector<HTMLElement>("[data-stake-value]")!.textContent = formatCredits(this.stakeCents);
    this.root.querySelector<HTMLButtonElement>("[data-action='bet']")!.disabled = !bettingOpen || this.selectedNumber === null || wallet.balanceCents < this.stakeCents;
    this.root.querySelector<HTMLElement>("[data-bet-status]")!.textContent = this.betStatus || (bettingOpen ? (round.phase === "LAST_CALL" ? "SON ÇAĞRI // BAHİSLER KAPANIYOR" : "SAYINI SEÇ VE BAHİSİ ONAYLA") : "BU ROUND İÇİN BAHİSLER KAPALI");
    this.root.querySelectorAll<HTMLElement>("[data-winning-number]").forEach((element) => {
      element.textContent = round.winningNumber === null ? "?" : String(round.winningNumber);
      element.classList.toggle("is-visible", round.winningNumber !== null);
    });
    this.root.querySelector<HTMLElement>("[data-wheel]")!.classList.toggle("is-spinning", round.phase === "SPINNING");
    this.root.querySelector<HTMLElement>("[data-wheel]")!.style.setProperty("--winning-angle", `${(round.winningNumber ?? 0) * 9.73}deg`);
    this.root.querySelectorAll<HTMLButtonElement>("[data-number]").forEach((button) => {
      const number = Number(button.dataset.number);
      button.classList.toggle("is-selected", this.selectedNumber === number);
      button.classList.toggle("is-winning", round.winningNumber === number);
      button.disabled = !bettingOpen;
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-stake]").forEach((button) => {
      button.classList.toggle("is-selected", Number(button.dataset.stake) === this.stakeCents);
    });
    const lucky = new Set(round.luckyNumbers);
    this.root.querySelector<HTMLElement>("[data-lucky-list]")!.innerHTML = round.luckyNumbers.length
      ? round.luckyNumbers.map((number) => `<span class="lucky-chip">${number}</span>`).join("")
      : `<span class="muted-copy">Sonuçtan sonra açıklanacak</span>`;
    this.root.querySelector<HTMLElement>("[data-multiplier-list]")!.innerHTML = round.revealedMultipliers.length
      ? round.revealedMultipliers.map((value, index) => `<span class="multiplier-chip ${lucky.has(round.luckyNumbers[index]) ? "is-lucky" : ""}" style="--reveal-index:${index}">${value}x</span>`).join("")
      : `<span class="muted-copy">Tek tek reveal bekleniyor</span>`;
    this.root.querySelector<HTMLElement>("[data-reveal-count]")!.textContent = `${round.revealedMultipliers.length}/${round.multipliersTotal}`;
    this.renderCountdown();
  }

  private renderCountdown() {
    if (!this.snapshot) return;
    const remaining = Date.parse(this.snapshot.round.nextTransitionAt) - (Date.now() + this.serverOffsetMs);
    this.root.querySelector<HTMLElement>("[data-countdown]")!.textContent = formatCountdown(remaining);
    this.root.querySelector<HTMLElement>("[data-progress]")!.style.setProperty("--countdown-progress", `${Math.max(0, Math.min(100, 100 - (remaining / Math.max(1, this.snapshot.round.countdownMs)) * 100))}%`);
  }

  private async placeBet() {
    if (this.selectedNumber === null) return;
    this.voice.unlock();
    const button = this.root.querySelector<HTMLButtonElement>("[data-action='bet']")!;
    button.disabled = true;
    try {
      const response = await fetch(`${API_BASE}/bets`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ number: this.selectedNumber, stakeCents: this.stakeCents, idempotencyKey: `${crypto.randomUUID()}-${Date.now()}` }),
      });
      const data = await response.json() as { wallet?: { balanceCents: number }; error?: string; bet?: { number: number; stakeCents: number } };
      if (!response.ok) throw new Error(data.error ?? "Bahis kabul edilmedi");
      this.betStatus = `BAHİS KABUL // ${data.bet?.number} NUMARA // ${formatCredits(data.bet?.stakeCents ?? this.stakeCents)}`;
      if (this.snapshot && data.wallet) this.snapshot.wallet.balanceCents = data.wallet.balanceCents;
      this.render();
    } catch (error) {
      this.betStatus = error instanceof Error ? error.message : "BAHİS KABUL EDİLMEDİ";
      this.root.querySelector<HTMLElement>("[data-bet-status]")!.textContent = this.betStatus;
      button.disabled = false;
    }
  }

  private renderHistory(results: Array<{ sequence: number; winningNumber: number; luckyNumbers: number[]; multipliers: number[] }>) {
    const target = this.root.querySelector<HTMLElement>("[data-history]");
    if (!target) return;
    target.innerHTML = results.map((result) => `
      <div class="history-row">
        <span>#${String(result.sequence).padStart(6, "0")}</span>
        <strong class="${result.winningNumber === 0 ? "is-zero" : RED_NUMBERS.has(result.winningNumber) ? "is-red" : "is-black"}">${result.winningNumber}</strong>
        <span>${result.luckyNumbers.length} LUCKY</span>
        <span>${result.multipliers.map((value) => `${value}x`).join(" · ")}</span>
      </div>
    `).join("") || `<span class="muted-copy">İlk sonuç bekleniyor</span>`;
  }

  private setConnection(label: string, live: boolean) {
    const element = this.root.querySelector<HTMLElement>("[data-connection]");
    if (!element) return;
    element.textContent = label;
    element.classList.toggle("is-live", live);
  }
}