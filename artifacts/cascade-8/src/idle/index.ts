import "./idle.css";
import "./stadium-premium.css";
import {
  createStadiumPremiumUi,
  type StadiumMutationResponse,
  type StadiumPremiumUi,
} from "./stadiumPremium";
import {
  fetchIdleStadiumState,
  projectIdleStadiumLive,
  subscribeIdleMarket,
} from "./services";
import type {
  IdleStadiumStateEnvelope,
  TicketMarketSnapshot,
} from "./types";

function formatMoneyFromCents(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTicketPrice(
  priceMicrodollars: number,
) {
  return `$${(
    priceMicrodollars / 1_000_000
  ).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })}`;
}

function formatTicketQuantity(
  microTickets: number,
) {
  const tickets = microTickets / 1_000_000;
  return tickets.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits:
      Number.isInteger(tickets) ? 0 : 3,
  });
}

function formatProductionRate(
  microTicketsPerHour: number,
) {
  return `${formatTicketQuantity(
    microTicketsPerHour,
  )} /sa`;
}

function setText(
  root: HTMLElement,
  selector: string,
  value: string,
) {
  const nodes = root.querySelectorAll<HTMLElement>(
    selector,
  );
  if (nodes.length === 0) {
    throw new Error(
      `IDLE_STADIUM_SHELL_MISSING:${selector}`,
    );
  }
  nodes.forEach((node) => {
    node.textContent = value;
  });
}

