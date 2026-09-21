import { ScratchSurface } from "./scratch/ScratchSurface";
import { getScratchCellLayerMarkup, getScratchCellPresentation } from "./scratch/ScratchPresentation";

type CadiKazanMode = "STANDARD" | "ADVANCED";
type CadiKazanStatus = "ACTIVE" | "CASHED_OUT" | "BUST" | "COMPLETED";

type CadiKazanRound = {
  id: string;
  mode: CadiKazanMode;
  alarmCount: number;
  cellCount: number;
  stakeCents: number;
  revealedCells: number[];
  revealedSafeCount: number;
  currentMultiplierBps: number;
  currentCashoutCents: number;
  status: CadiKazanStatus;
  payoutCents: number;
  revealedBombCells: number[];
  createdAt: string;
  updatedAt: string;
};

type CadiKazanState = {
  wallet: { sessionId: string; balanceCents: number };
  round: CadiKazanRound | null;
};

type CadiKazanMutation = {
  outcome: "SAFE" | "BUST" | "COMPLETED" | "CASHED_OUT" | "NOOP";
  state: CadiKazanState;
};

const API_BASE = "/api/cadi-kazan";

const formatCredits = (cents: number) => (cents / 100).toLocaleString("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatMultiplier = (basisPoints: number) => `${(basisPoints / 100).toLocaleString("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}x`;

const newIdempotencyKey = (prefix: string) => `${prefix}-${crypto.randomUUID()}-${Date.now()}`;

export const CADI_KAZAN_MARKUP = `
  <main class="witch-page" aria-labelledby="witch-title">
    <div class="witch-heading">
      <a class="back-link" href="/">← ANA MENÜ</a>
      <div>
        <span class="menu-kicker">FAHRİNİN YOLU // LUCKY SCRATCH</span>
        <h1 id="witch-title">CADI <em>KAZAN</em></h1>
        <p>Kartı aç, güvenli hücreleri bul ve riske girmeden kazancını al.</p>
      </div>
      <div class="witch-connection" data-witch-status>SERVER’A BAĞLANIYOR</div>
    </div>

    <section class="witch-wallet-bar" aria-label="Cadı Kazan bakiyesi">
      <div><span>ORTAK WALLET</span><strong data-witch-balance>0,00</strong></div>
      <div><span>ROUND</span><strong data-witch-round>—</strong></div>
      <div><span>DURUM</span><strong data-witch-round-status>HAZIR</strong></div>
    </section>

    <section class="witch-lobby" data-witch-lobby>
      <div class="witch-panel-heading">
        <span class="roulette-card-kicker">CHOOSE YOUR RISK</span>
        <h2>Oyun modu</h2>
        <p>Her bilet server tarafından oluşturulur. Bomba konumu tarayıcıya önceden gönderilmez.</p>
      </div>
      <div class="witch-mode-grid" role="group" aria-label="Cadı Kazan oyun modu">
        <button type="button" class="witch-mode-card is-selected" data-witch-mode="STANDARD">
          <span>STANDARD 5</span>
          <strong>1 BOMBА</strong>
          <small>5 alan · 4 güvenli açılış · 1.20x → 4.80x</small>
        </button>
        <button type="button" class="witch-mode-card" data-witch-mode="ADVANCED">
          <span>ADVANCED 25</span>
          <strong>25 ALAN</strong>
          <small>5×5 alan · alarm sayısını sen seç</small>
        </button>
      </div>
      <div class="witch-start-controls">
        <label>
          <span>ALARM SAYISI</span>
          <select data-witch-alarms disabled>
            <option value="1">1 ALARM</option>
            <option value="3">3 ALARM</option>
            <option value="5">5 ALARM</option>
            <option value="7">7 ALARM</option>
            <option value="10">10 ALARM</option>
          </select>
        </label>
        <label>
          <span>BİLET BEDELİ</span>
          <input data-witch-stake type="number" min="1" max="100" step="0.01" value="1.00" inputmode="decimal">
        </label>
        <button class="witch-primary-button" type="button" data-witch-action="start">BİLETİ AÇ</button>
      </div>
      <p class="witch-feedback" data-witch-feedback role="status">Mod seç ve biletini başlat.</p>
    </section>

     <section class="witch-play" data-witch-play hidden>
      <div class="witch-play-heading">
        <div>
          <span class="roulette-card-kicker" data-witch-play-mode>STANDARD 5</span>
          <h2 data-witch-play-title>Şansını dene</h2>
        </div>
        <div class="witch-cashout-card">
          <span>MEVCUT CASH OUT</span>
          <strong data-witch-multiplier>0.00x</strong>
          <small data-witch-payout>0,00 kredi</small>
        </div>
      </div>
      <div class="witch-board-wrap">
         <div class="witch-board" data-witch-board aria-label="Cadı Kazan kazınabilir alanları"></div>
      </div>
      <div class="witch-actions">
        <p class="witch-feedback" data-witch-play-feedback role="status">Güvenli bir alan seç.</p>
        <button class="witch-cashout-button" type="button" data-witch-action="cashout">CASH OUT</button>
        <button class="witch-secondary-button" type="button" data-witch-action="new" hidden>YENİ ROUND</button>
      </div>
    </section>

    <section class="witch-rules" aria-label="Cadı Kazan kuralları">
      <div><strong>01</strong><span>Her round server’da oluşturulur.</span></div>
      <div><strong>02</strong><span>Bomba açılırsa round BUST olur ve payout sıfırlanır.</span></div>
      <div><strong>03</strong><span>Güvenli hücrelerden sonra istediğin anda Cash Out yap.</span></div>
    </section>
  </main>
