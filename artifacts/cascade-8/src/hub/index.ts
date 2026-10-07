import { mountHubLeaderboard } from "./leaderboard";

type HubProfileUser = {
  email: string;
  username: string;
  userCode: string;
  balanceCents: number;
};

type HubProfileResponse = {
  user: HubProfileUser | null;
};

const formatHubMoney = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const hubRouteShell = (content: string) => `
  <div class="app-shell route-shell is-route-page is-menu-page">
    <div class="ambient ambient-a"></div><div class="ambient ambient-b"></div><div class="stars"></div>
    <header class="topbar route-topbar">
      <a class="brand brand-link" href="/" aria-label="Fahrinin Yolu ana menü">
        <div class="brand-mark"><span>✦</span></div>
        <div><div class="brand-name">FAHRİNİN <em>YOLU</em></div><div class="brand-sub">FAHRİYİ BEKLEYECEK KADAR SABIRLI MISIN?</div></div>
      </a>
      <span class="route-context">SELECT YOUR GAME</span>
    </header>
    ${content}
    <div class="demo-note"><span>✧</span> VIRTUAL CREDITS ONLY <span class="note-separator">•</span> NO REAL-MONEY GAMBLING <span class="note-separator">•</span> RNG DEMO PROTOTYPE</div>
  </div>
`;

export const HUB_MARKUP = `
  <main class="game-menu" aria-labelledby="game-menu-title">
    <div class="menu-intro">
      <span class="menu-kicker">FAHRİNİN YOLU // PLAY LOUNGE</span>
      <h1 id="game-menu-title">OYUNUNU <em>SEÇ</em></h1>
      <p>Gece açıldı. Dört ayrı dünya seni bekliyor. Hangi dünyaya gireceğine karar ver.</p>
    </div>

    <div class="game-choice-grid">
      <a class="game-choice game-choice-slot" href="/slot">
        <span class="choice-status is-live">AVAILABLE NOW</span>
        <span class="choice-art choice-art-slot" aria-hidden="true"><span>✦</span></span>
        <span class="choice-copy">
          <span class="choice-overline">CASCADE 8</span>
          <strong>FAHRİNİN YOLU</strong>
          <span class="choice-type">SLOT EXPERIENCE</span>
        </span>
        <span class="choice-footer"><span>30 SYMBOL FIELD</span><span class="choice-arrow" aria-hidden="true">→</span></span>
      </a>

      <a class="game-choice game-choice-roulette" href="/roulette" aria-label="Roulette oyununu aç">
        <span class="choice-status is-live">AVAILABLE NOW</span>
        <span class="choice-art choice-art-roulette" aria-hidden="true"><span>R</span><i></i><b></b></span>
        <span class="choice-copy">
          <span class="choice-overline">THE NIGHT TABLE</span>
          <strong>ROULETTE</strong>
          <span class="choice-type">TABLE EXPERIENCE</span>
        </span>
        <span class="choice-footer"><span>LIVE TABLE</span><span class="choice-arrow" aria-hidden="true">→</span></span>
      </a>

      <a class="game-choice game-choice-witch" href="/cadi-kazan" aria-label="Cadı Kazan oyununu aç">
        <span class="choice-status is-live">AVAILABLE NOW</span>
        <span class="choice-art choice-art-witch" aria-hidden="true"><span>✧</span></span>
        <span class="choice-copy">
          <span class="choice-overline">LUCKY SCRATCH</span>
          <strong>CADI KAZAN</strong>
          <span class="choice-type">SCRATCH EXPERIENCE</span>
        </span>
        <span class="choice-footer"><span>5 OR 25 CELLS</span><span class="choice-arrow" aria-hidden="true">→</span></span>
      </a>

      <a class="game-choice game-choice-businesses" href="/businesses" aria-label="İşletmeler ekranını aç">
        <span class="choice-status is-live">AVAILABLE NOW</span>
        <span class="choice-art choice-art-businesses" aria-hidden="true"><span>▦</span></span>
        <span class="choice-copy">
          <span class="choice-overline">IDLE EMPIRE</span>
          <strong>İŞLETMELER</strong>
          <span class="choice-type">BUSINESS EXPERIENCE</span>
        </span>
        <span class="choice-footer"><span>BUILD & EARN</span><span class="choice-arrow" aria-hidden="true">→</span></span>
      </a>

      <a class="game-choice game-choice-profile" href="/account" aria-label="Profil ve hesap ekranını aç" data-hub-profile-card>
        <span class="choice-status is-live" data-hub-profile-status>PLAYER PROFILE</span>
        <span class="choice-art choice-art-profile" aria-hidden="true"><span data-hub-profile-avatar>◎</span></span>
        <span class="choice-copy">
          <span class="choice-overline" data-hub-profile-overline>TEK HESAP · TÜM OYUNLAR</span>
          <strong data-hub-profile-name>GİRİŞ / KAYIT</strong>
          <span class="choice-type" data-hub-profile-meta>EMAIL · USERNAME · USERCODE</span>
        </span>

        <span
          class="hub-profile-wealth"
          role="button"
          tabindex="0"
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-label="Servet sıralamasını aç"
          data-hub-open-leaderboard
        >
          <span class="hub-profile-wealth-head">
            <span>
              <small>GLOBAL SIRA</small>
              <strong data-hub-profile-rank>—</strong>
            </span>
            <span class="hub-profile-wealth-total">
              <small>TOPLAM SERVET</small>
              <strong data-hub-profile-wealth-total>—</strong>
            </span>
          </span>
          <span class="hub-profile-wealth-breakdown">
            <span>
              <small>NAKİT</small>
              <strong data-hub-profile-cash>—</strong>
            </span>
            <span>
              <small>SERMAYE</small>
              <strong data-hub-profile-capital>—</strong>
            </span>
          </span>
          <span class="hub-profile-wealth-action">
            <span>SERVET SIRALAMASINI GÖR</span>
            <span aria-hidden="true">↗</span>
          </span>
        </span>

        <span class="choice-footer">
          <span data-hub-profile-footer>PROFİLİ AÇ</span>
          <span class="choice-arrow" aria-hidden="true">→</span>
        </span>
      </a>
    </div>

    <div class="menu-footer">
      <span class="menu-footer-line"></span>
      <span>ONE LOUNGE · FOUR WORLDS · ONE PROFILE</span>
      <span class="menu-footer-line"></span>
    </div>
  </main>
`;