export const BUSINESSES_MARKUP = `
  <div class="businesses-workspace">
    <aside
      class="businesses-sidebar"
      aria-label="Fahrinin Yolu navigasyon"
    >
      <a
        class="businesses-sidebar-brand"
        href="/"
        aria-label="Fahrinin Yolu ana menü"
      >
        <span
          class="businesses-sidebar-crest"
          aria-hidden="true"
        >FY</span>
        <span>
          <strong>FAHRİNİN YOLU</strong>
          <small>CLUB EMPIRE</small>
        </span>
      </a>

      <nav
        class="businesses-sidebar-nav"
        aria-label="Oyunlar ve kulüp bölümleri"
      >
        <span class="businesses-sidebar-section">
          OYUNLAR
        </span>
        <a
          class="businesses-sidebar-item"
          href="/slot"
        >
          <span
            class="businesses-sidebar-item-icon"
            aria-hidden="true"
          >▦</span>
          <span>SLOT</span>
        </a>
        <a
          class="businesses-sidebar-item"
          href="/roulette"
        >
          <span
            class="businesses-sidebar-item-icon"
            aria-hidden="true"
          >◎</span>
          <span>RULET</span>
        </a>
        <a
          class="businesses-sidebar-item"
          href="/cadi-kazan"
        >
          <span
            class="businesses-sidebar-item-icon"
            aria-hidden="true"
          >✦</span>
          <span>CADI KAZAN</span>
        </a>

        <span
          class="businesses-sidebar-section
                 businesses-sidebar-section--club"
        >
          KULÜP
        </span>
        <a
          class="businesses-sidebar-item is-active"
          href="/businesses"
          aria-current="page"
        >
          <span
            class="businesses-sidebar-item-icon"
            aria-hidden="true"
          >▣</span>
          <span>İŞLETMELER</span>
        </a>
      </nav>

      <div class="businesses-sidebar-footer">
        <span>FAHRİNİN YOLU</span>
        <small>KULÜP OPERASYON SİSTEMİ</small>
      </div>
    </aside>

    <main
      class="businesses-page"
      aria-labelledby="businesses-title"
    >
      <header class="businesses-header">
        <div class="businesses-header-nav">
          <a
            class="businesses-mobile-brand"
            href="/"
            aria-label="Fahrinin Yolu ana menü"
          >
            <span
              class="businesses-mobile-brand-crest"
              aria-hidden="true"
            >FY</span>
            <span>FAHRİNİN YOLU</span>
          </a>
          <span class="businesses-header-status">
            <i aria-hidden="true"></i>
            STADIUM OPERATIONS
          </span>
          <a
            class="back-link"
            href="/"
            aria-label="Ana menüye dön"
          >
            <span
              class="back-link-icon"
              aria-hidden="true"
            >←</span>
            <span>ANA MENÜ</span>
          </a>
        </div>

        <div class="businesses-header-main">
          <div class="businesses-heading">
            <span class="businesses-kicker">
              FAHRİNİN YOLU // STADIUM
            </span>
            <h1 id="businesses-title">
              İŞLETMELER
            </h1>
            <p>
              Stadyum bilet üretimini, depolamayı ve
              global piyasa fiyatını tek merkezden takip et.
            </p>
          </div>

          <div
            class="businesses-wallet"
            aria-label="Ortak oyun bakiyesi"
          >
            <span>ORTAK BAKİYE</span>
            <strong data-idle-balance>—</strong>
            <small>TÜM OYUNLARDA KULLANILIR</small>
          </div>
        </div>
      </header>

      <p
        class="businesses-error"
        data-idle-error
        role="status"
        hidden
      ></p>

      <section
        class="stadium-canonical-card"
        aria-label="Stadyum bilet ekonomisi"
        data-idle-stadium-card
        data-state="loading"
      >
        <div class="stadium-canonical-hero">
          <img
            src="/businesses/stadium.webp"
            alt=""
            decoding="async"
          />
          <div
            class="stadium-canonical-hero-shade"
            aria-hidden="true"
          ></div>
          <div class="stadium-canonical-identity">
            <span>ACTIVE BUSINESS</span>
            <strong>STADYUM</strong>
            <small data-idle-stadium-level>
              Lv—
            </small>
          </div>
          <div
            class="stadium-canonical-balance"
            aria-label="Toplam ortak oyun bakiyesi"
          >
            <span>TOPLAM BAKİYE</span>
            <strong data-idle-balance>—</strong>
            <small>TÜM OYUNLARDA ORTAK</small>
          </div>
          <div class="stadium-canonical-market">
            <span>CANLI BİLET FİYATI</span>
            <strong data-idle-market-price>—</strong>
            <small data-idle-market-status>
              BAĞLANIYOR
            </small>
          </div>
        </div>

        <div class="stadium-canonical-body">
          <div class="stadium-canonical-primary">
            <article>
              <span>BİLET STOĞU</span>
              <strong data-idle-ticket-inventory>—</strong>
              <small>Bilet</small>
            </article>
            <article>
              <span>ÜRETİM HIZI</span>
              <strong data-idle-production-rate>—</strong>
              <small data-idle-production-status>
                —
              </small>
            </article>
            <article>
              <span>KOLTUK</span>
              <strong data-idle-seats>—</strong>
              <small data-idle-seat-capacity>—</small>
            </article>
          </div>

          <div class="stadium-canonical-storage">
            <div class="stadium-canonical-storage-head">
              <div>
                <span>DEPO</span>
                <strong data-idle-storage-level>
                  Lv—
                </strong>
              </div>
              <div>
                <span>DOLULUK</span>
                <strong data-idle-storage-percent>
                  —%
                </strong>
              </div>
            </div>
            <div
              class="stadium-canonical-storage-track"
              role="progressbar"
              aria-label="Bilet depo doluluğu"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow="0"
              data-idle-storage-track
            >
              <i data-idle-storage-fill></i>
            </div>
            <div class="stadium-canonical-storage-meta">
              <span data-idle-storage-current>—</span>
              <span data-idle-storage-capacity>—</span>
            </div>
          </div>


        </div>
      </section>
    </main>
  </div>
`;

class BusinessesClient {
  private envelope:
    IdleStadiumStateEnvelope | null = null;

  private market:
    TicketMarketSnapshot | null = null;

  private renderTimer:
    number | null = null;

