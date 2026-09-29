import {
  SPEED_LEVELS,
  STADIUM_LEVELS,
  STORAGE_LEVELS,
} from "./config";
import {
  buyIdleStadiumSeats,
  fetchIdleMarketHistory,
  projectIdleStadiumLive,
  sellIdleStadiumTickets,
  upgradeIdleStadiumLevel,
  upgradeIdleStadiumSpeed,
  upgradeIdleStadiumStorage,
} from "./services";
import type {
  IdleStadiumStateEnvelope,
  TicketMarketHistoryPoint,
  TicketMarketSnapshot,
} from "./types";

export type StadiumPremiumUi = {
  render: () => void;
  renderMarket: () => void;
};

type Options = {
  root: HTMLElement;
  getEnvelope: () => IdleStadiumStateEnvelope | null;
  getMarket: () => TicketMarketSnapshot | null;
  refreshState: () => Promise<void>;
};

function money(cents: number) {
  const value = cents / 100;
  if (value >= 1_000) {
    return "$" + value.toLocaleString("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    });
  }
  return "$" + value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function price(value: number) {
  return "$" + (value / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function tickets(microTickets: number) {
  const value = microTickets / 1_000_000;
  return value.toLocaleString("en-US", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 3,
  });
}

function text(root: HTMLElement, selector: string, value: string) {
  const node = root.querySelector<HTMLElement>(selector);
  if (node) node.textContent = value;
}

function button(root: HTMLElement, selector: string) {
  const node = root.querySelector<HTMLButtonElement>(selector);
  if (!node) throw new Error("IDLE_PREMIUM_BUTTON_MISSING:" + selector);
  return node;
}

function readableError(error: unknown) {
  const code = error instanceof Error ? error.message : "IDLE_REQUEST_FAILED";
  const labels: Record<string, string> = {
    INSUFFICIENT_IDLE_CREDITS: "Bakiyen bu işlem için yeterli değil.",
    INSUFFICIENT_IDLE_TICKETS: "Depoda satılabilecek yeterli bilet yok.",
    IDLE_STADIUM_CAPACITY_EXCEEDED: "Bu alım stadyum kapasitesini aşıyor.",
    IDLE_STADIUM_MAX_SEATS_REACHED: "Stadyum maksimum koltuk sayısına ulaştı.",
    IDLE_STADIUM_MAX_SEATS_EXCEEDED: "Maksimum koltuk sınırı aşılamaz.",
    IDLE_STADIUM_MAX_LEVEL: "Stadyum zaten maksimum seviyede.",
    IDLE_SPEED_MAX_LEVEL: "Üretim hızı zaten maksimum seviyede.",
    IDLE_STORAGE_MAX_LEVEL: "Bilet deposu zaten maksimum seviyede.",
  };
  return labels[code] ?? code;
}

const MAIN_MARKUP = `
  <div class="stadium-premium-actions">
    <section class="stadium-sell-panel" aria-label="Bilet satışı">
      <div class="stadium-panel-heading">
        <div><span>GLOBAL MARKET</span><strong>BİLET SAT</strong></div>
        <small>İşlem anındaki canlı fiyat uygulanır.</small>
      </div>
      <div class="stadium-sell-input-row">
        <label><span>ADET</span><input type="number" min="1" step="1" inputmode="numeric" placeholder="0" data-idle-sell-input></label>
        <button type="button" data-idle-sell-button>ŞİMDİ SAT</button>
      </div>
      <div class="stadium-sell-shortcuts">
        <button type="button" data-idle-sell-ratio="0.25">%25</button>
        <button type="button" data-idle-sell-ratio="0.5">%50</button>
        <button type="button" data-idle-sell-ratio="0.75">%75</button>
        <button type="button" data-idle-sell-ratio="1">MAX</button>
      </div>
      <div class="stadium-sell-preview"><span>TAHMİNİ BRÜT</span><strong data-idle-sale-preview>—</strong></div>
    </section>
    <button type="button" class="stadium-details-open" data-idle-open-details>
      <span><small>STADIUM CONTROL</small><strong>DETAYLAR & GELİŞTİRMELER</strong></span><b aria-hidden="true">→</b>
    </button>
  </div>
`;

const DRAWER_MARKUP = `
  <p class="stadium-action-status" data-idle-action-status role="status" hidden></p>
  <section class="stadium-drawer" data-idle-details-drawer hidden>
    <div class="stadium-drawer-backdrop" data-idle-close-details></div>
    <div class="stadium-drawer-sheet" role="dialog" aria-modal="true" aria-labelledby="stadium-details-title">
      <div class="stadium-drawer-head">
        <div><span>STADIUM CONTROL</span><h2 id="stadium-details-title">DETAYLAR</h2></div>
        <button type="button" data-idle-close-details aria-label="Detayları kapat">×</button>
      </div>
      <div class="stadium-upgrade-grid">
        <article>
          <i>S</i><span>STADYUM</span><strong data-idle-detail-stadium-level>Lv—</strong>
          <p data-idle-detail-stadium-copy>—</p>
          <div><span>SONRAKİ</span><strong data-idle-detail-stadium-cost>—</strong></div>
          <button type="button" data-idle-upgrade-stadium>STADYUMU GELİŞTİR</button>
        </article>
        <article>
          <i>⚡</i><span>ÜRETİM HIZI</span><strong data-idle-detail-speed-level>Lv—</strong>
          <p data-idle-detail-speed-copy>—</p>
          <div><span>SONRAKİ</span><strong data-idle-detail-speed-cost>—</strong></div>
          <button type="button" data-idle-upgrade-speed>HIZI GELİŞTİR</button>
        </article>
        <article>
          <i>▤</i><span>BİLET DEPOSU</span><strong data-idle-detail-storage-level>Lv—</strong>
          <p data-idle-detail-storage-copy>—</p>
          <div><span>SONRAKİ</span><strong data-idle-detail-storage-cost>—</strong></div>
          <button type="button" data-idle-upgrade-storage>DEPOYU GELİŞTİR</button>
        </article>
      </div>
      <section class="stadium-seat-purchase">
        <div><span>KOLTUK EKLE</span><strong>ÜRETİM KAPASİTESİNİ BÜYÜT</strong><small data-idle-seat-room>—</small></div>
        <label><span>ADET</span><input type="number" min="1" step="1" inputmode="numeric" placeholder="100" data-idle-seat-input></label>
        <button type="button" data-idle-buy-seats>KOLTUK SATIN AL</button>
      </section>
    </div>
  </section>
  <section class="stadium-drawer stadium-market-drawer" data-idle-market-drawer hidden>
    <div class="stadium-drawer-backdrop" data-idle-close-market></div>
    <div class="stadium-drawer-sheet" role="dialog" aria-modal="true" aria-labelledby="stadium-market-title">
      <div class="stadium-drawer-head">
        <div><span>GLOBAL TICKET MARKET</span><h2 id="stadium-market-title">24 SAATLİK PİYASA</h2></div>
        <button type="button" data-idle-close-market aria-label="Piyasayı kapat">×</button>
      </div>
      <div class="stadium-market-summary">
        <article><span>CANLI FİYAT</span><strong data-idle-market-detail-price>—</strong></article>
        <article><span>24S EN DÜŞÜK</span><strong data-idle-market-low>—</strong></article>
        <article><span>24S EN YÜKSEK</span><strong data-idle-market-high>—</strong></article>
        <article><span>24S DEĞİŞİM</span><strong data-idle-market-change>—</strong></article>
      </div>
      <div class="stadium-market-chart" data-idle-market-chart-state="idle">
        <div class="stadium-market-chart-head"><span>BİLET / USD</span><small>SON 24 SAAT · 5 SANİYELİK HAM TICK</small></div>
        <svg viewBox="0 0 1000 280" preserveAspectRatio="none" role="img" aria-label="Son 24 saat bilet fiyat grafiği">
          <path class="stadium-market-chart-grid" d="M0 70 H1000 M0 140 H1000 M0 210 H1000"></path>
          <path class="stadium-market-chart-line" data-idle-market-chart-path d=""></path>
        </svg>
        <div class="stadium-market-chart-empty" data-idle-market-chart-empty>Grafik yükleniyor…</div>
      </div>
      <div class="stadium-market-foot"><span data-idle-market-detail-source>—</span><small>Satışta sunucunun işlem anındaki global fiyatı kullanılır.</small></div>
    </div>
  </section>
`;

function chartPath(points: TicketMarketHistoryPoint[]) {
  if (points.length < 2) return "";
  const values = points.map((item) => item.priceMicrodollars);
  const min = Math.min(...values);
  const range = Math.max(1, Math.max(...values) - min);
  return points.map((item, index) => {
    const x = index / (points.length - 1) * 1000;
    const y = 280 - (item.priceMicrodollars - min) / range * 280;
    return (index === 0 ? "M" : "L") + x.toFixed(2) + "," + y.toFixed(2);
  }).join(" ");
}

export function createStadiumPremiumUi(options: Options): StadiumPremiumUi {
  const { root, getEnvelope, getMarket, refreshState } = options;
  const body = root.querySelector<HTMLElement>(".stadium-canonical-body");
  const marketBox = root.querySelector<HTMLElement>(".stadium-canonical-market");
  const card = root.querySelector<HTMLElement>("[data-idle-stadium-card]");
  if (!body || !marketBox || !card) throw new Error("IDLE_PREMIUM_SHELL_MISSING");

  card.classList.add("stadium-premium-card");
  body.insertAdjacentHTML("beforeend", MAIN_MARKUP);
  root.insertAdjacentHTML("beforeend", DRAWER_MARKUP);
  marketBox.insertAdjacentHTML(
    "beforeend",
    '<button class="stadium-market-open" type="button" data-idle-open-market>24 SAAT PİYASA <span aria-hidden="true">↗</span></button>',
  );

  let busy = false;
  let history: TicketMarketHistoryPoint[] = [];

  const showStatus = (message: string, isError = false) => {
    const node = root.querySelector<HTMLElement>("[data-idle-action-status]");
    if (!node) return;
    node.hidden = false;
    node.dataset.tone = isError ? "error" : "success";
    node.textContent = message;
    window.setTimeout(() => {
      if (node.textContent === message) node.hidden = true;
    }, 4000);
  };

  const setDrawer = (kind: "details" | "market", open: boolean) => {
    const selector = kind === "details"
      ? "[data-idle-details-drawer]"
      : "[data-idle-market-drawer]";
    const drawer = root.querySelector<HTMLElement>(selector);
    if (!drawer) return;
    drawer.hidden = !open;
    document.body.classList.toggle(
      "idle-drawer-open",
      Boolean(root.querySelector("[data-idle-details-drawer]:not([hidden]), [data-idle-market-drawer]:not([hidden])")),
    );
  };

  const renderHistory = () => {
    const path = root.querySelector<SVGPathElement>("[data-idle-market-chart-path]");
    const empty = root.querySelector<HTMLElement>("[data-idle-market-chart-empty]");
    const chart = root.querySelector<HTMLElement>(".stadium-market-chart");
    if (!path || !empty || !chart) return;
    if (history.length < 2) {
      chart.dataset.idleMarketChartState = "empty";
      empty.textContent = "24 saatlik grafik için henüz yeterli veri yok.";
      path.setAttribute("d", "");
      return;
    }
    const values = history.map((item) => item.priceMicrodollars);
    const first = values[0];
    const last = values.at(-1) ?? first;
    const change = first === 0 ? 0 : (last - first) / first * 100;
    text(root, "[data-idle-market-low]", price(Math.min(...values)));
    text(root, "[data-idle-market-high]", price(Math.max(...values)));
    text(root, "[data-idle-market-change]", (change >= 0 ? "+" : "") + change.toFixed(2) + "%");
    path.setAttribute("d", chartPath(history));
    chart.dataset.idleMarketChartState = "ready";
    empty.textContent = "";
  };

  const loadHistory = async () => {
    const chart = root.querySelector<HTMLElement>(".stadium-market-chart");
    if (chart) chart.dataset.idleMarketChartState = "loading";
    try {
      history = (await fetchIdleMarketHistory()).points;
      renderHistory();
    } catch (error) {
      if (chart) chart.dataset.idleMarketChartState = "error";
      const empty = root.querySelector<HTMLElement>("[data-idle-market-chart-empty]");
      if (empty) empty.textContent = readableError(error);
    }
  };

  const renderMarket = () => {
    const market = getMarket();
    if (!market) return;
    text(root, "[data-idle-market-detail-price]", price(market.priceMicrodollars));
    text(
      root,
      "[data-idle-market-detail-source]",
      market.feedStatus + " · " + (
        market.source === "binance-btcusdt"
          ? "BINANCE BTCUSDT"
          : market.source === "coinbase-btc-usd"
            ? "COINBASE BTC-USD"
            : "FEED BEKLEMEDE"
      ),
    );
    const input = root.querySelector<HTMLInputElement>("[data-idle-sell-input]");
    const quantity = Number.parseInt(input?.value ?? "", 10);
    text(
      root,
      "[data-idle-sale-preview]",
      Number.isSafeInteger(quantity) && quantity > 0
        ? "$" + (quantity * market.priceMicrodollars / 1_000_000).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
        : "—",
    );
    if (history.length) renderHistory();
  };

  const render = () => {
    const envelope = getEnvelope();
    if (!envelope) return;
    const stadium = projectIdleStadiumLive(envelope);
    const nextStadium = STADIUM_LEVELS.find((item) => item.level === stadium.stadiumLevel + 1);
    const nextSpeed = SPEED_LEVELS.find((item) => item.level === stadium.speedLevel + 1);
    const nextStorage = STORAGE_LEVELS.find((item) => item.level === stadium.storageLevel + 1);

    text(root, "[data-idle-detail-stadium-level]", "Lv" + stadium.stadiumLevel);
    text(root, "[data-idle-detail-stadium-copy]", stadium.ownedSeats.toLocaleString("en-US") + " / " + stadium.maxSeatCapacity.toLocaleString("en-US") + " koltuk açık.");
    text(root, "[data-idle-detail-stadium-cost]", nextStadium ? money(nextStadium.unlockCostCents) : "MAX");
    text(root, "[data-idle-detail-speed-level]", "Lv" + stadium.speedLevel);
    text(root, "[data-idle-detail-speed-copy]", tickets(stadium.productionRateMicroTicketsPerHour) + " bilet/saat toplam üretim.");
    text(root, "[data-idle-detail-speed-cost]", nextSpeed ? money(nextSpeed.upgradeCostCents) : "MAX");
    text(root, "[data-idle-detail-storage-level]", "Lv" + stadium.storageLevel);
    text(root, "[data-idle-detail-storage-copy]", stadium.storageCapacityTickets.toLocaleString("en-US") + " bilet maksimum depo.");
    text(root, "[data-idle-detail-storage-cost]", nextStorage ? money(nextStorage.upgradeCostCents) : "MAX");
    text(root, "[data-idle-seat-room]", Math.max(0, stadium.maxSeatCapacity - stadium.ownedSeats).toLocaleString("en-US") + " koltuk alanı mevcut");

    const stadiumButton = button(root, "[data-idle-upgrade-stadium]");
    const speedButton = button(root, "[data-idle-upgrade-speed]");
    const storageButton = button(root, "[data-idle-upgrade-storage]");
    stadiumButton.disabled = busy || !nextStadium;
    speedButton.disabled = busy || !nextSpeed;
    storageButton.disabled = busy || !nextStorage;
    stadiumButton.textContent = nextStadium ? "STADYUMU GELİŞTİR" : "MAKSİMUM SEVİYE";
    speedButton.textContent = nextSpeed ? "HIZI GELİŞTİR" : "MAKSİMUM SEVİYE";
    storageButton.textContent = nextStorage ? "DEPOYU GELİŞTİR" : "MAKSİMUM SEVİYE";
    button(root, "[data-idle-buy-seats]").disabled = busy || stadium.ownedSeats >= stadium.maxSeatCapacity;
    button(root, "[data-idle-sell-button]").disabled = busy;
    renderMarket();
  };

  const mutate = async (success: string, action: () => Promise<unknown>) => {
    if (busy) return false;
    busy = true;
    render();
    try {
      await action();
      await refreshState();
      showStatus(success);
      return true;
    } catch (error) {
      showStatus(readableError(error), true);
      return false;
    } finally {
      busy = false;
      render();
    }
  };

  button(root, "[data-idle-open-details]").addEventListener("click", () => setDrawer("details", true));
  button(root, "[data-idle-open-market]").addEventListener("click", () => {
    setDrawer("market", true);
    void loadHistory();
  });
  root.querySelectorAll<HTMLElement>("[data-idle-close-details]").forEach((node) => node.addEventListener("click", () => setDrawer("details", false)));
  root.querySelectorAll<HTMLElement>("[data-idle-close-market]").forEach((node) => node.addEventListener("click", () => setDrawer("market", false)));

  root.querySelectorAll<HTMLButtonElement>("[data-idle-sell-ratio]").forEach((node) => {
    node.addEventListener("click", () => {
      const envelope = getEnvelope();
      if (!envelope) return;
      const ratio = Number(node.dataset.idleSellRatio ?? 0);
      const available = Math.floor(projectIdleStadiumLive(envelope).liveStoredMicroTickets / 1_000_000);
      const input = root.querySelector<HTMLInputElement>("[data-idle-sell-input]");
      if (input) input.value = String(ratio >= 1 ? available : Math.floor(available * ratio));
      renderMarket();
    });
  });
  root.querySelector<HTMLInputElement>("[data-idle-sell-input]")?.addEventListener("input", renderMarket);

  button(root, "[data-idle-sell-button]").addEventListener("click", () => {
    const input = root.querySelector<HTMLInputElement>("[data-idle-sell-input]");
    const quantity = Number.parseInt(input?.value ?? "", 10);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      showStatus("Satış için pozitif tam sayı gir.", true);
      return;
    }
    void mutate(quantity.toLocaleString("en-US") + " bilet satıldı.", () => sellIdleStadiumTickets(quantity))
      .then((succeeded) => {
        if (succeeded && input) input.value = "";
        renderMarket();
      });
  });
  button(root, "[data-idle-upgrade-stadium]").addEventListener("click", () => void mutate("Stadyum geliştirildi.", () => upgradeIdleStadiumLevel()));
  button(root, "[data-idle-upgrade-speed]").addEventListener("click", () => void mutate("Üretim hızı geliştirildi.", () => upgradeIdleStadiumSpeed()));
  button(root, "[data-idle-upgrade-storage]").addEventListener("click", () => void mutate("Bilet deposu geliştirildi.", () => upgradeIdleStadiumStorage()));
  button(root, "[data-idle-buy-seats]").addEventListener("click", () => {
    const input = root.querySelector<HTMLInputElement>("[data-idle-seat-input]");
    const quantity = Number.parseInt(input?.value ?? "", 10);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      showStatus("Koltuk alımı için pozitif tam sayı gir.", true);
      return;
    }
    void mutate(quantity.toLocaleString("en-US") + " koltuk satın alındı.", () => buyIdleStadiumSeats(quantity))
      .then((succeeded) => {
        if (succeeded && input) input.value = "";
      });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setDrawer("details", false);
      setDrawer("market", false);
    }
  });

  return { render, renderMarket };
}
