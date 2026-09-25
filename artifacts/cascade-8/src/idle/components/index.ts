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

const BUSINESS_META: Record<BusinessId, { eyebrow: string; definition: BusinessDefinition }> = {
  stadium: { eyebrow: "STADIUM", definition: STADIUM_BUSINESS },
  "club-store": { eyebrow: "CLUB STORE", definition: CLUB_STORE_BUSINESS },
  "fan-club": { eyebrow: "FAN CLUB", definition: FAN_CLUB_BUSINESS },
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

export function renderBusinessRowShell(businessId: BusinessId) {
  const meta = BUSINESS_META[businessId];
  return `
    <article class="business-row" data-business-id="${businessId}" data-business-status="loading">
      <div class="business-row-title">
        <small>${meta.eyebrow}</small>
        <strong>${meta.definition.label}</strong>
        <span data-business-level>Yükleniyor…</span>
      </div>

      <div class="business-row-metrics">
        <div class="business-row-metric">
          <span>BİRİKMİŞ</span>
          <strong data-business-accrued>—</strong>
        </div>
        <div class="business-row-metric">
          <span>GELİR</span>
          <strong data-business-income>— /sa</strong>
        </div>
        <div class="business-row-metric">
          <span>KASA</span>
          <strong data-business-vault>Lv— · —</strong>
        </div>
      </div>

      <div class="business-row-actions">
        <button type="button" disabled data-business-upgrade>YÜKSELT</button>
        <button type="button" disabled data-business-collect>TOPLA</button>
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
  const upgradeButton = row.querySelector<HTMLButtonElement>("[data-business-upgrade]");
  const collectButton = row.querySelector<HTMLButtonElement>("[data-business-collect]");

  if (!levelNode || !accruedNode || !incomeNode || !vaultNode || !upgradeButton || !collectButton) {
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
  vaultNode.textContent = `Lv${business.vaultLevel} · ${vault.capacityHours}sa${business.liveIsVaultFull ? " · DOLU" : ""}`;

  if (nextStage) {
    upgradeButton.textContent = business.businessLevel === null
      ? `SATIN AL · ${formatCreditsFromCents(nextStage.costCents)}`
      : `YÜKSELT · ${formatCreditsFromCents(nextStage.costCents)}`;
    upgradeButton.disabled = busy || walletBalanceCents < nextStage.costCents;
  } else {
    upgradeButton.textContent = "MAX SEVİYE";
    upgradeButton.disabled = true;
  }

  collectButton.textContent = business.canCollect
    ? `TOPLA · ${formatCreditsFromCents(business.collectableCents)}`
    : "TOPLA";
  collectButton.disabled = busy || !business.canCollect;

  row.dataset.businessStatus = business.vaultStatus.toLowerCase();
}
