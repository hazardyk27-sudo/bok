import "./roulette.css";
import { RouletteClient } from "./rouletteClient";
import { EUROPEAN_WHEEL_ORDER, ROULETTE_SEGMENT_DEGREES } from "./rouletteGeometry";

const rouletteRouteShell = (content: string) => `
  <div class="app-shell route-shell is-route-page is-roulette-page">
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

const rouletteRedNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const rouletteWheelBand = EUROPEAN_WHEEL_ORDER.map((number, index) => {
  const color = number === 0 ? "#138a4a" : rouletteRedNumbers.has(number) ? "#b5282b" : "#161a1c";
  return `${color} ${index * ROULETTE_SEGMENT_DEGREES}deg ${(index + 1) * ROULETTE_SEGMENT_DEGREES}deg`;
}).join(", ");
const rouletteChipValues = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000];
const rouletteBetButton = (type: string, key: string, numbers: number[], label: string, className = "") => `<button type="button" class="table-bet ${className}" data-bet-type="${type}" data-bet-key="${key}" data-bet-numbers="${numbers.join(",")}" data-bet-label="${label}"><span class="bet-label">${label}</span><span class="table-chip" hidden></span><span class="multiplier-badge" hidden></span></button>`;
const rouletteNumberRows = [2, 1, 0].map((row) => Array.from({ length: 12 }, (_, column) => column * 3 + row + 1).map((number) => rouletteBetButton("STRAIGHT", `straight:${number}`, [number], String(number), rouletteRedNumbers.has(number) ? "number-red" : "number-black")).join("")).join("");
const rouletteStreetBets = Array.from({ length: 12 }, (_, column) => {
  const numbers = [column * 3 + 1, column * 3 + 2, column * 3 + 3];
  return rouletteBetButton("STREET", `street:${numbers.join("-")}`, numbers, `${numbers[0]}–${numbers[2]}`);
}).join("");
const rouletteSixLineBets = Array.from({ length: 11 }, (_, column) => {
  const numbers = Array.from({ length: 6 }, (_, index) => column * 3 + index + 1);
  return rouletteBetButton("SIX_LINE", `six:${numbers.join("-")}`, numbers, `${numbers[0]}–${numbers[5]}`);
}).join("");
const rouletteSplitBets = [
  ...[1, 2, 3].map((number) => [0, number]),
  ...Array.from({ length: 36 }, (_, index) => index + 1).flatMap((number) => {
    const bets: number[][] = [];
    if (number % 3 !== 0) bets.push([number, number + 1]);
    if (number <= 33) bets.push([number, number + 3]);
    return bets;
  }),
].map((numbers) => rouletteBetButton("SPLIT", `split:${numbers.join("-")}`, numbers, numbers.join("/"))).join("");
const rouletteCornerBets = Array.from({ length: 11 }, (_, column) => [1, 2].flatMap((row) => {
  const number = column * 3 + row;
  return [number, number + 1, number + 3, number + 4];
})).flatMap((numbers) => numbers.length ? [numbers] : []).map((numbers) => rouletteBetButton("CORNER", `corner:${numbers.join("-")}`, numbers, `${numbers[0]}/${numbers[1]}/${numbers[2]}/${numbers[3]}`)).join("");
const rouletteOutside = (type: string, key: string, label: string, numbers: number[]) => rouletteBetButton(type, key, numbers, label, "outside-bet");
const rouletteDozens = [
  rouletteOutside("DOZEN", "dozen:1", "1st 12", Array.from({ length: 12 }, (_, index) => index + 1)),
  rouletteOutside("DOZEN", "dozen:2", "2nd 12", Array.from({ length: 12 }, (_, index) => index + 13)),
  rouletteOutside("DOZEN", "dozen:3", "3rd 12", Array.from({ length: 12 }, (_, index) => index + 25)),
].join("");
const rouletteColumns = [0, 1, 2].map((column) => rouletteOutside("COLUMN", `column:${column + 1}`, `C${column + 1}`, Array.from({ length: 12 }, (_, index) => index * 3 + column + 1))).join("");
const rouletteOutsideBets = [
  rouletteOutside("LOW", "low", "1–18", Array.from({ length: 18 }, (_, index) => index + 1)),
  rouletteOutside("EVEN", "even", "EVEN", Array.from({ length: 18 }, (_, index) => (index + 1) * 2)),
  rouletteOutside("RED", "red", "RED", [...rouletteRedNumbers]),
  rouletteOutside("BLACK", "black", "BLACK", Array.from({ length: 36 }, (_, index) => index + 1).filter((number) => !rouletteRedNumbers.has(number))),
  rouletteOutside("ODD", "odd", "ODD", Array.from({ length: 18 }, (_, index) => index * 2 + 1)),
  rouletteOutside("HIGH", "high", "19–36", Array.from({ length: 18 }, (_, index) => index + 19)),
].join("");
const rouletteMobileOutsideBets = [
  rouletteOutside("LOW", "low", "1–18", Array.from({ length: 18 }, (_, index) => index + 1)),
  rouletteOutside("EVEN", "even", "EVEN", Array.from({ length: 18 }, (_, index) => (index + 1) * 2)),
  rouletteOutside("RED", "red", "RED", [...rouletteRedNumbers]),
  rouletteOutside("BLACK", "black", "BLACK", Array.from({ length: 36 }, (_, index) => index + 1).filter((number) => !rouletteRedNumbers.has(number))),
  rouletteOutside("ODD", "odd", "ODD", Array.from({ length: 18 }, (_, index) => index * 2 + 1)),
  rouletteOutside("HIGH", "high", "19–36", Array.from({ length: 18 }, (_, index) => index + 19)),
].join("");
const rouletteMobileDozens = rouletteDozens;
const rouletteMobileNumberColumns = Array.from({ length: 3 }, (_, column) => `<div class="mobile-number-column">${Array.from({ length: 12 }, (_, row) => {
  const number = column * 12 + row + 1;
  return rouletteBetButton("STRAIGHT", `straight:${number}`, [number], String(number), rouletteRedNumbers.has(number) ? "number-red" : "number-black");
}).join("")}</div>`).join("");
const rouletteInsideBets = `
  <div class="inside-bet-drawer-grid">
    <div class="bet-zone-group"><span>SPLIT // 17:1</span><div>${rouletteSplitBets}</div></div>
    <div class="bet-zone-group"><span>STREET // 11:1</span><div>${rouletteStreetBets}</div></div>
    <div class="bet-zone-group"><span>CORNER // 8:1</span><div>${rouletteCornerBets}</div></div>
    <div class="bet-zone-group"><span>SIX LINE // 5:1</span><div>${rouletteSixLineBets}</div></div>
  </div>
