import Phaser from "phaser";
import "./styles.css";
import { getSymbolDefinition, PAYTABLE, NORMAL_SYMBOLS } from "./config/GameConfig";
import { evaluateBoard } from "./engine/WinEvaluator";
import type { Board } from "./engine/types";
import { GameController, formatCredits } from "./game/GameController";
import { createGameScene, GameScene } from "./game/GameScene";

const app = document.querySelector<HTMLDivElement>("#app")!;
const isLab = window.location.pathname === "/lab";

app.innerHTML = `
  <div class="app-shell ${isLab ? "is-lab" : ""}">
    <div class="ambient ambient-a"></div><div class="ambient ambient-b"></div><div class="stars"></div>
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark"><span>✦</span></div>
        <div><div class="brand-name">CASCADE <em>8</em></div><div class="brand-sub">ASTRAL TUMBLE SYSTEM</div></div>
      </div>
      <div class="top-actions">
        <div class="balance-card"><span>BALANCE</span><strong id="balance">10,000.00</strong><small>DEMO CREDITS</small></div>
        <button class="icon-button" data-modal="settings" aria-label="Open settings">☷</button>
      </div>
    </header>
    <main class="game-layout">
      <section class="game-stage">
        <div class="mode-ribbon">
          <div><span class="eyebrow">MODE</span><strong id="mode-label">BASE REALM</strong></div>
          <div class="mode-stat"><span>CURRENT WIN</span><strong id="win">0.00</strong></div>
          <div class="mode-stat bonus-stat"><span>BONUS WIN</span><strong id="bonus-win">0.00</strong></div>
          <div class="free-counter"><span>FREE SPINS LEFT</span><strong id="free-spins">0</strong></div>
        </div>
        <div class="board-wrap">
          <div class="board-caption"><span class="caption-line"></span><span>THE CELESTIAL FIELD</span><span class="caption-line"></span></div>
          <div id="phaser-board" aria-label="Cascade 8 game board"></div>
          <div class="board-floor"></div>
          <div id="bonus-overlay" class="bonus-overlay" hidden aria-live="assertive"><span>✦ BONUS UNLOCKED ✦</span><strong>FREE SPINS READY</strong><small>PRESS SPIN TO ENTER THE GOLDEN REALM</small></div>
          <div id="win-announcer" class="win-announcer" aria-live="polite"></div>
        </div>
        <div class="status-line"><span class="status-dot"></span><span id="status">THE GATES ARE QUIET</span><span id="tumble">—</span></div>
      </section>
      <aside class="side-panel">
        <div class="panel-kicker">LIVE CONFIGURATION</div>
        <div class="side-card">
          <div class="side-card-label">WAYS TO WIN</div>
          <div class="side-stat"><strong>8+</strong><span>matching symbols anywhere</span></div>
          <div class="side-rule"></div>
          <div class="side-card-label">ORIGINATING CAP</div>
          <div class="side-stat"><strong>5000<small>x</small></strong><span>maximum win per spin</span></div>
        </div>
        <div class="legend-card">
          <div class="panel-kicker">SYMBOL FREQUENCY</div>
          ${NORMAL_SYMBOLS.map((symbol) => `<div class="legend-row"><img class="legend-logo" src="${import.meta.env.BASE_URL}${symbol.logoPath}" alt=""><span>${symbol.name}</span><b>${symbol.weight.toFixed(1)}%</b></div>`).join("")}
        </div>
        <button class="outline-button full" data-modal="info"><span>▣</span> HOW TO PLAY <b>↗</b></button>
      </aside>
    </main>
    <footer class="control-deck">
      <div class="bet-control">
        <span class="eyebrow">STAKE</span>
        <div class="bet-stepper"><button id="bet-minus" aria-label="Decrease bet">−</button><strong id="bet">1.00</strong><button id="bet-plus" aria-label="Increase bet">+</button></div>
      </div>
      <div class="auto-control">
        <span class="eyebrow">AUTO RUN</span>
        <div class="auto-row"><select id="auto-count" aria-label="Automatic spin count"><option value="25">25 SPINS</option><option value="50">50 SPINS</option><option value="75">75 SPINS</option><option value="100">100 SPINS</option></select><button id="auto-start">START AUTO</button></div>
        <small id="auto-status">BET 1.00 / READY</small>
      </div>
      <button id="spin" class="spin-button"><span class="spin-glow"></span><span class="spin-icon">✦</span><span class="spin-label">SPIN</span><small>ENTER THE CASCADE</small></button>
      <div class="utility-controls">
        <button id="turbo" class="utility-button"><span class="utility-icon">»</span><span>TURBO</span></button>
        <button id="sound" class="utility-button"><span class="utility-icon">◒</span><span>SOUND ON</span></button>
        <button class="utility-button" data-modal="info"><span class="utility-icon">?</span><span>INFO</span></button>
      </div>
    </footer>
    <div class="demo-note"><span>✧</span> VIRTUAL CREDITS ONLY <span class="note-separator">•</span> NO REAL-MONEY GAMBLING <span class="note-separator">•</span> RNG DEMO PROTOTYPE</div>
  </div>
  <div id="modal-root"></div>
`;

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const modalRoot = byId<HTMLDivElement>("modal-root");

