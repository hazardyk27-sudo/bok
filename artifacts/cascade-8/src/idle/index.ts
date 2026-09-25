import "./idle.css";
import { renderBusinessRowShell, updateBusinessRow } from "./components";
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

    <section class="business-summary" aria-label="İşletme özeti">
      <div>
        <span>TOPLAM SAATLİK GELİR</span>
        <strong data-idle-total-hourly>—</strong>
      </div>
      <div>
        <span>TOPLANABİLİR</span>
        <strong data-idle-total-collectable>—</strong>
      </div>
      <div>
        <span>AKTİF İŞLETME</span>
        <strong data-idle-active-businesses>— / 3</strong>
      </div>
      <button type="button" class="business-summary-collect-all" data-idle-collect-all disabled>
        TÜMÜNÜ TOPLA
      </button>
    </section>

    <p class="businesses-error" data-idle-error role="status" hidden></p>

    <section class="business-list" aria-label="İşletmeler">
      ${BUSINESS_IDS.map(renderBusinessRowShell).join("")}
    </section>
  </main>
`;

export class BusinessesClient {
  private envelope: IdleStateEnvelope | null = null;
  private timer: number | null = null;
  private readonly busyBusinesses = new Set<BusinessId>();
  private collectingAll = false;

  constructor(private readonly root: HTMLElement) {
    this.root.addEventListener("click", this.handleClick);
    void this.refresh();
    this.timer = window.setInterval(() => this.render(), 1_000);
  }

  destroy() {
    this.root.removeEventListener("click", this.handleClick);
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
    collectAllButton.textContent = totalCollectableCents > 0
      ? `TÜMÜNÜ TOPLA · ${formatCredits(totalCollectableCents)}`
      : "TÜMÜNÜ TOPLA";
    collectAllButton.disabled = this.collectingAll || totalCollectableCents <= 0;
  }

  private handleClick = (event: Event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>("button");
    if (!button) return;

    if (button.matches("[data-idle-collect-all]")) {
      if (!this.collectingAll) void this.runCollectAll();
      return;
    }

    const row = target?.closest<HTMLElement>("[data-business-id]");
    if (!row) return;

    const businessId = row.dataset.businessId as BusinessId | undefined;
    if (!businessId || !BUSINESS_IDS.includes(businessId)) return;
    if (this.busyBusinesses.has(businessId)) return;

    if (button.matches("[data-business-upgrade]")) {
      void this.runBusinessAction(businessId, () => upgradeIdleBusiness(businessId));
    } else if (button.matches("[data-business-collect]")) {
      void this.runBusinessAction(businessId, () => collectIdleBusiness(businessId));
    } else if (button.matches("[data-business-vault-upgrade]")) {
      void this.runBusinessAction(businessId, () => upgradeIdleVault(businessId));
    }
  };

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
