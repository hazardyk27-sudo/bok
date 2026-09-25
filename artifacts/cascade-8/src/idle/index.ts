import "./idle.css";
import { renderBusinessRowShell, updateBusinessRow } from "./components";
import {
  collectIdleBusiness,
  fetchIdleState,
  getIdleTotalCollectableCents,
  getIdleTotalPassiveIncomeCentsPerHour,
  projectIdleStateLive,
  upgradeIdleBusiness,
} from "./services";
import {
  BUSINESS_IDS,
  type BusinessId,
  type IdleStateEnvelope,
} from "./types";

function formatCredits(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const BUSINESSES_MARKUP = `
  <main class="businesses-page" aria-labelledby="businesses-title">
    <header class="businesses-header">
      <a class="back-link" href="/">← ANA MENÜ</a>
      <div class="businesses-heading">
        <span class="businesses-kicker">FAHRİNİN YOLU // İŞLETMELER</span>
        <h1 id="businesses-title">İŞLETMELER</h1>
        <p>Üç işletmeyi büyüt, Kasalarını geliştir ve biriken geliri ortak bakiyene aktar.</p>
      </div>
      <div class="businesses-wallet" aria-label="Ortak bakiye">
        <span>BAKİYE</span>
        <strong data-idle-balance>—</strong>
      </div>
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
    </section>

    <section class="business-list" aria-label="İşletmeler">
      ${BUSINESS_IDS.map(renderBusinessRowShell).join("")}
    </section>
  </main>
`;

export class BusinessesClient {
  private envelope: IdleStateEnvelope | null = null;
  private timer: number | null = null;
  private readonly busyBusinesses = new Set<BusinessId>();

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
    this.envelope = await fetchIdleState();
    this.render();
  }

  private render() {
    if (!this.envelope) return;

    const live = projectIdleStateLive(this.envelope);
    const walletBalanceCents = live.wallet.balanceCents;
    const balanceNode = this.root.querySelector<HTMLElement>("[data-idle-balance]");
    const hourlyNode = this.root.querySelector<HTMLElement>("[data-idle-total-hourly]");
    const collectableNode = this.root.querySelector<HTMLElement>("[data-idle-total-collectable]");

    if (!balanceNode || !hourlyNode || !collectableNode) {
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

    hourlyNode.textContent = `${formatCredits(totalHourlyCents)} /sa`;
    collectableNode.textContent = formatCredits(totalCollectableCents);
  }

  private handleClick = (event: Event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>("button");
    const row = target?.closest<HTMLElement>("[data-business-id]");
    if (!button || !row) return;

    const businessId = row.dataset.businessId as BusinessId | undefined;
    if (!businessId || !BUSINESS_IDS.includes(businessId)) return;
    if (this.busyBusinesses.has(businessId)) return;

    if (button.matches("[data-business-upgrade]")) {
      void this.runBusinessAction(businessId, () => upgradeIdleBusiness(businessId));
    } else if (button.matches("[data-business-collect]")) {
      void this.runBusinessAction(businessId, () => collectIdleBusiness(businessId));
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
    } finally {
      this.busyBusinesses.delete(businessId);
      this.render();
    }
  }
}
