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
    </div>
    <div class="menu-footer">
      <span class="menu-footer-line"></span>
       <span>ONE LOUNGE · FOUR WORLDS</span>
      <span class="menu-footer-line"></span>
    </div>
  </main>
`;

export function mountHub(app: HTMLElement) {
  app.innerHTML = hubRouteShell(HUB_MARKUP);
}
