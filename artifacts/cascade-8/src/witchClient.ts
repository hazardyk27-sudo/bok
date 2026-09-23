import { ScratchSurface } from "./scratch/ScratchSurface";
import { getScratchCellLayerMarkup, getScratchCellPresentation } from "./scratch/ScratchPresentation";
import { triggerScratchHaptic } from "./scratch/ScratchFeedback";
import { ScratchTelemetry } from "./scratch/ScratchTelemetry";
import { AudioManager } from "./game/AudioManager";

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

const formatTicketPrice = (cents: number) => {
  const credits = cents / 100;
  return "$" + credits.toLocaleString("tr-TR", {
    minimumFractionDigits: Number.isInteger(credits) ? 0 : 2,
    maximumFractionDigits: 2,
  });
};

const newIdempotencyKey = (prefix: string) => `${prefix}-${crypto.randomUUID()}-${Date.now()}`;

export const CADI_KAZAN_MARKUP = `
  <main class="witch-page" aria-labelledby="witch-title">
    <header class="witch-appbar">
      <a class="witch-back" href="/" aria-label="Ana menüye dön">←</a>

      <div class="witch-appbrand">
        <div>
          <h1 id="witch-title">CADI KAZAN</h1>
          <small>LUCKY SCRATCH</small>
        </div>
      </div>

      <section class="witch-appstats" aria-label="Cadı Kazan durumu">
        <div class="witch-stat witch-stat-balance">
          <span>BAKİYE</span>
          <strong data-witch-balance>0,00</strong>
          <small>CR</small>
        </div>
        <div class="witch-stat">
          <span>ROUND</span>
          <strong data-witch-round>—</strong>
        </div>
        <div class="witch-stat witch-stat-status">
          <span>DURUM</span>
          <strong data-witch-round-status>HAZIR</strong>
          <small data-witch-round-note>MASA BOŞ</small>
        </div>
        <div class="witch-connection" data-witch-status role="status" aria-live="polite">BAĞLANIYOR</div>
      </section>
    </header>

    <section class="witch-stage-shell" data-witch-play aria-label="Cadı Kazan oyun masası">
      <div class="witch-stage-decor witch-stage-decor-book" aria-hidden="true">
        <span>☾</span>
        <small>GOOD THINGS<br>HAPPEN HERE</small>
      </div>
      <div class="witch-stage-decor witch-stage-decor-coin" aria-hidden="true">✦</div>
      <div class="witch-stage-decor witch-stage-decor-candle" aria-hidden="true"></div>

      <div class="witch-table-heading">
        <div>
          <span class="witch-table-eyebrow"><i>●</i> LIVE TABLE</span>
          <strong data-witch-play-mode>NO TICKET</strong>
        </div>
        <p data-witch-play-title>Bir bilet seç ve kazımaya başla.</p>
      </div>

      <div class="witch-table-surface">
        <div class="witch-empty-table" data-witch-empty>
          <span class="witch-empty-seal" aria-hidden="true">✦</span>
          <strong>BİLETİNİ MASAYA BIRAK</strong>
          <small>Modu ve stake’i seç, ardından bileti satın al.</small>
        </div>

        <article class="witch-ticket" data-witch-ticket hidden aria-label="Kazınabilir Cadı Kazan bileti">
          <div class="witch-ticket-frame" aria-hidden="true"></div>

          <header class="witch-ticket-header">
            <div class="witch-ticket-sidecopy">
              <small>ŞANS CESURLARI SEVER</small>
              <span>KAZI<br>KEŞFET<br>KATLA</span>
            </div>
            <div class="witch-ticket-lockup">
              <span class="witch-ticket-sigil" aria-hidden="true">☾</span>
              <strong class="witch-ticket-brand">CADI<br>KAZAN</strong>
              <small>LUCKY SCRATCH</small>
            </div>
            <div class="witch-ticket-price">
              <small>BİLET DEĞERİ</small>
              <strong data-witch-ticket-price>$1</strong>
              <span>KAZI KAZAN</span>
            </div>
          </header>

          <div class="witch-ticket-meta-row">
            <span data-witch-ticket-mode>STANDARD 5</span>
            <i aria-hidden="true">✦</i>
            <span><b data-witch-ticket-stake>0,00 CR</b> · <b data-witch-ticket-bombs>01 BOMB</b></span>
          </div>

          <div class="witch-board-wrap">
            <div class="witch-board" data-witch-board aria-label="Cadı Kazan kazınabilir alanları"></div>
          </div>

          <footer class="witch-ticket-footer">
            <span>KAZIDIĞIN KARARIN GÜCÜNDEN</span>
            <strong>İYİ ŞANSLAR</strong>
            <span data-witch-ticket-id>—</span>
          </footer>
        </article>
      </div>

      <aside class="witch-payout-panel" data-witch-desktop-payout aria-label="Kazanç ve Cash Out">
        <div class="witch-payout-head">
          <span>GÜNCEL KAZANÇ</span>
          <small>MASADAKİ DEĞER</small>
        </div>

        <div class="witch-payout-hero">
          <strong class="witch-multiplier" data-witch-multiplier>0.00x</strong>
          <div class="witch-payout-amount" data-witch-payout>0,00 kredi</div>
          <div class="witch-payout-net">NET <b data-witch-net>—</b></div>
        </div>

        <div class="witch-payout-lines">
          <span>STAKE <b data-witch-stake-display>—</b></span>
        </div>

        <button class="witch-cashout-button" type="button" data-witch-action="cashout">
          <span>CASH OUT</span>
          <b aria-hidden="true">↗</b>
        </button>
        <button class="witch-secondary-button" type="button" data-witch-action="new" hidden>YENİ KART</button>

        <p class="witch-payout-note" data-witch-payout-note>İlk güvenli alan cash out’u açar.</p>
      </aside>

      <div class="witch-table-feedback">
        <span class="witch-feedback" data-witch-play-feedback role="status">Bilet satın alındığında kart masaya gelir.</span>
        <span>Üç katmanı kazı, sembolü yavaşça ortaya çıkar.</span>
      </div>
    </section>

    <section class="witch-control-dock" data-witch-lobby aria-label="Bilet ayarları">
      <div class="witch-mode-grid" role="group" aria-label="Cadı Kazan oyun modu">
        <button type="button" class="witch-mode-card is-selected" data-witch-mode="STANDARD">
          <i class="witch-radio" aria-hidden="true"></i>
          <span><strong>Standard 5</strong><small>5 şans · 1 bomba</small></span>
        </button>
        <button type="button" class="witch-mode-card" data-witch-mode="ADVANCED">
          <i class="witch-radio" aria-hidden="true"></i>
          <span><strong>Advanced 25</strong><small>5×5 · riskli seçim</small></span>
        </button>
      </div>

      <div class="witch-control-separator" aria-hidden="true"></div>

      <div class="witch-control-group witch-stake-group">
        <label>STAKE</label>
        <div class="witch-stake-stepper">
          <button type="button" data-witch-stake-step="-1" aria-label="Stake azalt">−</button>
          <div class="witch-input-wrap">
            <input data-witch-stake type="number" min="1" step="0.01" value="1.00" inputmode="decimal" aria-label="Bilet bedeli">
            <i>CR</i>
          </div>
          <button type="button" data-witch-stake-step="1" aria-label="Stake artır">+</button>
        </div>
      </div>

      <div class="witch-control-separator" aria-hidden="true"></div>

      <label class="witch-control-group witch-alarm-field">
        <span>BOMBA</span>
        <select data-witch-alarms disabled aria-label="Advanced bomba sayısı">
          <option value="1">1 BOMBA</option>
          <option value="3">3 BOMBA</option>
          <option value="5">5 BOMBA</option>
          <option value="7">7 BOMBA</option>
          <option value="10">10 BOMBA</option>
        </select>
      </label>

      <div class="witch-round-summary" data-witch-risk-note>STANDARD · 1 BOMBA</div>

      <button class="witch-primary-button" type="button" data-witch-action="start">
        <span>BİLETİ SATIN AL</span>
        <b aria-hidden="true">◇</b>
      </button>

      <p class="witch-feedback witch-dock-feedback" data-witch-feedback role="status">Biletini seç ve masaya bırak.</p>
    </section>

    <div class="witch-mobile-actions" data-witch-mobile-actions hidden aria-label="Mobil kazanç ve aksiyonlar">
      <div class="witch-mobile-amount">
        <span data-witch-mobile-caption>KAZANÇ</span>
        <strong data-witch-mobile-multiplier>0.00x</strong>
        <b data-witch-mobile-payout>0,00 kredi</b>
      </div>
      <button class="witch-cashout-button" type="button" data-witch-action="cashout">CASH OUT <b>↗</b></button>
      <button class="witch-secondary-button" type="button" data-witch-action="new" hidden>YENİ KART</button>
    </div>
  </main>
`;

