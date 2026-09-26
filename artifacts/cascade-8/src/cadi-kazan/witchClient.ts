import { ScratchSurface } from "./scratch/ScratchSurface";
import { getScratchCellLayerMarkup, getScratchCellPresentation } from "./scratch/ScratchPresentation";
import { triggerScratchHaptic } from "./scratch/ScratchFeedback";
import { ScratchTelemetry } from "./scratch/ScratchTelemetry";
import { AudioManager } from "./AudioManager";

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
const SCRATCH_BRUSH_RADIUS_PX = 14;

const formatMoney = (cents: number, options: { compactInteger?: boolean; signed?: boolean } = {}) => {
  const absolute = Math.abs(cents) / 100;
  const minimumFractionDigits = options.compactInteger && Number.isInteger(absolute) ? 0 : 2;
  const amount = absolute.toLocaleString("en-US", {
    minimumFractionDigits,
    maximumFractionDigits: 2,
  });
  const sign = options.signed ? (cents > 0 ? "+" : cents < 0 ? "−" : "") : (cents < 0 ? "−" : "");
  return sign + "$" + amount;
};

const parseStakeDollars = (value: string) => {
  const raw = value.trim().replaceAll("$", "").replaceAll(" ", "");
  const normalized = raw.includes(".") ? raw.replace(/,/g, "") : raw.replace(",", ".");
  const dollars = Number(normalized);
  return Number.isFinite(dollars) ? dollars : NaN;
};

