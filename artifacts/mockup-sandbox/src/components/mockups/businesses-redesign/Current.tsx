import "./_group.css";

type Business = {
  eyebrow: string;
  name: string;
  level: string;
  accrued: string;
  hourly: string;
  daily: string;
  vault: string;
  stage: string;
  kind: "stadium" | "store" | "fan";
};

const businesses: Business[] = [
  { eyebrow: "STADIUM", name: "Stadyum", level: "Lv6 · Stadyum ★1", accrued: "$156.55", hourly: "$615.20 /sa", daily: "$14,765.00 /gün", vault: "Lv6 · 24sa", stage: "STADIUM // ELITE", kind: "stadium" },
  { eyebrow: "CLUB STORE", name: "Kulüp Mağazası", level: "Lv6 · Kulüp Markası ★1", accrued: "$72.86", hourly: "$288.54 /sa", daily: "$6,925.00 /gün", vault: "Lv1 · 1sa", stage: "CLUB STORE // ELITE", kind: "store" },
  { eyebrow: "FAN CLUB", name: "Taraftar Kulübü", level: "Lv1 · Resmî Taraftar Kulübü", accrued: "$1.20", hourly: "$4.72 /sa", daily: "$113.00 /gün", vault: "Lv1 · 1sa", stage: "FAN CLUB // LOCAL", kind: "fan" },
];

function Illustration({ kind }: { kind: Business["kind"] }) {
  if (kind === "stadium") return (
    <svg viewBox="0 0 420 190" role="presentation">
      <defs><linearGradient id="stadium-sky" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#0a1a2e"/><stop offset=".55" stopColor="#102b48"/><stop offset="1" stopColor="#07111f"/></linearGradient><linearGradient id="stadium-pitch" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#1d6e63"/><stop offset="1" stopColor="#0c3535"/></linearGradient></defs>
      <rect width="420" height="190" fill="url(#stadium-sky)"/><circle cx="326" cy="33" r="52" fill="#46c8ff" opacity=".13"/>
      <g fill="#193a5c" opacity=".5"><rect x="8" y="78" width="25" height="36"/><rect x="36" y="66" width="34" height="48"/><rect x="360" y="58" width="40" height="56"/></g>
      <g stroke="#7ddfff" opacity=".5"><path d="M48 20v88M372 20v88" strokeWidth="3"/><path d="M29 23h38M353 23h38" strokeWidth="5" strokeLinecap="round"/></g>
      <path d="M54 108C77 54 343 54 366 108L340 112C319 82 101 82 80 112Z" fill="#153855" stroke="#69d8ff" strokeOpacity=".5" strokeWidth="2"/><path d="M62 111C96 77 324 77 358 111L334 146H86Z" fill="#193a5c" stroke="#8ae5ff" strokeOpacity=".25"/><path d="M86 121C118 101 302 101 334 121L313 158H107Z" fill="#0b2034" stroke="#73d8ff" strokeOpacity=".25"/><ellipse cx="210" cy="139" rx="103" ry="35" fill="#06111d" stroke="#74dcff" strokeOpacity=".3"/><ellipse cx="210" cy="143" rx="76" ry="23" fill="url(#stadium-pitch)" stroke="#a0f3db" strokeOpacity=".3"/>
    </svg>
  );
  if (kind === "store") return (
    <svg viewBox="0 0 420 190" role="presentation">
      <defs><linearGradient id="store-night" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#11192d"/><stop offset=".55" stopColor="#18233d"/><stop offset="1" stopColor="#080f1b"/></linearGradient></defs>
      <rect width="420" height="190" fill="url(#store-night)"/><path d="M0 153L420 144V190H0Z" fill="#070d17"/><path d="M56 49H365L349 69H70Z" fill="#111d32" stroke="#a2dfff" strokeOpacity=".25"/><rect x="67" y="66" width="290" height="90" rx="7" fill="#0a1525" stroke="#91ddff" strokeOpacity=".25"/><g fill="#173557" stroke="#7bdcff" strokeOpacity=".25"><rect x="78" y="77" width="86" height="66" rx="4"/><rect x="171" y="77" width="86" height="66" rx="4"/><rect x="264" y="77" width="82" height="66" rx="4"/></g><rect x="118" y="51" width="184" height="16" rx="8" fill="#07111d" stroke="#8fdfff" strokeOpacity=".3"/><path d="M144 59H277" stroke="#46c8ff" strokeWidth="2.5"/><g fill="#29416b"><path d="M100 88l12-6 12 6 10-4 8 13-10 6v27H92v-27l-10-6 8-13z"/><path d="M193 89l12-6 12 6 10-4 8 13-10 6v26h-40v-26l-10-6 8-13z" fill="#29285a"/><path d="M289 89l11-6 11 6 9-4 8 12-9 6v27h-38v-27l-9-6 8-12z"/></g>
    </svg>
  );
  return (
    <svg viewBox="0 0 420 190" role="presentation">
      <defs><linearGradient id="fan-night" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#0b1a29"/><stop offset=".55" stopColor="#10283a"/><stop offset="1" stopColor="#061019"/></linearGradient></defs>
      <rect width="420" height="190" fill="url(#fan-night)"/><path d="M45 52H376L354 74H68Z" fill="#10283b" stroke="#93e1ff" strokeOpacity=".2"/><rect x="60" y="69" width="302" height="87" rx="8" fill="#07131f" stroke="#83dfff" strokeOpacity=".2"/><path d="M78 81H344" stroke="#46c8ff" strokeWidth="2.2"/><rect x="161" y="83" width="98" height="48" rx="5" fill="#17435a" stroke="#92e4ff" strokeOpacity=".3"/><path d="M172 122l18-15 18 9 17-18 23 24" fill="none" stroke="#7ddfff" strokeOpacity=".3" strokeWidth="2"/><g fill="#9ce9ff" opacity=".5"><circle cx="95" cy="133" r="4"/><circle cx="111" cy="129" r="4"/><circle cx="127" cy="132" r="4"/><circle cx="294" cy="127" r="4"/><circle cx="310" cy="130" r="4"/></g><path d="M80 141C112 124 142 126 166 141V156H80ZM254 141C278 126 308 124 340 141V156H254Z" fill="#0b2231" stroke="#75d8ef" strokeOpacity=".18"/>
    </svg>
  );
}

