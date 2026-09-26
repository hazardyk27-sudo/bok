import {
  CLUB_STORE_BUSINESS,
  FAN_CLUB_BUSINESS,
  STADIUM_BUSINESS,
  VAULT_LEVELS,
} from "../config";
import type {
  BusinessDefinition,
  BusinessId,
  IdleLiveBusinessState,
} from "../types";

const BUSINESS_META: Record<
  BusinessId,
  {
    eyebrow: string;
    icon: string;
    imagePath: string;
    placeholderLabel: string;
    visualLabel: string;
    definition: BusinessDefinition;
  }
> = {
  stadium: {
    eyebrow: "STADIUM",
    icon: "◉",
    imagePath: "/businesses/stadium.png",
    placeholderLabel: "STADYUM GÖRSELİ",
    visualLabel: "Stadyum görsel alanı",
    definition: STADIUM_BUSINESS,
  },
  "club-store": {
    eyebrow: "CLUB STORE",
    icon: "▦",
    imagePath: "/businesses/club-store.png",
    placeholderLabel: "KULÜP MAĞAZASI GÖRSELİ",
    visualLabel: "Kulüp mağazası görsel alanı",
    definition: CLUB_STORE_BUSINESS,
  },
  "fan-club": {
    eyebrow: "FAN CLUB",
    icon: "✦",
    imagePath: "/businesses/fan-club.png",
    placeholderLabel: "TARAFTAR KULÜBÜ GÖRSELİ",
    visualLabel: "Taraftar kulübü görsel alanı",
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

function renderBusinessMedia(businessId: BusinessId) {
  const meta = BUSINESS_META[businessId];
  return `
    <div
      class="business-card-media-slot"
      data-business-image-slot
      data-image-state="loading"
      data-image-src="${meta.imagePath}"
      aria-hidden="true"
    >
      <img
        class="business-card-media"
        data-business-image
        src="${meta.imagePath}"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <div class="business-card-media-placeholder">
        <span class="business-card-media-placeholder-icon">＋</span>
        <span>${meta.placeholderLabel}</span>
        <small>1600 × 900 PNG / WEBP</small>
      </div>
    </div>
  `;
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
      class="business-card business-card--${businessId}"
      data-business-id="${businessId}"
      data-business-status="loading"
      data-business-ownership="loading"
    >
      <div
        class="business-card-hero business-card-visual"
        role="img"
        aria-label="${meta.visualLabel}"
      >
${renderBusinessMedia(businessId)}
        <div class="business-card-visual-shade" aria-hidden="true"></div>

        <span class="business-card-state" data-business-card-state>YÜKLENİYOR</span>
        <span class="business-card-level-mark" data-business-level-mark aria-hidden="true">FY</span>

        <div class="business-card-identity-overlay">
          <span class="business-card-identity-icon" aria-hidden="true">${meta.icon}</span>
          <div class="business-card-title business-row-title">
            <small>${meta.eyebrow}</small>
            <strong>${meta.definition.label}</strong>
            <span data-business-level>Yükleniyor…</span>
          </div>
        </div>
      </div>

      <div class="business-card-content business-card-body">
        <section class="business-card-balance business-card-accrued" aria-label="Biriken gelir">
          <div class="business-card-balance-heading business-card-accrued-heading">
            <span>BİRİKMİŞ GELİR</span>
            <small data-business-accrued-status>KASADA HAZIR</small>
          </div>
          <strong data-business-accrued>—</strong>
        </section>

        <section class="business-card-stats business-card-quick-stats" aria-label="İşletme özeti">
          <div class="business-card-stat business-card-quick-stat">
            <span>SAATLİK GELİR</span>
            <strong data-business-income>— /sa</strong>
          </div>
          <div class="business-card-stat business-card-quick-stat">
            <span>KASA KAPASİTESİ</span>
            <strong data-business-vault>Lv— · —</strong>
          </div>
        </section>

        <section class="business-card-vault business-card-vault-status" aria-label="Kasada biriken para">
          <div class="business-card-vault-heading">
            <span>KASADA BİRİKEN</span>
            <strong data-business-vault-fill>%—</strong>
          </div>
          <div class="business-vault-progress" aria-hidden="true">
            <i data-business-vault-progress></i>
          </div>
          <div class="business-card-vault-helper">
            <small data-business-vault-remaining>Kalan kapasite —</small>
            <small class="business-vault-eta" data-business-vault-eta>—</small>
          </div>
        </section>

        <div class="business-card-actions">
          <button
            type="button"
            class="business-card-primary"
            disabled
            data-action-state="loading"
            data-business-collect
          >TOPLA</button>
          <button
            type="button"
            class="business-card-secondary business-card-details"
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
  const vaultNode = row.querySelector<HTMLElement>("[data-business-vault]");
  const vaultFillNode = row.querySelector<HTMLElement>("[data-business-vault-fill]");
  const vaultRemainingNode = row.querySelector<HTMLElement>("[data-business-vault-remaining]");
  const vaultProgressNode = row.querySelector<HTMLElement>("[data-business-vault-progress]");
  const vaultEtaNode = row.querySelector<HTMLElement>("[data-business-vault-eta]");
  const accruedStatusNode = row.querySelector<HTMLElement>("[data-business-accrued-status]");
  const collectButton = row.querySelector<HTMLButtonElement>("[data-business-collect]");
  const cardStateNode = row.querySelector<HTMLElement>("[data-business-card-state]");
  const levelMarkNode = row.querySelector<HTMLElement>("[data-business-level-mark]");

  if (
    !levelNode
    || !accruedNode
    || !incomeNode
    || !vaultNode
    || !vaultFillNode
    || !vaultRemainingNode
    || !vaultProgressNode
    || !vaultEtaNode
    || !accruedStatusNode
    || !collectButton
    || !cardStateNode
    || !levelMarkNode
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
  const vaultCapacityMicrocents = business.businessLevel === null
    ? 0
    : business.liveAccruedMicrocents + business.liveRemainingCapacityMicrocents;
  vaultNode.textContent = business.businessLevel === null
    ? "$0.00"
    : formatCreditsFromMicrocents(vaultCapacityMicrocents);

  const fillPercent = business.businessLevel === null
    ? 0
    : Math.round(Math.min(1, Math.max(0, business.vaultFillRatio)) * 100);
  vaultFillNode.textContent = business.businessLevel === null
    ? "%0"
    : `%${fillPercent}`;
  vaultRemainingNode.textContent = business.businessLevel === null
    ? "Kasa aktif değil"
    : business.liveIsVaultFull
      ? "Kapasite doldu"
      : `Kalan kapasite ${formatCreditsFromMicrocents(business.liveRemainingCapacityMicrocents)}`;
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
  row.dataset.businessStatus = business.vaultStatus.toLowerCase();
  row.dataset.businessOwnership = currentStage ? "owned" : "locked";
  row.dataset.businessLevel = currentStage ? String(currentStage.level) : "unowned";
  cardStateNode.textContent = !currentStage
    ? "SATIN ALINMADI"
    : business.liveIsVaultFull
      ? "KASA DOLU"
      : nextStage
        ? "AKTİF"
        : "MAX SEVİYE";

  levelMarkNode.textContent = !currentStage
    ? "LOCK"
    : nextStage
      ? `LV${currentStage.level}`
      : "MAX";
  levelMarkNode.dataset.levelState = !currentStage
    ? "locked"
    : nextStage
      ? "active"
      : "max";
}
