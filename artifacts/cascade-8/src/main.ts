import Phaser from "phaser";
import "./styles.css";
import { getSymbolDefinition, PAYTABLE, NORMAL_SYMBOLS, BASE_REEL_CONFIG, ANIMATION } from "./config/GameConfig";
import { evaluateBoard } from "./engine/WinEvaluator";
import { calculateSequenceSettlement } from "./engine/SlotEngine";
import { ColumnStream, createColumnStreams, generateInitialBoardWithStreams } from "./engine/BoardGenerator";
import { SeededRNG } from "./engine/RNG";
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
        <button class="icon-button" data-modal="info" aria-label="How to play">?</button>
        <button class="icon-button" data-modal="settings" aria-label="Open settings">☷</button>
      </div>
    </header>
    <main class="game-layout">
      <section class="game-stage">
        <div class="mode-ribbon">
          <div class="hud-stat"><span>BALANCE</span><strong id="balance">10,000.00</strong></div>
          <div class="hud-stat"><span>BET</span><strong id="bet">1.00</strong></div>
          <div class="hud-stat"><span>TOTAL WIN</span><strong id="win">0.00</strong></div>
          <div class="hud-stat bonus-stat"><span>BONUS WIN</span><strong id="bonus-win">0.00</strong></div>
          <div class="free-counter"><span>FREE SPINS</span><strong id="free-spins">0</strong></div>
        </div>
        <div class="board-wrap">
          <div class="board-caption"><span>6 × 5 CASCADE FIELD</span></div>
          <div id="phaser-board" aria-label="Cascade 8 game board"></div>
          <div id="bonus-overlay" class="bonus-overlay" hidden aria-live="assertive"><span>✦ BONUS UNLOCKED ✦</span><strong>FREE SPINS READY</strong><small>PRESS SPIN TO ENTER THE GOLDEN REALM</small></div>
        </div>
         <div id="tumble-win-panel" class="tumble-win-panel" aria-live="polite">
           <span class="tumble-win-label">TUMBLE WIN</span>
            <span id="tumble-symbol-win" class="tumble-symbol-win"></span>
           <strong id="tumble">—</strong>
           <span id="tumble-increment" class="tumble-increment"></span>
           <small id="tumble-meta" class="tumble-meta">GOOD LUCK</small>
           <div id="tumble-settlement" class="tumble-settlement"></div>
         </div>
         <div class="status-line" aria-live="polite"><span class="status-dot"></span><span id="status">THE GATES ARE QUIET</span></div>
      </section>
    </main>
    <footer class="control-deck">
      <div class="bet-control">
        <span class="eyebrow">BET</span>
        <div class="bet-stepper"><button id="bet-minus" aria-label="Decrease bet">−</button><strong data-bet-display>1.00</strong><button id="bet-plus" aria-label="Increase bet">+</button></div>
      </div>
      <div class="auto-control">
        <span class="eyebrow">AUTO</span>
        <div class="auto-row"><select id="auto-count" aria-label="Automatic spin count"><option value="25">25 SPINS</option><option value="50">50 SPINS</option><option value="75">75 SPINS</option><option value="100">100 SPINS</option></select><button id="auto-start">START AUTO</button></div>
        <small id="auto-status">BET 1.00 / READY</small>
      </div>
      <button id="spin" class="spin-button"><span class="spin-glow"></span><span class="spin-icon">✦</span><span class="spin-label">SPIN</span><small>ENTER THE CASCADE</small></button>
      <div class="utility-controls">
        <button id="turbo" class="utility-button"><span class="utility-icon">»</span><span>TURBO</span></button>
        <button id="sound" class="utility-button"><span class="utility-icon">◒</span><span>SOUND ON</span></button>
      </div>
    </footer>
    <div class="demo-note"><span>✧</span> VIRTUAL CREDITS ONLY <span class="note-separator">•</span> NO REAL-MONEY GAMBLING <span class="note-separator">•</span> RNG DEMO PROTOTYPE</div>
  </div>
   <div id="big-win-overlay" class="big-win-overlay" aria-live="assertive"></div>
   <div id="bonus-summary-overlay" class="bonus-summary-overlay" aria-live="assertive"></div>
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
       <label class="volume-row"><span>SFX VOLUME</span><input id="setting-volume" type="range" min="0" max="1" step="0.01" value="0.38"></label>
       <label class="volume-row"><span>MUSIC VOLUME</span><input id="setting-music-volume" type="range" min="0" max="1" step="0.01" value="0.18"></label>
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
     const musicVolume = byId<HTMLInputElement>("setting-music-volume"); musicVolume.value = String(controller.audio.musicVolume);
     musicVolume.oninput = () => controller.audio.setMusicVolume(Number(musicVolume.value));
    byId<HTMLButtonElement>("demo-reset").onclick = () => { controller.resetDemo(); showModal(null); };
  } else {
    modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal-card info-modal"><button class="modal-close" data-close>×</button><div class="modal-kicker">CASCADE 8 // FIELD GUIDE</div><h2>How to play</h2><p class="modal-lead">Match 8 or more of a club logo anywhere on the field. Winning logos burst, the field falls, and fresh logos tumble in.</p>
      <div class="info-grid"><div><span class="info-number">01</span><b>Drop</b><small>30 symbols land in a 6 × 5 field.</small></div><div><span class="info-number">02</span><b>Match</b><small>Every matching symbol counts, even when separated.</small></div><div><span class="info-number">03</span><b>Tumble</b><small>Wins vanish together and the cascade repeats.</small></div><div><span class="info-number">04</span><b>Bonus</b><small>4 Astral Gates trigger 10 Free Spins.</small></div></div>
       <div class="paytable"><div class="paytable-head"><span>CLUB LOGO</span><span>8 — 9</span><span>10 — 11</span><span>12+</span></div>${NORMAL_SYMBOLS.map((symbol) => { const paytable = PAYTABLE[symbol.id as keyof typeof PAYTABLE]; return `<div class="paytable-row"><span class="paytable-club" style="color:${symbol.colorHex}"><img src="${import.meta.env.BASE_URL}${symbol.logoPath}" alt="">${symbol.name}</span><span>${paytable[0].multiplier}x</span><span>${paytable[1].multiplier}x</span><span>${paytable[2].multiplier}x</span></div>`; }).join("")}</div>
        <div class="info-callout"><b>MULTIPLIER CORES</b><span>Rare Base refill cells and Free Spin refill cells can spawn physical 2x–500x Cores. Cores stay locked across the whole tumble sequence, add together at settlement, and apply once to the raw sequence pool.</span></div>
        <div class="modal-footnote">Base Core chance is 0.006% per Base refill position after RTP calibration; Bonus Core chance is 1.10%. This is a virtual-credit demo and is not a regulated gaming product.</div>
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
       bonusOverlay: byId("bonus-overlay"), tumbleSymbolWin: byId("tumble-symbol-win"), tumbleIncrement: byId("tumble-increment"), tumbleMeta: byId("tumble-meta"), tumbleSettlement: byId("tumble-settlement"), tumblePanel: byId("tumble-win-panel"), bigWinOverlay: byId("big-win-overlay"), bonusSummaryOverlay: byId("bonus-summary-overlay"), boardWrap: byId("phaser-board").parentElement!,
    setModal: showModal,
  });
  if (isLab) renderLab(scene);
}, 80);

