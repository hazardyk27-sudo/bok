import "./witch.css";
import "./witch.visual-lock.css";
import { CADI_KAZAN_MARKUP, WitchClient } from "./witchClient";

const cadiKazanRouteShell = (content: string) => `
  <div class="app-shell route-shell is-route-page is-witch-page">
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

export function mountCadiKazan(app: HTMLElement) {
  app.innerHTML = cadiKazanRouteShell(CADI_KAZAN_MARKUP);
  const witchRoot = app.querySelector<HTMLElement>(".witch-page");
  if (witchRoot) new WitchClient(witchRoot);
}

export { CADI_KAZAN_MARKUP, WitchClient };
