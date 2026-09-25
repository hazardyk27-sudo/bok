import {
  CLUB_STORE_BUSINESS,
  FAN_CLUB_BUSINESS,
  STADIUM_BUSINESS,
  VAULT_LEVELS,
} from "../config";
import { getIdleVaultUpgradePreview } from "../services";
import type {
  BusinessDefinition,
  BusinessId,
  IdleLiveBusinessState,
} from "../types";

const BUSINESS_META: Record<
  BusinessId,
  {
    eyebrow: string;
    code: string;
    artClass: string;
    visualLabel: string;
    definition: BusinessDefinition;
  }
> = {
  stadium: {
    eyebrow: "STADIUM",
    code: "01",
    artClass: "business-card-art--stadium",
    visualLabel: "Stadyum gelişim görsel alanı",
    definition: STADIUM_BUSINESS,
  },
  "club-store": {
    eyebrow: "CLUB STORE",
    code: "02",
    artClass: "business-card-art--club-store",
    visualLabel: "Kulüp mağazası gelişim görsel alanı",
    definition: CLUB_STORE_BUSINESS,
  },
  "fan-club": {
    eyebrow: "FAN CLUB",
    code: "03",
    artClass: "business-card-art--fan-club",
    visualLabel: "Taraftar kulübü gelişim görsel alanı",
    definition: FAN_CLUB_BUSINESS,
  },
};

const MICRO_CENTS_PER_CENT = 1_000_000;