function showModal(name: string | null) {
  if (!name) { modalRoot.innerHTML = ""; return; }
  if (name === "settings") {
    modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal-card settings-modal"><button class="modal-close" data-close>×</button><div class="modal-kicker">CONTROL DECK</div><h2>Settings</h2><p class="modal-lead">Tune the presentation without changing the math.</p>
      <label class="setting-row"><span><b>Sound effects</b><small>WebAudio tones only</small></span><input id="setting-sound" type="checkbox" checked><i></i></label>
      <label class="setting-row"><span><b>Turbo mode</b><small>Shorter animation timing</small></span><input id="setting-turbo" type="checkbox"><i></i></label>
      <label class="setting-row"><span><b>Reduced motion</b><small>Respect system accessibility preference</small></span><input id="setting-motion" type="checkbox"><i></i></label>
      <label class="volume-row"><span>VOLUME</span><input id="setting-volume" type="range" min="0" max="1" step="0.01" value="0.38"></label>
      <button id="demo-reset" class="outline-button full">RESET DEMO CREDITS <small>RESTORE 10,000.00</small></button>
      <div class="modal-footnote">Preferences are stored locally. No secret RNG state or personal data is stored.</div>
    </section></div>`;
    const sound = byId<HTMLInputElement>("setting-sound"); sound.checked = !controller.audio.muted;
    const turbo = byId<HTMLInputElement>("setting-turbo"); turbo.checked = controller.turbo;
    const motion = byId<HTMLInputElement>("setting-motion"); motion.checked = controller.reducedMotion;
    const volume = byId<HTMLInputElement>("setting-volume"); volume.value = String(controller.audio.volume);
    sound.onchange = () => { controller.audio.setMuted(!sound.checked); controller.updateForModal(); };
    turbo.onchange = () => { controller.turbo = turbo.checked; localStorage.setItem("cascade8-turbo", String(turbo.checked)); controller.updateForModal(); };
    motion.onchange = () => { controller.reducedMotion = motion.checked; localStorage.setItem("cascade8-reduced-motion", String(motion.checked)); };
    volume.oninput = () => controller.audio.setVolume(Number(volume.value));
    byId<HTMLButtonElement>("demo-reset").onclick = () => { controller.resetDemo(); showModal(null); };
  } else {
    modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal-card info-modal"><button class="modal-close" data-close>×</button><div class="modal-kicker">CASCADE 8 // FIELD GUIDE</div><h2>How to play</h2><p class="modal-lead">Match 8 or more of a club logo anywhere on the field. Winning logos burst, the field falls, and fresh logos tumble in.</p>
      <div class="info-grid"><div><span class="info-number">01</span><b>Drop</b><small>30 symbols land in a 6 × 5 field.</small></div><div><span class="info-number">02</span><b>Match</b><small>Every matching symbol counts, even when separated.</small></div><div><span class="info-number">03</span><b>Tumble</b><small>Wins vanish together and the cascade repeats.</small></div><div><span class="info-number">04</span><b>Bonus</b><small>4 Astral Gates trigger 10 Free Spins.</small></div></div>
       <div class="paytable"><div class="paytable-head"><span>CLUB LOGO</span><span>8 — 9</span><span>10 — 11</span><span>12+</span></div>${NORMAL_SYMBOLS.map((symbol) => { const paytable = PAYTABLE[symbol.id as keyof typeof PAYTABLE]; return `<div class="paytable-row"><span class="paytable-club" style="color:${symbol.colorHex}"><img src="${import.meta.env.BASE_URL}${symbol.logoPath}" alt="">${symbol.name}</span><span>${paytable[0].multiplier}x</span><span>${paytable[1].multiplier}x</span><span>${paytable[2].multiplier}x</span></div>`; }).join("")}</div>
      <div class="info-callout"><b>MULTIPLIER CRYSTALS</b><span>Free Spin wins can reveal 2x–100x crystals. Revealed values add together and multiply that tumble only.</span></div>
      <div class="modal-footnote">Measured RTP: 95.7117% over 1,000,000 spins (seed 20260913). This is a virtual-credit demo and is not a regulated gaming product.</div>
    </section></div>`;
  }
  modalRoot.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => showModal(null)));
  modalRoot.querySelector(".modal-backdrop")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) showModal(null); });
}