  private stopMarket:
    (() => void) | null = null;

  private readonly premiumUi: StadiumPremiumUi;

  constructor(
    private readonly root: HTMLElement,
  ) {
    this.premiumUi = createStadiumPremiumUi({
      root: this.root,
      getEnvelope: () => this.envelope,
      getMarket: () => this.market,
      applyMutationResponse: (response) => {
        this.applyMutationResponse(response);
      },
    });
    void this.start();
  }

  private applyMutationResponse(
    response: StadiumMutationResponse,
  ) {
    if (!this.envelope) return;

    const currentMarket =
      this.market
      ?? this.envelope.snapshot.market;
    const responseMarket =
      "market" in response
        ? response.market
        : null;

    const currentTick =
      new Date(currentMarket.tickAt).getTime();
    const responseTick =
      responseMarket
        ? new Date(responseMarket.tickAt).getTime()
        : Number.NEGATIVE_INFINITY;

    const nextMarket =
      responseMarket
      && (
        !Number.isFinite(currentTick)
        || (
          Number.isFinite(responseTick)
          && responseTick >= currentTick
        )
      )
        ? responseMarket
        : currentMarket;

    this.market = nextMarket;
    this.envelope = {
      snapshot: {
        ...this.envelope.snapshot,
        serverTime: response.serverTime,
        wallet: {
          ...this.envelope.snapshot.wallet,
          balanceCents: response.balanceCents,
        },
        stadium: response.stadium,
        market: nextMarket,
      },
      receivedAtMs: Date.now(),
    };
    this.render();
  }

  private async start() {
    try {
      this.envelope =
        await fetchIdleStadiumState();
      this.market = this.envelope.snapshot.market;
      this.render();
      this.startLiveProjection();
      this.startMarketStream();
    } catch (error) {
      this.showError(error);
    }
  }

  private startLiveProjection() {
    if (this.renderTimer !== null) {
      window.clearInterval(this.renderTimer);
    }

    this.renderTimer = window.setInterval(
      () => this.render(),
      500,
    );

    window.addEventListener(
      "pagehide",
      () => {
        if (this.renderTimer !== null) {
          window.clearInterval(this.renderTimer);
          this.renderTimer = null;
        }
      },
      { once: true },
    );
  }

  private startMarketStream() {
    this.stopMarket?.();

    this.stopMarket = subscribeIdleMarket(
      (market) => {
        this.market = market;
        this.renderMarket();
      },
      () => {
        const card =
          this.root.querySelector<HTMLElement>(
            "[data-idle-stadium-card]",
          );
        if (card) {
          card.dataset.marketConnection =
            "reconnecting";
        }

        setText(
          this.root,
          "[data-idle-market-status]",
          "YENİDEN BAĞLANIYOR",
        );

        const detailStatus =
          this.root.querySelector<HTMLElement>(
            "[data-idle-market-detail-source]",
          );
        if (detailStatus) {
          detailStatus.textContent =
            "YENİDEN BAĞLANIYOR · SON FİYAT KORUNUYOR";
        }
      },
    );

    window.addEventListener(
      "pagehide",
      () => {
        this.stopMarket?.();
        this.stopMarket = null;
      },
      { once: true },
    );
  }