function formatCreditsFromCents(cents: number) {
  const credits = cents / 100;
  return `$${credits.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCreditsFromMicrocents(microcents: number) {
  return formatCreditsFromCents(microcents / MICRO_CENTS_PER_CENT);
}

function getDefinition(businessId: BusinessId) {
  return BUSINESS_META[businessId].definition;
}

function renderBusinessArt(businessId: BusinessId) {
  if (businessId === "fan-club") {
    return `
      <div class="business-card-art business-card-art--fan-club business-card-fan-scene" aria-hidden="true">
        <svg viewBox="0 0 420 190" preserveAspectRatio="xMidYMid slice" role="presentation">
          <defs>
            <linearGradient id="fan-night" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#0b1a29"/>
              <stop offset="55%" stop-color="#10283a"/>
              <stop offset="100%" stop-color="#061019"/>
            </linearGradient>
            <linearGradient id="fan-lounge" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#15364d"/>
              <stop offset="100%" stop-color="#07131f"/>
            </linearGradient>
            <linearGradient id="fan-screen" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#17435a"/>
              <stop offset="100%" stop-color="#0b202d"/>
            </linearGradient>
            <linearGradient id="fan-banner" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#46c8ff"/>
              <stop offset="52%" stop-color="#7ddfff"/>
              <stop offset="100%" stop-color="#7258ff"/>
            </linearGradient>
            <filter id="fan-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.5"/>
            </filter>
          </defs>

          <rect class="fan-night" width="420" height="190" fill="url(#fan-night)"/>
          <ellipse class="fan-room-glow" cx="215" cy="126" rx="160" ry="64" fill="#46c8ff" opacity=".055" filter="url(#fan-soft-glow)"/>

          <g class="fan-lounge-shell">
            <path class="fan-roof" d="M45 52H376L354 74H68Z" fill="#10283b" stroke="#93e1ff" stroke-opacity=".2"/>
            <rect class="fan-lounge-wall" x="60" y="69" width="302" height="87" rx="8" fill="url(#fan-lounge)" stroke="#83dfff" stroke-opacity=".18"/>
            <path class="fan-backlight" d="M78 81H344" stroke="url(#fan-banner)" stroke-width="2.2" stroke-linecap="round" opacity=".58"/>
            <path class="fan-floor" d="M54 157H368L395 190H24Z" fill="#07121d" stroke="#6fdcff" stroke-opacity=".08"/>
          </g>

          <g class="fan-media">
            <rect class="fan-main-screen" x="161" y="83" width="98" height="48" rx="5" fill="url(#fan-screen)" stroke="#92e4ff" stroke-opacity=".24"/>
            <path d="M172 122l18-15 18 9 17-18 23 24" fill="none" stroke="#7ddfff" stroke-opacity=".24" stroke-width="2"/>
            <rect class="fan-side-screen fan-side-screen-left" x="83" y="87" width="59" height="36" rx="4" fill="#0c2432" stroke="#7ddfff" stroke-opacity=".16"/>
            <rect class="fan-side-screen fan-side-screen-right" x="278" y="87" width="59" height="36" rx="4" fill="#0c2432" stroke="#7ddfff" stroke-opacity=".16"/>
          </g>

          <g class="fan-seating">
            <path d="M80 141C112 124 142 126 166 141V156H80Z" fill="#0b2231" stroke="#75d8ef" stroke-opacity=".14"/>
            <path d="M254 141C278 126 308 124 340 141V156H254Z" fill="#0b2231" stroke="#75d8ef" stroke-opacity=".14"/>
            <rect x="181" y="139" width="58" height="17" rx="8" fill="#0d2635" stroke="#87dff5" stroke-opacity=".12"/>
          </g>

          <g class="fan-supporters" fill="#9ce9ff" opacity=".46">
            <circle cx="95" cy="133" r="4"/><circle cx="111" cy="129" r="4"/><circle cx="127" cy="132" r="4"/>
            <circle cx="143" cy="128" r="4"/><circle cx="278" cy="131" r="4"/><circle cx="294" cy="127" r="4"/>
            <circle cx="310" cy="130" r="4"/><circle cx="326" cy="126" r="4"/>
            <path d="M91 138v13M107 134v17M123 137v14M139 133v18M274 136v15M290 132v19M306 135v16M322 131v20" stroke="#9ce9ff" stroke-width="3" stroke-linecap="round"/>
          </g>

          <g class="fan-flags" opacity=".34">
            <path d="M72 79v52M348 78v53" stroke="#b8efff" stroke-width="2"/>
            <path d="M74 82l30 8-30 11zM346 82l-30 8 30 11z" fill="url(#fan-banner)"/>
          </g>

          <g class="fan-scarves" opacity=".28">
            <path d="M106 72h62M252 72h62" stroke="#7ddfff" stroke-width="4" stroke-linecap="round"/>
            <path d="M106 68v8M168 68v8M252 68v8M314 68v8" stroke="#b6f0ff" stroke-width="2"/>
          </g>

          <g class="fan-vip-lighting" opacity=".12" filter="url(#fan-soft-glow)">
            <path d="M96 62L153 146M324 62L267 146" stroke="#7ddfff" stroke-width="10"/>
          </g>

          <g class="fan-icon-crown" opacity="0" fill="none" stroke="#c9f5ff" stroke-width="1.5">
            <path d="M210 25l7 9 11 1-7 8 2 11-13-6-13 6 2-11-7-8 11-1z"/>
            <circle cx="210" cy="40" r="22" stroke-opacity=".2"/>
          </g>
        </svg>
      </div>
    `;
  }

  if (businessId === "club-store") {
    return `
      <div class="business-card-art business-card-art--club-store business-card-store-scene" aria-hidden="true">
        <svg viewBox="0 0 420 190" preserveAspectRatio="xMidYMid slice" role="presentation">
          <defs>
            <linearGradient id="store-night" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#11192d"/>
              <stop offset="54%" stop-color="#18233d"/>
              <stop offset="100%" stop-color="#080f1b"/>
            </linearGradient>
            <linearGradient id="store-glass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#173557" stop-opacity=".92"/>
              <stop offset="100%" stop-color="#091725" stop-opacity=".95"/>
            </linearGradient>
            <linearGradient id="store-floor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#172039"/>
              <stop offset="100%" stop-color="#070d17"/>
            </linearGradient>
            <linearGradient id="store-neon" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#46c8ff"/>
              <stop offset="55%" stop-color="#8d7dff"/>
              <stop offset="100%" stop-color="#46c8ff"/>
            </linearGradient>
            <filter id="store-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.5"/>
            </filter>
          </defs>

          <rect class="store-night" width="420" height="190" fill="url(#store-night)"/>
          <path class="store-pavement" d="M0 153L420 144V190H0Z" fill="url(#store-floor)"/>
          <ellipse class="store-ground-glow" cx="230" cy="158" rx="146" ry="22" fill="#7258ff" opacity=".07" filter="url(#store-soft-glow)"/>

          <g class="store-shell">
            <path class="store-canopy" d="M56 49H365L349 69H70Z" fill="#111d32" stroke="#a2dfff" stroke-opacity=".2"/>
            <rect class="store-facade" x="67" y="66" width="290" height="90" rx="7" fill="#0a1525" stroke="#91ddff" stroke-opacity=".18"/>
            <rect class="store-window store-window-left" x="78" y="77" width="86" height="66" rx="4" fill="url(#store-glass)" stroke="#7bdcff" stroke-opacity=".19"/>
            <rect class="store-window store-window-center" x="171" y="77" width="86" height="66" rx="4" fill="url(#store-glass)" stroke="#9a8cff" stroke-opacity=".2"/>
            <rect class="store-window store-window-right" x="264" y="77" width="82" height="66" rx="4" fill="url(#store-glass)" stroke="#7bdcff" stroke-opacity=".19"/>
            <path class="store-door" d="M198 93H230V155H198Z" fill="#0b1a2c" stroke="#b4ebff" stroke-opacity=".24"/>
            <circle class="store-door-handle" cx="224" cy="125" r="1.5" fill="#bdefff" opacity=".55"/>
          </g>

          <g class="store-signage">
            <rect x="118" y="51" width="184" height="16" rx="8" fill="#07111d" stroke="#8fdfff" stroke-opacity=".2"/>
            <path class="store-sign-line" d="M144 59H277" stroke="url(#store-neon)" stroke-width="2.5" stroke-linecap="round"/>
            <circle class="store-sign-mark" cx="131" cy="59" r="4" fill="none" stroke="#7ddfff" stroke-opacity=".72"/>
          </g>

          <g class="store-merch">
            <g class="store-jersey store-jersey-left">
              <path d="M100 88l12-6 12 6 10-4 8 13-10 6v27H92v-27l-10-6 8-13z" fill="#183e61" stroke="#8de5ff" stroke-opacity=".28"/>
              <path d="M112 82v48M96 103h32" stroke="#8de5ff" stroke-opacity=".16"/>
            </g>
            <g class="store-jersey store-jersey-center">
              <path d="M193 89l12-6 12 6 10-4 8 13-10 6v26h-40v-26l-10-6 8-13z" fill="#29285a" stroke="#aa9cff" stroke-opacity=".3"/>
              <path d="M205 83v47M189 104h32" stroke="#aa9cff" stroke-opacity=".17"/>
            </g>
            <g class="store-jersey store-jersey-right">
              <path d="M289 89l11-6 11 6 9-4 8 12-9 6v27h-38v-27l-9-6 8-12z" fill="#143c55" stroke="#8de5ff" stroke-opacity=".26"/>
              <path d="M300 83v47M286 104h28" stroke="#8de5ff" stroke-opacity=".15"/>
            </g>
          </g>

          <g class="store-shelves" opacity=".46">
            <path d="M84 136h68M270 136h68" stroke="#9edfff" stroke-opacity=".32"/>
            <rect x="91" y="126" width="10" height="7" rx="1" fill="#79dfff"/>
            <rect x="106" y="123" width="12" height="10" rx="1" fill="#8f83ff"/>
            <rect x="124" y="127" width="17" height="6" rx="1" fill="#79dfff"/>
            <rect x="277" y="126" width="12" height="7" rx="1" fill="#79dfff"/>
            <rect x="294" y="122" width="15" height="11" rx="1" fill="#8f83ff"/>
            <rect x="314" y="127" width="15" height="6" rx="1" fill="#79dfff"/>
          </g>

          <g class="store-premium-rack" opacity=".25">
            <path d="M206 80v58M184 91h44" stroke="#d4f6ff" stroke-opacity=".34"/>
            <circle cx="206" cy="76" r="4" fill="#bcefff" opacity=".35"/>
          </g>

          <g class="store-flagship-mark" opacity="0" fill="none" stroke="#c8f4ff" stroke-width="1.5">
            <path d="M210 26l7 9 11 1-7 8 2 11-13-6-13 6 2-11-7-8 11-1z"/>
            <circle cx="210" cy="40" r="22" stroke-opacity=".2"/>
          </g>
        </svg>
      </div>
    `;
  }

  return `
    <div class="business-card-art business-card-art--stadium business-card-stadium-scene" aria-hidden="true">
      <svg viewBox="0 0 420 190" preserveAspectRatio="xMidYMid slice" role="presentation">
        <defs>
          <linearGradient id="stadium-sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#0a1a2e"/>
            <stop offset="52%" stop-color="#102b48"/>
            <stop offset="100%" stop-color="#07111f"/>
          </linearGradient>
          <linearGradient id="stadium-stand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#193a5c"/>
            <stop offset="100%" stop-color="#07111d"/>
          </linearGradient>
          <linearGradient id="stadium-pitch" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#1d6e63"/>
            <stop offset="100%" stop-color="#0c3535"/>
          </linearGradient>
          <radialGradient id="stadium-glow">
            <stop offset="0%" stop-color="#9be9ff" stop-opacity=".75"/>
            <stop offset="100%" stop-color="#46c8ff" stop-opacity="0"/>
          </radialGradient>
          <filter id="stadium-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4"/>
          </filter>
        </defs>

        <rect class="stadium-sky" width="420" height="190" fill="url(#stadium-sky)"/>
        <circle class="stadium-moon-glow" cx="326" cy="33" r="52" fill="url(#stadium-glow)" opacity=".24"/>

        <g class="stadium-city" opacity=".44">
          <rect x="8" y="78" width="25" height="36" rx="2"/>
          <rect x="36" y="66" width="34" height="48" rx="2"/>
          <rect x="74" y="82" width="24" height="32" rx="2"/>
          <rect x="328" y="74" width="28" height="40" rx="2"/>
          <rect x="360" y="58" width="40" height="56" rx="2"/>
        </g>

        <g class="stadium-floodlights">
          <path d="M48 20v88M372 20v88" stroke="currentColor" stroke-width="3" opacity=".58"/>
          <path d="M29 23h38M353 23h38" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
          <g class="stadium-light-beams" opacity=".25" filter="url(#stadium-soft-glow)">
            <path d="M31 26L118 127M65 26L143 126M355 26L277 127M389 26L302 126" stroke="#7ddfff" stroke-width="8"/>
          </g>
        </g>

        <g class="stadium-shell">
          <path class="stadium-roof" d="M54 108C77 54 343 54 366 108L340 112C319 82 101 82 80 112Z" fill="#153855" stroke="#69d8ff" stroke-opacity=".33" stroke-width="2"/>
          <path class="stadium-upper-tier" d="M62 111C96 77 324 77 358 111L334 146H86Z" fill="url(#stadium-stand)" stroke="#8ae5ff" stroke-opacity=".22"/>
          <path class="stadium-lower-tier" d="M86 121C118 101 302 101 334 121L313 158H107Z" fill="#0b2034" stroke="#73d8ff" stroke-opacity=".2"/>
          <ellipse class="stadium-bowl" cx="210" cy="139" rx="103" ry="35" fill="#06111d" stroke="#74dcff" stroke-opacity=".24"/>
          <ellipse class="stadium-pitch" cx="210" cy="143" rx="76" ry="23" fill="url(#stadium-pitch)" stroke="#a0f3db" stroke-opacity=".25"/>
          <path class="stadium-midline" d="M210 121v44M135 143h150" stroke="#c4fff1" stroke-opacity=".22" stroke-width="1"/>
          <circle class="stadium-center-circle" cx="210" cy="143" r="12" fill="none" stroke="#c4fff1" stroke-opacity=".2"/>
        </g>

        <g class="stadium-crowd" fill="#7ddfff" opacity=".52">
          <circle cx="108" cy="109" r="1.2"/><circle cx="124" cy="105" r="1.1"/><circle cx="142" cy="101" r="1.3"/>
          <circle cx="163" cy="99" r="1.1"/><circle cx="184" cy="98" r="1.2"/><circle cx="208" cy="97" r="1.1"/>
          <circle cx="234" cy="98" r="1.2"/><circle cx="258" cy="100" r="1.1"/><circle cx="281" cy="103" r="1.3"/>
          <circle cx="304" cy="107" r="1.1"/>
        </g>

        <g class="stadium-star-crown" fill="none" stroke="#a7eeff" stroke-width="1.5" opacity="0">
          <path d="M210 49l5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2z"/>
          <circle cx="210" cy="64" r="24" stroke-opacity=".22"/>
        </g>
      </svg>
    </div>
  `;
}

function getBusinessVisualStage(business: IdleLiveBusinessState) {
  if (business.businessLevel === null) return "locked";
  if (business.businessLevel <= 2) return "local";
  if (business.businessLevel <= 5) return "pro";
  if (business.businessLevel <= 7) return "elite";
  return "landmark";
}

function formatVaultEta(
  business: IdleLiveBusinessState,
  dailyIncomeCents: number | null,
) {
  if (business.businessLevel === null || dailyIncomeCents === null || dailyIncomeCents <= 0) {
    return "Satın alındıktan sonra aktif";
  }
  if (business.liveIsVaultFull) return "Kasa dolu · toplamaya hazır";

  const hourlyMicrocents = dailyIncomeCents * MICRO_CENTS_PER_CENT / 24;
  if (hourlyMicrocents <= 0) return "Gelir bekleniyor";

  const remainingHours = business.liveRemainingCapacityMicrocents / hourlyMicrocents;
  if (!Number.isFinite(remainingHours) || remainingHours <= 0) return "Kasa dolmak üzere";

  if (remainingHours < 1) {
    return `Yaklaşık ${Math.max(1, Math.ceil(remainingHours * 60))} dk sonra dolar`;
  }

  const wholeHours = Math.floor(remainingHours);
  const minutes = Math.round((remainingHours - wholeHours) * 60);
  if (minutes <= 0) return `Yaklaşık ${wholeHours}sa sonra dolar`;
  return `Yaklaşık ${wholeHours}sa ${minutes}dk sonra dolar`;
}

export function renderBusinessRowShell(businessId: BusinessId) {
  const meta = BUSINESS_META[businessId];
  return `
    <article
      class="business-row business-card business-card--${businessId}"
      data-business-id="${businessId}"
      data-business-status="loading"
      data-business-ownership="loading"
    >
      <div class="business-card-visual" role="img" aria-label="${meta.visualLabel}">
${renderBusinessArt(businessId)}
        <span class="business-card-code">${meta.code}</span>
        <span class="business-card-milestone" data-business-milestone>${businessId === "stadium" ? "STADIUM" : businessId === "club-store" ? "CLUB STORE" : "FAN CLUB"} // BASE</span>
        <span class="business-card-state" data-business-card-state>YÜKLENİYOR</span>
        <div class="business-card-visual-shade" aria-hidden="true"></div>
      </div>

      <div class="business-card-body">
        <header class="business-card-header">
          <div class="business-row-title">
            <small>${meta.eyebrow}</small>
            <strong>${meta.definition.label}</strong>
            <span data-business-level>Yükleniyor…</span>
          </div>
          <span class="business-card-level-mark" aria-hidden="true">FY</span>
        </header>

        <div class="business-row-metrics business-card-metrics">
          <div class="business-row-metric business-card-accrued">
            <div class="business-card-accrued-heading">
              <span>BİRİKMİŞ</span>
              <small data-business-accrued-status>KASADA HAZIR</small>
            </div>
            <strong data-business-accrued>—</strong>
          </div>
          <div class="business-row-metric business-card-income">
            <span>SAATLİK GELİR</span>
            <strong data-business-income>— /sa</strong>
            <small data-business-daily>— /gün</small>
          </div>
          <div class="business-row-metric business-vault-metric business-card-vault">
            <span>KASA KAPASİTESİ</span>
            <strong data-business-vault>Lv— · —</strong>
            <small data-business-vault-fill>Doluluk —</small>
            <div class="business-vault-progress" aria-hidden="true"><i data-business-vault-progress></i></div>
            <small class="business-vault-eta" data-business-vault-eta>—</small>
            <button type="button" class="business-vault-upgrade" disabled data-action-state="loading" data-business-vault-upgrade>GELİŞTİR</button>
          </div>
        </div>

        <section class="business-card-next" data-business-next-panel aria-label="Sonraki işletme gelişimi">
          <div class="business-card-next-copy">
            <span>SONRAKİ GELİŞİM</span>
            <strong data-business-next-name>—</strong>
            <small data-business-next-cost>—</small>
          </div>
          <div class="business-card-next-gain">
            <span>GELİR ARTIŞI</span>
            <strong data-business-next-gain>—</strong>
          </div>
        </section>

        <div class="business-card-divider" aria-hidden="true"></div>

        <div class="business-row-actions business-card-actions">
          <div class="business-card-action business-card-action--collect">
            <button
              type="button"
              class="business-card-primary"
              disabled
              data-action-state="loading"
              data-business-collect
            >TOPLA</button>
            <small data-business-collect-note>Yükleniyor…</small>
          </div>
          <div class="business-card-action business-card-action--upgrade">
            <button
              type="button"
              class="business-card-secondary"
              disabled
              data-action-state="loading"
              data-business-upgrade
            >YÜKSELT</button>
            <small data-business-upgrade-note>Yükleniyor…</small>
          </div>
        </div>

        <div class="business-card-footer">
          <div class="business-card-footer-progress">
            <span>9 SEVİYELİ GELİŞİM</span>
            <span>LV0 → LV8</span>
          </div>
          <button
            type="button"
            class="business-card-details"
            data-business-details
            aria-label="${meta.definition.label} detaylarını aç"
          >
            <span>DETAYLAR</span>
            <i aria-hidden="true">→</i>
          </button>
        </div>
      </div>
    </article>
  `;
}

export function updateBusinessRow(
  row: HTMLElement,
  business: IdleLiveBusinessState,
  walletBalanceCents: number,
  busy = false,
) {
  const definition = getDefinition(business.businessId);
  const levelNode = row.querySelector<HTMLElement>("[data-business-level]");
  const accruedNode = row.querySelector<HTMLElement>("[data-business-accrued]");
  const incomeNode = row.querySelector<HTMLElement>("[data-business-income]");
  const dailyNode = row.querySelector<HTMLElement>("[data-business-daily]");
  const vaultNode = row.querySelector<HTMLElement>("[data-business-vault]");
  const vaultFillNode = row.querySelector<HTMLElement>("[data-business-vault-fill]");
  const vaultProgressNode = row.querySelector<HTMLElement>("[data-business-vault-progress]");
  const vaultEtaNode = row.querySelector<HTMLElement>("[data-business-vault-eta]");
  const accruedStatusNode = row.querySelector<HTMLElement>("[data-business-accrued-status]");
  const nextPanelNode = row.querySelector<HTMLElement>("[data-business-next-panel]");
  const nextNameNode = row.querySelector<HTMLElement>("[data-business-next-name]");
  const nextCostNode = row.querySelector<HTMLElement>("[data-business-next-cost]");
  const nextGainNode = row.querySelector<HTMLElement>("[data-business-next-gain]");
  const vaultUpgradeButton = row.querySelector<HTMLButtonElement>("[data-business-vault-upgrade]");
  const upgradeButton = row.querySelector<HTMLButtonElement>("[data-business-upgrade]");
  const upgradeNoteNode = row.querySelector<HTMLElement>("[data-business-upgrade-note]");
  const collectButton = row.querySelector<HTMLButtonElement>("[data-business-collect]");
  const collectNoteNode = row.querySelector<HTMLElement>("[data-business-collect-note]");
  const cardStateNode = row.querySelector<HTMLElement>("[data-business-card-state]");
  const milestoneNode = row.querySelector<HTMLElement>("[data-business-milestone]");

  if (
    !levelNode
    || !accruedNode
    || !incomeNode
    || !dailyNode
    || !vaultNode
    || !vaultFillNode
    || !vaultProgressNode
    || !vaultEtaNode
    || !accruedStatusNode
    || !nextPanelNode
    || !nextNameNode
    || !nextCostNode
    || !nextGainNode
    || !vaultUpgradeButton
    || !upgradeButton
    || !upgradeNoteNode
    || !collectButton
    || !collectNoteNode
    || !cardStateNode
  ) {
    throw new Error("IDLE_BUSINESS_ROW_INCOMPLETE");
  }

  const currentStage = business.businessLevel === null
    ? null
    : definition.levels.find((stage) => stage.level === business.businessLevel);
  if (business.businessLevel !== null && !currentStage) {
    throw new Error("INVALID_IDLE_BUSINESS_LEVEL");
  }

  const nextStage = business.businessLevel === null
    ? definition.levels[0]
    : definition.levels.find((stage) => stage.level === business.businessLevel! + 1) ?? null;
  const vault = VAULT_LEVELS.find((entry) => entry.level === business.vaultLevel);
  if (!vault) throw new Error("INVALID_IDLE_VAULT_LEVEL");

  levelNode.textContent = currentStage
    ? `Lv${currentStage.level} · ${currentStage.name}`
    : "Satın alınmadı";
  accruedNode.textContent = formatCreditsFromMicrocents(business.liveAccruedMicrocents);
  incomeNode.textContent = currentStage
    ? `${formatCreditsFromCents(currentStage.hourlyIncomeDisplayCents)} /sa`
    : "$0.00 /sa";
  dailyNode.textContent = currentStage
    ? `${formatCreditsFromCents(currentStage.dailyIncomeCents)} /gün`
    : "$0.00 /gün";
  const vaultUpgrade = getIdleVaultUpgradePreview(business);
  vaultNode.textContent = `Lv${business.vaultLevel} · ${vault.capacityHours}sa${vaultUpgrade.isMaxLevel ? " · MAX" : business.liveIsVaultFull ? " · DOLU" : ""}`;
  const fillPercent = business.businessLevel === null
    ? 0
    : Math.round(Math.min(1, Math.max(0, business.vaultFillRatio)) * 100);
  vaultFillNode.textContent = business.businessLevel === null
    ? "Satın alındıktan sonra aktif"
    : `Doluluk %${fillPercent}`;
  vaultProgressNode.style.width = `${fillPercent}%`;
  vaultEtaNode.textContent = formatVaultEta(
    business,
    currentStage?.dailyIncomeCents ?? null,
  );
  accruedStatusNode.textContent = business.businessLevel === null
    ? "İŞLETME KAPALI"
    : business.canCollect
      ? "TOPLAMAYA HAZIR"
      : "GELİR BİRİKİYOR";

  if (nextStage) {
    const currentHourlyCents = currentStage?.hourlyIncomeDisplayCents ?? 0;
    const incomeGainCents = Math.max(
      0,
      nextStage.hourlyIncomeDisplayCents - currentHourlyCents,
    );
    const incomeGainPercent = currentHourlyCents > 0
      ? Math.round(incomeGainCents / currentHourlyCents * 100)
      : null;

    nextPanelNode.dataset.nextState = currentStage ? "upgrade" : "purchase";
    nextNameNode.textContent = `Lv${nextStage.level} · ${nextStage.name}`;
    nextCostNode.textContent = `Maliyet · ${formatCreditsFromCents(nextStage.costCents)}`;
    nextGainNode.textContent = incomeGainPercent === null
      ? `${formatCreditsFromCents(nextStage.hourlyIncomeDisplayCents)} /sa`
      : `+${formatCreditsFromCents(incomeGainCents)} /sa · +%${incomeGainPercent}`;
  } else {
    nextPanelNode.dataset.nextState = "max";
    nextNameNode.textContent = "ZİRVEYE ULAŞTI";
    nextCostNode.textContent = "Tüm işletme seviyeleri tamamlandı";
    nextGainNode.textContent = "MAX";
  }

  if (!vaultUpgrade.isOwned) {
    vaultUpgradeButton.hidden = true;
    vaultUpgradeButton.disabled = true;
    vaultUpgradeButton.dataset.actionState = "locked";
    vaultUpgradeButton.title = "Kasa, işletme satın alındıktan sonra geliştirilebilir.";
  } else if (vaultUpgrade.isMaxLevel || !vaultUpgrade.canUpgrade) {
    vaultUpgradeButton.hidden = false;
    vaultUpgradeButton.disabled = true;
    vaultUpgradeButton.textContent = "KASA MAX";
    vaultUpgradeButton.dataset.actionState = "max";
    vaultUpgradeButton.title = "Kasa maksimum seviyede.";
  } else {
    const vaultCostCents = vaultUpgrade.costCents ?? 0;
    const vaultShortfallCents = Math.max(0, vaultCostCents - walletBalanceCents);
    const canAffordVault = walletBalanceCents >= vaultCostCents;

    vaultUpgradeButton.hidden = false;
    vaultUpgradeButton.textContent = `KASA GELİŞTİR · ${formatCreditsFromCents(vaultCostCents)}`;
    vaultUpgradeButton.disabled = busy || !canAffordVault;
    vaultUpgradeButton.dataset.actionState = busy
      ? "busy"
      : canAffordVault
        ? "ready"
        : "insufficient";
    vaultUpgradeButton.title = busy
      ? "İşlem sürüyor."
      : canAffordVault
        ? `Kasayı ${vaultUpgrade.nextCapacityHours} saate çıkar.`
        : `Bakiye yetersiz. ${formatCreditsFromCents(vaultShortfallCents)} eksik.`;
  }

  if (nextStage) {
    const shortfallCents = Math.max(0, nextStage.costCents - walletBalanceCents);
    const canAffordUpgrade = walletBalanceCents >= nextStage.costCents;
    const isPurchase = business.businessLevel === null;

    upgradeButton.textContent = isPurchase
      ? `SATIN AL · ${formatCreditsFromCents(nextStage.costCents)}`
      : `YÜKSELT · ${formatCreditsFromCents(nextStage.costCents)}`;
    upgradeButton.disabled = busy || !canAffordUpgrade;
    upgradeButton.dataset.actionState = busy
      ? "busy"
      : canAffordUpgrade
        ? isPurchase ? "purchase" : "ready"
        : "insufficient";
    upgradeButton.title = busy
      ? "İşlem sürüyor."
      : canAffordUpgrade
        ? isPurchase
          ? "İşletmeyi aç ve pasif gelir üretmeye başla."
          : "İşletme yükseltildiğinde Kasa Lv1'e döner."
        : `Bakiye yetersiz. ${formatCreditsFromCents(shortfallCents)} eksik.`;
    upgradeNoteNode.textContent = busy
      ? "İşlem sürüyor"
      : canAffordUpgrade
        ? isPurchase
          ? "Aç ve gelir üretmeye başla"
          : "Yükseltmede Kasa Lv1'e döner"
        : `${formatCreditsFromCents(shortfallCents)} eksik`;
  } else {
    upgradeButton.textContent = "MAX SEVİYE";
    upgradeButton.disabled = true;
    upgradeButton.dataset.actionState = "max";
    upgradeButton.title = "Tüm işletme seviyeleri tamamlandı.";
    upgradeNoteNode.textContent = "Tüm seviyeler tamamlandı";
  }

  collectButton.textContent = business.canCollect
    ? `TOPLA · ${formatCreditsFromCents(business.collectableCents)}`
    : "TOPLA";
  collectButton.disabled = busy || !business.canCollect;
  collectButton.dataset.actionState = busy
    ? "busy"
    : business.businessLevel === null
      ? "locked"
      : business.canCollect
        ? business.liveIsVaultFull ? "full" : "ready"
        : "empty";
  collectButton.title = busy
    ? "İşlem sürüyor."
    : business.businessLevel === null
      ? "İşletme satın alındıktan sonra gelir toplanabilir."
      : business.canCollect
        ? "Kasadaki birikmiş tutarı ortak bakiyeye aktar."
        : "Toplanabilir gelir henüz oluşmadı.";
  collectNoteNode.textContent = busy
    ? "İşlem sürüyor"
    : business.businessLevel === null
      ? "İşletme kapalı"
      : business.liveIsVaultFull
        ? "Kasa dolu · şimdi topla"
        : business.canCollect
          ? "Ortak bakiyeye aktar"
          : "Gelir birikiyor";

  row.dataset.businessStatus = business.vaultStatus.toLowerCase();
  row.dataset.businessOwnership = currentStage ? "owned" : "locked";
  row.dataset.businessLevel = currentStage ? String(currentStage.level) : "unowned";
  const visualStage = getBusinessVisualStage(business);
  row.dataset.visualStage = visualStage;
  if (milestoneNode) {
    const visualPrefix = business.businessId === "stadium"
      ? "STADIUM"
      : business.businessId === "club-store"
        ? "CLUB STORE"
        : "FAN CLUB";
    milestoneNode.textContent = visualStage === "locked"
      ? `${visualPrefix} // LOCKED`
      : visualStage === "local"
        ? `${visualPrefix} // LOCAL`
        : visualStage === "pro"
          ? `${visualPrefix} // PRO`
          : visualStage === "elite"
            ? `${visualPrefix} // ELITE`
            : `${visualPrefix} // ICON`;
  }

  cardStateNode.textContent = !currentStage
    ? "SATIN ALINMADI"
    : business.liveIsVaultFull
      ? "KASA DOLU"
      : nextStage
        ? "AKTİF"
        : "MAX SEVİYE";
}
