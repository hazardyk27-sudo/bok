import { ScratchSurface } from "./scratch/ScratchSurface";
import {
  SCRATCH_RESULT_ART_URLS,
  getScratchCellLayerMarkup,
  getScratchCellPresentation,
} from "./scratch/ScratchPresentation";
import { triggerScratchHaptic } from "./scratch/ScratchFeedback";
import { ScratchTelemetry } from "./scratch/ScratchTelemetry";
import { AudioManager } from "./AudioManager";
import {
  OFFICE_CARD_ART_URL,
  OFFICE_MATCH_SYMBOLS,
  OFFICE_RESULT_ART_URLS,
  type OfficeMatchSymbolId,
} from "./office/officeCardConfig";
import { fitAdvancedCardBounds } from "./advanced/advancedCardFit";

type CadiKazanMode = "STANDARD" | "ADVANCED" | "OFFICE_MATCH_6";
type CadiKazanStatus = "ACTIVE" | "CASHED_OUT" | "BUST" | "COMPLETED";

type CadiKazanOfficeVisibleCell = {
  index: number;
  symbolId: OfficeMatchSymbolId;
};

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
  revealedOfficeCells?: CadiKazanOfficeVisibleCell[];
  officeTicketPublicId: string | null;
  officePoolRemaining: number | null;
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

type CadiKazanOfficePoolStatus = {
  remaining: number;
  total: number;
};

type CadiKazanPreparedReveal =
  | {
      roundId: string;
      cellIndex: number;
      mode: "STANDARD" | "ADVANCED";
      kind: "SAFE" | "BOMB";
    }
  | {
      roundId: string;
      cellIndex: number;
      mode: "OFFICE_MATCH_6";
      kind: "OFFICE";
      symbolId: OfficeMatchSymbolId;
    };

const API_BASE = "/api/cadi-kazan";
const ADVANCED_25_CARD_ART_URL = new URL("./advanced/assets/advanced25-card-master.png", import.meta.url).href;
const SCRATCH_BRUSH_RADIUS_PX = 14;
const OFFICE_SCRATCH_BRUSH_RADIUS_PX = SCRATCH_BRUSH_RADIUS_PX * 1.43;
const OFFICE_SYMBOL_BY_ID = new Map(OFFICE_MATCH_SYMBOLS.map((symbol) => [symbol.id, symbol] as const));
const OFFICE_SCRATCH_COVER_URL = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 250">
  <rect width="360" height="250" rx="12" fill="#ececec"/>
  <g transform="translate(180 125) rotate(-1)">
    <text x="-72" y="-58" text-anchor="middle" font-family="Georgia,serif" font-size="32" font-weight="700" fill="#111" stroke="#fff" stroke-width="9" paint-order="stroke fill">that's</text>
    <text x="0" y="20" text-anchor="middle" font-family="Georgia,serif" font-size="92" font-weight="900" letter-spacing="-5" fill="#070707" stroke="#fff" stroke-width="12" paint-order="stroke fill">what</text>
    <text x="38" y="73" text-anchor="middle" font-family="Georgia,serif" font-size="43" font-weight="800" fill="#111" stroke="#fff" stroke-width="10" paint-order="stroke fill">she said</text>
  </g>
</svg>`);

const officeSymbolPresentation = (symbolId: OfficeMatchSymbolId | undefined, revealed: boolean) => {
  if (!revealed || !symbolId) {
    return { symbol: "", label: "", resultClass: null as "safe" | null, special: false, artworkUrl: null };
  }
  const symbol = OFFICE_SYMBOL_BY_ID.get(symbolId);
  if (!symbol) {
    return { symbol: "", label: "", resultClass: null as "safe" | null, special: false, artworkUrl: null };
  }
  return {
    symbol: symbol.label.toUpperCase(),
    label: `${symbol.label.toUpperCase()} · ${symbol.multiplierBps / 100}X`,
    resultClass: "safe" as const,
    special: symbol.special,
    artworkUrl: symbol.artworkUrl,
  };
};

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

const ALL_SCRATCH_RESULT_ART_URLS = [...new Set([
  ...SCRATCH_RESULT_ART_URLS,
  ...OFFICE_RESULT_ART_URLS,
])];

function preloadScratchResultAssets() {
  if (typeof Image === "undefined") return Promise.resolve();

  return Promise.all(ALL_SCRATCH_RESULT_ART_URLS.map((url) => new Promise<void>((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = async () => {
      if (settled) return;
      settled = true;
      try {
        await image.decode();
      } catch {
        // A failed decode must not make the game unusable. The browser can
        // still retry the already-cached URL in the persistent result slot.
      }
      resolve();
    };
    image.addEventListener("load", () => { void finish(); }, { once: true });
    image.addEventListener("error", () => {
      if (settled) return;
      settled = true;
      resolve();
    }, { once: true });
    image.decoding = "async";
    image.src = url;
    if (image.complete && image.naturalWidth > 0) void finish();
  }))).then(() => undefined);
}

const scratchResultAssetsReady = preloadScratchResultAssets();

const PREPARE_REVEAL_TIMEOUT_MS = 1200;
const PREPARE_REVEAL_MAX_ATTEMPTS = 2;
const REVEAL_ATTEMPT_TIMEOUT_MS = 2200;
const REVEAL_MAX_ATTEMPTS = 2;

async function fetchPreparedReveal(roundId: string, cellIndex: number) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= PREPARE_REVEAL_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}/rounds/${encodeURIComponent(roundId)}/prepare-reveal`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cellIndex }),
        signal: AbortSignal.timeout(PREPARE_REVEAL_TIMEOUT_MS),
      });
      const data = await response.json() as CadiKazanPreparedReveal & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Alan hazırlanamadı");
      return data;
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof DOMException
          ? error.name === "TimeoutError" || error.name === "AbortError"
          : error instanceof TypeError;
      if (!retryable || attempt >= PREPARE_REVEAL_MAX_ATTEMPTS) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Alan hazırlanamadı");
}