const formatStakeInput = (dollars: number) => "$" + dollars.toLocaleString("en-US", {
  useGrouping: false,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatMultiplier = (basisPoints: number) => `${(basisPoints / 100).toLocaleString("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}×`;

const compactNumber = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0$/, "$1")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : value >= 10_000 ? 1 : 2).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0$/, "$1")}K`;
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatCompactMoney = (cents: number, signed = false) => {
  const absolute = Math.abs(cents) / 100;
  const sign = signed ? (cents > 0 ? "+" : cents < 0 ? "−" : "") : (cents < 0 ? "−" : "");
  return `${sign}$${compactNumber(absolute)}`;
};

const formatTicketPrice = (cents: number) => {
  const dollars = cents / 100;
  if (dollars >= 1_000) return `$${compactNumber(dollars)}`;
  return formatMoney(cents, { compactInteger: true });
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
          <strong data-witch-balance>$0.00</strong>
        </div>
        <div class="witch-stat witch-stat-runtime" aria-hidden="true">
          <strong data-witch-round>—</strong>
          <strong data-witch-round-status>HAZIR</strong>
          <small data-witch-round-note>MASA BOŞ</small>
        </div>
        <button class="witch-menu-button" type="button" data-witch-menu-toggle aria-label="Oyun menüsünü aç" aria-expanded="false">☰</button>
      <div class="witch-game-menu" data-witch-menu hidden>
        <strong>OYUN MENÜSÜ</strong>
        <button type="button" data-witch-sound-toggle>SES: AÇIK</button>
        <label>SES SEVİYESİ <input type="range" min="0" max="1" step="0.05" data-witch-volume></label>
        <a href="/">ANA MENÜYE DÖN</a>
        <small data-witch-status role="status" aria-live="polite">BAĞLANIYOR</small>
      </div>
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
          <span class="witch-table-eyebrow"><i>●</i> OYUN MASASI</span>
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
          <div class="witch-standard-price-badge" data-witch-standard-price hidden>$1</div>

          <div class="witch-bcs-card-art" aria-hidden="true">
            <div class="witch-bcs-topbar">IN LEGAL TROUBLE?</div>
            <div class="witch-bcs-main">
              <div class="witch-bcs-copy">
                <div class="witch-bcs-script">“Better Call Saul”</div>
                <div class="witch-bcs-name">
                  <span>SAUL</span>
                  <i>⚖</i>
                  <span>GOODMAN</span>
                </div>
                <div class="witch-bcs-law">ATTORNEY AT LAW</div>
                <div class="witch-bcs-phone">(505) 503-4455</div>
                <div class="witch-bcs-call">CALL SAUL NOW!</div>
              </div>
            </div>
            <div class="witch-bcs-bottombar">NOT TOLL FREE <b>•</b> SE HABLA ESPAÑOL</div>
          </div>

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
            <span><b data-witch-ticket-stake>$0.00</b> · <b data-witch-ticket-bombs>01 BOMBA</b></span>
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
          <div class="witch-payout-amount" data-witch-payout>$0.00</div>
          <div class="witch-payout-net">NET <b data-witch-net>—</b></div>
        </div>

        <div class="witch-payout-lines">
          <span>STAKE <b data-witch-stake-display>—</b></span>
        </div>

        <button class="witch-cashout-button" type="button" data-witch-action="cashout">
          <span>CASH OUT</span>
          <b aria-hidden="true">↗</b>
        </button>

        <p class="witch-payout-note" data-witch-payout-note>İlk güvenli alan cash out’u açar.</p>
      </aside>

      <div class="witch-table-feedback">
        <span class="witch-feedback" data-witch-play-feedback role="status">Bilet satın alındığında kart masaya gelir.</span>
        <span>Üç katmanı kazı, sembolü yavaşça ortaya çıkar.</span>
      </div>
    </section>

    <section class="witch-control-dock" data-witch-lobby aria-label="Bilet ayarları">
      <div class="witch-control-group witch-card-picker">
        <label>KART</label>
        <button
          type="button"
          class="witch-cards-button"
          data-witch-cards-toggle
          aria-expanded="false"
          aria-haspopup="true"
        >
          <span>
            <strong>KARTLAR</strong>
            <small data-witch-card-current>Standard 5</small>
          </span>
          <b aria-hidden="true">⌃</b>
        </button>
        <div class="witch-card-menu" data-witch-card-menu hidden role="group" aria-label="Kazı Kazan çeşitleri">
          <button type="button" class="witch-card-option is-selected" data-witch-mode="STANDARD">
            <span><strong>Standard 5</strong><small>5 alan · 1 bomba</small></span>
            <b aria-hidden="true">✓</b>
          </button>
          <button type="button" class="witch-card-option" data-witch-mode="ADVANCED">
            <span><strong>Advanced 25</strong><small>25 alan · risk seçimi</small></span>
            <b aria-hidden="true">25</b>
          </button>
        </div>
      </div>

      <div class="witch-control-separator" aria-hidden="true"></div>

      <div class="witch-control-group witch-stake-group">
        <label>BAHİS</label>
        <div class="witch-stake-stepper">
          <button type="button" data-witch-stake-step="-1" aria-label="Stake azalt">−</button>
          <div class="witch-input-wrap">
            <i>$</i>
            <input data-witch-stake type="text" value="$1.00" inputmode="decimal" autocomplete="off" aria-label="Bilet bedeli">
          </div>
          <button type="button" data-witch-stake-step="1" aria-label="Stake artır">+</button>
        </div>
        <div class="witch-stake-presets" aria-label="Hızlı bahis seçenekleri">
          <button type="button" data-witch-stake-preset="10">$10</button>
          <button type="button" data-witch-stake-preset="25">$25</button>
          <button type="button" data-witch-stake-preset="50">$50</button>
          <button type="button" class="witch-stake-scale" data-witch-stake-scale="2">X2</button>
          <button type="button" class="witch-stake-scale" data-witch-stake-scale="0.5">÷2</button>
          <button type="button" data-witch-stake-preset="MAX">MAX</button>
        </div>
      </div>

      <div class="witch-control-separator" aria-hidden="true"></div>

      <label class="witch-control-group witch-alarm-field">
        <span>RİSK</span>
        <select data-witch-alarms disabled aria-label="Advanced bomba sayısı">
          <option value="1">1 BOMBA</option>
          <option value="3">3 BOMBA</option>
          <option value="5">5 BOMBA</option>
          <option value="7">7 BOMBA</option>
          <option value="10">10 BOMBA</option>
        </select>
      </label>

      <div class="witch-round-summary" data-witch-risk-note>STANDARD · 1 BOMBA</div>

      <div class="witch-control-group witch-buy-group">
        <label aria-hidden="true">&nbsp;</label>
        <button class="witch-primary-button" type="button" data-witch-action="start">
          <span>BİLETİ SATIN AL</span>
          <b aria-hidden="true">◇</b>
        </button>
      </div>

      <p class="witch-feedback witch-dock-feedback" data-witch-feedback role="status">Biletini seç ve masaya bırak.</p>
    </section>

    <div class="witch-mobile-actions" data-witch-mobile-actions hidden aria-label="Mobil kazanç ve aksiyonlar">
      <div class="witch-mobile-amount">
        <span data-witch-mobile-caption>KAZANÇ</span>
        <strong data-witch-mobile-multiplier>0.00x</strong>
        <b data-witch-mobile-payout>$0.00</b>
      </div>
      <button class="witch-cashout-button" type="button" data-witch-action="cashout">CASH OUT <b>↗</b></button>
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
  private readonly audio = new AudioManager("cadi-kazan");
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
    const menuToggle = this.root.querySelector<HTMLButtonElement>("[data-witch-menu-toggle]");
    const menu = this.root.querySelector<HTMLElement>("[data-witch-menu]");
    const soundToggle = this.root.querySelector<HTMLButtonElement>("[data-witch-sound-toggle]");
    const volume = this.root.querySelector<HTMLInputElement>("[data-witch-volume]");
    const syncAudioMenu = () => {
      if (soundToggle) soundToggle.textContent = this.audio.muted ? "SES: KAPALI" : "SES: AÇIK";
      if (volume) volume.value = String(this.audio.volume);
    };
    syncAudioMenu();
    const closeGameMenu = () => {
      if (!menu) return;
      menu.hidden = true;
      menuToggle?.setAttribute("aria-expanded", "false");
    };
    const closeCardsMenu = () => {
      if (!cardsMenu) return;
      cardsMenu.hidden = true;
      cardsToggle?.setAttribute("aria-expanded", "false");
    };

    menuToggle?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!menu) return;
      const willOpen = menu.hidden;
      closeCardsMenu();
      menu.hidden = !willOpen;
      menuToggle.setAttribute("aria-expanded", String(willOpen));
    });
    soundToggle?.addEventListener("click", () => {
      this.audio.setMuted(!this.audio.muted);
      if (!this.audio.muted) this.audio.unlock();
      syncAudioMenu();
    });
    volume?.addEventListener("input", () => {
      this.audio.setVolume(Number(volume.value));
      if (this.audio.muted && Number(volume.value) > 0) this.audio.setMuted(false);
      this.audio.unlock();
      syncAudioMenu();
    });
    const cardsToggle = this.root.querySelector<HTMLButtonElement>("[data-witch-cards-toggle]");
    const cardsMenu = this.root.querySelector<HTMLElement>("[data-witch-card-menu]");
    cardsToggle?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (this.busy || this.state?.round?.status === "ACTIVE" || !cardsMenu) return;
      const willOpen = cardsMenu.hidden;
      closeGameMenu();
      cardsMenu.hidden = !willOpen;
      cardsToggle.setAttribute("aria-expanded", String(willOpen));
    });

    menu?.addEventListener("click", (event) => event.stopPropagation());
    cardsMenu?.addEventListener("click", (event) => event.stopPropagation());
    this.root.addEventListener("click", () => {
      closeGameMenu();
      closeCardsMenu();
    });
    this.root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      closeGameMenu();
      closeCardsMenu();
      menuToggle?.focus();
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.busy || this.state?.round?.status === "ACTIVE") return;
        this.mode = button.dataset.witchMode as CadiKazanMode;
        if (cardsMenu) cardsMenu.hidden = true;
        cardsToggle?.setAttribute("aria-expanded", "false");
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-stake-step]").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.busy || this.state?.round?.status === "ACTIVE") return;
        const input = this.root.querySelector<HTMLInputElement>("[data-witch-stake]");
        if (!input) return;
        const direction = Number(button.dataset.witchStakeStep ?? 0);
        const current = parseStakeDollars(input.value || "1");
        const safeCurrent = Number.isFinite(current) ? current : 1;
        const step = safeCurrent >= 1000 ? 100 : safeCurrent >= 250 ? 25 : safeCurrent >= 100 ? 10 : safeCurrent >= 25 ? 5 : 1;
        const next = Math.max(1, safeCurrent + direction * step);
        input.value = formatStakeInput(next);
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-stake-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.busy || this.state?.round?.status === "ACTIVE") return;
        const input = this.root.querySelector<HTMLInputElement>("[data-witch-stake]");
        if (!input) return;
        const preset = button.dataset.witchStakePreset ?? "1";
        const walletDollars = (this.state?.wallet.balanceCents ?? 0) / 100;
        const next = preset === "MAX" ? Math.max(1, walletDollars) : Math.max(1, Number(preset));
        input.value = formatStakeInput(next);
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-stake-scale]").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.busy || this.state?.round?.status === "ACTIVE") return;
        const input = this.root.querySelector<HTMLInputElement>("[data-witch-stake]");
        if (!input) return;
        const factor = Number(button.dataset.witchStakeScale ?? "1");
        if (!Number.isFinite(factor) || factor <= 0) return;
        const current = parseStakeDollars(input.value || "1");
        const safeCurrent = Number.isFinite(current) ? Math.max(1, current) : 1;
        input.value = formatStakeInput(Math.max(1, safeCurrent * factor));
        this.render();
      });
    });
    const stakeInput = this.root.querySelector<HTMLInputElement>("[data-witch-stake]");
    stakeInput?.addEventListener("blur", () => {
      const parsed = parseStakeDollars(stakeInput.value);
      stakeInput.value = formatStakeInput(Number.isFinite(parsed) ? Math.max(1, parsed) : 1);
    });
    stakeInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.audio.unlock();
        void this.startRound();
      }
    });

    this.root.querySelector<HTMLButtonElement>("[data-witch-action='start']")?.addEventListener("click", () => {
      this.audio.unlock();
      void this.startRound();
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-action='cashout']").forEach((button) => {
      button.addEventListener("click", () => {
        this.audio.unlock();
        void this.cashOut();
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
    const stakeDollars = parseStakeDollars(stakeInput?.value ?? "");
    const stakeCents = Math.round(stakeDollars * 100);
    const alarmCount = this.mode === "STANDARD" ? 1 : Number(alarmInput?.value ?? 1);
    if (!Number.isSafeInteger(stakeCents) || stakeCents < 100) {
      this.setFeedback("Bilet bedeli en az $1.00 olmalı.");
      return;
    }
    if (this.state && stakeCents > this.state.wallet.balanceCents) {
      this.setFeedback(`Yetersiz bakiye. Kullanılabilir: ${formatMoney(this.state.wallet.balanceCents)}`);
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
      this.audio.ticketPurchase();
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
      if (data.outcome === "BUST") {
        triggerScratchHaptic("BOMB");
        this.audio.bombBust();
      } else if (data.outcome === "SAFE" || data.outcome === "COMPLETED") {
        triggerScratchHaptic("GOLD");
      }
      if (data.outcome === "COMPLETED") this.audio.cashRegister();
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
      if (data.outcome === "CASHED_OUT") {
        triggerScratchHaptic("CASH_OUT");
        this.audio.cashRegister();
      }
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
    if (balance) balance.textContent = formatMoney(state?.wallet.balanceCents ?? 0);
    if (roundLabel) roundLabel.textContent = round ? `#${round.id.slice(0, 8).toUpperCase()}` : "—";
    if (roundStatus) roundStatus.textContent = round?.status ?? "HAZIR";
    if (roundNote) roundNote.textContent = round ? (round.status === "ACTIVE" ? "KART AÇIK" : "ROUND KAPALI") : "MASA BOŞ";

    const hasActiveRound = round?.status === "ACTIVE";
    const hasRound = Boolean(round);
    this.root.classList.toggle("has-round", hasRound);
    this.root.classList.toggle("is-active-round", hasActiveRound);
    this.root.classList.toggle("is-advanced-round", Boolean(round && round.mode === "ADVANCED"));
    const visualMode = round?.mode ?? this.mode;
    this.root.classList.toggle("is-standard-theme", visualMode === "STANDARD");
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-mode]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.witchMode === this.mode);
      button.disabled = this.busy || hasActiveRound;
    });
    const cardsToggle = this.root.querySelector<HTMLButtonElement>("[data-witch-cards-toggle]");
    const cardsMenu = this.root.querySelector<HTMLElement>("[data-witch-card-menu]");
    const currentCard = this.root.querySelector<HTMLElement>("[data-witch-card-current]");
    if (currentCard) currentCard.textContent = this.mode === "STANDARD" ? "Standard 5" : "Advanced 25";
    if (cardsToggle) {
      cardsToggle.disabled = this.busy || hasActiveRound;
      if (this.busy || hasActiveRound) {
        cardsToggle.setAttribute("aria-expanded", "false");
        if (cardsMenu) cardsMenu.hidden = true;
      }
    }
    const alarms = this.root.querySelector<HTMLSelectElement>("[data-witch-alarms]");
    if (alarms) alarms.disabled = this.busy || hasActiveRound || this.mode !== "ADVANCED";
    const stakeInput = this.root.querySelector<HTMLInputElement>("[data-witch-stake]");
    if (stakeInput) stakeInput.disabled = this.busy || hasActiveRound;
    const start = this.root.querySelector<HTMLButtonElement>("[data-witch-action='start']");
    if (start) start.disabled = this.busy || hasActiveRound;
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-stake-step], [data-witch-stake-preset], [data-witch-stake-scale]").forEach((button) => {
      button.disabled = this.busy || hasActiveRound;
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-stake-preset]").forEach((button) => {
      const presetValue = button.dataset.witchStakePreset ?? "";
      const inputValue = parseStakeDollars(stakeInput?.value ?? "");
      const preset = presetValue === "MAX" ? (state?.wallet.balanceCents ?? 0) / 100 : Number(presetValue);
      button.classList.toggle("is-selected", Number.isFinite(inputValue) && Math.abs(inputValue - preset) < 0.001);
    });

    const empty = this.root.querySelector<HTMLElement>("[data-witch-empty]");
    const ticket = this.root.querySelector<HTMLElement>("[data-witch-ticket]");
    const showStandardPreview = !hasRound && visualMode === "STANDARD";
    if (empty) empty.hidden = hasRound || showStandardPreview;
    if (ticket) {
      ticket.hidden = !(hasRound || showStandardPreview);
      ticket.classList.toggle("is-preview", showStandardPreview);
    }

    const riskNote = this.root.querySelector<HTMLElement>("[data-witch-risk-note]");
    if (riskNote) {
      const selectedBombs = this.mode === "STANDARD" ? "1" : (alarms?.value ?? "1");
      riskNote.textContent = `${this.mode === "STANDARD" ? "STANDARD" : "ADVANCED"} / ${selectedBombs} BOMBA`;
    }

    const board = this.root.querySelector<HTMLElement>("[data-witch-board]");

    if (!round) {
      const playMode = this.root.querySelector<HTMLElement>("[data-witch-play-mode]");
      const playTitle = this.root.querySelector<HTMLElement>("[data-witch-play-title]");
      if (playMode) playMode.textContent = showStandardPreview ? "STANDARD 5 / 01 BOMBA" : "NO TICKET";
      if (playTitle) playTitle.textContent = showStandardPreview ? "Biletini al ve kazımaya başla." : "Bir bilet seç ve kazımaya başla.";

      if (showStandardPreview && board) {
        if (board.dataset.preview !== "standard") {
          this.destroyScratchSurfaces();
          board.dataset.preview = "standard";
          board.innerHTML = Array.from({ length: 5 }, (_, index) => `
            <button type="button" class="witch-cell witch-preview-cell" disabled aria-label="Bilet satın alındığında kazınabilir alan ${index + 1}">
              <span class="witch-preview-coating" aria-hidden="true">
                <img src="/cadi-kazan/bcs-cactus.webp" alt="" draggable="false">
              </span>
            </button>
          `).join("");
        }

        const previewStakeDollars = parseStakeDollars(stakeInput?.value ?? "1");
        const previewStakeCents = Math.max(100, Math.round((Number.isFinite(previewStakeDollars) ? previewStakeDollars : 1) * 100));
        const ticketMode = this.root.querySelector<HTMLElement>("[data-witch-ticket-mode]");
        const ticketStake = this.root.querySelector<HTMLElement>("[data-witch-ticket-stake]");
        const ticketBombs = this.root.querySelector<HTMLElement>("[data-witch-ticket-bombs]");
        const ticketPrice = this.root.querySelector<HTMLElement>("[data-witch-ticket-price]");
        const standardPrice = this.root.querySelector<HTMLElement>("[data-witch-standard-price]");
        const ticketId = this.root.querySelector<HTMLElement>("[data-witch-ticket-id]");
        if (ticketMode) ticketMode.textContent = "STANDARD 5";
        if (ticketStake) ticketStake.textContent = formatMoney(previewStakeCents);
        if (ticketBombs) ticketBombs.textContent = "01 BOMBA";
        if (ticketPrice) ticketPrice.textContent = formatTicketPrice(previewStakeCents);
        if (standardPrice) {
          standardPrice.textContent = formatTicketPrice(previewStakeCents);
          standardPrice.hidden = false;
        }
        if (ticketId) ticketId.textContent = "PREVIEW";
      } else if (board?.dataset.preview) {
        board.replaceChildren();
        delete board.dataset.preview;
      }

      this.updatePayout(null);
      return;
    }

    if (board && (board.childElementCount !== round.cellCount || Boolean(board.dataset.preview))) {
      delete board.dataset.preview;
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
      button.setAttribute("aria-label", presentation.resultClass ? presentation.label : "Kazınabilir kapalı alan");
      const content = button.querySelector<HTMLElement>(".witch-cell-content");
      if (content) {
        if (presentation.artworkUrl) {
          content.innerHTML = `<img class="witch-cell-artwork" src="${presentation.artworkUrl}" alt="" draggable="false">`;
        } else {
          content.textContent = presentation.symbol;
        }
      }
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
          brushRadiusPx: SCRATCH_BRUSH_RADIUS_PX,
          debrisCanvas: debrisCanvas ?? undefined,
          layerCanvases,
          coverImageUrl: round.mode === "STANDARD" ? "/cadi-kazan/bcs-cactus.webp" : undefined,
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
    const standardPrice = this.root.querySelector<HTMLElement>("[data-witch-standard-price]");
    const ticketId = this.root.querySelector<HTMLElement>("[data-witch-ticket-id]");
    if (playMode) playMode.textContent = round.mode === "STANDARD" ? "STANDARD 5 / 01 BOMBA" : `ADVANCED 25 / ${String(round.alarmCount).padStart(2, "0")} BOMBA`;
    if (playTitle) playTitle.textContent = round.status === "BUST" ? "Bomba açıldı." : round.status === "CASHED_OUT" ? "Kazanç alındı." : round.status === "COMPLETED" ? "Kart tamamlandı." : "Folyo kazındıkça alttaki sonuç görünür.";
    if (ticketMode) ticketMode.textContent = round.mode === "STANDARD" ? "STANDARD 5" : "ADVANCED 25";
    if (ticketStake) ticketStake.textContent = formatMoney(round.stakeCents);
    if (ticketBombs) ticketBombs.textContent = `${String(round.alarmCount).padStart(2, "0")} BOMBA`;
    if (ticketPrice) ticketPrice.textContent = formatTicketPrice(round.stakeCents);
    if (standardPrice) {
      standardPrice.textContent = formatTicketPrice(round.stakeCents);
      standardPrice.hidden = round.mode !== "STANDARD";
    }
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
    this.root.querySelectorAll<HTMLElement>("[data-witch-payout], [data-witch-mobile-payout]").forEach((element) => { element.textContent = formatCompactMoney(displayedPayout); });
    const stake = round ? formatCompactMoney(round.stakeCents) : "—";
    const net = round ? formatCompactMoney(displayedPayout - round.stakeCents, true) : "—";
    this.root.querySelectorAll<HTMLElement>("[data-witch-stake-display]").forEach((element) => { element.textContent = stake; });
    this.root.querySelectorAll<HTMLElement>("[data-witch-net]").forEach((element) => { element.textContent = net; });
    const payoutNote = this.root.querySelector<HTMLElement>("[data-witch-payout-note]");
    if (payoutNote) payoutNote.textContent = !round ? "Güvenli bir alan açıldığında cash out aktif olur." : round.status === "ACTIVE" ? (round.revealedSafeCount > 0 ? "Kazancı şimdi alabilir veya devam edebilirsin." : "İlk güvenli alan cash out’u açar.") : round.status === "BUST" ? "Bomba kartı kapattı. Payout: $0.00." : "Bu round server tarafından kapatıldı.";
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-action='cashout']").forEach((button) => {
      button.disabled = this.busy || !round || round.status !== "ACTIVE" || round.revealedSafeCount < 1;
    });
    const mobileActions = this.root.querySelector<HTMLElement>("[data-witch-mobile-payout]")?.closest<HTMLElement>(".witch-mobile-actions");
    if (mobileActions) mobileActions.hidden = !round;
    const mobileCaption = this.root.querySelector<HTMLElement>("[data-witch-mobile-caption]");
    if (mobileCaption) mobileCaption.textContent = round?.status === "BUST" ? "ROUND BUST" : round?.status === "ACTIVE" ? "MASADAKİ KAZANÇ" : "SON PAYOUT";
  }
}