document.querySelectorAll<HTMLElement>("[data-modal]").forEach((button) => button.addEventListener("click", () => showModal(button.dataset.modal ?? null)));

const game = createGameScene(byId("phaser-board"));
let controller: GameController;
window.setTimeout(() => {
  const scene = game.scene.getScene("Cascade8GameScene") as GameScene;
  controller = new GameController(scene, {
    balance: byId("balance"), bet: byId("bet"), win: byId("win"), bonusWin: byId("bonus-win"), freeSpins: byId("free-spins"),
    tumble: byId("tumble"), status: byId("status"), spin: byId("spin"), spinLabel: byId("spin").querySelector(".spin-label") as HTMLElement,
    betMinus: byId("bet-minus"), betPlus: byId("bet-plus"), autoCount: byId("auto-count"), autoStart: byId("auto-start"), autoStatus: byId("auto-status"),
    turbo: byId("turbo"), sound: byId("sound"),
    bonusOverlay: byId("bonus-overlay"), winAnnouncer: byId("win-announcer"), boardWrap: byId("phaser-board").parentElement!,
    setModal: showModal,
  });
  if (isLab) renderLab(scene);
}, 80);

function renderLab(scene: GameScene) {
  const lab = document.createElement("section");
  lab.className = "lab-panel";
  lab.innerHTML = `<div class="panel-kicker">DEVELOPMENT ROUTE // /lab</div><h1>Animation & Math Lab</h1><p>Deterministic board checks stay separate from live RNG. Use these cards to inspect the 8-symbol threshold and simultaneous removal logic.</p><div class="lab-actions"><button data-lab="seven">7 × S1</button><button data-lab="eight">8 × S1</button><button data-lab="simultaneous">8 × S1 + 8 × S6</button></div><div class="lab-result" id="lab-result">Choose a predefined board.</div>`;
  document.querySelector(".game-stage")?.append(lab);
  lab.querySelectorAll<HTMLButtonElement>("[data-lab]").forEach((button) => button.onclick = () => {
    const key = button.dataset.lab;
    const values = key === "seven" ? [...Array(7).fill("S1"), ...Array(23).fill("S2")] : key === "eight" ? [...Array(8).fill("S1"), ...Array(22).fill("S2")] : [...Array(8).fill("S1"), ...Array(8).fill("S6"), ...Array(14).fill("S2")];
    const board = Array.from({ length: 5 }, (_, row) => values.slice(row * 6, row * 6 + 6)) as Board;
    const evaluation = evaluateBoard(board);
    scene.renderBoard(board, evaluation.winningCells); scene.highlightCells(evaluation.winningCells, 380);
    byId("lab-result").textContent = `${evaluation.winningSymbols.length ? evaluation.winningSymbols.join(" + ") : "NO WIN"} // ${evaluation.winningCells.length} CELLS // ${evaluation.rawPayoutMultiplier.toFixed(2)}x`;
  });
}