async function fetchRevealMutation(roundId: string, cellIndex: number, idempotencyKey: string) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= REVEAL_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}/rounds/${encodeURIComponent(roundId)}/reveal`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cellIndex, idempotencyKey }),
        signal: AbortSignal.timeout(REVEAL_ATTEMPT_TIMEOUT_MS),
      });
      const data = await response.json() as CadiKazanMutation & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Alan açılamadı");
      return data;
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof DOMException
          ? error.name === "TimeoutError" || error.name === "AbortError"
          : error instanceof TypeError;
      if (!retryable || attempt >= REVEAL_MAX_ATTEMPTS) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Alan açılamadı");
}

export const CADI_KAZAN_MARKUP = `
  <main class="witch-page" aria-labelledby="witch-title">
    <svg class="witch-office-filter-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <filter id="witch-office-remove-black" color-interpolation-filters="sRGB">
          <feColorMatrix
            type="matrix"
            values="
              1 0 0 0 0
              0 1 0 0 0
              0 0 1 0 0
              8 8 8 0 -0.12
            "
          />
        </filter>
      </defs>
    </svg>
    <header class="witch-appbar">
      <a class="witch-back" href="/" aria-label="Ana menüye dön">←</a>

      <div class="witch-appbrand">
        <div>
          <h1 id="witch-title">CADI KAZAN</h1>
          <small>LUCKY SCRATCH</small>
        </div>
      </div>

      <section class="witch-appstats" aria-label="Cadı Kazan durumu">
        <div class="witch-office-pool-head" data-witch-office-pool-head hidden>
          <div class="witch-office-pool-chip" aria-label="The Office havuzunda kalan bilet">
            <span>HAVUZ</span>
            <strong data-witch-office-pool-head-value>—/200</strong>
          </div>
          <button
            class="witch-office-pool-info-button"
            type="button"
            data-witch-office-pool-info-toggle
            aria-label="The Office havuz sistemi hakkında bilgi"
            aria-expanded="false"
            aria-controls="witch-office-pool-info"
          >i</button>
          <div
            class="witch-office-pool-info"
            id="witch-office-pool-info"
            data-witch-office-pool-info
            role="dialog"
            aria-label="The Office havuz sistemi"
            hidden
          >
            <strong>200 BİLETLİK HAVUZ</strong>
            <p>Her havuzda önceden hazırlanmış 200 bilet bulunur. Satın aldığında havuzdaki kullanılmamış biletlerden biri sana atanır.</p>
            <div class="witch-office-pool-info-grid">
              <span><b>1</b> Michael · 100x</span>
              <span><b>3</b> Stanley · 20x</span>
              <span><b>5</b> Dwight · 10x</span>
              <span><b>15</b> Jim · 5x</span>
              <span><b>60</b> Kevin · 2x</span>
              <span><b>116</b> Ödülsüz</span>
            </div>
            <small>Havuzdaki 200 bilet bittiğinde sıradaki 200'lük paket otomatik devreye girer.</small>
          </div>
        </div>
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

          <div class="witch-advanced-card-art" aria-hidden="true">
            <img class="witch-advanced-card-master" src="${ADVANCED_25_CARD_ART_URL}" alt="" width="1200" height="546" loading="eager" decoding="async" fetchpriority="auto" draggable="false">
          </div>

          <div class="witch-office-card-art" aria-hidden="true">
            <img class="witch-office-card-master" src="${OFFICE_CARD_ART_URL}" alt="" width="1000" height="468" loading="eager" decoding="async" fetchpriority="auto" draggable="false">
          </div>
          <div class="witch-office-card-meta" data-witch-office-meta hidden>
            <span>HAVUZ <b data-witch-office-pool>—/200</b></span>
            <span>BİLET ID <b data-witch-office-ticket-id>—</b></span>
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
          <button type="button" class="witch-card-option witch-card-option-office" data-witch-mode="OFFICE_MATCH_6">
            <span><strong>The Office</strong><small>6 alan · 3 aynı sembol</small></span>
            <b aria-hidden="true">3×</b>
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
          <option value="0">3 AYNI</option>
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
  private officePoolStatus: CadiKazanOfficePoolStatus | null = null;
  private mode: CadiKazanMode = "STANDARD";
  private busy = false;
  private pendingRevealCell: number | null = null;
  private terminalRevealRoundId: string | null = null;
  private readonly terminalRevealVisibleCells = new Set<number>();
  private readonly terminalRevealTimers = new Set<number>();
  private terminalRevealAnimating = false;
  private readonly scratchSurfaces = new Map<number, ScratchSurface>();
  private preparedRevealRoundId: string | null = null;
  private readonly preparedReveals = new Map<number, CadiKazanPreparedReveal>();
  private readonly preparedRevealRequests = new Map<number, Promise<void>>();
  private officeRevealQueue: Promise<void> = Promise.resolve();
  private officeScratchPointerId: number | null = null;
  private officeScratchOriginIndex: number | null = null;
  private readonly audio = new AudioManager("cadi-kazan");
  private readonly telemetry = new ScratchTelemetry();
  private lastRevealInput: "pointer" | "keyboard" = "pointer";
  private entranceRoundId: string | null = null;
  private entranceTimer: number | null = null;
  private advancedFitObserver?: ResizeObserver;
  private advancedFitFrame: number | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.bind();
    this.bindAdvancedCardFit();
    void this.load();
  }

  private bindAdvancedCardFit() {
    const surface = this.root.querySelector<HTMLElement>(".witch-table-surface");
    if (!surface) return;

    if (typeof ResizeObserver !== "undefined") {
      this.advancedFitObserver = new ResizeObserver(() => this.scheduleAdvancedCardFit());
      this.advancedFitObserver.observe(surface);
    } else {
      window.addEventListener("resize", this.scheduleAdvancedCardFit, { passive: true });
    }
    this.scheduleAdvancedCardFit();
  }

  private readonly scheduleAdvancedCardFit = () => {
    if (this.advancedFitFrame !== null) return;
    this.advancedFitFrame = window.requestAnimationFrame(() => {
      this.advancedFitFrame = null;
      this.applyAdvancedCardFit();
    });
  };

  private applyAdvancedCardFit() {
    const ticket = this.root.querySelector<HTMLElement>("[data-witch-ticket]");
    const surface = this.root.querySelector<HTMLElement>(".witch-table-surface");
    if (!ticket || !surface) return;

    if (!this.root.classList.contains("is-advanced-theme") || ticket.hidden) {
      ticket.style.removeProperty("--advanced-fit-width");
      ticket.style.removeProperty("--advanced-fit-height");
      return;
    }

    const fitted = fitAdvancedCardBounds(surface.clientWidth, surface.clientHeight);
    if (fitted.width <= 0 || fitted.height <= 0) return;

    ticket.style.setProperty("--advanced-fit-width", `${fitted.width}px`);
    ticket.style.setProperty("--advanced-fit-height", `${fitted.height}px`);
  }

  private bind() {
    const menuToggle = this.root.querySelector<HTMLButtonElement>("[data-witch-menu-toggle]");
    const menu = this.root.querySelector<HTMLElement>("[data-witch-menu]");
    const officePoolInfoToggle = this.root.querySelector<HTMLButtonElement>("[data-witch-office-pool-info-toggle]");
    const officePoolInfo = this.root.querySelector<HTMLElement>("[data-witch-office-pool-info]");
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
    const closeOfficePoolInfo = () => {
      if (!officePoolInfo) return;
      officePoolInfo.hidden = true;
      officePoolInfoToggle?.setAttribute("aria-expanded", "false");
    };

    menuToggle?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!menu) return;
      const willOpen = menu.hidden;
      closeCardsMenu();
      menu.hidden = !willOpen;
      menuToggle.setAttribute("aria-expanded", String(willOpen));
    });
    officePoolInfoToggle?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!officePoolInfo || this.mode !== "OFFICE_MATCH_6") return;
      const willOpen = officePoolInfo.hidden;
      closeGameMenu();
      closeCardsMenu();
      officePoolInfo.hidden = !willOpen;
      officePoolInfoToggle.setAttribute("aria-expanded", String(willOpen));
    });
    officePoolInfo?.addEventListener("click", (event) => event.stopPropagation());
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
      closeOfficePoolInfo();
    });
    this.root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      closeGameMenu();
      closeCardsMenu();
      closeOfficePoolInfo();
      menuToggle?.focus();
    });

    // The Office supports one continuous drag across multiple scratch cells.
    // The origin cell keeps its native pointer-captured ScratchSurface; every
    // other Office surface receives the same screen-space pointer path when the
    // cursor/finger crosses its bounds. Standard and Advanced are untouched.
    this.root.addEventListener("pointerdown", (event) => {
      const round = this.state?.round;
      if (!round || round.mode !== "OFFICE_MATCH_6" || round.status !== "ACTIVE") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest("[data-witch-board]")) return;
      this.officeScratchPointerId = event.pointerId;
      const cell = target.closest<HTMLButtonElement>("[data-witch-cell]");
      this.officeScratchOriginIndex = cell ? Number(cell.dataset.witchCell) : null;
    });

    this.root.addEventListener("pointermove", (event) => {
      if (this.officeScratchPointerId !== event.pointerId) return;
      const round = this.state?.round;
      if (!round || round.mode !== "OFFICE_MATCH_6" || round.status !== "ACTIVE") return;

      // Pointer capture keeps events routed to the origin canvas, but the
      // physical pointer can already be over another Office cell. Resolve the
      // actual screen-space cell once instead of forcing every scratch surface
      // to measure its DOMRect on every move.
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const cell = hit?.closest<HTMLButtonElement>("[data-witch-cell]") ?? null;
      const index = cell ? Number(cell.dataset.witchCell) : NaN;
      if (!Number.isInteger(index) || index === this.officeScratchOriginIndex) return;

      const surface = this.scratchSurfaces.get(index);
      if (!surface) return;
      const pressure = event.pressure > 0 ? event.pressure : 0.62;
      surface.scratchExternalPointer(event.pointerId, event.clientX, event.clientY, pressure);
    });

    const finishOfficeMultiScratch = (event: PointerEvent) => {
      if (this.officeScratchPointerId !== event.pointerId) return;
      for (const [index, surface] of Array.from(this.scratchSurfaces.entries())) {
        if (index === this.officeScratchOriginIndex) continue;
        surface.finishExternalPointer(event.pointerId);
      }
      this.officeScratchPointerId = null;
      this.officeScratchOriginIndex = null;
    };
    this.root.addEventListener("pointerup", finishOfficeMultiScratch);
    this.root.addEventListener("pointercancel", finishOfficeMultiScratch);

    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.busy || this.state?.round?.status === "ACTIVE") return;
        this.mode = button.dataset.witchMode as CadiKazanMode;
        if (cardsMenu) cardsMenu.hidden = true;
        cardsToggle?.setAttribute("aria-expanded", "false");
        this.render();
        if (this.mode === "OFFICE_MATCH_6") void this.refreshOfficePoolStatus();
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

  private async refreshOfficePoolStatus() {
    try {
      const response = await fetch(`${API_BASE}/office-pool`, { credentials: "same-origin" });
      const data = await response.json() as CadiKazanOfficePoolStatus & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Office havuzu yüklenemedi");
      this.officePoolStatus = {
        remaining: Math.max(0, Number(data.remaining) || 0),
        total: Math.max(1, Number(data.total) || 200),
      };
      this.render();
    } catch {
      // Pool metadata is informational; never block the scratch game if it
      // cannot refresh. The next successful Office purchase carries a fresh
      // server-side remaining count on the round snapshot.
    }
  }

  private async load() {
    try {
      const response = await fetch(`${API_BASE}/state`, { credentials: "same-origin" });
      const data = await response.json() as CadiKazanState & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Cadı Kazan yüklenemedi");
      await scratchResultAssetsReady;
      this.applyState(data);
      if (data.round) this.mode = data.round.mode;
      this.setStatus("SERVER’A BAĞLI", true);
      this.render();
      void this.refreshOfficePoolStatus();
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
    const alarmCount = this.mode === "STANDARD" ? 1 : this.mode === "OFFICE_MATCH_6" ? 0 : Number(alarmInput?.value ?? 1);
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
      await scratchResultAssetsReady;
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

  private paintPreparedReveal(button: HTMLButtonElement, round: CadiKazanRound, prepared: CadiKazanPreparedReveal | null) {
    // The board DOM is rebuilt for every round, so a selected result candidate
    // can stay sticky for the lifetime of that round. Do not clear it during a
    // transient render where prepared data is momentarily absent; that was able
    // to expose a plain white result cell between state updates.
    if (!prepared || prepared.roundId !== round.id || prepared.cellIndex !== Number(button.dataset.witchCell)) {
      return;
    }

    const preparedKey = prepared.kind === "OFFICE" ? prepared.symbolId : prepared.kind;
    if (button.dataset.preparedResult !== preparedKey) {
      button.querySelectorAll<HTMLElement>("[data-witch-result-candidate], [data-witch-office-candidate]").forEach((candidate) => {
        candidate.dataset.witchResultActive = "false";
      });
    }

    if (prepared.kind === "OFFICE") {
      const candidate = button.querySelector<HTMLElement>(`[data-witch-office-candidate="${prepared.symbolId}"]`);
      if (!candidate) return;
      const symbol = OFFICE_SYMBOL_BY_ID.get(prepared.symbolId);
      const prize = candidate.querySelector<HTMLElement>("[data-witch-office-result-prize]");
      if (symbol && prize) {
        prize.textContent = formatMoney(
          Math.floor((round.stakeCents * symbol.multiplierBps) / 100),
          { compactInteger: true },
        );
      }
      candidate.dataset.witchResultActive = "true";
      button.dataset.preparedResult = prepared.symbolId;
      return;
    }

    const candidate = button.querySelector<HTMLElement>(`[data-witch-result-candidate="${prepared.kind}"]`);
    if (!candidate) return;
    candidate.dataset.witchResultActive = "true";
    button.dataset.preparedResult = prepared.kind;
  }

  private async prepareReveal(roundId: string, cellIndex: number) {
    const round = this.state?.round;
    if (!round || round.id !== roundId || round.status !== "ACTIVE") throw new Error("ROUND_CHANGED");
    if (this.preparedReveals.has(cellIndex)) return;

    const inFlight = this.preparedRevealRequests.get(cellIndex);
    if (inFlight) return inFlight;

    const task = fetchPreparedReveal(roundId, cellIndex)
      .then((prepared) => {
        const current = this.state?.round;
        if (!current || current.id !== roundId || current.status !== "ACTIVE") throw new Error("ROUND_CHANGED");
        if (prepared.roundId !== roundId || prepared.cellIndex !== cellIndex || prepared.mode !== current.mode) {
          throw new Error("PREPARED_REVEAL_MISMATCH");
        }
        this.preparedReveals.set(cellIndex, prepared);
        const button = this.root.querySelector<HTMLButtonElement>(`[data-witch-cell="${cellIndex}"]`);
        if (button) this.paintPreparedReveal(button, current, prepared);
      })
      .finally(() => {
        this.preparedRevealRequests.delete(cellIndex);
      });

    this.preparedRevealRequests.set(cellIndex, task);
    return task;
  }

  private queueOfficeReveal(cellIndex: number) {
    const task = this.officeRevealQueue
      .catch(() => undefined)
      .then(async () => {
        const before = this.state?.round;
        if (
          !before ||
          before.mode !== "OFFICE_MATCH_6" ||
          before.status !== "ACTIVE" ||
          before.revealedCells.includes(cellIndex)
        ) return;

        this.telemetry.recordScratchCommit(cellIndex);
        this.lastRevealInput = "pointer";
        await this.reveal(cellIndex);

        const after = this.state?.round;
        if (
          after?.id === before.id &&
          after.status === "ACTIVE" &&
          !after.revealedCells.includes(cellIndex)
        ) {
          throw new Error("REVEAL_NOT_COMMITTED");
        }
      });

    // Keep the queue usable even if one network mutation fails. The caller
    // still receives the original task rejection so ScratchSurface can retry.
    this.officeRevealQueue = task.catch(() => undefined);
    return task;
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
      const idempotencyKey = newIdempotencyKey("reveal");
      const data = await fetchRevealMutation(round.id, cellIndex, idempotencyKey);
      this.applyState(data.state, data.state.round?.status !== "ACTIVE");
      const resultRound = data.state.round;
      if (resultRound) this.telemetry.recordRevealResult(cellIndex, data.outcome, resultRound.revealedSafeCount, resultRound.currentMultiplierBps);
      if (data.outcome === "BUST") {
        triggerScratchHaptic("BOMB");
        this.audio.bombBust();
      } else if (data.outcome === "SAFE" || data.outcome === "COMPLETED") {
        triggerScratchHaptic("GOLD");
      }
      if (data.outcome === "COMPLETED") {
        if (resultRound?.mode === "OFFICE_MATCH_6" && resultRound.payoutCents === 0) this.audio.officeLoss();
        else this.audio.cashRegister();
      }
      if (data.outcome === "BUST" || data.outcome === "COMPLETED") {
        if (resultRound) this.telemetry.recordSettlement(data.outcome, resultRound.revealedSafeCount, resultRound.currentMultiplierBps, resultRound.payoutCents);
      }
      this.setFeedback(
        resultRound?.mode === "OFFICE_MATCH_6"
          ? data.outcome === "COMPLETED"
            ? (resultRound.payoutCents > 0 ? "3 aynı karakter bulundu. Ödül wallet’a aktarıldı." : "6 alan tamamlandı. Eşleşme çıkmadı.")
            : data.outcome === "SAFE"
              ? "Karakter açıldı. 3 aynı karakteri tamamla."
              : "Bu alan daha önce açıldı."
          : data.outcome === "BUST"
            ? "BOMBA! Round BUST oldu."
            : data.outcome === "COMPLETED"
              ? "Tüm güvenli alanlar açıldı. Ödül tamamlandı."
              : data.outcome === "SAFE"
                ? "Güvenli alan. Cash Out kullanabilir veya devam edebilirsin."
                : "Bu alan daha önce açıldı.",
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
    if (!round || round.mode === "OFFICE_MATCH_6" || round.status !== "ACTIVE" || round.revealedSafeCount < 1 || this.busy) return;
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
    if (round?.mode === "OFFICE_MATCH_6" && round.officePoolRemaining !== null) {
      this.officePoolStatus = { remaining: round.officePoolRemaining, total: 200 };
    }
    if (round?.id !== this.preparedRevealRoundId) {
      this.preparedRevealRoundId = round?.id ?? null;
      this.preparedReveals.clear();
      this.preparedRevealRequests.clear();
    }
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

    // Every bomb-based card must expose the whole ticket immediately on BUST.
    // Keep this client-side guarantee in addition to the server snapshot rule so
    // no scratch canvas can remain over Standard or Advanced terminal results.
    if (round.mode !== "OFFICE_MATCH_6" && round.status === "BUST") {
      allCells.forEach((index) => this.terminalRevealVisibleCells.add(index));
      this.terminalRevealAnimating = false;
      this.render();
      return;
    }

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
    this.root.classList.toggle("is-office-round", Boolean(round && round.mode === "OFFICE_MATCH_6"));
    const visualMode = round?.mode ?? this.mode;
    this.root.classList.toggle("is-standard-theme", visualMode === "STANDARD");
    this.root.classList.toggle("is-advanced-theme", visualMode === "ADVANCED");
    this.root.classList.toggle("is-office-theme", visualMode === "OFFICE_MATCH_6");
    const officePoolHead = this.root.querySelector<HTMLElement>("[data-witch-office-pool-head]");
    const officePoolHeadValue = this.root.querySelector<HTMLElement>("[data-witch-office-pool-head-value]");
    const officeMeta = this.root.querySelector<HTMLElement>("[data-witch-office-meta]");
    const officePool = this.root.querySelector<HTMLElement>("[data-witch-office-pool]");
    const officeTicketId = this.root.querySelector<HTMLElement>("[data-witch-office-ticket-id]");
    const officePoolRemaining = round?.mode === "OFFICE_MATCH_6" && round.officePoolRemaining !== null
      ? round.officePoolRemaining
      : this.officePoolStatus?.remaining ?? null;
    const officePoolTotal = this.officePoolStatus?.total ?? 200;
    if (officePoolHead) officePoolHead.hidden = visualMode !== "OFFICE_MATCH_6";
    if (officePoolHeadValue) officePoolHeadValue.textContent = officePoolRemaining === null
      ? `—/${officePoolTotal}`
      : `${officePoolRemaining}/${officePoolTotal}`;
    if (visualMode !== "OFFICE_MATCH_6") {
      const info = this.root.querySelector<HTMLElement>("[data-witch-office-pool-info]");
      const infoToggle = this.root.querySelector<HTMLButtonElement>("[data-witch-office-pool-info-toggle]");
      if (info) info.hidden = true;
      infoToggle?.setAttribute("aria-expanded", "false");
    }
    if (officeMeta) officeMeta.hidden = visualMode !== "OFFICE_MATCH_6";
    if (officePool) officePool.textContent = officePoolRemaining === null
      ? `—/${officePoolTotal}`
      : `${officePoolRemaining}/${officePoolTotal}`;
    if (officeTicketId) officeTicketId.textContent = round?.mode === "OFFICE_MATCH_6"
      ? round.officeTicketPublicId ?? "—"
      : "SATIN AL";
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-mode]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.witchMode === this.mode);
      button.disabled = this.busy || hasActiveRound;
    });
    const cardsToggle = this.root.querySelector<HTMLButtonElement>("[data-witch-cards-toggle]");
    const cardsMenu = this.root.querySelector<HTMLElement>("[data-witch-card-menu]");
    const currentCard = this.root.querySelector<HTMLElement>("[data-witch-card-current]");
    if (currentCard) {
      currentCard.textContent = this.mode === "STANDARD"
        ? "Standard 5"
        : this.mode === "ADVANCED"
          ? "Advanced 25"
          : "The Office";
    }
    if (cardsToggle) {
      cardsToggle.disabled = this.busy || hasActiveRound;
      if (this.busy || hasActiveRound) {
        cardsToggle.setAttribute("aria-expanded", "false");
        if (cardsMenu) cardsMenu.hidden = true;
      }
    }
    const alarms = this.root.querySelector<HTMLSelectElement>("[data-witch-alarms]");
    if (alarms) {
      if (this.mode === "OFFICE_MATCH_6") alarms.value = "0";
      else if (alarms.value === "0") alarms.value = "1";
      alarms.disabled = this.busy || hasActiveRound || this.mode !== "ADVANCED";
    }
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
    const showAdvancedPreview = !hasRound && visualMode === "ADVANCED";
    const showOfficePreview = !hasRound && visualMode === "OFFICE_MATCH_6";
    const showCardPreview = showStandardPreview || showAdvancedPreview || showOfficePreview;
    if (empty) empty.hidden = hasRound || showCardPreview;
    if (ticket) {
      ticket.hidden = !(hasRound || showCardPreview);
      ticket.classList.toggle("is-preview", showCardPreview);
      ticket.classList.toggle("is-office", visualMode === "OFFICE_MATCH_6");
      ticket.classList.toggle("is-advanced", visualMode === "ADVANCED");
    }
    this.scheduleAdvancedCardFit();

    const usesMasterCardArtwork = visualMode === "ADVANCED" || visualMode === "OFFICE_MATCH_6";
    this.root.querySelectorAll<HTMLElement>(
      ".witch-ticket-frame, .witch-bcs-card-art, .witch-ticket-header, .witch-ticket-meta-row, .witch-ticket-footer",
    ).forEach((element) => {
      element.hidden = usesMasterCardArtwork;
    });

    const riskNote = this.root.querySelector<HTMLElement>("[data-witch-risk-note]");
    const riskLabel = this.root.querySelector<HTMLElement>(".witch-alarm-field > span");
    if (riskLabel) riskLabel.textContent = this.mode === "OFFICE_MATCH_6" ? "KURAL" : "RİSK";
    if (riskNote) {
      if (this.mode === "OFFICE_MATCH_6") {
        riskNote.textContent = `THE OFFICE / HAVUZ ${officePoolRemaining === null ? "—/200" : `${officePoolRemaining}/${officePoolTotal}`} / 3 AYNI = ÖDÜL`;
      } else {
        const selectedBombs = this.mode === "STANDARD" ? "1" : (alarms?.value ?? "1");
        riskNote.textContent = `${this.mode === "STANDARD" ? "STANDARD" : "ADVANCED"} / ${selectedBombs} BOMBA`;
      }
    }

    const board = this.root.querySelector<HTMLElement>("[data-witch-board]");

    if (!round) {
      const playMode = this.root.querySelector<HTMLElement>("[data-witch-play-mode]");
      const playTitle = this.root.querySelector<HTMLElement>("[data-witch-play-title]");
      if (playMode) {
        playMode.textContent = showStandardPreview
          ? "STANDARD 5 / 01 BOMBA"
          : showAdvancedPreview
            ? `ADVANCED 25 / ${String(Number(alarms?.value ?? "1")).padStart(2, "0")} BOMBA`
            : showOfficePreview
              ? "THE OFFICE / 3 AYNI"
              : "NO TICKET";
      }
      if (playTitle) {
        playTitle.textContent = showOfficePreview
          ? "6 alanı kazı. 3 aynı karakteri bul ve ödülü kazan."
          : showAdvancedPreview
            ? "25 alanlı bileti al, riskini seç ve kazımaya başla."
            : showStandardPreview
              ? "Biletini al ve kazımaya başla."
              : "Bir bilet seç ve kazımaya başla.";
      }

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
      } else if (showAdvancedPreview && board) {
        if (board.dataset.preview !== "advanced") {
          this.destroyScratchSurfaces();
          board.dataset.preview = "advanced";
          board.innerHTML = Array.from({ length: 25 }, (_, index) => `
            <button type="button" class="witch-cell witch-preview-cell witch-advanced-preview-cell" disabled aria-label="Advanced 25 kapalı kazıma alanı ${index + 1}"></button>
          `).join("");
        }

        const previewStakeDollars = parseStakeDollars(stakeInput?.value ?? "1");
        const previewStakeCents = Math.max(100, Math.round((Number.isFinite(previewStakeDollars) ? previewStakeDollars : 1) * 100));
        const previewBombs = Number(alarms?.value ?? "1");
        const ticketMode = this.root.querySelector<HTMLElement>("[data-witch-ticket-mode]");
        const ticketStake = this.root.querySelector<HTMLElement>("[data-witch-ticket-stake]");
        const ticketBombs = this.root.querySelector<HTMLElement>("[data-witch-ticket-bombs]");
        const ticketPrice = this.root.querySelector<HTMLElement>("[data-witch-ticket-price]");
        const standardPrice = this.root.querySelector<HTMLElement>("[data-witch-standard-price]");
        const ticketId = this.root.querySelector<HTMLElement>("[data-witch-ticket-id]");
        if (ticketMode) ticketMode.textContent = "ADVANCED 25";
        if (ticketStake) ticketStake.textContent = formatMoney(previewStakeCents);
        if (ticketBombs) ticketBombs.textContent = `${String(previewBombs).padStart(2, "0")} BOMBA`;
        if (ticketPrice) ticketPrice.textContent = formatTicketPrice(previewStakeCents);
        if (standardPrice) standardPrice.hidden = true;
        if (ticketId) ticketId.textContent = "PREVIEW";
      } else if (showOfficePreview && board) {
        if (board.dataset.preview !== "office") {
          this.destroyScratchSurfaces();
          board.dataset.preview = "office";
          board.innerHTML = Array.from({ length: 6 }, (_, index) => `
            <button type="button" class="witch-cell witch-preview-cell witch-office-preview-cell" disabled aria-label="The Office kapalı kazıma alanı ${index + 1}">
              <span class="witch-office-preview-coating" aria-hidden="true">
                <strong>that's</strong>
                <b>what</b>
                <span>she said</span>
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
        if (ticketMode) ticketMode.textContent = "THE OFFICE";
        if (ticketStake) ticketStake.textContent = formatMoney(previewStakeCents);
        if (ticketBombs) ticketBombs.textContent = "3 AYNI";
        if (ticketPrice) ticketPrice.textContent = formatTicketPrice(previewStakeCents);
        if (standardPrice) standardPrice.hidden = true;
        if (ticketId) ticketId.textContent = "PREVIEW";
      } else if (board?.dataset.preview || board?.dataset.roundId) {
        board.replaceChildren();
        delete board.dataset.preview;
        delete board.dataset.roundId;
      }

      this.updatePayout(null, visualMode);
      return;
    }

    const boardRoundChanged = board?.dataset.roundId !== round.id;
    if (board && (boardRoundChanged || board.childElementCount !== round.cellCount || Boolean(board.dataset.preview))) {
      delete board.dataset.preview;
      board.dataset.roundId = round.id;
      this.destroyScratchSurfaces();
      board.innerHTML = Array.from({ length: round.cellCount }, (_, index) => `
        <button type="button" class="witch-cell" data-witch-cell="${index}" aria-label="Kazınabilir kapalı alan">
          ${getScratchCellLayerMarkup(round.mode)}
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
    if (board) board.dataset.roundId = round.id;

    const revealedBombs = new Set(round.revealedBombCells);
    const visibleOfficeSymbols = new Map((round.revealedOfficeCells ?? []).map((cell) => [cell.index, cell.symbolId] as const));
    const officeSymbolCounts = new Map<OfficeMatchSymbolId, number>();
    if (round.mode === "OFFICE_MATCH_6") {
      for (const symbolId of visibleOfficeSymbols.values()) {
        officeSymbolCounts.set(symbolId, (officeSymbolCounts.get(symbolId) ?? 0) + 1);
      }
    }
    const winningOfficeSymbolId = round.mode === "OFFICE_MATCH_6" && round.status === "COMPLETED" && round.payoutCents > 0
      ? OFFICE_MATCH_SYMBOLS.find((symbol) => (officeSymbolCounts.get(symbol.id) ?? 0) >= 3)?.id ?? null
      : null;
    const winningOfficeIndices = new Set<number>();
    if (winningOfficeSymbolId) {
      (round.revealedOfficeCells ?? [])
        .filter((cell) => cell.symbolId === winningOfficeSymbolId)
        .map((cell) => cell.index)
        .sort((left, right) => left - right)
        .slice(0, 3)
        .forEach((index) => winningOfficeIndices.add(index));
    }

    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-cell]").forEach((button) => {
      const index = Number(button.dataset.witchCell);
      const isActuallyRevealed = round.revealedCells.includes(index);
      const isTerminallyRevealed = this.terminalRevealRoundId === round.id && this.terminalRevealVisibleCells.has(index);
      const isRevealed = isActuallyRevealed || isTerminallyRevealed;
      const isBomb = round.status !== "ACTIVE" && revealedBombs.has(index) && isRevealed;
      const officePresentation = round.mode === "OFFICE_MATCH_6"
        ? officeSymbolPresentation(visibleOfficeSymbols.get(index), isRevealed)
        : null;
      const presentation = officePresentation ?? getScratchCellPresentation(round.mode as "STANDARD" | "ADVANCED", isRevealed, isBomb);
      button.disabled = round.status !== "ACTIVE";
      button.dataset.cellState = presentation.resultClass ?? "covered";
      button.classList.toggle("is-revealed", isRevealed);
      button.classList.toggle("is-safe", presentation.resultClass === "safe");
      button.classList.toggle("is-bomb", presentation.resultClass === "bomb");
      button.classList.toggle("is-office-cell", round.mode === "OFFICE_MATCH_6");
      button.classList.toggle("is-office-special", Boolean(officePresentation?.special));
      button.classList.toggle(
        "is-office-winning-match",
        round.mode === "OFFICE_MATCH_6" && winningOfficeIndices.has(index),
      );
      button.classList.toggle(
        "is-office-win-dimmed",
        round.mode === "OFFICE_MATCH_6" && winningOfficeIndices.size === 3 && !winningOfficeIndices.has(index),
      );
      button.classList.toggle("is-pending", this.pendingRevealCell === index);
      button.classList.toggle("is-terminal-reveal", this.terminalRevealAnimating && isTerminallyRevealed && !isActuallyRevealed);
      button.setAttribute("aria-label", presentation.resultClass ? presentation.label : "Kazınabilir kapalı alan");
      const authoritativePrepared: CadiKazanPreparedReveal | null = round.mode === "OFFICE_MATCH_6"
        ? (() => {
            const symbolId = visibleOfficeSymbols.get(index);
            return isRevealed && symbolId
              ? { roundId: round.id, cellIndex: index, mode: "OFFICE_MATCH_6", kind: "OFFICE", symbolId }
              : null;
          })()
        : isRevealed
          ? {
              roundId: round.id,
              cellIndex: index,
              mode: round.mode,
              kind: isBomb ? "BOMB" : "SAFE",
            }
          : null;
      const preparedVisual = authoritativePrepared ?? this.preparedReveals.get(index) ?? null;
      this.paintPreparedReveal(button, round, preparedVisual);

      // Authoritative terminal/revealed state gets its own DOM marker. This is
      // deliberately independent from the prepared-result cache so a BUST
      // bomb can never render as a white empty cell if a transient render or
      // candidate flag gets out of sync.
      if (authoritativePrepared?.kind === "OFFICE") {
        button.dataset.authoritativeResult = authoritativePrepared.symbolId;
      } else if (authoritativePrepared) {
        button.dataset.authoritativeResult = authoritativePrepared.kind;
      } else {
        delete button.dataset.authoritativeResult;
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
          brushRadiusPx: round.mode === "OFFICE_MATCH_6" ? OFFICE_SCRATCH_BRUSH_RADIUS_PX : SCRATCH_BRUSH_RADIUS_PX,
          debrisCanvas: debrisCanvas ?? undefined,
          layerCanvases,
          coverImageUrl: round.mode === "STANDARD"
            ? "/cadi-kazan/bcs-cactus.webp"
            : round.mode === "OFFICE_MATCH_6"
              ? OFFICE_SCRATCH_COVER_URL
              : undefined,
          resultReady: isActuallyRevealed,
          persistentCoverageCommit: round.mode === "OFFICE_MATCH_6",
          onPrepare: async () => {
            if (this.state?.round?.revealedCells.includes(index)) return;
            await this.prepareReveal(round.id, index);
          },
          onCommit: async () => {
            if (this.state?.round?.revealedCells.includes(index)) return;

            if (round.mode === "OFFICE_MATCH_6") {
              await this.queueOfficeReveal(index);
              return;
            }

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
    if (playMode) {
      playMode.textContent = round.mode === "STANDARD"
        ? "STANDARD 5 / 01 BOMBA"
        : round.mode === "ADVANCED"
          ? `ADVANCED 25 / ${String(round.alarmCount).padStart(2, "0")} BOMBA`
          : "THE OFFICE / 3 AYNI";
    }
    if (playTitle) {
      playTitle.textContent = round.mode === "OFFICE_MATCH_6"
        ? round.status === "COMPLETED"
          ? (round.payoutCents > 0 ? "3 aynı karakter bulundu. Ödül tamamlandı." : "Kart tamamlandı. Eşleşme yok.")
          : "6 alanı kazı. 3 aynı karakteri bul."
        : round.status === "BUST"
          ? "Bomba açıldı."
          : round.status === "CASHED_OUT"
            ? "Kazanç alındı."
            : round.status === "COMPLETED"
              ? "Kart tamamlandı."
              : "Folyo kazındıkça alttaki sonuç görünür.";
    }
    if (ticketMode) ticketMode.textContent = round.mode === "STANDARD" ? "STANDARD 5" : round.mode === "ADVANCED" ? "ADVANCED 25" : "THE OFFICE";
    if (ticketStake) ticketStake.textContent = formatMoney(round.stakeCents);
    if (ticketBombs) ticketBombs.textContent = round.mode === "OFFICE_MATCH_6" ? "3 AYNI" : `${String(round.alarmCount).padStart(2, "0")} BOMBA`;
    if (ticketPrice) ticketPrice.textContent = formatTicketPrice(round.stakeCents);
    if (standardPrice) {
      standardPrice.textContent = formatTicketPrice(round.stakeCents);
      standardPrice.hidden = round.mode !== "STANDARD";
    }
    if (ticketId) ticketId.textContent = `#${round.id.slice(0, 8).toUpperCase()}`;
    if (riskNote) {
      if (round.mode === "OFFICE_MATCH_6") {
        riskNote.textContent = `THE OFFICE / HAVUZ ${officePoolRemaining === null ? "—/200" : `${officePoolRemaining}/${officePoolTotal}`} / 3 AYNI = ÖDÜL`;
      } else {
        const selectedBombs = this.mode === "STANDARD" ? "1" : (alarms?.value ?? String(round.alarmCount));
        riskNote.textContent = `${this.mode === "STANDARD" ? "STANDARD" : "ADVANCED"} / ${selectedBombs} BOMBA`;
      }
    }
    const ticketElement = this.root.querySelector<HTMLElement>("[data-witch-ticket]");
    if (ticketElement) {
      ticketElement.classList.toggle("is-advanced", round.mode === "ADVANCED");
      ticketElement.classList.toggle("is-office", round.mode === "OFFICE_MATCH_6");
      ticketElement.classList.toggle("is-office-win", Boolean(winningOfficeSymbolId));
      ticketElement.classList.toggle("is-office-100x-win", winningOfficeSymbolId === "MICHAEL");
      ticketElement.classList.toggle("is-entering", this.entranceRoundId === round.id);
      if (this.entranceRoundId === round.id && this.entranceTimer === null) {
        this.entranceTimer = window.setTimeout(() => {
          this.entranceRoundId = null;
          this.entranceTimer = null;
          ticketElement.classList.remove("is-entering");
        }, 540);
      }
    }
    this.updatePayout(round, round.mode);
  }

  private updatePayout(round: CadiKazanRound | null, visualMode: CadiKazanMode = this.mode) {
    const isOffice = (round?.mode ?? visualMode) === "OFFICE_MATCH_6";
    const displayedPayout = round ? (round.status === "ACTIVE" ? round.currentCashoutCents : round.payoutCents) : 0;
    const multiplier = round ? formatMultiplier(round.currentMultiplierBps) : "0.00x";
    this.root.querySelectorAll<HTMLElement>("[data-witch-multiplier], [data-witch-mobile-multiplier]").forEach((element) => { element.textContent = multiplier; });
    this.root.querySelectorAll<HTMLElement>("[data-witch-payout], [data-witch-mobile-payout]").forEach((element) => { element.textContent = formatCompactMoney(displayedPayout); });
    const stake = round ? formatCompactMoney(round.stakeCents) : "—";
    const net = round ? formatCompactMoney(displayedPayout - round.stakeCents, true) : "—";
    this.root.querySelectorAll<HTMLElement>("[data-witch-stake-display]").forEach((element) => { element.textContent = stake; });
    this.root.querySelectorAll<HTMLElement>("[data-witch-net]").forEach((element) => { element.textContent = net; });
    const payoutNote = this.root.querySelector<HTMLElement>("[data-witch-payout-note]");
    if (payoutNote) {
      payoutNote.textContent = isOffice
        ? !round
          ? "3 aynı karakteri bulduğunda ödül otomatik ödenir."
          : round.status === "ACTIVE"
            ? "Cash Out yok. 3 aynı karakteri tamamla."
            : round.payoutCents > 0
              ? "Eşleşme tamamlandı. Ödül wallet’a aktarıldı."
              : "Kart tamamlandı. Eşleşme çıkmadı."
        : !round
          ? "Güvenli bir alan açıldığında cash out aktif olur."
          : round.status === "ACTIVE"
            ? (round.revealedSafeCount > 0 ? "Kazancı şimdi alabilir veya devam edebilirsin." : "İlk güvenli alan cash out’u açar.")
            : round.status === "BUST"
              ? "Bomba kartı kapattı. Payout: $0.00."
              : "Bu round server tarafından kapatıldı.";
    }
    this.root.querySelectorAll<HTMLButtonElement>("[data-witch-action='cashout']").forEach((button) => {
      button.disabled = this.busy || isOffice || !round || round.status !== "ACTIVE" || round.revealedSafeCount < 1;
    });
    const mobileActions = this.root.querySelector<HTMLElement>("[data-witch-mobile-payout]")?.closest<HTMLElement>(".witch-mobile-actions");
    if (mobileActions) mobileActions.hidden = !round;
    const mobileCaption = this.root.querySelector<HTMLElement>("[data-witch-mobile-caption]");
    if (mobileCaption) mobileCaption.textContent = round?.status === "BUST" ? "ROUND BUST" : round?.status === "ACTIVE" ? "MASADAKİ KAZANÇ" : "SON PAYOUT";
  }
}