function renderLab(scene: GameScene) {
  const lab = document.createElement("section");
  lab.className = "lab-panel";
    lab.innerHTML = `<div class="panel-kicker">DEVELOPMENT ROUTE // /lab</div><h1>Animation & Math Lab</h1><p>Deterministic board checks stay separate from live RNG. Use these cards to inspect the frameless Scatter, persistent Cores, streams and the full win presentation.</p><div class="lab-actions"><button data-lab="seven">7 × S1</button><button data-lab="eight">8 × S1</button><button data-lab="simultaneous">8 × S1 + 8 × S6</button><button data-lab="core">CORE BOARD</button><button data-lab="scatter-idle">SCATTER IDLE</button><button data-lab="scatter-fall">SCATTER FALL</button><button data-lab="scatter-land">SCATTER LAND</button><button data-lab="scatter-1">SCATTER #1</button><button data-lab="scatter-2">SCATTER #2</button><button data-lab="scatter-3">SCATTER #3</button><button data-lab="scatter-bonus">BONUS SCATTER</button><button data-lab="tumble">TUMBLE 1.20 → 4.00 → 8.00</button><button data-lab="settlement">8x + 35x</button><button data-lab="waiting">BONUS WAITING</button><button data-lab="streams">STREAMS</button><button data-lab="pairs">PAIR SPLIT</button><button data-lab="anti">ANTI-STREAK</button><button data-lab="timing">TIMINGS</button><button data-lab="big">BIG WIN WAIT</button><button data-lab="max">MAX WIN WAIT</button></div><div class="lab-result" id="lab-result">Choose a predefined board.</div><pre class="lab-metrics" id="lab-metrics"></pre><div class="special-design"><div class="panel-kicker">SPECIAL SYMBOL DESIGN // SCATTER NEXT TO ORDINARY SYMBOL</div><div class="special-grid"><div class="special-preview normal-preview"><span class="special-state">ORDINARY</span><div class="preview-crest">GS</div><b>GALATASARAY</b></div><div class="special-preview scatter-preview"><span class="special-state">FRAMELESS</span><div class="preview-trophy-mark"></div><b>GOLDEN TROPHY</b></div>${[2, 10, 25, 50, 100, 250, 500].map((value) => `<div class="special-preview core-preview core-${value}"><span class="special-state">${value >= 100 ? "SETTLEMENT" : "ACTIVE"}</span><strong>${value}x</strong><b>CORE</b></div>`).join("")}</div></div>`;
  document.querySelector(".game-stage")?.append(lab);
   const metrics = lab.querySelector<HTMLElement>("#lab-metrics")!;
   const updateMetrics = () => {
     const current = scene.getDebugMetrics();
     metrics.textContent = `PERF // ${current.fps} FPS // ${current.renderer} // ${current.activeNodes}/${current.boardCells} ACTIVE BOARD NODES`;
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
     if (key === "big") {
       controller.showBigWin(250, 25_000);
        byId("lab-result").textContent = "BIG WIN COUNT-UP // first tap finishes, second tap continues";
        return;
      }
      if (key === "max") {
        controller.showBigWin(5000, 500_000, "MAX WIN");
        byId("lab-result").textContent = "MAX WIN WAIT // explicit two-input dismissal";
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
        byId("lab-result").textContent = `PERSISTENT STREAM // initial ${seeded.board.length}x${seeded.board[0].length} board // split refill items ${String(first[0])} → ${String(second[0])}`;
        return;
      }
      if (key === "pairs") {
        const stream = new ColumnStream({ nextFloat: () => 0.999999 }, { ...BASE_REEL_CONFIG, symbolWeights: [{ value: "S3", weight: 1 }], runLengthWeights: [{ value: 2, weight: 1 }] }, 0);
        byId("lab-result").textContent = `PAIR SPLIT // request 1: ${String(stream.next(1, "BASE_REFILL")[0])} // request 2: ${String(stream.next(1, "BASE_REFILL")[0])}`;
        return;
      }
      if (key === "anti") {
        const stream = createColumnStreams(new SeededRNG("lab-anti"), "base")[0];
        const values = stream.next(500, "BASE_REFILL");
        let maximum = 0;
        let current = 0;
        let previous: unknown;
        values.forEach((value) => { current = value === previous ? current + 1 : 1; maximum = Math.max(maximum, current); previous = value; });
         byId("lab-result").textContent = `ANTI-STREAK // 500 incoming cells // maximum contiguous normal streak ${maximum} // configured runs 75% singles / 25% pairs`;
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