function hydrateProfileCard(app: HTMLElement, user: HubProfileUser | null) {
  const status = app.querySelector<HTMLElement>("[data-hub-profile-status]");
  const avatar = app.querySelector<HTMLElement>("[data-hub-profile-avatar]");
  const overline = app.querySelector<HTMLElement>("[data-hub-profile-overline]");
  const name = app.querySelector<HTMLElement>("[data-hub-profile-name]");
  const meta = app.querySelector<HTMLElement>("[data-hub-profile-meta]");
  const footer = app.querySelector<HTMLElement>("[data-hub-profile-footer]");

  if (!status || !avatar || !overline || !name || !meta || !footer) return;

  if (!user) {
    status.textContent = "PLAYER PROFILE";
    avatar.textContent = "◎";
    overline.textContent = "TEK HESAP · TÜM OYUNLAR";
    name.textContent = "GİRİŞ / KAYIT";
    meta.textContent = "EMAIL · USERNAME · USERCODE";
    footer.textContent = "PROFİLİ AÇ";
    return;
  }

  status.textContent = "SIGNED IN";
  avatar.textContent = user.username.slice(0, 1).toUpperCase() || "P";
  overline.textContent = `${user.userCode} · ${formatHubMoney(user.balanceCents)}`;
  name.textContent = user.username;
  meta.textContent = user.email;
  footer.textContent = "PROFİL · ŞİFRE · BAKİYE";
}

export function mountHub(app: HTMLElement) {
  app.innerHTML = hubRouteShell(HUB_MARKUP);
  hydrateProfileCard(app, null);
  const leaderboard = mountHubLeaderboard(app);

  void fetch("/api/auth/me", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const body = await response.json() as HubProfileResponse;
      return body.user;
    })
    .then((user) => {
      hydrateProfileCard(app, user);
      leaderboard.setCurrentUsername(user?.username ?? null);
    })
    .catch(() => {
      hydrateProfileCard(app, null);
      leaderboard.setCurrentUsername(null);
    });
}
