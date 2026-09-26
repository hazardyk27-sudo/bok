import Phaser from "phaser";
import { getSymbolDefinition, PAYTABLE, NORMAL_SYMBOLS, BASE_REEL_CONFIG, ANIMATION, NORMAL_PAIR_COPY_CHANCE } from "./config/GameConfig";
import { evaluateBoard } from "./engine/WinEvaluator";
import { calculateSequenceSettlement } from "./engine/SlotEngine";
import { ColumnStream, createColumnStreams, generateInitialBoardWithStreams } from "./engine/BoardGenerator";
import { SeededRNG } from "./engine/RNG";
import { getNormalSymbol, getStackMetadata } from "./engine/types";
import type { Board, BoardCell } from "./engine/types";
import { GameController, formatCredits } from "./game/GameController";
import { createGameScene, GameScene } from "./game/GameScene";

const app = document.querySelector<HTMLDivElement>("#app")!;
const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
const isLab = currentPath === "/lab";
const isSlotRoute = currentPath === "/slot" || isLab;
const isRouletteRoute = currentPath === "/roulette";
const isWitchRoute = currentPath === "/cadi-kazan";
const isBusinessesRoute = currentPath === "/businesses";
const isHubRoute = !isSlotRoute && !isRouletteRoute && !isWitchRoute && !isBusinessesRoute;

const rouletteModule = isRouletteRoute ? await import("./roulette") : null;
const hubModule = isHubRoute ? await import("./hub") : null;
const witchModule = isWitchRoute ? await import("./witchClient") : null;
const businessesModule = isBusinessesRoute ? await import("./idle") : null;

if (!isBusinessesRoute) {
  await import("./styles.css");
}
if (isWitchRoute) {
  await Promise.all([
    import("./witch.css"),
    import("./witch.visual-lock.css"),
  ]);
}

if (isBusinessesRoute) {
  document.documentElement.classList.add("businesses-route");
  document.body.classList.add("businesses-route");
}
const isWinLabelPreview = isLab && new URLSearchParams(window.location.search).get("preview") === "win-labels";
const isMultiplierCollectionPreview = isLab && new URLSearchParams(window.location.search).get("preview") === "multiplier-collection";

const syncSlotVisualViewport = () => {
  if (!isSlotRoute) return;
  const viewport = window.visualViewport;
  const viewportHeight = Math.round(viewport?.height ?? window.innerHeight);
  const viewportTop = Math.max(0, Math.round(viewport?.offsetTop ?? 0));
  const layoutHeight = Math.round(window.innerHeight);
  const browserOcclusion = Math.max(0, layoutHeight - viewportHeight - viewportTop);
  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const portrait = window.innerHeight >= window.innerWidth;

  // Chrome's installed-app WebView can report a viewport that extends behind
  // Android's 3-button navigation bar while env(safe-area-inset-bottom) stays 0.
  // Browsers do not have this mismatch because their visual viewport is already
  // reduced by browser chrome. Keep one usable-height variable for both modes.
  const standaloneBottomGuard = standalone && portrait && browserOcclusion < 8 ? 44 : 0;
  const usableHeight = Math.max(320, viewportHeight - standaloneBottomGuard);
  document.documentElement.style.setProperty("--slot-visual-height", `${usableHeight}px`);
  document.documentElement.dataset.slotDisplayMode = standalone ? "standalone" : "browser";
};

if (isSlotRoute) {
  syncSlotVisualViewport();
  window.visualViewport?.addEventListener("resize", syncSlotVisualViewport, { passive: true });
  window.visualViewport?.addEventListener("scroll", syncSlotVisualViewport, { passive: true });
  window.addEventListener("resize", syncSlotVisualViewport, { passive: true });
  window.addEventListener("orientationchange", syncSlotVisualViewport, { passive: true });
}

const describeStreamCell = (cell: BoardCell) => {
  const symbol = getNormalSymbol(cell);
  if (!symbol) return cell === "SCATTER" ? "SCATTER" : "CORE";
  const metadata = getStackMetadata(cell);
  return metadata
    ? `${symbol}[stack ${metadata.stackId}, ${metadata.stackIndex + 1}/${metadata.stackSize}]`
    : symbol;
};