`;

export class WitchClient {
  private readonly root: HTMLElement;
  private state: CadiKazanState | null = null;
  private mode: CadiKazanMode = "STANDARD";
  private busy = false;
  private pendingRevealCell: number | null = null;
  private terminalRevealRoundId: string | null = null;
  private terminalRevealVisible = false;
  private terminalRevealTimer: number | null = null;
  private readonly scratchSurfaces = new Map<number, ScratchSurface>();

  constructor(root: HTMLElement) {
    this.root = root;
    this.bind();
    void this.load();
  }

  private bind() {
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.busy || this.state?.round?.status === "ACTIVE") return;
        this.mode = button.dataset.witchMode as CadiKazanMode;
        this.render();
      });
    });
    this.root.querySelector<HTMLButtonElement>("[data-witch-action='start']")?.addEventListener("click", () => void this.startRound());
    this.root.querySelector<HTMLButtonElement>("[data-witch-action='cashout']")?.addEventListener("click", () => void this.cashOut());
    this.root.querySelector<HTMLButtonElement>("[data-witch-action='new']")?.addEventListener("click", () => {
       if (this.state) this.applyState({ ...this.state, round: null });
    });
  }

  private async load() {
    try {
      const response = await fetch(`${API_BASE}/state`, { credentials: "same-origin" });
      const data = await response.json() as CadiKazanState & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Cadı Kazan yüklenemedi");
      this.applyState(data);
      if (data.round) this.mode = data.round.mode;
      this.setStatus("SERVER’A BAĞLI", true);
      this.render();
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : "BAĞLANTI HATASI", false);
      this.render();
    }
  }

  private async startRound() {
    const stakeInput = this.root.querySelector<HTMLInputElement>("[data-witch-stake]");
    const alarmInput = this.root.querySelector<HTMLSelectElement>("[data-witch-alarms]");
    const stakeCents = Math.round(Number(stakeInput?.value ?? 0) * 100);
    const alarmCount = this.mode === "STANDARD" ? 1 : Number(alarmInput?.value ?? 1);
    this.setFeedback("Bilet server’da oluşturuluyor…");
    this.busy = true;
    this.render();
    try {
      const response = await fetch(`${API_BASE}/rounds`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: this.mode, alarmCount, stakeCents, idempotencyKey: newIdempotencyKey("start") }),
      });
      const data = await response.json() as CadiKazanState & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Bilet başlatılamadı");
      this.applyState(data);
      this.setStatus("SERVER’A BAĞLI", true);
    } catch (error) {
      this.setFeedback(error instanceof Error ? error.message : "Bilet başlatılamadı");
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async reveal(cellIndex: number) {
    const round = this.state?.round;
    if (!round || round.status !== "ACTIVE" || this.busy || round.revealedCells.includes(cellIndex)) return;
    this.busy = true;
    this.pendingRevealCell = cellIndex;
    this.setFeedback("Alan server’da açılıyor…");
    this.render();
    try {
      const response = await fetch(`${API_BASE}/rounds/${encodeURIComponent(round.id)}/reveal`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cellIndex, idempotencyKey: newIdempotencyKey("reveal") }),
      });
      const data = await response.json() as CadiKazanMutation & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Alan açılamadı");
      this.applyState(data.state, data.state.round?.status !== "ACTIVE");
      this.setFeedback(
        data.outcome === "BUST" ? "BOMBA! Round BUST oldu." :
          data.outcome === "COMPLETED" ? "Tüm güvenli alanlar açıldı. Ödül tamamlandı." :
            data.outcome === "SAFE" ? "Güvenli alan. Cash Out kullanabilir veya devam edebilirsin." :
              "Bu alan daha önce açıldı.",
      );
    } catch (error) {
      this.scratchSurfaces.get(cellIndex)?.reset();
      this.setFeedback(error instanceof Error ? error.message : "Alan açılamadı");
    } finally {
      this.pendingRevealCell = null;
      this.busy = false;
      this.render();
    }
  }

  private async cashOut() {
    const round = this.state?.round;
    if (!round || round.status !== "ACTIVE" || round.revealedSafeCount < 1 || this.busy) return;
    this.busy = true;
    this.setFeedback("Cash Out server’da kesinleştiriliyor…");
    this.render();
    try {
      const response = await fetch(`${API_BASE}/rounds/${encodeURIComponent(round.id)}/cash-out`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: newIdempotencyKey("cashout") }),
      });
      const data = await response.json() as CadiKazanMutation & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Cash Out başarısız");
      this.applyState(data.state, data.state.round?.status !== "ACTIVE");
      this.setFeedback(data.outcome === "CASHED_OUT" ? "Kazanç wallet’a aktarıldı." : "Round zaten kapalı.");
    } catch (error) {
      this.setFeedback(error instanceof Error ? error.message : "Cash Out başarısız");
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private setStatus(value: string, connected: boolean) {
    const status = this.root.querySelector<HTMLElement>("[data-witch-status]");
    if (status) {
      status.textContent = value;
      status.classList.toggle("is-live", connected);
    }
  }

  private setFeedback(value: string) {
    this.root.querySelectorAll<HTMLElement>("[data-witch-feedback], [data-witch-play-feedback]").forEach((element) => {
      element.textContent = value;
    });
  }

  private clearTerminalRevealTimer() {
    if (this.terminalRevealTimer !== null) {
      window.clearTimeout(this.terminalRevealTimer);
      this.terminalRevealTimer = null;
    }
  }

  private destroyScratchSurfaces() {
    this.scratchSurfaces.forEach((surface) => surface.destroy());
    this.scratchSurfaces.clear();
  }

  private applyState(nextState: CadiKazanState, animateTerminal = false) {
    this.clearTerminalRevealTimer();
    this.state = nextState;
    const round = nextState.round;
    if (!round) {
      this.terminalRevealRoundId = null;
      this.terminalRevealVisible = false;
      this.destroyScratchSurfaces();
      this.render();
      return;
    }
    const terminal = round.status !== "ACTIVE";
    this.terminalRevealRoundId = terminal ? round.id : null;
    this.terminalRevealVisible = terminal && !animateTerminal;
    this.render();
    if (terminal && animateTerminal) {
      this.terminalRevealTimer = window.setTimeout(() => {
        this.terminalRevealVisible = true;
        this.terminalRevealTimer = null;
        this.render();
      }, 380);
    }
  }

  private render() {
    const state = this.state;
    const round = state?.round ?? null;
    const lobby = this.root.querySelector<HTMLElement>("[data-witch-lobby]");
    const play = this.root.querySelector<HTMLElement>("[data-witch-play]");
    const balance = this.root.querySelector<HTMLElement>("[data-witch-balance]");
    const roundLabel = this.root.querySelector<HTMLElement>("[data-witch-round]");
    const roundStatus = this.root.querySelector<HTMLElement>("[data-witch-round-status]");
    if (balance) balance.textContent = formatCredits(state?.wallet.balanceCents ?? 0);
    if (roundLabel) roundLabel.textContent = round ? `#${round.id.slice(0, 8).toUpperCase()}` : "—";
    if (roundStatus) roundStatus.textContent = round?.status ?? "HAZIR";

    const hasRound = Boolean(round);
    if (lobby) lobby.hidden = hasRound;
    if (play) play.hidden = !hasRound;
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-mode]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.witchMode === this.mode);
      button.disabled = this.busy || hasRound;
    });
    const alarms = this.root.querySelector<HTMLSelectElement>("[data-witch-alarms]");
    if (alarms) alarms.disabled = this.busy || hasRound || this.mode !== "ADVANCED";
    const start = this.root.querySelector<HTMLButtonElement>("[data-witch-action='start']");
    if (start) start.disabled = this.busy;

    if (!round) return;
    const board = this.root.querySelector<HTMLElement>("[data-witch-board]");
    if (board && board.childElementCount !== round.cellCount) {
      this.destroyScratchSurfaces();
      board.innerHTML = Array.from({ length: round.cellCount }, (_, index) => `
        <button type="button" class="witch-cell" data-witch-cell="${index}" aria-label="Kazınabilir kapalı alan">
          ${getScratchCellLayerMarkup()}
        </button>
      `).join("");
    }
    const revealedBombs = new Set(round.revealedBombCells);
    const terminalBoardVisible = round.status !== "ACTIVE"
      && this.terminalRevealRoundId === round.id
      && this.terminalRevealVisible;
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-cell]").forEach((button) => {
      const index = Number(button.dataset.witchCell);
      const isActuallyRevealed = round.revealedCells.includes(index);
      const isRevealed = isActuallyRevealed || terminalBoardVisible;
      const isBomb = round.status !== "ACTIVE"
        && revealedBombs.has(index)
        && (isActuallyRevealed || terminalBoardVisible);
      const presentation = getScratchCellPresentation(round.mode, isRevealed, isBomb);
      button.disabled = round.status !== "ACTIVE" || isActuallyRevealed;
      button.classList.toggle("is-revealed", isRevealed);
      button.classList.toggle("is-safe", presentation.resultClass === "safe");
      button.classList.toggle("is-bomb", presentation.resultClass === "bomb");
      button.classList.toggle("is-pending", this.pendingRevealCell === index);
      button.setAttribute(
        "aria-label",
        presentation.resultClass === "bomb"
          ? presentation.label
          : presentation.resultClass === "safe"
            ? "GOLD ödülü"
            : "Kazınabilir kapalı alan",
      );
      const content = button.querySelector<HTMLElement>(".witch-cell-content");
      if (content) content.textContent = presentation.symbol;
      const resultLabel = button.querySelector<HTMLElement>(".witch-cell-result-label");
      if (resultLabel) resultLabel.textContent = presentation.label;
      const canvas = button.querySelector<HTMLCanvasElement>(".witch-scratch-canvas");
      if (!canvas) return;
      const keepActiveMaskLayer = round.status === "ACTIVE" && isActuallyRevealed;
      canvas.hidden = isRevealed && !keepActiveMaskLayer;
      const surface = this.scratchSurfaces.get(index);
      if (!isRevealed && !surface) {
        this.scratchSurfaces.set(index, new ScratchSurface(canvas, {
          onCommit: () => {
            if (this.pendingRevealCell === null && !this.busy) void this.reveal(index);
          },
        }));
      } else if (isRevealed && surface) {
        surface.destroy();
        this.scratchSurfaces.delete(index);
      }
    });
    const playMode = this.root.querySelector<HTMLElement>("[data-witch-play-mode]");
    const playTitle = this.root.querySelector<HTMLElement>("[data-witch-play-title]");
    if (playMode) playMode.textContent = round.mode === "STANDARD" ? "STANDARD 5 // 1 BOMBA" : `ADVANCED 25 // ${round.alarmCount} ALARM`;
    if (playTitle) playTitle.textContent = round.status === "BUST" ? "Bomba açıldı" : round.status === "CASHED_OUT" ? "Kazanç alındı" : round.status === "COMPLETED" ? "Round tamamlandı" : "Bir alan seç";
    this.root.querySelector<HTMLElement>("[data-witch-multiplier]")!.textContent = formatMultiplier(round.currentMultiplierBps);
    const displayedPayout = round.status === "ACTIVE" ? round.currentCashoutCents : round.payoutCents;
    this.root.querySelector<HTMLElement>("[data-witch-payout]")!.textContent = `${formatCredits(displayedPayout)} kredi`;
    const cashout = this.root.querySelector<HTMLButtonElement>("[data-witch-action='cashout']");
    if (cashout) cashout.disabled = this.busy || round.status !== "ACTIVE" || round.revealedSafeCount < 1;
    const newRound = this.root.querySelector<HTMLButtonElement>("[data-witch-action='new']");
    if (newRound) newRound.hidden = round.status === "ACTIVE";
  }
}