  private render() {
    if (!this.envelope) return;

    const live = projectIdleStadiumLive(
      this.envelope,
    );

    setText(
      this.root,
      "[data-idle-balance]",
      formatMoneyFromCents(
        this.envelope.snapshot.wallet.balanceCents,
      ),
    );
    setText(
      this.root,
      "[data-idle-stadium-level]",
      `Lv${live.stadiumLevel}`,
    );
    setText(
      this.root,
      "[data-idle-ticket-inventory]",
      formatTicketQuantity(
        live.liveStoredMicroTickets,
      ),
    );
    setText(
      this.root,
      "[data-idle-production-rate]",
      formatProductionRate(
        live.productionRateMicroTicketsPerHour,
      ),
    );
    setText(
      this.root,
      "[data-idle-production-status]",
      live.liveProductionStatus === "NO_SEATS"
        ? "KOLTUK BEKLİYOR"
        : live.liveProductionStatus
            === "STORAGE_FULL"
          ? "DEPO DOLU"
          : "ÜRETİM AKTİF",
    );
    setText(
      this.root,
      "[data-idle-seats]",
      live.ownedSeats.toLocaleString("en-US"),
    );
    setText(
      this.root,
      "[data-idle-seat-capacity]",
      `KAPASİTE ${live.maxSeatCapacity
        .toLocaleString("en-US")}`,
    );
    setText(
      this.root,
      "[data-idle-storage-level]",
      `Lv${live.storageLevel}`,
    );

    const rawStoragePercent =
      live.storageFillRatio * 100;
    const storagePercent =
      live.liveIsStorageFull
        ? 100
        : Math.min(
          99.9,
          Math.floor(rawStoragePercent * 10) / 10,
        );
    const storagePercentLabel =
      Number.isInteger(storagePercent)
        ? String(storagePercent)
        : storagePercent.toFixed(1);

    setText(
      this.root,
      "[data-idle-storage-percent]",
      `%${storagePercentLabel}`,
    );
    setText(
      this.root,
      "[data-idle-storage-current]",
      `${formatTicketQuantity(
        live.liveStoredMicroTickets,
      )} bilet`,
    );
    setText(
      this.root,
      "[data-idle-storage-capacity]",
      `${live.storageCapacityTickets
        .toLocaleString("en-US")} kapasite`,
    );
    const track =
      this.root.querySelector<HTMLElement>(
        "[data-idle-storage-track]",
      );
    const fill =
      this.root.querySelector<HTMLElement>(
        "[data-idle-storage-fill]",
      );

    if (!track || !fill) {
      throw new Error(
        "IDLE_STADIUM_STORAGE_SHELL_MISSING",
      );
    }

    track.setAttribute(
      "aria-valuenow",
      String(storagePercent),
    );
    fill.style.width = `${storagePercent}%`;

    const card =
      this.root.querySelector<HTMLElement>(
        "[data-idle-stadium-card]",
      );
    if (card) {
      card.dataset.state =
        live.liveProductionStatus.toLowerCase();
    }

    this.renderMarket();
    this.premiumUi.render();
  }

  private renderMarket() {
    if (!this.market) return;

    setText(
      this.root,
      "[data-idle-market-price]",
      formatTicketPrice(
        this.market.priceMicrodollars,
      ),
    );
    setText(
      this.root,
      "[data-idle-market-status]",
      this.market.feedStatus,
    );
    const card =
      this.root.querySelector<HTMLElement>(
        "[data-idle-stadium-card]",
      );
    if (card) {
      card.dataset.marketConnection =
        this.market.feedStatus === "LIVE"
          ? "live"
          : "limited";
    }

    this.premiumUi.renderMarket();
  }

  private showError(error: unknown) {
    const node =
      this.root.querySelector<HTMLElement>(
        "[data-idle-error]",
      );
    if (!node) return;

    node.hidden = false;
    node.textContent =
      error instanceof Error
        ? error.message
        : "IDLE_STADIUM_STATE_REQUEST_FAILED";
  }
}

export function mountBusinesses(
  app: HTMLDivElement,
) {
  document.documentElement.classList.add(
    "businesses-route",
  );
  document.body.classList.add(
    "businesses-route",
  );

  app.innerHTML = `
    <div
      class="app-shell route-shell
             is-route-page is-businesses-page"
    >
      ${BUSINESSES_MARKUP}
    </div>
  `;

  const businessesRoot =
    app.querySelector<HTMLElement>(
      ".businesses-page",
    );

  if (businessesRoot) {
    new BusinessesClient(businessesRoot);
  }
}
