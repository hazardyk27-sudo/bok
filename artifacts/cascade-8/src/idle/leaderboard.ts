import "./leaderboard.css";

export type IdleLeaderboardEntry = {
  rank: number;
  username: string;
  cashCents: number;
  capitalCents: number;
  totalWealthCents: number;
};

type IdleLeaderboardResponse = {
  serverTime: string;
  totalPlayers: number;
  entries: IdleLeaderboardEntry[];
};

function exactMoney(cents: number) {
  return "$" + (cents / 100).toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchIdleLeaderboard() {
  const response = await fetch(
    "/api/idle/leaderboard",
    {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    },
  );

  if (!response.ok) {
    const body = await response.json().catch(
      () => null,
    ) as { error?: string } | null;
    throw new Error(
      body?.error
      ?? "IDLE_LEADERBOARD_REQUEST_FAILED",
    );
  }

  return response.json() as Promise<
    IdleLeaderboardResponse
  >;
}

const DRAWER_MARKUP = `
  <section class="idle-leaderboard-drawer" data-idle-leaderboard-drawer hidden>
    <div class="idle-leaderboard-backdrop" data-idle-close-leaderboard></div>
    <div class="idle-leaderboard-sheet" role="dialog" aria-modal="true" aria-labelledby="idle-leaderboard-title">
      <div class="idle-leaderboard-head">
        <div>
          <span>CLUB EMPIRE</span>
          <h2 id="idle-leaderboard-title">KULLANICI SIRALAMASI</h2>
          <p>Nakit + Sermaye = Toplam Servet · sıralama toplam servete göre yapılır.</p>
        </div>
        <button type="button" data-idle-close-leaderboard aria-label="Sıralamayı kapat">×</button>
      </div>
      <div class="idle-leaderboard-summary">
        <span>KAYITLI OYUNCU</span>
        <strong data-idle-leaderboard-count>—</strong>
        <small>Sermaye; Stadium, koltuk, üretim hızı ve depo yatırımlarından hesaplanır.</small>
      </div>
      <div class="idle-leaderboard-table-wrap">
        <table class="idle-leaderboard-table">
          <thead>
            <tr>
              <th>SIRA</th>
              <th>KULLANICI</th>
              <th>NAKİT</th>
              <th>SERMAYE</th>
              <th>TOPLAM SERVET</th>
            </tr>
          </thead>
          <tbody data-idle-leaderboard-body>
            <tr><td colspan="5" class="idle-leaderboard-state">Yükleniyor…</td></tr>
          </tbody>
        </table>
      </div>
      <p class="idle-leaderboard-footnote">İlk 1.000 koltuk ücretsiz başlangıç sermayesidir ve yatırıma dahil edilmez. Bilet stoğu satılmamış envanter olduğu için servete eklenmez.</p>
    </div>
  </section>
`;

function rankBadge(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return String(rank);
}

function renderRows(
  body: HTMLTableSectionElement,
  entries: IdleLeaderboardEntry[],
) {
  if (entries.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="idle-leaderboard-state">Henüz sıralanacak kullanıcı yok.</td></tr>';
    return;
  }

  body.innerHTML = entries.map((entry) => `
    <tr data-rank="${entry.rank}">
      <td><span class="idle-leaderboard-rank">${rankBadge(entry.rank)}</span></td>
      <td><strong class="idle-leaderboard-user">${escapeHtml(entry.username)}</strong></td>
      <td>${exactMoney(entry.cashCents)}</td>
      <td>${exactMoney(entry.capitalCents)}</td>
      <td><strong class="idle-leaderboard-total">${exactMoney(entry.totalWealthCents)}</strong></td>
    </tr>
  `).join("");
}

export function createIdleLeaderboardUi(
  root: HTMLElement,
) {
  const backLink =
    root.querySelector<HTMLElement>(".back-link");
  if (!backLink) {
    throw new Error(
      "IDLE_LEADERBOARD_HEADER_MISSING",
    );
  }

  backLink.insertAdjacentHTML(
    "beforebegin",
    `<button type="button" class="idle-leaderboard-open" data-idle-open-leaderboard>
      <span aria-hidden="true">♛</span>
      <strong>SERVET SIRALAMASI</strong>
    </button>`,
  );
  root.insertAdjacentHTML(
    "beforeend",
    DRAWER_MARKUP,
  );

  const drawer =
    root.querySelector<HTMLElement>(
      "[data-idle-leaderboard-drawer]",
    );
  const body =
    root.querySelector<HTMLTableSectionElement>(
      "[data-idle-leaderboard-body]",
    );
  const count =
    root.querySelector<HTMLElement>(
      "[data-idle-leaderboard-count]",
    );
  const openButton =
    root.querySelector<HTMLButtonElement>(
      "[data-idle-open-leaderboard]",
    );

  if (!drawer || !body || !count || !openButton) {
    throw new Error(
      "IDLE_LEADERBOARD_SHELL_MISSING",
    );
  }

  let loading = false;

  const setOpen = (open: boolean) => {
    drawer.hidden = !open;
    document.body.classList.toggle(
      "idle-leaderboard-lock",
      open,
    );
  };

  const load = async () => {
    if (loading) return;
    loading = true;
    body.innerHTML = '<tr><td colspan="5" class="idle-leaderboard-state">Sıralama güncelleniyor…</td></tr>';

    try {
      const response = await fetchIdleLeaderboard();
      count.textContent = response.totalPlayers
        .toLocaleString("en-US");
      renderRows(body, response.entries);
    } catch (error) {
      body.innerHTML = `<tr><td colspan="5" class="idle-leaderboard-state idle-leaderboard-state--error">${escapeHtml(
        error instanceof Error
          ? error.message
          : "IDLE_LEADERBOARD_REQUEST_FAILED",
      )}</td></tr>`;
    } finally {
      loading = false;
    }
  };

  openButton.addEventListener("click", () => {
    setOpen(true);
    void load();
  });

  root
    .querySelectorAll<HTMLElement>(
      "[data-idle-close-leaderboard]",
    )
    .forEach((node) => {
      node.addEventListener(
        "click",
        () => setOpen(false),
      );
    });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !drawer.hidden) {
      setOpen(false);
    }
  });
}
