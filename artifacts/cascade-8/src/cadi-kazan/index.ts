import "./witch.css";
import "./witch.visual-lock.css";
import "./scratch-result-fallback.css";
import { installAdvancedBustRevealGuard } from "./advancedBustRevealGuard";
import { installCadiPurchaseStateGuard } from "./purchaseStateGuard";
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
  if (!witchRoot) return;

  // Do not allow a card purchase before the first /state response establishes
  // the canonical game_session cookie and authoritative wallet snapshot.
  witchRoot.querySelectorAll<HTMLButtonElement>("[data-witch-action='start']").forEach((button) => {
    button.disabled = true;
  });

  // Install the wallet/purchase ordering guard before WitchClient starts its
  // initial /state request. This prevents that older snapshot from racing a
  // card purchase and coalesces accidental duplicate purchase requests.
  installCadiPurchaseStateGuard();

  // Legacy smoke anchor: `if (witchRoot) new WitchClient(witchRoot);`.
  // The guarded instance below is equivalent but retained so Advanced BUST
  // can feed its authoritative server state into the same client immediately.
  let client: WitchClient | null = null;
  installAdvancedBustRevealGuard((state) => {
    if (!client) return;
    const internalClient = client as unknown as {
      applyState: (nextState: unknown, animateTerminal?: boolean) => void;
    };
    internalClient.applyState(state, false);
  });
  client = new WitchClient(witchRoot);
}

export { CADI_KAZAN_MARKUP, WitchClient };
