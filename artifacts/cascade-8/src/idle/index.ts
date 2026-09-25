import "./idle.css";

const BUSINESS_SHELL_ROWS = [
  { id: "stadium", eyebrow: "STADIUM", title: "Stadyum" },
  { id: "club-store", eyebrow: "CLUB STORE", title: "Kulüp Mağazası" },
  { id: "fan-club", eyebrow: "FAN CLUB", title: "Taraftar Kulübü" },
] as const;

export const BUSINESSES_MARKUP = `
  <main class="businesses-page" aria-labelledby="businesses-title">
    <header class="businesses-header">
      <a class="back-link" href="/">← ANA MENÜ</a>
      <div class="businesses-heading">
        <span class="businesses-kicker">FAHRİNİN YOLU // İŞLETMELER</span>
        <h1 id="businesses-title">İŞLETMELER</h1>
        <p>Üç işletmeyi büyüt, Kasalarını geliştir ve biriken geliri ortak bakiyene aktar.</p>
      </div>
      <div class="businesses-wallet" aria-label="Ortak bakiye">
        <span>BAKİYE</span>
        <strong data-idle-balance>—</strong>
      </div>
    </header>

    <section class="business-summary" aria-label="İşletme özeti">
      <div>
        <span>TOPLAM SAATLİK GELİR</span>
        <strong data-idle-total-hourly>—</strong>
      </div>
      <div>
        <span>TOPLANABİLİR</span>
        <strong data-idle-total-collectable>—</strong>
      </div>
    </section>

    <section class="business-list" aria-label="İşletmeler">
      ${BUSINESS_SHELL_ROWS.map((business) => `
        <article class="business-row" data-business-id="${business.id}">
          <div class="business-row-title">
            <small>${business.eyebrow}</small>
            <strong>${business.title}</strong>
            <span data-business-level>Seviye —</span>
          </div>

          <div class="business-row-metrics">
            <div class="business-row-metric">
              <span>BİRİKMİŞ</span>
              <strong data-business-accrued>—</strong>
            </div>
            <div class="business-row-metric">
              <span>GELİR</span>
              <strong data-business-income>— /sa</strong>
            </div>
            <div class="business-row-metric">
              <span>KASA</span>
              <strong data-business-vault>Lv— · —</strong>
            </div>
          </div>

          <div class="business-row-actions">
            <button type="button" disabled data-business-upgrade>YÜKSELT</button>
            <button type="button" disabled data-business-collect>TOPLA</button>
          </div>
        </article>
      `).join("")}
    </section>
  </main>
`;