export class WitchClient {
  private readonly root: HTMLElement;
  private state: CadiKazanState | null = null;
  private mode: CadiKazanMode = "STANDARD";
  private busy = false;
  private pendingRevealCell: number | null = null;
  private terminalRevealRoundId: string | null = null;
  private readonly terminalRevealVisibleCells = new Set<number>();
  private readonly terminalRevealTimers = new Set<number>();
  private terminalRevealAnimating = false;
  private readonly scratchSurfaces = new Map<number, ScratchSurface>();
  private readonly audio = new AudioManager();
  private readonly telemetry = new ScratchTelemetry();
  private lastRevealInput: "pointer" | "keyboard" = "pointer";
  private entranceRoundId: string | null = null;
  private entranceTimer: number | null = null;

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
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-stake-step]").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.busy || this.state?.round) return;
        const input = this.root.querySelector<HTMLInputElement>("[data-witch-stake]");
        if (!input) return;
        const direction = Number(button.dataset.witchStakeStep ?? 0);
        const current = Number(input.value || 1);
        const next = Math.max(1, current + direction);
        input.value = Number.isInteger(next) ? String(next) : next.toFixed(2);
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-stake-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.busy || this.state?.round) return;
        const input = this.root.querySelector<HTMLInputElement>("[data-witch-stake]");
        if (!input) return;
        const next = Math.max(1, Number(button.dataset.witchStakePreset ?? 1));
        input.value = next.toFixed(2);
        this.render();
      });
    });
    this.root.querySelector<HTMLButtonElement>("[data-witch-action='start']")?.addEventListener("click", () => void this.startRound());
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-action='cashout']").forEach((button) => {
      button.addEventListener("click", () => void this.cashOut());
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-action='new']").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.state) this.applyState({ ...this.state, round: null });
      });
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
    if (!Number.isSafeInteger(stakeCents) || stakeCents < 100) {
      this.setFeedback("Bilet bedeli en az 1 kredi olmalı.");
      return;
    }
    this.setFeedback("Bilet server’da mühürleniyor…");
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
      if (data.round) {
        this.telemetry.beginRound({
          roundId: data.round.id,
          mode: data.round.mode,
          bombCount: data.round.alarmCount,
          cellCount: data.round.cellCount,
          stakeCents: data.round.stakeCents,
        });
      }
      this.setStatus("SERVER’A BAĞLI", true);
      this.setFeedback("Kart hazır. Folyonun üzerinde parmağını veya fareyi gezdir.");
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
    this.telemetry.recordRevealRequest(cellIndex, this.lastRevealInput);
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
      const resultRound = data.state.round;
      if (resultRound) this.telemetry.recordRevealResult(cellIndex, data.outcome, resultRound.revealedSafeCount, resultRound.currentMultiplierBps);
      if (data.outcome === "BUST") triggerScratchHaptic("BOMB");
      else if (data.outcome === "SAFE" || data.outcome === "COMPLETED") triggerScratchHaptic("GOLD");
      if (data.outcome === "BUST" || data.outcome === "COMPLETED") {
        if (resultRound) this.telemetry.recordSettlement(data.outcome, resultRound.revealedSafeCount, resultRound.currentMultiplierBps, resultRound.payoutCents);
      }
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
      if (data.outcome === "CASHED_OUT") triggerScratchHaptic("CASH_OUT");
      if (data.state.round) this.telemetry.recordSettlement(data.outcome, data.state.round.revealedSafeCount, data.state.round.currentMultiplierBps, data.state.round.payoutCents);
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
    this.terminalRevealTimers.forEach((timer) => window.clearTimeout(timer));
    this.terminalRevealTimers.clear();
  }

  private destroyScratchSurfaces() {
    this.scratchSurfaces.forEach((surface) => surface.destroy());
    this.scratchSurfaces.clear();
  }

  private applyState(nextState: CadiKazanState, animateTerminal = false) {
    this.clearTerminalRevealTimer();
    const previousRoundId = this.state?.round?.id;
    this.state = nextState;
    const round = nextState.round;
    if (!round) {
      this.terminalRevealRoundId = null;
      this.terminalRevealVisibleCells.clear();
      this.terminalRevealAnimating = false;
      this.entranceRoundId = null;
      if (this.entranceTimer !== null) {
        window.clearTimeout(this.entranceTimer);
        this.entranceTimer = null;
      }
      this.destroyScratchSurfaces();
      const board = this.root.querySelector<HTMLElement>("[data-witch-board]");
      if (board) board.replaceChildren();
      this.render();
      return;
    }
    if (round.id !== previousRoundId && round.status === "ACTIVE") this.entranceRoundId = round.id;
    const terminal = round.status !== "ACTIVE";
    this.terminalRevealRoundId = terminal ? round.id : null;
    this.terminalRevealVisibleCells.clear();
    this.terminalRevealAnimating = false;
    if (!terminal) {
      this.render();
      return;
    }
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const allCells = Array.from({ length: round.cellCount }, (_, index) => index);
    const immediateCells = new Set(round.revealedCells);
    if (!animateTerminal || reducedMotion) {
      allCells.forEach((index) => this.terminalRevealVisibleCells.add(index));
      this.render();
      return;
    }
    this.terminalRevealAnimating = true;
    if (round.status === "BUST") round.revealedBombCells.forEach((index) => immediateCells.add(index));
    immediateCells.forEach((index) => this.terminalRevealVisibleCells.add(index));
    this.render();
    allCells.filter((index) => !this.terminalRevealVisibleCells.has(index)).forEach((index, order) => {
      const timer = window.setTimeout(() => {
        this.terminalRevealTimers.delete(timer);
        this.terminalRevealVisibleCells.add(index);
        this.render();
      }, 70 + order * 55);
      this.terminalRevealTimers.add(timer);
    });
  }

  private render() {
    const state = this.state;
    const round = state?.round ?? null;
    const balance = this.root.querySelector<HTMLElement>("[data-witch-balance]");
    const roundLabel = this.root.querySelector<HTMLElement>("[data-witch-round]");
    const roundStatus = this.root.querySelector<HTMLElement>("[data-witch-round-status]");
    const roundNote = this.root.querySelector<HTMLElement>("[data-witch-round-note]");
    if (balance) balance.textContent = formatCredits(state?.wallet.balanceCents ?? 0);
    if (roundLabel) roundLabel.textContent = round ? `#${round.id.slice(0, 8).toUpperCase()}` : "—";
    if (roundStatus) roundStatus.textContent = round?.status ?? "HAZIR";
    if (roundNote) roundNote.textContent = round ? (round.status === "ACTIVE" ? "KART AÇIK" : "ROUND KAPALI") : "MASA BOŞ";

    const hasActiveRound = round?.status === "ACTIVE";
    const hasRound = Boolean(round);
    this.root.classList.toggle("has-round", hasRound);
    this.root.classList.toggle("is-active-round", hasActiveRound);
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-mode]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.witchMode === this.mode);
      button.disabled = this.busy || hasActiveRound;
    });
    const alarms = this.root.querySelector<HTMLSelectElement>("[data-witch-alarms]");
    if (alarms) alarms.disabled = this.busy || hasActiveRound || this.mode !== "ADVANCED";
    const stakeInput = this.root.querySelector<HTMLInputElement>("[data-witch-stake]");
    if (stakeInput) stakeInput.disabled = this.busy || hasActiveRound;
    const start = this.root.querySelector<HTMLButtonElement>("[data-witch-action='start']");
    if (start) start.disabled = this.busy || hasRound;
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-stake-step], [data-witch-stake-preset]").forEach((button) => {
      button.disabled = this.busy || hasRound;
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-stake-preset]").forEach((button) => {
      const preset = Number(button.dataset.witchStakePreset ?? 0);
      button.classList.toggle("is-selected", Math.abs(Number(stakeInput?.value ?? 0) - preset) < 0.001);
    });

    const empty = this.root.querySelector<HTMLElement>("[data-witch-empty]");
    const ticket = this.root.querySelector<HTMLElement>("[data-witch-ticket]");
    if (empty) empty.hidden = hasRound;
    if (ticket) ticket.hidden = !hasRound;

    const riskNote = this.root.querySelector<HTMLElement>("[data-witch-risk-note]");
    if (riskNote) {
      const selectedBombs = this.mode === "STANDARD" ? "1" : (alarms?.value ?? "1");
      riskNote.textContent = `${this.mode === "STANDARD" ? "STANDARD" : "ADVANCED"} / ${selectedBombs} BOMBA`;
    }

    if (!round) {
      const playMode = this.root.querySelector<HTMLElement>("[data-witch-play-mode]");
      const playTitle = this.root.querySelector<HTMLElement>("[data-witch-play-title]");
      if (playMode) playMode.textContent = "NO TICKET";
      if (playTitle) playTitle.textContent = "Bir bilet seç ve kazımaya başla.";
      this.updatePayout(null);
      return;
    }

    const board = this.root.querySelector<HTMLElement>("[data-witch-board]");
    if (board && board.childElementCount !== round.cellCount) {
      this.destroyScratchSurfaces();
      board.innerHTML = Array.from({ length: round.cellCount }, (_, index) => `
        <button type="button" class="witch-cell" data-witch-cell="${index}" aria-label="Kazınabilir kapalı alan">
          ${getScratchCellLayerMarkup()}
        </button>
      `).join("");
      board.querySelectorAll<HTMLButtonElement>("[data-witch-cell]").forEach((button) => {
        button.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          const index = Number(button.dataset.witchCell);
          this.lastRevealInput = "keyboard";
          void this.reveal(index);
        });
      });
    }

    const revealedBombs = new Set(round.revealedBombCells);
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-cell]").forEach((button) => {
      const index = Number(button.dataset.witchCell);
      const isActuallyRevealed = round.revealedCells.includes(index);
      const isTerminallyRevealed = this.terminalRevealRoundId === round.id && this.terminalRevealVisibleCells.has(index);
      const isRevealed = isActuallyRevealed || isTerminallyRevealed;
      const isBomb = round.status !== "ACTIVE" && revealedBombs.has(index) && isRevealed;
      const presentation = getScratchCellPresentation(round.mode, isRevealed, isBomb);
      button.disabled = round.status !== "ACTIVE";
      button.dataset.cellState = presentation.resultClass ?? "covered";
      button.classList.toggle("is-revealed", isRevealed);
      button.classList.toggle("is-safe", presentation.resultClass === "safe");
      button.classList.toggle("is-bomb", presentation.resultClass === "bomb");
      button.classList.toggle("is-pending", this.pendingRevealCell === index);
      button.classList.toggle("is-terminal-reveal", this.terminalRevealAnimating && isTerminallyRevealed && !isActuallyRevealed);
      button.setAttribute("aria-label", presentation.resultClass === "bomb" ? presentation.label : presentation.resultClass === "safe" ? "GOLD ödülü" : "Kazınabilir kapalı alan");
      const content = button.querySelector<HTMLElement>(".witch-cell-content");
      if (content) content.textContent = presentation.symbol;
      const resultLabel = button.querySelector<HTMLElement>(".witch-cell-result-label");
      if (resultLabel) resultLabel.textContent = presentation.label;
      const layerCanvases = Array.from(button.querySelectorAll<HTMLCanvasElement>(".witch-scratch-layer"));
      const interactionCanvas = button.querySelector<HTMLCanvasElement>(".witch-scratch-layer-lacquer") ?? layerCanvases.at(-1) ?? null;
      if (!interactionCanvas || layerCanvases.length === 0) return;
      const debrisCanvas = button.querySelector<HTMLCanvasElement>(".witch-debris-canvas");
      const scratchHidden = round.status !== "ACTIVE" ? isRevealed : false;
      layerCanvases.forEach((layer) => { layer.hidden = scratchHidden; });
      if (debrisCanvas) debrisCanvas.hidden = scratchHidden;
      const surface = this.scratchSurfaces.get(index);
      if (round.status === "ACTIVE" && !surface) {
        this.scratchSurfaces.set(index, new ScratchSurface(interactionCanvas, {
          audio: this.audio,
          debrisCanvas: debrisCanvas ?? undefined,
          layerCanvases,
          resultReady: isActuallyRevealed,
          onCommit: async () => {
            if (this.state?.round?.revealedCells.includes(index)) return;
            if (this.pendingRevealCell !== null || this.busy) throw new Error("ROUND_BUSY");
            this.telemetry.recordScratchCommit(index);
            this.lastRevealInput = "pointer";
            await this.reveal(index);
            if (!this.state?.round?.revealedCells.includes(index)) throw new Error("REVEAL_NOT_COMMITTED");
          },
        }));
      } else if (surface && round.status !== "ACTIVE") {
        surface.destroy();
        this.scratchSurfaces.delete(index);
      }
    });

    const playMode = this.root.querySelector<HTMLElement>("[data-witch-play-mode]");
    const playTitle = this.root.querySelector<HTMLElement>("[data-witch-play-title]");
    const ticketMode = this.root.querySelector<HTMLElement>("[data-witch-ticket-mode]");
    const ticketStake = this.root.querySelector<HTMLElement>("[data-witch-ticket-stake]");
    const ticketBombs = this.root.querySelector<HTMLElement>("[data-witch-ticket-bombs]");
    const ticketPrice = this.root.querySelector<HTMLElement>("[data-witch-ticket-price]");
    const ticketId = this.root.querySelector<HTMLElement>("[data-witch-ticket-id]");
    if (playMode) playMode.textContent = round.mode === "STANDARD" ? "STANDARD 5 / 01 BOMB" : `ADVANCED 25 / ${String(round.alarmCount).padStart(2, "0")} BOMBS`;
    if (playTitle) playTitle.textContent = round.status === "BUST" ? "Bomba açıldı." : round.status === "CASHED_OUT" ? "Kazanç alındı." : round.status === "COMPLETED" ? "Kart tamamlandı." : "Folyo kazındıkça alttaki sonuç görünür.";
    if (ticketMode) ticketMode.textContent = round.mode === "STANDARD" ? "STANDARD 5" : "ADVANCED 25";
    if (ticketStake) ticketStake.textContent = `${formatCredits(round.stakeCents)} CR`;
    if (ticketBombs) ticketBombs.textContent = `${String(round.alarmCount).padStart(2, "0")} ${round.alarmCount === 1 ? "BOMB" : "BOMBS"}`;
    if (ticketPrice) ticketPrice.textContent = formatTicketPrice(round.stakeCents);
    if (ticketId) ticketId.textContent = `#${round.id.slice(0, 8).toUpperCase()}`;
    if (riskNote) {
      const selectedBombs = this.mode === "STANDARD" ? "1" : (alarms?.value ?? String(round.alarmCount));
      riskNote.textContent = `${this.mode === "STANDARD" ? "STANDARD" : "ADVANCED"} / ${selectedBombs} BOMBA`;
    }
    const ticketElement = this.root.querySelector<HTMLElement>("[data-witch-ticket]");
    if (ticketElement) {
      ticketElement.classList.toggle("is-advanced", round.mode === "ADVANCED");
      ticketElement.classList.toggle("is-entering", this.entranceRoundId === round.id);
      if (this.entranceRoundId === round.id && this.entranceTimer === null) {
        this.entranceTimer = window.setTimeout(() => {
          this.entranceRoundId = null;
          this.entranceTimer = null;
          ticketElement.classList.remove("is-entering");
        }, 540);
      }
    }
    this.updatePayout(round);
  }

  private updatePayout(round: CadiKazanRound | null) {
    const displayedPayout = round ? (round.status === "ACTIVE" ? round.currentCashoutCents : round.payoutCents) : 0;
    const multiplier = round ? formatMultiplier(round.currentMultiplierBps) : "0.00x";
    this.root.querySelectorAll<HTMLElement>("[data-witch-multiplier], [data-witch-mobile-multiplier]").forEach((element) => { element.textContent = multiplier; });
    this.root.querySelectorAll<HTMLElement>("[data-witch-payout], [data-witch-mobile-payout]").forEach((element) => { element.textContent = `${formatCredits(displayedPayout)} kredi`; });
    const stake = round ? `${formatCredits(round.stakeCents)} CR` : "—";
    const net = round ? `${formatCredits(displayedPayout - round.stakeCents)} CR` : "—";
    this.root.querySelectorAll<HTMLElement>("[data-witch-stake-display]").forEach((element) => { element.textContent = stake; });
    this.root.querySelectorAll<HTMLElement>("[data-witch-net]").forEach((element) => { element.textContent = net; });
    const payoutNote = this.root.querySelector<HTMLElement>("[data-witch-payout-note]");
    if (payoutNote) payoutNote.textContent = !round ? "Güvenli bir alan açıldığında cash out aktif olur." : round.status === "ACTIVE" ? (round.revealedSafeCount > 0 ? "Kazancı şimdi alabilir veya devam edebilirsin." : "İlk güvenli alan cash out’u açar.") : round.status === "BUST" ? "Bomba kartı kapattı. Payout: 0 kredi." : "Bu round server tarafından kapatıldı.";
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-action='cashout']").forEach((button) => {
      button.disabled = this.busy || !round || round.status !== "ACTIVE" || round.revealedSafeCount < 1;
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-action='new']").forEach((button) => {
      button.hidden = !round || round.status === "ACTIVE";
    });
    const mobileActions = this.root.querySelector<HTMLElement>("[data-witch-mobile-payout]")?.closest<HTMLElement>(".witch-mobile-actions");
    if (mobileActions) mobileActions.hidden = !round;
    const mobileCaption = this.root.querySelector<HTMLElement>("[data-witch-mobile-caption]");
    if (mobileCaption) mobileCaption.textContent = round?.status === "BUST" ? "ROUND BUST" : round?.status === "ACTIVE" ? "MASADAKİ KAZANÇ" : "SON PAYOUT";
  }
}