`;
const rouletteRacetrack = `
  <div class="roulette-racetrack" data-racetrack-panel hidden aria-hidden="true">
    <div class="racetrack-heading"><span>RACETRACK // EUROPEAN ORDER</span><small>Bir sayıya dokun · komşu modu açıksa 5’li cluster</small></div>
    <div class="racetrack-ring" aria-label="Racetrack Avrupa sayı sırası">
      ${EUROPEAN_WHEEL_ORDER.map((number) => rouletteBetButton("STRAIGHT", `straight:${number}`, [number], String(number), `racetrack-number ${number === 0 ? "number-zero" : rouletteRedNumbers.has(number) ? "number-red" : "number-black"}`)).join("")}
    </div>
  </div>
`;
export const ROULETTE_MARKUP = `
  <main class="roulette-page" aria-labelledby="roulette-title">
    <div class="roulette-heading">
      <a class="back-link" href="/">← ANA MENÜ</a>
      <div>
        <span class="menu-kicker">THE NIGHT TABLE // EUROPEAN TABLE</span>
        <h1 id="roulette-title">LIGHTNING <em>ROULETTE</em></h1>
        <p>Klasik Avrupa ruleti düzeni. Birden fazla sayı ve bahis alanına chip koy, masayı istediğin gibi kur.</p>
      </div>
      <div class="roulette-connection" data-connection>BAĞLANTI KURULUYOR</div>
    </div>
    <section class="roulette-hud" aria-label="Round status">
      <div class="roulette-hud-card"><span>ROUND</span><strong data-round>—</strong></div>
      <div class="roulette-hud-card is-phase"><span>MASA DURUMU</span><strong data-phase>BAĞLANIYOR</strong></div>
      <div class="roulette-countdown" data-progress><small>SONRAKİ GEÇİŞ</small><strong data-countdown>--:--</strong></div>
      <div class="roulette-hud-card wallet-hud"><span>ROULETTE WALLET</span><strong data-balance>0.00</strong></div>
      <button class="roulette-sound-button" data-action="sound" type="button" aria-label="Türkçe sesi aç"><span>SESİ AÇ</span></button>
    </section>
    <section class="roulette-mobile-results" data-mobile-results aria-label="Son sonuçlar"><span class="mobile-results-label">SON SONUÇLAR</span><div class="mobile-results-list"><span class="muted-copy">Sonuçlar yükleniyor</span></div></section>
    <nav class="mobile-control-dock" aria-label="Mobil masa araçları">
      <button type="button" data-action="drawer-controls" aria-label="Masa araçlarını aç" aria-haspopup="dialog"><span>☷</span><small>ARAÇLAR</small></button>
      <button type="button" data-action="undo" aria-label="Son bahsi geri al"><span>↶</span><small>UNDO</small></button>
      <button type="button" data-action="rebet" aria-label="Son bahsi tekrar et"><span>↻</span><small>TEKRAR</small></button>
      <button type="button" data-action="clear" aria-label="Masadaki tüm bahisleri temizle"><span>×</span><small>TEMİZLE</small></button>
      <button type="button" data-action="drawer-chips" aria-label="Chip seçici"><span>◉</span><small>CHIP</small></button>
      <button type="button" data-action="sound" aria-label="Türkçe sesi aç"><span>♫</span><small>SES</small></button>
      <button type="button" data-action="menu" aria-label="Ana menüye dön"><span>←</span><small>MENÜ</small></button>
    </nav>
    <section class="roulette-layout">
      <section class="roulette-wheel-card" aria-labelledby="roulette-wheel-title" aria-describedby="roulette-wheel-order">
        <h2 id="roulette-wheel-title" class="roulette-screen-reader-only">Avrupa ruleti çarkı</h2>
        <p id="roulette-wheel-order" class="roulette-screen-reader-only">Avrupa ruleti sayı sırası: ${EUROPEAN_WHEEL_ORDER.join(", ")}.</p>
        <div class="roulette-screen-reader-only" data-roulette-summary role="status" aria-live="polite" aria-atomic="true">Rulet senkronizasyonu bekleniyor.</div>
         <div class="roulette-card-kicker">LIVE EUROPEAN WHEEL</div>
        <div class="roulette-wheel-stage">
           <div class="roulette-wheel-live" data-wheel style="--wheel-band:${rouletteWheelBand}">
            <canvas class="roulette-physics-canvas" data-physics-wheel aria-hidden="true"></canvas>
            <div class="wheel-rotor">
               <div class="wheel-wood-deck" aria-hidden="true"></div>
              <div class="wheel-number-band" aria-hidden="true" style="--wheel-band:${rouletteWheelBand}"></div>
              <div class="wheel-number-labels" aria-label="European wheel number order">${EUROPEAN_WHEEL_ORDER.map((number, index) => `<span class="wheel-number-label" data-pocket-index="${index}" style="--pocket-index:${index};--label-flip:0deg"><b>${number}</b></span>`).join("")}</div>
              <div class="wheel-pocket-track">${EUROPEAN_WHEEL_ORDER.map((number, index) => `<span class="wheel-pocket ${number === 0 ? "is-green" : rouletteRedNumbers.has(number) ? "is-red" : "is-black"}" data-wheel-number="${number}" style="--pocket-index:${index}"><i aria-hidden="true"></i></span>`).join("")}</div>
              <div class="wheel-deflectors">${Array.from({ length: 8 }, (_, index) => `<i style="--deflector-index:${index}"></i>`).join("")}</div>
              <div class="wheel-center-well"><div class="wheel-center-cap"><i></i><b></b></div></div>
            </div>
            <div class="wheel-ball-track"><div class="wheel-ball"></div></div>
            <div class="wheel-result-overlay" data-result-overlay>
              <small>ROUND SONUCU</small>
              <strong data-overlay-winning>?</strong>
              <span data-overlay-payout>SONUÇ BEKLENİYOR</span>
            </div>
          </div>
        </div>
      </section>
      <section class="roulette-bet-card" aria-label="Klasik Avrupa ruleti bahis masası">
        <div class="mobile-utility-rail" aria-label="Mobil masa kontrolleri">
          <button type="button" data-action="undo" aria-label="Son bahsi geri al">↶<small>UNDO</small></button>
          <button type="button" data-action="rebet" aria-label="Son bahsi tekrar et">↻<small>TEKRAR</small></button>
           <button type="button" data-action="double" aria-label="Tüm chipleri iki katına çıkar">×2<small>İKİLE</small></button>
           <button type="button" data-action="clear" aria-label="Masadaki tüm bahisleri temizle">×<small>TEMİZLE</small></button>
          <button type="button" data-action="drawer-chips" aria-label="Chip seçici">◉<small>CHIP</small></button>
          <button type="button" data-action="drawer-inside" aria-label="Inside bahisleri">＋<small>INSIDE</small></button>
          <button type="button" data-action="drawer-history" aria-label="Geçmiş sonuçlar">◌<small>GEÇMİŞ</small></button>
          <button type="button" data-action="drawer-fairness" aria-label="Adil oyun bilgisi">✦<small>FAIR</small></button>
          <button type="button" data-action="sound" aria-label="Türkçe sesi aç">♫<small>SES</small></button>
          <button type="button" data-action="menu" aria-label="Ana menüye dön">☰<small>MENÜ</small></button>
        </div>
         <div class="table-card-heading"><div><div class="roulette-card-kicker">EUROPEAN ROULETTE // 0 + 36 NUMARA</div><strong>BAHİS MASASI</strong></div><div class="table-heading-tools"><button type="button" data-action="racetrack" aria-pressed="false">RACETRACK</button><button type="button" data-action="neighbors" aria-pressed="false">KOMŞULAR</button><button type="button" data-action="drawer-inside">İÇ BAHİSLER</button><button type="button" data-action="drawer-fairness">FAIRNESS</button><span class="table-odds-note">KAZANAN SAYIYA GÖRE ÖDEME<br><b>35:1 STRAIGHT UP</b></span></div></div>
        <div class="roulette-table-felt">
           ${rouletteRacetrack}
          <div class="roulette-zero-lane">${rouletteBetButton("STRAIGHT", "straight:0", [0], "0", "number-zero")}</div>
          <div class="roulette-desktop-table">
          <div class="roulette-number-board" aria-label="Standart 3 sıra 12 kolon sayı düzeni">
            <div class="roulette-number-grid">${rouletteNumberRows}</div>
            <div class="roulette-column-row">${rouletteColumns}</div>
          </div>
          <div class="roulette-dozen-row">${rouletteDozens}</div>
          <div class="roulette-outside-row">${rouletteOutsideBets}</div>
          </div>
          <div class="roulette-mobile-table" aria-label="Mobil dikey Avrupa ruleti masası">
            <div class="mobile-table-main">
              <div class="mobile-outer-rail">${rouletteMobileOutsideBets}</div>
              <div class="mobile-number-columns">${rouletteMobileNumberColumns}</div>
              <div class="mobile-dozen-rail">${rouletteMobileDozens}</div>
            </div>
            <div class="mobile-column-row">${rouletteColumns}</div>
          </div>
          <div class="roulette-multiplier-effects" data-multiplier-effects aria-hidden="true"></div>
        </div>
         <div class="roulette-lucky-row"><div><span>LUCKY NUMBERS</span><div data-lucky-list><span class="muted-copy">Sonuçtan sonra açıklanacak</span></div></div><div class="reveal-count"><span>REVEAL</span><strong data-reveal-count>0/0</strong></div></div>
        <div class="roulette-multiplier-row"><span>MULTIPLIER REVEAL</span><div data-multiplier-list><span class="muted-copy">Tek tek reveal bekleniyor</span></div></div>
        <div class="roulette-bet-slip">
           <div class="chip-picker"><span>CHIP DEĞERİ</span><div>${rouletteChipValues.map((stake) => `<button type="button" data-stake="${stake}" class="${stake === 100 ? "is-selected" : ""}"><i></i>${(stake / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</button>`).join("")}</div></div>
           <div class="bet-slip-summary"><div><span>MASADAKİ BAHİS</span><strong data-total-stake>0,00</strong><small data-bet-count>0 ALAN · <b data-table-info>EUROPEAN TABLE</b></small></div><div class="bet-slip-actions"><button type="button" data-action="undo">↶ UNDO</button><button type="button" data-action="clear">CLEAR</button><button type="button" data-action="double">×2</button></div></div>
          <div class="selected-bets" data-selected-bets><span class="muted-copy">Chip seç ve masada bir veya daha fazla alana dokun</span></div>
        </div>
        <p class="roulette-bet-status" data-bet-status>CANLI MASA YÜKLENİYOR</p>
      </section>
    </section>
    <section class="roulette-history-card"><div class="history-heading"><div><span class="roulette-card-kicker">GLOBAL HISTORY</span><h2>SONUÇ AKIŞI</h2></div><button type="button" data-action="refresh">↻ YENİLE</button></div><div class="history-list" data-history><span class="muted-copy">Sonuçlar yükleniyor</span></div></section>
     <aside class="roulette-drawer" data-drawer="chips" aria-hidden="true"><button class="drawer-close" type="button" data-action="drawer-close">×</button><span class="roulette-card-kicker">CHIP SELECTOR</span><h2>CHIP DEĞERİ</h2><p>Seçili chip’i masada istediğin kadar farklı alana uygula.</p><div class="drawer-chip-grid">${rouletteChipValues.map((stake) => `<button type="button" data-stake="${stake}"><i></i>${(stake / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</button>`).join("")}</div><small class="drawer-hint">1 · 5 · 10 · 25 · 50 · 100 · 250 · 500 CREDITS</small></aside>
    <aside class="roulette-drawer" data-drawer="inside" aria-hidden="true"><button class="drawer-close" type="button" data-action="drawer-close">×</button><span class="roulette-card-kicker">INSIDE BETS</span><h2>İÇ BAHİSLER</h2><p>Masadaki klasik iç bahis bölgeleri.</p>${rouletteInsideBets}</aside>
    <aside class="roulette-drawer" data-drawer="fairness" aria-hidden="true"><button class="drawer-close" type="button" data-action="drawer-close">×</button><span class="roulette-card-kicker">FAIR PLAY // SERVER PROOF</span><h2>ADİL OYUN</h2><p>Sonuç server tarafından round başlamadan önce belirlenir; animasyon sadece bu sonucu doğal biçimde gösterir.</p><div class="drawer-proof"><b>COMMITMENT HASH</b><code data-commitment>WAITING FOR ROUND</code><small>Sonuç açıklandığında doğrulanabilir.</small></div></aside>
    <aside class="roulette-drawer roulette-history-drawer" data-drawer="history" aria-hidden="true"><button class="drawer-close" type="button" data-action="drawer-close">×</button><span class="roulette-card-kicker">RECENT ROUNDS</span><h2>SONUÇ GEÇMİŞİ</h2><div class="history-list" data-history-drawer><span class="muted-copy">Sonuçlar yükleniyor</span></div></aside>
      <aside class="roulette-drawer mobile-controls-drawer" data-drawer="controls" aria-hidden="true">
        <button class="drawer-close" type="button" data-action="drawer-close">×</button>
        <span class="roulette-card-kicker">TABLE CONTROLS</span>
        <h2>MASA ARAÇLARI</h2>
        <div class="mobile-control-grid">
          <button type="button" data-action="undo">↶<small>UNDO</small></button>
          <button type="button" data-action="rebet">↻<small>TEKRAR</small></button>
          <button type="button" data-action="double">×2<small>İKİLE</small></button>
          <button type="button" data-action="clear">×<small>TEMİZLE</small></button>
          <button type="button" data-action="racetrack" aria-pressed="false">◎<small>RACE</small></button>
          <button type="button" data-action="neighbors" aria-pressed="false">✦<small>KOMŞU</small></button>
          <button type="button" data-action="drawer-inside">＋<small>İÇ BAHİS</small></button>
          <button type="button" data-action="drawer-history">◌<small>GEÇMİŞ</small></button>
          <button type="button" data-action="drawer-fairness">✧<small>FAIR</small></button>
        </div>
      </aside>
  </main>
`;

export function mountRoulette(app: HTMLElement) {
  app.innerHTML = rouletteRouteShell(ROULETTE_MARKUP);
  const rouletteRoot = app.querySelector<HTMLElement>(".roulette-page");
  if (rouletteRoot) new RouletteClient(rouletteRoot);
}