const routeShell = (content: string, className = "") => `
  <div class="app-shell route-shell ${className}">
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

/**
 * Businesses owns a dedicated visual shell. Do not mount the legacy game-route
 * ambient lights, star field, topbar or demo footer here: those belong to the
 * slot/menu visual system and cause the old blue/violet theme to bleed into
 * the charcoal/green Businesses workspace.
 */
const businessesRouteShell = (content: string) => `
  <div class="app-shell route-shell is-route-page is-businesses-page">
    ${content}
  </div>
`;

if (isRouletteRoute) {
  rouletteModule!.mountRoulette(app);
} else if (isWitchRoute) {
  app.innerHTML = routeShell(witchModule!.CADI_KAZAN_MARKUP, "is-route-page is-witch-page");
} else if (isBusinessesRoute) {
  app.innerHTML = businessesRouteShell(businessesModule!.BUSINESSES_MARKUP);
} else if (isHubRoute) {
  hubModule!.mountHub(app);
} else {
app.innerHTML = `
  <div class="app-shell is-slot-game ${isLab ? "is-lab" : ""} ${isWinLabelPreview ? "is-label-preview" : ""} ${isMultiplierCollectionPreview ? "is-multiplier-preview" : ""}">
    <div class="ambient ambient-a"></div><div class="ambient ambient-b"></div><div class="stars"></div>
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark"><span>✦</span></div>
        <div><div class="brand-name">FAHRİNİN <em>YOLU</em></div><div class="brand-sub">FAHRİYİ BEKLEYECEK KADAR SABIRLI MISIN?</div></div>
      </div>
      <div class="top-actions">
        <button class="icon-button" data-modal="info" aria-label="How to play">?</button>
        <button class="icon-button" data-modal="settings" aria-label="Open menu">☷</button>
      </div>
    </header>
    <main class="game-layout">
      <section class="game-stage">
        <div class="mode-ribbon">
          <div class="hud-stat"><span>BALANCE</span><strong id="balance">$0.00</strong></div>
          <div class="hud-stat"><span>BET</span><strong id="bet">$1.00 FREE</strong></div>
          <div class="hud-stat"><span>TOTAL WIN</span><strong id="win">$0.00</strong></div>
          <div class="hud-stat bonus-stat"><span>BONUS WIN</span><strong id="bonus-win">$0.00</strong></div>
        </div>
        <section id="free-spin-calculation" class="free-spin-calculation" hidden aria-label="Free Spin calculation" aria-live="polite">
          <div class="free-spin-calc-equation">
            <div class="free-spin-calc-value" aria-label="Raw explosion total"><span aria-hidden="true">SYMBOL WIN</span><strong id="free-spin-symbol-win">$0.00</strong></div>
            <span id="free-spin-multiply-operator" class="free-spin-calc-operator">×</span>
            <div class="free-spin-calc-value" aria-label="Multiplier"><span aria-hidden="true">MULTIPLIER</span><strong id="free-spin-multiplier">1x</strong></div>
            <span id="free-spin-equals-operator" class="free-spin-calc-operator">=</span>
            <div class="free-spin-calc-value is-result" aria-label="Spin win"><span aria-hidden="true">SPIN WIN</span><strong id="free-spin-spin-win">$0.00</strong></div>
          </div>
        </section>
        <div class="board-wrap">
          <div id="phaser-board" aria-label="Fahrinin Yolu oyun alanı"></div>
         </div>
          <div id="game-status-badge" class="game-status-badge" hidden aria-live="polite" aria-atomic="true">
            <span class="game-status-icon" aria-hidden="true">✦</span>
            <strong id="free-spins">0</strong>
            <span id="game-status-label">FREE SPINS LEFT</span>
          </div>
          <div id="tumble-win-panel" class="tumble-win-panel" aria-live="polite">
            <span class="tumble-win-label">TUMBLE WIN</span>
            <span id="tumble-symbol-win" class="tumble-symbol-win" hidden aria-hidden="true"></span>
           <strong id="tumble">—</strong>
            <span id="tumble-increment" class="tumble-increment" hidden aria-hidden="true"></span>
            <small id="tumble-meta" class="tumble-meta" hidden aria-hidden="true"></small>
           <div id="tumble-settlement" class="tumble-settlement"></div>
         </div>
         <div class="status-line" aria-live="polite"><span class="status-dot"></span><span id="status">THE GATES ARE QUIET</span></div>
      </section>
    </main>
    <div class="stadium-atmosphere" aria-hidden="true">
      <div class="stadium-starball"></div>
      <div class="stadium-copy"><span>✦</span><small>MORE THAN A GAME</small></div>
    </div>
    <footer class="control-deck">
      <div class="bet-control">
        <span class="eyebrow">BET</span>
        <div class="bet-stepper"><button id="bet-minus" aria-label="Decrease bet">−</button><strong data-bet-display>$1.0 FREE</strong><button id="bet-plus" aria-label="Increase bet">+</button></div>
      </div>
      <div class="auto-control">
        <button id="auto-toggle" class="auto-trigger" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Choose automatic spin count">
          <span id="auto-action-desktop" class="auto-action auto-action-desktop">AUTO</span>
          <span id="auto-action-mobile" class="auto-action auto-action-mobile">START AUTO</span>
          <small id="auto-selection">
            <span id="auto-selection-desktop" class="auto-selection-desktop">25</span>
            <span id="auto-selection-mobile" class="auto-selection-mobile">
              <strong id="auto-selection-value" class="auto-selection-value">25</strong>
              <span id="auto-selection-label" class="auto-selection-label"></span>
            </span>
          </small>
        </button>
        <div id="auto-menu" class="auto-menu" role="menu" aria-label="Automatic spin count" hidden>
          <button type="button" class="auto-option" data-auto-option="10" role="menuitemradio" aria-checked="false">10</button>
          <button type="button" class="auto-option" data-auto-option="25" role="menuitemradio" aria-checked="true">25</button>
          <button type="button" class="auto-option" data-auto-option="50" role="menuitemradio" aria-checked="false">50</button>
          <button type="button" class="auto-option" data-auto-option="100" role="menuitemradio" aria-checked="false">100</button>
          <button type="button" class="auto-option" data-auto-option="250" role="menuitemradio" aria-checked="false">250</button>
          <button type="button" class="auto-option" data-auto-option="500" role="menuitemradio" aria-checked="false">500</button>
        </div>
        <select id="auto-count" class="auto-count-native" aria-hidden="true" tabindex="-1">
          <option value="10">10 SPINS</option><option value="25" selected>25 SPINS</option><option value="50">50 SPINS</option><option value="100">100 SPINS</option><option value="250">250 SPINS</option><option value="500">500 SPINS</option>
        </select>
      </div>
      <button id="spin" class="spin-button"><span class="spin-glow"></span><span class="spin-icon">✦</span><span class="spin-label">SPIN</span><small>ENTER THE CASCADE</small></button>
      <div class="utility-controls">
        <button id="turbo" class="utility-button"><span class="utility-icon">»</span><span>TURBO</span></button>
        <button id="sound" class="utility-button" aria-label="Toggle sound effects"><span class="utility-icon sound-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="presentation"><path d="M5 9v6h4l5 4V5L9 9H5Z"/><path d="M17 9.5c.9.7 1.4 1.5 1.4 2.5s-.5 1.8-1.4 2.5"/></svg></span><span class="sound-label-full">SOUND ON</span><span class="sound-label-compact">SFX</span></button>
      </div>
    </footer>
    <div class="demo-note"><span>✧</span> VIRTUAL CREDITS ONLY <span class="note-separator">•</span> NO REAL-MONEY GAMBLING <span class="note-separator">•</span> RNG DEMO PROTOTYPE</div>
  </div>
   <div id="bonus-overlay" class="bonus-overlay" hidden aria-live="assertive">
     <div class="bonus-ceremony-panel">
       <span class="bonus-eyebrow">GOLDEN REALM</span>
       <div id="bonus-scatter-row" class="bonus-scatter-row" aria-label="Triggering scatter symbols"></div>
       <span id="bonus-trigger-label" class="bonus-trigger-label"></span>
       <strong id="bonus-title" class="bonus-title">FREE SPINS READY</strong>
       <div id="bonus-spin-count" class="bonus-hero-number">10</div>
       <span id="bonus-support" class="bonus-support">FREE SPINS AWARDED</span>
       <small id="bonus-instruction">PRESS START TO ENTER THE GOLDEN REALM</small>
       <button type="button" data-bonus-start>START FREE SPINS</button>
     </div>
   </div>
   <div id="big-win-overlay" class="big-win-overlay" aria-live="assertive"></div>
   <div id="bonus-summary-overlay" class="bonus-summary-overlay" aria-live="assertive"></div>
   <div id="modal-root"></div>
 `;
}

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const modalRoot = byId<HTMLDivElement>("modal-root");

function showModal(name: string | null) {
  if (!name) { modalRoot.innerHTML = ""; return; }
  if (name === "settings") {
    modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal-card settings-modal"><button class="modal-close" data-close>×</button><div class="modal-kicker">CONTROL DECK</div><h2>Settings</h2><p class="modal-lead">Tune the presentation without changing the math.</p>
      <label class="setting-row"><span><b>Sound effects</b><small>WebAudio tones only</small></span><input id="setting-sound" type="checkbox" checked><i></i></label>
      <label class="setting-row"><span><b>Turbo mode</b><small>Shorter animation timing</small></span><input id="setting-turbo" type="checkbox"><i></i></label>
       <label class="volume-row"><span>SFX VOLUME</span><input id="setting-volume" type="range" min="0" max="1" step="0.01" value="0.38"></label>
       <button id="main-menu-button" class="outline-button full menu-exit-button">ANA MENÜ <small>BACK TO GAME SELECT</small></button>
      <div class="modal-footnote">Preferences are stored locally. No secret RNG state or personal data is stored.</div>
    </section></div>`;
    const sound = byId<HTMLInputElement>("setting-sound"); sound.checked = !controller.audio.muted;
    const turbo = byId<HTMLInputElement>("setting-turbo"); turbo.checked = controller.turbo;
    const volume = byId<HTMLInputElement>("setting-volume"); volume.value = String(controller.audio.volume);
    sound.onchange = () => { controller.audio.setMuted(!sound.checked); controller.updateForModal(); };
    turbo.onchange = () => { controller.turbo = turbo.checked; localStorage.setItem("cascade8-turbo", String(turbo.checked)); controller.updateForModal(); };
     volume.oninput = () => controller.audio.setVolume(Number(volume.value));
     byId<HTMLButtonElement>("main-menu-button").onclick = () => { window.location.assign("/"); };
  } else {
    modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal-card info-modal"><button class="modal-close" data-close>×</button><div class="modal-kicker">CASCADE 8 // FIELD GUIDE</div><h2>How to play</h2><p class="modal-lead">Match 8 or more of a club logo anywhere on the field. Winning logos burst, the field falls, and fresh logos tumble in.</p>
      <div class="info-grid"><div><span class="info-number">01</span><b>Drop</b><small>30 symbols land in a 6 × 5 field.</small></div><div><span class="info-number">02</span><b>Match</b><small>Every matching symbol counts, even when separated.</small></div><div><span class="info-number">03</span><b>Tumble</b><small>Wins vanish together and the cascade repeats.</small></div><div><span class="info-number">04</span><b>Bonus</b><small>4 Astral Gates trigger 10 Free Spins.</small></div></div>
       <div class="paytable"><div class="paytable-head"><span>CLUB LOGO</span><span>8</span><span>9</span><span>10</span><span>11</span><span>12+</span></div>${NORMAL_SYMBOLS.map((symbol) => { const paytable = PAYTABLE[symbol.id as keyof typeof PAYTABLE]; return `<div class="paytable-row"><span class="paytable-club" style="color:${symbol.colorHex}"><img src="${import.meta.env.BASE_URL}${symbol.logoPath}" alt="">${symbol.name}</span>${paytable.map((tier) => `<span>${tier.multiplier}x</span>`).join("")}</div>`; }).join("")}</div>
        <div class="info-callout"><b>MULTIPLIER CORES</b><span>Rare Base refill cells and Free Spin cells can spawn physical 2x–1000x Cores. Cores stay locked across the whole tumble sequence, add together at settlement, and apply once to the raw sequence pool.</span></div>
        <div class="modal-footnote">Base Core chance is 1% per eligible Base refill position; Free Spin Scatter chance is 3.5% on initial and refill positions. Free Spin Core chance is 5% on the initial board and 3% per eligible refill position. This is a virtual-credit demo and is not a regulated gaming product.</div>
    </section></div>`;
  }
  modalRoot.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => showModal(null)));
  modalRoot.querySelector(".modal-backdrop")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) showModal(null); });
}

document.querySelectorAll<HTMLElement>("[data-modal]").forEach((button) => button.addEventListener("click", () => showModal(button.dataset.modal ?? null)));

let controller: GameController;
if (isBusinessesRoute) {
  const businessesRoot = document.querySelector<HTMLElement>(".businesses-page");
  if (businessesRoot) new businessesModule!.BusinessesClient(businessesRoot);
} else if (isWitchRoute) {
  const witchRoot = document.querySelector<HTMLElement>(".witch-page");
  if (witchRoot) new witchModule!.WitchClient(witchRoot);
} else if (isSlotRoute) {
const game = createGameScene(byId("phaser-board"));
window.setTimeout(() => {
  const scene = game.scene.getScene("Cascade8GameScene") as GameScene;
  controller = new GameController(scene, {
    balance: byId("balance"), bet: byId("bet"), win: byId("win"), bonusWin: byId("bonus-win"), freeSpins: byId("free-spins"), gameStatusBadge: byId("game-status-badge"), gameStatusLabel: byId("game-status-label"),
    tumble: byId("tumble"), status: byId("status"), spin: byId("spin"), spinLabel: byId("spin").querySelector(".spin-label") as HTMLElement,
     betMinus: byId("bet-minus"), betPlus: byId("bet-plus"), autoToggle: byId("auto-toggle"), autoActionDesktop: byId("auto-action-desktop"), autoActionMobile: byId("auto-action-mobile"), autoSelectionDesktop: byId("auto-selection-desktop"), autoSelectionValue: byId("auto-selection-value"), autoSelectionLabel: byId("auto-selection-label"), autoMenu: byId("auto-menu"), autoCount: byId("auto-count"),
     turbo: byId("turbo"), sound: byId("sound"),
         bonusOverlay: byId("bonus-overlay"), bonusStart: byId("bonus-overlay").querySelector("[data-bonus-start]") as HTMLButtonElement, bonusSpinCount: byId("bonus-spin-count"), bonusScatterRow: byId("bonus-scatter-row"), bonusTriggerLabel: byId("bonus-trigger-label"), bonusTitle: byId("bonus-title"), bonusSupport: byId("bonus-support"), bonusInstruction: byId("bonus-instruction"), freeSpinCalculation: byId("free-spin-calculation"), freeSpinRawWin: byId("free-spin-symbol-win"), freeSpinMultiplier: byId("free-spin-multiplier"), freeSpinFinalWin: byId("free-spin-spin-win"), freeSpinMultiplyOperator: byId("free-spin-multiply-operator"), freeSpinEqualsOperator: byId("free-spin-equals-operator"), tumbleLabel: document.querySelector(".tumble-win-label") as HTMLElement, tumbleSymbolWin: byId("tumble-symbol-win"), tumbleIncrement: byId("tumble-increment"), tumbleMeta: byId("tumble-meta"), tumbleSettlement: byId("tumble-settlement"), tumblePanel: byId("tumble-win-panel"), bigWinOverlay: byId("big-win-overlay"), bonusSummaryOverlay: byId("bonus-summary-overlay"), boardWrap: byId("phaser-board").parentElement!, controlDeck: document.querySelector(".control-deck") as HTMLElement,
    setModal: showModal,
  });
   if (isLab) renderLab(scene);
   if (isLab && new URLSearchParams(window.location.search).has("preview-free-spin")) {
     void controller.previewFreeSpinAccounting();
   }
    if (isLab && new URLSearchParams(window.location.search).get("preview") === "win-labels") {
      byId("lab-result").textContent = "ON-BOARD WIN LABELS // TWO EVENTS → RAW TOTAL";
      window.setTimeout(() => { void controller.previewWinLabels(); }, 500);
    }
     if (isMultiplierCollectionPreview) {
       byId("lab-result").textContent = "MULTIPLIER COLLECTION // RAW 50.00 // 5x → 10x → 500x → 25x // FINAL 540x // 27,000.00";
       window.setTimeout(() => { void controller.previewMultiplierCollection(); }, 500);
     }
    const previewAmount = Number(new URLSearchParams(window.location.search).get("preview-amount"));
    if (isLab && Number.isFinite(previewAmount) && previewAmount > 0) {
      controller.previewBonusLargeWin(Math.round(previewAmount * 100));
    }
}, 80);
}

function renderLab(scene: GameScene) {
  const lab = document.createElement("section");
  lab.className = "lab-panel";
   lab.innerHTML = `<div class="panel-kicker">DEVELOPMENT ROUTE // /lab</div><h1>Animation & Math Lab</h1><p>Deterministic board checks stay separate from live RNG. Use these cards to inspect the frameless Scatter, persistent Cores, paired normal groups and the full win presentation.</p><div class="lab-actions"><button data-lab="seven">7 × S1</button><button data-lab="eight">8 × S1</button><button data-lab="simultaneous">8 × S1 + 8 × S6</button><button data-lab="win-labels">WIN LABELS</button><button data-lab="core">CORE BOARD</button><button data-lab="multiplier-collection">MULTIPLIER SEQUENCE</button><button data-lab="scatter-idle">SCATTER IDLE</button><button data-lab="scatter-fall">SCATTER FALL</button><button data-lab="scatter-land">SCATTER LAND</button><button data-lab="scatter-1">SCATTER #1</button><button data-lab="scatter-2">SCATTER #2</button><button data-lab="scatter-3">SCATTER #3</button><button data-lab="scatter-bonus">BONUS SCATTER</button><button data-lab="tumble">TUMBLE 1.20 → 4.00 → 8.00</button><button data-lab="settlement">8x + 35x</button><button data-lab="free-spin-accounting">FREE SPIN ACCOUNTING</button><button data-lab="free-spin-zero">ZERO-WIN FREE SPIN</button><button data-lab="bonus-4">BONUS CEREMONY // 4</button><button data-lab="bonus-5">BONUS CEREMONY // 5</button><button data-lab="bonus-6">BONUS CEREMONY // 6</button><button data-lab="retrigger-3">RETRIGGER // 3</button><button data-lab="retrigger-4">RETRIGGER // 4</button><button data-lab="retrigger-5">RETRIGGER // 5</button><button data-lab="retrigger-6">RETRIGGER // 6</button><button data-lab="waiting">BONUS WAITING</button><button data-lab="streams">PERSISTENT STREAM</button><button data-lab="pair-stream">PAIR STREAM</button><button data-lab="pairs">PAIR CONTINUATION</button><button data-lab="anti">GROUP INDEPENDENCE</button><button data-lab="timing">TIMINGS</button><button data-lab="base-big">BASE LARGE WIN</button><button data-lab="bonus-big">BONUS LARGE WIN</button></div><div class="lab-result" id="lab-result">Choose a predefined board.</div><pre class="lab-metrics" id="lab-metrics"></pre><div class="special-design"><div class="panel-kicker">SPECIAL SYMBOL DESIGN // MINIMAL MULTIPLIER TILES</div><div class="special-grid"><div class="special-preview normal-preview"><span class="special-state">ORDINARY</span><div class="preview-crest">GS</div><b>GALATASARAY</b></div><div class="special-preview scatter-preview"><span class="special-state">TRANSPARENT CIRCLE</span><img class="scatter-preview-image" src="${import.meta.env.BASE_URL}special-symbols/scatter.png" alt="Golden Scatter symbol"><b>GOLDEN SCATTER</b></div>${[2, 3, 5, 10, 15, 20, 25, 50, 100, 250, 500, 1000].map((value) => `<div class="special-preview core-preview core-${value}"><span class="special-state">${value >= 100 ? "HIGH AURA" : value >= 10 ? "MID AURA" : "LOW AURA"}</span><strong class="core-preview-fallback">${value}x</strong><b>CORE</b></div>`).join("")}</div></div>`;
  document.querySelector(".game-stage")?.append(lab);
   const metrics = lab.querySelector<HTMLElement>("#lab-metrics")!;
   const updateMetrics = () => {
     const current = scene.getDebugMetrics();
      const audio = controller.audio.getDebugMetrics();
      metrics.textContent = `PERF // ${current.fps} FPS // ${current.renderer} // ${current.activeNodes}/${current.boardCells} NODES // ${current.activeTweens} TWEENS // ${current.transientEffects} FX // ${current.activeWinLabels} LABELS // ${current.displayObjects} OBJECTS // ${audio.activeTones} TONES // ${audio.pendingSfxTimers} SFX TIMERS`;
     window.requestAnimationFrame(updateMetrics);
   };
   updateMetrics();
  lab.querySelectorAll<HTMLButtonElement>("[data-lab]").forEach((button) => button.onclick = () => {
    const key = button.dataset.lab;
      if (key === "tumble") {
        void controller.previewTumbleSequence(false);
        byId("lab-result").textContent = "TUMBLE WIN PREVIEW // 1.20 → 4.00 → 8.00 // cumulative raw pool";
        return;
      }
      if (key === "settlement") {
        void controller.previewTumbleSequence(true);
      const settlement = calculateSequenceSettlement(8, [10, 25]);
      byId("lab-result").textContent = `RAW POOL 8.00x × CORES ${settlement.combinedCoreMultiplier}x = FINAL ${settlement.finalWinMultiplier}x // SETTLED ONCE`;
      return;
    }
      if (key === "free-spin-accounting") {
       void controller.previewFreeSpinAccounting();
       byId("lab-result").textContent = "FREE SPIN ACCOUNTING // 20.00 + 30.00 × 10x = 500.00 // BONUS TOTAL 400.00 → 900.00";
       return;
     }
      if (key === "win-labels") {
        app.classList.add("is-label-preview");
        void controller.previewWinLabels();
        byId("lab-result").textContent = "ON-BOARD WIN LABELS // TWO EVENTS → RAW TOTAL";
        return;
      }
      if (key === "multiplier-collection") {
        void controller.previewMultiplierCollection();
        byId("lab-result").textContent = "MULTIPLIER COLLECTION // RAW 50.00 // 5x → 10x → 500x → 25x // FINAL 540x // 27,000.00";
        return;
      }
      if (key === "free-spin-zero") {
        void controller.previewZeroWinFreeSpin();
        byId("lab-result").textContent = "ZERO-WIN FREE SPIN // NO CORE OR EQUATION CEREMONY // SETTLE THEN ADVANCE";
        return;
      }
     if (key === "bonus-4" || key === "bonus-5" || key === "bonus-6") {
       const scatterCount = Number(key.slice(-1));
       void controller.previewBonusTriggerCeremony(scatterCount);
       byId("lab-result").textContent = `BONUS TRIGGER CEREMONY // ${scatterCount} SCATTERS // BOARD → CENTER → FREE SPINS READY`;
       return;
     }
     if (key?.startsWith("retrigger-")) {
       const count = Number(key.slice(-1));
       void controller.previewFreeSpinRetriggerCeremony(count);
       byId("lab-result").textContent = `FREE SPIN RETRIGGER // ${count} SCATTERS GATHER → +5 FREE SPINS → EXPLICIT CONTINUE`;
       return;
     }
     if (key === "base-big") {
       controller.previewBaseLargeWin();
         byId("lab-result").textContent = "BASE GAME LARGE WIN // CEREMONY OVERLAY";
        return;
      }
      if (key === "bonus-big") {
        controller.previewBonusLargeWin();
        byId("lab-result").textContent = "BONUS FINAL LARGE WIN // CALCULATION → OVERLAY → TOTAL TRANSFER";
        return;
      }
      if (key === "waiting") {
        byId("lab-result").textContent = "BONUS_WAITING_FOR_START // no Free Spin board is generated until START FREE SPINS";
        return;
      }
       if (key === "timing") {
        byId("lab-result").textContent = `NORMAL TIMINGS // drop ${ANIMATION.initialDrop}ms // highlight ${ANIMATION.winHighlight}ms // burst ${ANIMATION.burst}ms // refill ${ANIMATION.refill}ms // turbo scales centrally`;
        return;
      }
       if (key?.startsWith("scatter-")) {
         const scatterCount = key === "scatter-1" || key === "scatter-idle" || key === "scatter-fall" || key === "scatter-land" ? 1 : key === "scatter-2" ? 2 : key === "scatter-3" ? 3 : 4;
         const values = Array(30).fill("S2");
         const placements = [[2, 1], [1, 3], [3, 4], [0, 5]];
         placements.slice(0, scatterCount).forEach(([row, col]) => { values[row * 6 + col] = "SCATTER"; });
         const scatterBoard = Array.from({ length: 5 }, (_, row) => values.slice(row * 6, row * 6 + 6)) as Board;
         scene.renderBoard(scatterBoard);
         if (key === "scatter-fall") void scene.animateDrop(520);
         if (key === "scatter-land") { scene.renderBoard(scatterBoard); void scene.animateDrop(160); }
         byId("lab-result").textContent = `${key.toUpperCase()} // ${scatterCount} GOLDEN TROPHY${scatterCount === 1 ? "" : "S"} // ordinary football symbol shown beside it`;
         return;
       }
       if (key === "streams") {
        const seeded = generateInitialBoardWithStreams(new SeededRNG("lab-streams"), "base");
        const first = seeded.streams[0].next(1, "BASE_REFILL");
        const second = seeded.streams[0].next(1, "BASE_REFILL");
         byId("lab-result").textContent = `PERSISTENT STREAM // initial ${seeded.board.length}x${seeded.board[0].length} board // next cells ${describeStreamCell(first[0])} → ${describeStreamCell(second[0])}`;
        return;
      }
       if (key === "pair-stream") {
         const stream = createColumnStreams(new SeededRNG("lab-pair-stream"), "base")[0];
        const values = stream.next(10, "BASE_REFILL");
         byId("lab-result").textContent = `PAIR STREAM // ${values.map(describeStreamCell).join("  →  ")} // second-position copy branch ${(NORMAL_PAIR_COPY_CHANCE * 100).toFixed(0)}%`;
        return;
      }
      if (key === "pairs") {
           const rolls = [0.999999, 0.999999, 0.1];
          const stream = new ColumnStream({ nextFloat: () => rolls.shift() ?? 0.999999 }, { ...BASE_REEL_CONFIG, symbolWeights: [{ value: "S3", weight: 1 }] }, 0);
        const first = stream.next(1, "BASE_REFILL")[0];
        const second = stream.next(1, "BASE_REFILL")[0];
         byId("lab-result").textContent = `PAIR CONTINUATION // request 1: ${describeStreamCell(first)} // request 2: ${describeStreamCell(second)} // same stackId proves persistent second position`;
        return;
      }
      if (key === "anti") {
        const stream = createColumnStreams(new SeededRNG("lab-anti"), "base")[0];
        const values = stream.next(500, "BASE_REFILL");
        let maximum = 0;
        let current = 0;
         let previous: string | null = null;
         values.forEach((value) => { const symbol = getNormalSymbol(value); current = symbol && symbol === previous ? current + 1 : symbol ? 1 : 0; maximum = Math.max(maximum, current); previous = symbol; });
           byId("lab-result").textContent = `GROUP INDEPENDENCE // 500 incoming cells // maximum contiguous normal streak ${maximum} // each new pair starts with fresh weighted RNG`;
       return;
     }
     const values = key === "core"
       ? [...Array(8).fill("S8"), { kind: "MULTIPLIER_CORE", value: 2 }, { kind: "MULTIPLIER_CORE", value: 10 }, { kind: "MULTIPLIER_CORE", value: 100 }, ...Array(19).fill("S2")]
       : key === "seven" ? [...Array(7).fill("S1"), ...Array(23).fill("S2")] : key === "eight" ? [...Array(8).fill("S1"), ...Array(22).fill("S2")] : [...Array(8).fill("S1"), ...Array(8).fill("S6"), ...Array(14).fill("S2")];
    const board = Array.from({ length: 5 }, (_, row) => values.slice(row * 6, row * 6 + 6)) as Board;
    const evaluation = evaluateBoard(board);
    scene.renderBoard(board, evaluation.winningCells); scene.highlightCells(evaluation.winningCells, 380);
    byId("lab-result").textContent = `${evaluation.winningSymbols.length ? evaluation.winningSymbols.join(" + ") : "NO WIN"} // ${evaluation.winningCells.length} CELLS // ${evaluation.rawPayoutMultiplier.toFixed(2)}x`;
   });
 }
