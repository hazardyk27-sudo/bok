import "./leaderboard.css";

export type HubLeaderboardEntry = {
  rank: number;
  username: string;
  cashCents: number;
  capitalCents: number;
  totalWealthCents: number;
};

type HubLeaderboardResponse = {
  serverTime: string;
  totalPlayers: number;
  entries: HubLeaderboardEntry[];
};

export const HUB_LEADERBOARD_REFRESH_MS = 15_000;

const LEADERBOARD_MARKUP = `
  <section
    class="hub-leaderboard-drawer"
    data-hub-leaderboard-drawer
    hidden
  >
    <div
      class="hub-leaderboard-backdrop"
      data-hub-close-leaderboard
    ></div>
    <div
      class="hub-leaderboard-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hub-leaderboard-title"
    >
      <header class="hub-leaderboard-head">
        <div>
          <span>GLOBAL PLAYER BOARD</span>
          <h2 id="hub-leaderboard-title">SERVET SIRALAMASI</h2>
          <p>Nakit + işletmelere yatırılan sermaye = Toplam Servet</p>
        </div>
        <button
          type="button"
          class="hub-leaderboard-close"
          data-hub-close-leaderboard
          aria-label="Servet sıralamasını kapat"
        >×</button>
      </header>

      <div class="hub-leaderboard-meta">
        <div>
          <span>KAYITLI OYUNCU</span>
          <strong data-hub-leaderboard-count>—</strong>
        </div>
        <div>
          <span>YENİLEME</span>
          <strong>15 SANİYE</strong>
        </div>
        <div>
          <span>SON GÜNCELLEME</span>
          <strong data-hub-leaderboard-updated>—</strong>
        </div>
        <button
          type="button"
          class="hub-leaderboard-refresh"
          data-hub-refresh-leaderboard
        >ŞİMDİ YENİLE</button>
      </div>

      <div class="hub-leaderboard-table-wrap">
        <table class="hub-leaderboard-table">
          <thead>
            <tr>
              <th>SIRA</th>
              <th>KULLANICI</th>
              <th>NAKİT</th>
              <th>SERMAYE</th>
              <th>TOPLAM SERVET</th>
            </tr>
          </thead>
          <tbody data-hub-leaderboard-body>
            <tr data-state="message">
              <td colspan="5" class="hub-leaderboard-state">
                Sıralama yükleniyor…
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="hub-leaderboard-footnote">
        Tablo açıkken 15 saniyede bir otomatik yenilenir. Sekmeye geri dönüldüğünde anında tekrar kontrol edilir.
      </p>
    </div>
  </section>
`;