function BusinessCard({ business }: { business: Business }) {
  return (
    <article className="business-card">
      <div className="business-art">
        <Illustration kind={business.kind} />
        <span className="business-code mono">{business.kind === "stadium" ? "01" : business.kind === "store" ? "02" : "03"}</span>
        <span className="business-state mono">AKTİF</span>
        <span className="business-stage mono">{business.stage}</span>
      </div>
      <div className="business-card-body">
        <header className="business-title">
          <div><small>{business.eyebrow}</small><h2>{business.name}</h2><p>{business.level}</p></div>
          <span className="level mono">{business.level.split(" · ")[0]}</span>
        </header>
        <section className="accrued"><div className="accrued-head mono"><span>BİRİKMİŞ</span><b>TOPLAMAYA HAZIR</b></div><strong>{business.accrued}</strong></section>
        <section className="metrics">
          <div className="metric"><span className="metric-label">SAATLİK GELİR</span><strong>{business.hourly}</strong><small>{business.daily}</small></div>
          <div className="metric"><span className="metric-label">KASA KAPASİTESİ</span><strong>{business.vault}</strong><small>Doluluk %25 · Yaklaşık 45sa sonra dolar</small><div className="meter"><i /></div><div className="meter-label mono"><span>KASA GELİŞİR</span><span>→</span></div></div>
        </section>
        <div className="actions"><button type="button">TOPLA · {business.accrued}</button><button type="button">DETAYLAR →</button></div>
        <footer className="footer mono"><span>9 SEVİYELİ GELİŞİM</span><span>LV0 → LV8</span></footer>
      </div>
    </article>
  );
}

export function Current() {
  return <main className="businesses-mockup"><div className="businesses-mockup-shell">
    <div className="businesses-topline"><a href="#businesses">← ANA MENÜ</a><span className="businesses-status"><i /> KULÜP OPERASYON MERKEZİ</span></div>
    <section className="businesses-hero"><div><span className="businesses-kicker">FAHRİNİN YOLU // CLUB EMPIRE</span><h1>İŞLETMELER</h1><p>Kulübünün gelir kaynaklarını büyüt, kapasiteni geliştir ve biriken kazancı tek merkezden yönet.</p></div><div className="wallet"><span className="stat-label">ORTAK BAKİYE</span><strong>$1,240.00</strong><small>TÜM OYUNLARDA KULLANILIR</small></div></section>
    <section className="summary"><div className="stat"><span className="stat-label">TOPLAM SAATLİK GELİR</span><strong>$908.46 /sa</strong><small>PASİF GELİR HIZI</small></div><div className="stat"><span className="stat-label">TOPLANABİLİR</span><strong>$230.61</strong><small>KASALARDA HAZIR</small></div><div className="stat"><span className="stat-label">AKTİF İŞLETME</span><strong>3 / 3</strong><small>GELİR ÜRETİYOR</small></div><button className="collect-all" type="button"><span><small>TÜM KASALAR</small><strong>TÜMÜNÜ TOPLA</strong></span><b>$230.61</b><span>→</span></button></section>
    <section className="business-grid" aria-label="İşletmeler">{businesses.map((business) => <BusinessCard key={business.kind} business={business} />)}</section>
  </div></main>;
}