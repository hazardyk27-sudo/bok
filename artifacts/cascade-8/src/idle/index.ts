import "./idle.css";
import { renderBusinessRowShell, updateBusinessRow } from "./components";
import {
  CLUB_STORE_BUSINESS,
  FAN_CLUB_BUSINESS,
  STADIUM_BUSINESS,
  VAULT_LEVELS,
} from "./config";
import {
  collectAllIdleBusinesses,
  collectIdleBusiness,
  fetchIdleState,
  getIdleTotalCollectableCents,
  getIdleTotalPassiveIncomeCentsPerHour,
  projectIdleStateLive,
  upgradeIdleBusiness,
  upgradeIdleVault,
} from "./services";
import {
  BUSINESS_IDS,
  type BusinessId,
  type IdleStateEnvelope,
} from "./types";

function formatCredits(cents: number) {
  return `${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const BUSINESS_LEVELS_PER_BUSINESS = 9;
const TOTAL_BUSINESS_PROGRESSION_LEVELS =
  BUSINESS_IDS.length * BUSINESS_LEVELS_PER_BUSINESS;

const BUSINESS_DETAIL_DEFINITIONS = {
  stadium: STADIUM_BUSINESS,
  "club-store": CLUB_STORE_BUSINESS,
  "fan-club": FAN_CLUB_BUSINESS,
} as const;

const BUSINESS_DETAIL_EYEBROWS: Record<BusinessId, string> = {
  stadium: "STADIUM OPERATIONS",
  "club-store": "RETAIL OPERATIONS",
  "fan-club": "SUPPORTER OPERATIONS",
};

type BusinessDetailTab = "business" | "vault";

function getBusinessLevelState(stageLevel: number, currentLevel: number | null) {
  if (currentLevel === null) return stageLevel === 0 ? "future" : "locked";
  if (stageLevel < currentLevel) return "completed";
  if (stageLevel === currentLevel) return "current";
  if (stageLevel === currentLevel + 1) return "future";
  return "locked";
}

function getBusinessLevelMilestone(stageLevel: number) {
  if (stageLevel <= 2) return "LOCAL";
  if (stageLevel <= 5) return "PRO";
  if (stageLevel <= 7) return "ELITE";
  return "ICON";
}

function renderBusinessLevelTree(
  businessId: BusinessId,
  currentLevel: number | null,
) {
  const definition = BUSINESS_DETAIL_DEFINITIONS[businessId];

  return definition.levels.map((stage) => {
    const state = getBusinessLevelState(stage.level, currentLevel);
    const isImmediateFuture = state === "future";
    const stateLabel = state === "completed"
      ? "TAMAMLANDI"
      : state === "current"
        ? "MEVCUT"
        : isImmediateFuture
          ? "SONRAKİ"
          : "KİLİTLİ";
    const starLabel = stage.level >= 6 ? `★${stage.level - 5}` : "";
    const incomeLabel = `${formatCredits(stage.hourlyIncomeDisplayCents)} /sa`;
    const dailyLabel = `${formatCredits(stage.dailyIncomeCents)} /gün`;
    const costLabel = `${formatCredits(stage.costCents)}`;

    return `
      <article
        class="business-level-node"
        data-level="${stage.level}"
        data-level-state="${state}"
        data-level-next="${isImmediateFuture ? "true" : "false"}"
        aria-label="Lv${stage.level} ${stage.name}, ${stateLabel.toLocaleLowerCase("tr-TR")}"
      >
        <div class="business-level-node-rail" aria-hidden="true">
          <span class="business-level-node-dot">
            ${state === "completed" ? "✓" : stage.level}
          </span>
        </div>

        <div class="business-level-node-card">
          <header class="business-level-node-header">
            <div>
              <span class="business-level-node-kicker">
                LV${stage.level} · ${getBusinessLevelMilestone(stage.level)}
              </span>
              <strong>${stage.name}</strong>
            </div>
            <div class="business-level-node-state">
              ${starLabel ? `<b>${starLabel}</b>` : ""}
              <span>${stateLabel}</span>
            </div>
          </header>

          <div class="business-level-node-economy">
            <div>
              <span>SAATLİK</span>
              <strong>${incomeLabel}</strong>
              <small>${dailyLabel}</small>
            </div>
            <div>
              <span>YATIRIM</span>
              <strong>${costLabel}</strong>
              <small>ROI hedefi · ${stage.targetRoiDays} gün</small>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

export const BUSINESSES_MARKUP = `
  <main class="businesses-page" aria-labelledby="businesses-title">
    <header class="businesses-header">
      <div class="businesses-header-nav">
        <a class="back-link" href="/">← ANA MENÜ</a>
        <span class="businesses-header-status"><i aria-hidden="true"></i>KULÜP OPERASYON MERKEZİ</span>
      </div>

      <div class="businesses-header-main">
        <div class="businesses-heading">
          <span class="businesses-kicker">FAHRİNİN YOLU // CLUB EMPIRE</span>
          <h1 id="businesses-title">İŞLETMELER</h1>
          <p>Kulübünün gelir kaynaklarını büyüt, kapasiteni geliştir ve biriken kazancı tek merkezden yönet.</p>
        </div>

        <div class="businesses-wallet" aria-label="Ortak oyun bakiyesi">
          <span>ORTAK BAKİYE</span>
          <strong data-idle-balance>—</strong>
          <small>TÜM OYUNLARDA KULLANILIR</small>
        </div>
      </div>

      <section class="businesses-progression" aria-label="Kulüp imparatorluğu ilerlemesi">
        <div class="businesses-progression-copy">
          <span>KULÜP İMPARATORLUĞU</span>
          <strong>
            <b data-idle-progression-levels>— / ${TOTAL_BUSINESS_PROGRESSION_LEVELS}</b>
            <small>İŞLETME SEVİYESİ</small>
          </strong>
        </div>
        <div
          class="businesses-progression-track"
          role="progressbar"
          aria-label="Toplam işletme gelişimi"
          aria-valuemin="0"
          aria-valuemax="${TOTAL_BUSINESS_PROGRESSION_LEVELS}"
          aria-valuenow="0"
          data-idle-progression-track
        >
          <i data-idle-progression-bar></i>
        </div>
        <div class="businesses-progression-meta">
          <span data-idle-progression-percent>0%</span>
          <span>3 İŞLETME · ${TOTAL_BUSINESS_PROGRESSION_LEVELS} SEVİYE</span>
        </div>
      </section>
    </header>

    <section class="business-summary business-command-bar" aria-label="İşletme komuta özeti" data-idle-command-bar>
      <div class="business-command-stat business-command-income">
        <span class="business-command-label">TOPLAM SAATLİK GELİR</span>
        <strong data-idle-total-hourly>—</strong>
        <small>PASİF GELİR HIZI</small>
      </div>
      <div class="business-command-stat business-command-ready">
        <span class="business-command-label">TOPLANABİLİR</span>
        <strong data-idle-total-collectable>—</strong>
        <small>KASALARDA HAZIR</small>
      </div>
      <div class="business-command-stat business-command-active">
        <span class="business-command-label">AKTİF İŞLETME</span>
        <strong data-idle-active-businesses>— / 3</strong>
        <small>GELİR ÜRETİYOR</small>
      </div>
      <button
        type="button"
        class="business-summary-collect-all"
        data-idle-collect-all
        aria-label="Tüm işletmelerdeki biriken parayı topla"
        disabled
      >
        <span class="business-collect-all-copy">
          <small>TÜM KASALAR</small>
          <strong>TÜMÜNÜ TOPLA</strong>
        </span>
        <span class="business-collect-all-value" data-idle-collect-all-value>$0.00</span>
        <span class="business-collect-all-arrow" aria-hidden="true">→</span>
      </button>
    </section>

    <p class="businesses-error" data-idle-error role="status" hidden></p>

    <section class="business-list" aria-label="İşletmeler">
      ${BUSINESS_IDS.map(renderBusinessRowShell).join("")}
    </section>

    <div class="business-detail-layer" data-idle-detail-layer data-open="false" hidden>
      <button
        type="button"
        class="business-detail-backdrop"
        data-idle-detail-backdrop
        aria-label="İşletme detaylarını kapat"
        tabindex="-1"
      ></button>

      <aside
        class="business-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="business-detail-title"
        data-idle-detail-drawer
      >
        <header class="business-detail-header">
          <div class="business-detail-heading">
            <span data-idle-detail-eyebrow>KULÜP OPERASYONLARI</span>
            <h2 id="business-detail-title" data-idle-detail-title>İŞLETME</h2>
            <p data-idle-detail-level>Seviye bilgisi yükleniyor…</p>
          </div>
          <button
            type="button"
            class="business-detail-close"
            data-idle-detail-close
            aria-label="Detayları kapat"
          >×</button>
        </header>

        <div class="business-detail-status-row">
          <span class="business-detail-level-badge" data-idle-detail-level-badge>—</span>
          <span class="business-detail-state" data-idle-detail-state>YÜKLENİYOR</span>
        </div>

        <nav class="business-detail-tabs" role="tablist" aria-label="İşletme detayları">
          <button
            type="button"
            role="tab"
            aria-selected="true"
            data-idle-detail-tab="business"
          >İŞLETME GELİŞİMİ</button>
          <button
            type="button"
            role="tab"
            aria-selected="false"
            data-idle-detail-tab="vault"
          >KASA</button>
        </nav>

        <section class="business-detail-summary" aria-label="Mevcut işletme özeti">
          <div>
            <span>SAATLİK GELİR</span>
            <strong data-idle-detail-hourly>—</strong>
          </div>
          <div>
            <span>GÜNLÜK GELİR</span>
            <strong data-idle-detail-daily>—</strong>
          </div>
          <div>
            <span>KASA</span>
            <strong data-idle-detail-vault>—</strong>
          </div>
        </section>

        <div class="business-detail-scroll">
          <section class="business-detail-panel" data-idle-detail-panel="business">
            <div class="business-detail-section-heading">
              <span>GELİŞİM ROTASI</span>
              <strong>LV0 → LV8</strong>
            </div>
            <div class="business-detail-preview-card">
              <span>MEVCUT KONUM</span>
              <strong data-idle-detail-current>—</strong>
              <small data-idle-detail-next>Sonraki seviye bilgisi yükleniyor…</small>
            </div>
            <div class="business-level-tree-legend" aria-label="Seviye durumları">
              <span data-legend-state="completed">TAMAMLANDI</span>
              <span data-legend-state="current">MEVCUT</span>
              <span data-legend-state="future">SONRAKİ</span>
              <span data-legend-state="locked">KİLİTLİ</span>
            </div>
            <div
              class="business-level-tree"
              data-idle-business-level-tree
              aria-label="İşletme seviye ağacı"
            ></div>
          </section>

          <section class="business-detail-panel" data-idle-detail-panel="vault" hidden>
            <div class="business-detail-section-heading">
              <span>KASA GELİŞİMİ</span>
              <strong>1SA → 24SA</strong>
            </div>
            <div class="business-detail-preview-card">
              <span>MEVCUT KAPASİTE</span>
              <strong data-idle-detail-vault-current>—</strong>
              <small>İşletme yükseltildiğinde Kasa Lv1'e döner.</small>
            </div>
            <div class="business-detail-roadmap-placeholder business-detail-roadmap-placeholder--vault" aria-hidden="true">
              <i></i><i></i><i></i><i></i><i></i><i></i>
            </div>
          </section>
        </div>
      </aside>
    </div>
  </main>
`;

export class BusinessesClient {
  private envelope: IdleStateEnvelope | null = null;
  private timer: number | null = null;
  private readonly busyBusinesses = new Set<BusinessId>();
  private collectingAll = false;
  private detailBusinessId: BusinessId | null = null;
  private detailTab: BusinessDetailTab = "business";
  private lastDetailTrigger: HTMLElement | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("keydown", this.handleKeyDown);
    void this.refresh();
    this.timer = window.setInterval(() => this.render(), 1_000);
  }

  destroy() {
    this.root.removeEventListener("click", this.handleClick);
    this.root.removeEventListener("keydown", this.handleKeyDown);
    document.body.classList.remove("business-detail-open");
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private async refresh() {
    try {
      this.envelope = await fetchIdleState();
      this.setError(null);
      this.render();
    } catch (error) {
      this.setError(this.getErrorMessage(error));
    }
  }

  private getErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INSUFFICIENT_IDLE_CREDITS") return "Bakiye yetersiz.";
    if (message === "IDLE_BUSINESS_MAX_LEVEL") return "İşletme maksimum seviyede.";
    if (message === "IDLE_VAULT_MAX_LEVEL") return "Kasa maksimum seviyede.";
    return "İşletmeler sunucusuna bağlanılamadı. Lütfen tekrar dene.";
  }

  private setError(message: string | null) {
    const node = this.root.querySelector<HTMLElement>("[data-idle-error]");
    if (!node) return;
    node.hidden = message === null;
    node.textContent = message ?? "";
  }

  private render() {
    if (!this.envelope) return;

    const live = projectIdleStateLive(this.envelope);
    const walletBalanceCents = live.wallet.balanceCents;
    const balanceNode = this.root.querySelector<HTMLElement>("[data-idle-balance]");
    const hourlyNode = this.root.querySelector<HTMLElement>("[data-idle-total-hourly]");
    const collectableNode = this.root.querySelector<HTMLElement>("[data-idle-total-collectable]");
    const activeNode = this.root.querySelector<HTMLElement>("[data-idle-active-businesses]");
    const collectAllButton = this.root.querySelector<HTMLButtonElement>("[data-idle-collect-all]");
    const collectAllValueNode = this.root.querySelector<HTMLElement>("[data-idle-collect-all-value]");
    const commandBarNode = this.root.querySelector<HTMLElement>("[data-idle-command-bar]");
    const progressionLevelsNode = this.root.querySelector<HTMLElement>("[data-idle-progression-levels]");
    const progressionTrackNode = this.root.querySelector<HTMLElement>("[data-idle-progression-track]");
    const progressionBarNode = this.root.querySelector<HTMLElement>("[data-idle-progression-bar]");
    const progressionPercentNode = this.root.querySelector<HTMLElement>("[data-idle-progression-percent]");

    if (
      !balanceNode
      || !hourlyNode
      || !collectableNode
      || !activeNode
      || !collectAllButton
      || !collectAllValueNode
      || !commandBarNode
      || !progressionLevelsNode
      || !progressionTrackNode
      || !progressionBarNode
      || !progressionPercentNode
    ) {
      throw new Error("IDLE_PAGE_SHELL_INCOMPLETE");
    }

    balanceNode.textContent = formatCredits(walletBalanceCents);

    const totalHourlyCents = getIdleTotalPassiveIncomeCentsPerHour(
      live.businesses,
    );
    const totalCollectableCents = getIdleTotalCollectableCents(
      live.businesses,
    );

    for (const business of live.businesses) {
      const row = this.root.querySelector<HTMLElement>(
        `[data-business-id="${business.businessId}"]`,
      );
      if (!row) throw new Error("IDLE_BUSINESS_ROW_MISSING");

      updateBusinessRow(
        row,
        business,
        walletBalanceCents,
        this.busyBusinesses.has(business.businessId),
      );
    }

    if (this.detailBusinessId) {
      const detailBusiness = live.businesses.find(
        (business) => business.businessId === this.detailBusinessId,
      );
      if (detailBusiness) this.renderBusinessDetails(detailBusiness);
    }

    const activeBusinesses = live.businesses.filter(
      (business) => business.businessLevel !== null,
    ).length;
    const completedBusinessLevels = live.businesses.reduce(
      (total, business) =>
        total + (business.businessLevel === null ? 0 : business.businessLevel + 1),
      0,
    );
    const progressionPercent = Math.round(
      completedBusinessLevels / TOTAL_BUSINESS_PROGRESSION_LEVELS * 100,
    );

    progressionLevelsNode.textContent =
      `${completedBusinessLevels} / ${TOTAL_BUSINESS_PROGRESSION_LEVELS}`;
    progressionPercentNode.textContent = `%${progressionPercent}`;
    progressionBarNode.style.width = `${progressionPercent}%`;
    progressionTrackNode.setAttribute(
      "aria-valuenow",
      String(completedBusinessLevels),
    );

    hourlyNode.textContent = `${formatCredits(totalHourlyCents)} /sa`;
    collectableNode.textContent = formatCredits(totalCollectableCents);
    activeNode.textContent = `${activeBusinesses} / ${BUSINESS_IDS.length}`;
    collectAllValueNode.textContent = formatCredits(totalCollectableCents);
    collectAllButton.disabled = this.collectingAll || totalCollectableCents <= 0;
    collectAllButton.setAttribute(
      "aria-label",
      totalCollectableCents > 0
        ? `Tüm işletmelerden ${formatCredits(totalCollectableCents)} topla`
        : "Toplanabilir işletme geliri yok",
    );
    commandBarNode.dataset.collectable =
      totalCollectableCents > 0 ? "ready" : "empty";
    commandBarNode.dataset.collecting = this.collectingAll ? "true" : "false";
  }

  private handleClick = (event: Event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>("button");
    if (!button) return;

    if (button.matches("[data-idle-detail-close], [data-idle-detail-backdrop]")) {
      this.closeBusinessDetails();
      return;
    }

    if (button.matches("[data-idle-detail-tab]")) {
      const tab = button.dataset.idleDetailTab as BusinessDetailTab | undefined;
      if (tab === "business" || tab === "vault") this.setDetailTab(tab);
      return;
    }

    if (button.matches("[data-idle-collect-all]")) {
      if (!this.collectingAll) void this.runCollectAll();
      return;
    }

    const row = target?.closest<HTMLElement>("[data-business-id]");
    if (!row) return;

    const businessId = row.dataset.businessId as BusinessId | undefined;
    if (!businessId || !BUSINESS_IDS.includes(businessId)) return;

    if (button.matches("[data-business-details]")) {
      this.openBusinessDetails(businessId, button);
      return;
    }

    if (this.busyBusinesses.has(businessId)) return;

    if (button.matches("[data-business-upgrade]")) {
      void this.runBusinessAction(businessId, () => upgradeIdleBusiness(businessId));
    } else if (button.matches("[data-business-collect]")) {
      void this.runBusinessAction(businessId, () => collectIdleBusiness(businessId));
    } else if (button.matches("[data-business-vault-upgrade]")) {
      void this.runBusinessAction(businessId, () => upgradeIdleVault(businessId));
    }
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && this.detailBusinessId) {
      event.preventDefault();
      this.closeBusinessDetails();
    }
  };

  private openBusinessDetails(businessId: BusinessId, trigger: HTMLElement) {
    const layer = this.root.querySelector<HTMLElement>("[data-idle-detail-layer]");
    if (!layer) throw new Error("IDLE_DETAIL_LAYER_MISSING");

    this.detailBusinessId = businessId;
    this.detailTab = "business";
    this.lastDetailTrigger = trigger;
    layer.hidden = false;
    document.body.classList.add("business-detail-open");
    this.setDetailTab("business");

    if (this.envelope) this.render();

    window.requestAnimationFrame(() => {
      layer.dataset.open = "true";
      this.root.querySelector<HTMLButtonElement>("[data-idle-detail-close]")?.focus();
    });
  }

  private closeBusinessDetails() {
    const layer = this.root.querySelector<HTMLElement>("[data-idle-detail-layer]");
    if (!layer) return;

    const focusTarget = this.lastDetailTrigger;
    this.detailBusinessId = null;
    this.lastDetailTrigger = null;
    layer.dataset.open = "false";
    document.body.classList.remove("business-detail-open");

    window.setTimeout(() => {
      if (this.detailBusinessId === null) layer.hidden = true;
    }, 220);

    focusTarget?.focus();
  }

  private setDetailTab(tab: BusinessDetailTab) {
    this.detailTab = tab;

    for (const tabButton of this.root.querySelectorAll<HTMLButtonElement>("[data-idle-detail-tab]")) {
      const selected = tabButton.dataset.idleDetailTab === tab;
      tabButton.setAttribute("aria-selected", selected ? "true" : "false");
      tabButton.dataset.active = selected ? "true" : "false";
    }

    for (const panel of this.root.querySelectorAll<HTMLElement>("[data-idle-detail-panel]")) {
      panel.hidden = panel.dataset.idleDetailPanel !== tab;
    }
  }

  private renderBusinessDetails(business: ReturnType<typeof projectIdleStateLive>["businesses"][number]) {
    const definition = BUSINESS_DETAIL_DEFINITIONS[business.businessId];
    const currentStage = business.businessLevel === null
      ? null
      : definition.levels.find((stage) => stage.level === business.businessLevel) ?? null;
    const nextStage = business.businessLevel === null
      ? definition.levels[0]
      : definition.levels.find((stage) => stage.level === business.businessLevel! + 1) ?? null;
    const vault = VAULT_LEVELS.find((entry) => entry.level === business.vaultLevel);

    const eyebrowNode = this.root.querySelector<HTMLElement>("[data-idle-detail-eyebrow]");
    const titleNode = this.root.querySelector<HTMLElement>("[data-idle-detail-title]");
    const levelNode = this.root.querySelector<HTMLElement>("[data-idle-detail-level]");
    const levelBadgeNode = this.root.querySelector<HTMLElement>("[data-idle-detail-level-badge]");
    const stateNode = this.root.querySelector<HTMLElement>("[data-idle-detail-state]");
    const hourlyNode = this.root.querySelector<HTMLElement>("[data-idle-detail-hourly]");
    const dailyNode = this.root.querySelector<HTMLElement>("[data-idle-detail-daily]");
    const vaultNode = this.root.querySelector<HTMLElement>("[data-idle-detail-vault]");
    const currentNode = this.root.querySelector<HTMLElement>("[data-idle-detail-current]");
    const nextNode = this.root.querySelector<HTMLElement>("[data-idle-detail-next]");
    const vaultCurrentNode = this.root.querySelector<HTMLElement>("[data-idle-detail-vault-current]");
    const businessLevelTreeNode = this.root.querySelector<HTMLElement>("[data-idle-business-level-tree]");

    if (
      !eyebrowNode
      || !titleNode
      || !levelNode
      || !levelBadgeNode
      || !stateNode
      || !hourlyNode
      || !dailyNode
      || !vaultNode
      || !currentNode
      || !nextNode
      || !vaultCurrentNode
      || !businessLevelTreeNode
      || !vault
    ) {
      throw new Error("IDLE_DETAIL_SHELL_INCOMPLETE");
    }

    eyebrowNode.textContent = BUSINESS_DETAIL_EYEBROWS[business.businessId];
    titleNode.textContent = definition.label;
    levelNode.textContent = currentStage
      ? `Lv${currentStage.level} · ${currentStage.name}`
      : "Henüz satın alınmadı";
    levelBadgeNode.textContent = currentStage ? `LV${currentStage.level}` : "LOCKED";
    stateNode.textContent = business.businessLevel === null
      ? "SATIN ALINMADI"
      : business.liveIsVaultFull
        ? "KASA DOLU"
        : nextStage
          ? "AKTİF"
          : "MAX SEVİYE";

    hourlyNode.textContent = currentStage
      ? `${formatCredits(currentStage.hourlyIncomeDisplayCents)} /sa`
      : "$0.00 /sa";
    dailyNode.textContent = currentStage
      ? `${formatCredits(currentStage.dailyIncomeCents)} /gün`
      : "$0.00 /gün";
    vaultNode.textContent = `Lv${business.vaultLevel} · ${vault.capacityHours}sa`;

    currentNode.textContent = currentStage
      ? `Lv${currentStage.level} · ${currentStage.name}`
      : "Başlangıç seviyesi kilitli";
    nextNode.textContent = nextStage
      ? `Sonraki hedef: Lv${nextStage.level} · ${nextStage.name} · ${formatCredits(nextStage.costCents)}`
      : "Tüm işletme seviyeleri tamamlandı.";
    vaultCurrentNode.textContent = `Kasa Lv${business.vaultLevel} · ${vault.capacityHours} saat kapasite`;
    businessLevelTreeNode.innerHTML = renderBusinessLevelTree(
      business.businessId,
      business.businessLevel,
    );
  }

  private async runBusinessAction(
    businessId: BusinessId,
    action: () => Promise<unknown>,
  ) {
    this.busyBusinesses.add(businessId);
    this.render();
    try {
      await action();
      await this.refresh();
    } catch (error) {
      this.setError(this.getErrorMessage(error));
    } finally {
      this.busyBusinesses.delete(businessId);
      this.render();
    }
  }

  private async runCollectAll() {
    this.collectingAll = true;
    for (const businessId of BUSINESS_IDS) this.busyBusinesses.add(businessId);
    this.render();

    try {
      await collectAllIdleBusinesses();
      await this.refresh();
    } catch (error) {
      this.setError(this.getErrorMessage(error));
      await this.refresh();
    } finally {
      this.collectingAll = false;
      this.busyBusinesses.clear();
      this.render();
    }
  }
}