function formatMoney(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function rankLabel(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return String(rank);
}

function formatUpdatedAt(serverTime: string) {
  const date = new Date(serverTime);
  if (!Number.isFinite(date.getTime())) return "ŞİMDİ";
  return date.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function fetchHubLeaderboard() {
  const response = await fetch("/api/idle/leaderboard", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error ?? "LEADERBOARD_REQUEST_FAILED",
    );
  }

  return response.json() as Promise<HubLeaderboardResponse>;
}

function renderRows(
  body: HTMLTableSectionElement,
  entries: HubLeaderboardEntry[],
) {
  if (entries.length === 0) {
    body.innerHTML = `
      <tr data-state="message">
        <td colspan="5" class="hub-leaderboard-state">
          Henüz sıralanacak kullanıcı yok.
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = entries.map((entry) => `
    <tr data-rank="${entry.rank}">
      <td data-label="SIRA">
        <span class="hub-leaderboard-rank">
          ${rankLabel(entry.rank)}
        </span>
      </td>
      <td data-label="KULLANICI">
        <strong class="hub-leaderboard-user">
          ${escapeHtml(entry.username)}
        </strong>
      </td>
      <td data-label="NAKİT">${formatMoney(entry.cashCents)}</td>
      <td data-label="SERMAYE">${formatMoney(entry.capitalCents)}</td>
      <td data-label="TOPLAM SERVET">
        <strong class="hub-leaderboard-total">
          ${formatMoney(entry.totalWealthCents)}
        </strong>
      </td>
    </tr>
  `).join("");
}

export function mountHubLeaderboard(app: HTMLElement) {
  app.insertAdjacentHTML("beforeend", LEADERBOARD_MARKUP);

  const openButton = app.querySelector<HTMLElement>(
    "[data-hub-open-leaderboard]",
  );
  const drawer = app.querySelector<HTMLElement>(
    "[data-hub-leaderboard-drawer]",
  );
  const body = app.querySelector<HTMLTableSectionElement>(
    "[data-hub-leaderboard-body]",
  );
  const count = app.querySelector<HTMLElement>(
    "[data-hub-leaderboard-count]",
  );
  const updated = app.querySelector<HTMLElement>(
    "[data-hub-leaderboard-updated]",
  );
  const refreshButton = app.querySelector<HTMLButtonElement>(
    "[data-hub-refresh-leaderboard]",
  );

  if (
    !openButton
    || !drawer
    || !body
    || !count
    || !updated
    || !refreshButton
  ) {
    throw new Error("HUB_LEADERBOARD_SHELL_MISSING");
  }

  let loading = false;
  let refreshTimer: number | null = null;
  let hasLoaded = false;

  const load = async () => {
    if (loading) return;
    loading = true;
    refreshButton.disabled = true;

    try {
      const response = await fetchHubLeaderboard();
      hasLoaded = true;
      count.textContent = response.totalPlayers.toLocaleString("tr-TR");
      updated.textContent = formatUpdatedAt(response.serverTime);
      renderRows(body, response.entries);
    } catch (error) {
      if (!hasLoaded) {
        body.innerHTML = `
          <tr data-state="message">
            <td colspan="5" class="hub-leaderboard-state hub-leaderboard-state--error">
              ${escapeHtml(
                error instanceof Error
                  ? error.message
                  : "LEADERBOARD_REQUEST_FAILED",
              )}
            </td>
          </tr>
        `;
      }
    } finally {
      loading = false;
      refreshButton.disabled = false;
    }
  };

  const stopRefreshTimer = () => {
    if (refreshTimer !== null) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };

  const startRefreshTimer = () => {
    stopRefreshTimer();
    refreshTimer = window.setInterval(() => {
      if (!drawer.hidden && document.visibilityState === "visible") {
        void load();
      }
    }, HUB_LEADERBOARD_REFRESH_MS);
  };

  const setOpen = (open: boolean) => {
    drawer.hidden = !open;
    openButton.setAttribute(
      "aria-expanded",
      open ? "true" : "false",
    );
    document.body.classList.toggle(
      "hub-leaderboard-lock",
      open,
    );

    if (open) {
      void load();
      startRefreshTimer();
    } else {
      stopRefreshTimer();
    }
  };

  const openLeaderboard = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  };

  openButton.addEventListener("click", openLeaderboard);
  openButton.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      openLeaderboard(event);
    }
  });
  refreshButton.addEventListener("click", () => void load());

  app
    .querySelectorAll<HTMLElement>("[data-hub-close-leaderboard]")
    .forEach((node) => {
      node.addEventListener("click", () => setOpen(false));
    });

  const handleVisibility = () => {
    if (document.visibilityState === "visible" && !drawer.hidden) {
      void load();
    }
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !drawer.hidden) {
      setOpen(false);
    }
  };

  document.addEventListener("visibilitychange", handleVisibility);
  document.addEventListener("keydown", handleKeydown);

  window.addEventListener(
    "pagehide",
    () => {
      stopRefreshTimer();
      document.removeEventListener(
        "visibilitychange",
        handleVisibility,
      );
      document.removeEventListener("keydown", handleKeydown);
    },
    { once: true },
  );
}
