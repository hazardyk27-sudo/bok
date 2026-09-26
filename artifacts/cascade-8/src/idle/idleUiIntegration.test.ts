import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentsSource = readFileSync(
  fileURLToPath(new URL("./components/index.ts", import.meta.url)),
  "utf8",
);
const idleIndexSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);
const idleCssSource = readFileSync(
  fileURLToPath(new URL("./idle.css", import.meta.url)),
  "utf8",
);
const mainSource = readFileSync(
  fileURLToPath(new URL("../main.ts", import.meta.url)),
  "utf8",
);


describe("final Idle UI integration", () => {
  it("keeps the main cards focused on collect and Details only", () => {
    expect(componentsSource).toContain("data-business-collect");
    expect(componentsSource).toContain("data-business-details");
    expect(componentsSource).not.toContain("data-business-upgrade");
    expect(componentsSource).not.toContain("data-business-vault-upgrade");
    expect(idleIndexSource).not.toContain('button.matches("[data-business-vault-upgrade]")');
  });

  it("keeps both business and Kasa upgrades inside the Details stage cards", () => {
    expect(idleIndexSource).toContain("data-idle-detail-upgrade");
    expect(idleIndexSource).toContain("data-idle-detail-vault-upgrade");
    expect(idleIndexSource).toContain("upgradeIdleBusiness(businessId)");
    expect(idleIndexSource).toContain("upgradeIdleVault(businessId)");
  });

  it("keeps individual collection connected to the real service", () => {
    expect(idleIndexSource).toContain("collectIdleBusiness(businessId)");
    expect(idleIndexSource).toContain('button.matches("[data-business-collect]")');
  });
});

describe("Idle request failure handling", () => {
  it("keeps request failures inside the page instead of leaking unhandled promises", () => {
    expect(idleIndexSource).toContain("data-idle-error");
    expect(idleIndexSource).toContain("this.setError(this.getErrorMessage(error))");
    expect(idleIndexSource).toContain('return "İşletmeler sunucusuna bağlanılamadı. Lütfen tekrar dene."');
  });
});



describe("Idle collect all integration", () => {
  it("shows one summary action for collecting every business", () => {
    expect(idleIndexSource).toContain("data-idle-collect-all");
    expect(idleIndexSource).toContain("collectAllIdleBusinesses,");
    expect(idleIndexSource).toContain("TÜMÜNÜ TOPLA");
    expect(idleIndexSource).toContain("this.runCollectAll()");
  });

  it("keeps only core at-a-glance information on each main card", () => {
    expect(componentsSource).toContain("BİRİKMİŞ");
    expect(componentsSource).toContain("SAATLİK GELİR");
    expect(componentsSource).toContain("data-business-vault");
    expect(componentsSource).toContain("data-business-vault-fill");
    expect(componentsSource).toContain("data-business-vault-progress");
    expect(componentsSource).toContain("data-business-vault-eta");
    expect(componentsSource).not.toContain("data-business-daily");
    expect(componentsSource).not.toContain("KASA GELİŞTİR");
  });
});

describe("Businesses mobile scrolling", () => {
  it("uses the Businesses route shell as the explicit mobile touch-scroll container", () => {
    expect(mainSource).toContain('document.documentElement.classList.add("businesses-route")');
    expect(mainSource).toContain('document.body.classList.add("businesses-route")');
    expect(idleCssSource).toContain("html.businesses-route #app");
    expect(idleCssSource).toContain(".route-shell.is-businesses-page {");
    expect(idleCssSource).toContain("height: 100dvh");
    expect(idleCssSource).toContain("overflow-y: auto");
    expect(idleCssSource).toContain("touch-action: pan-y");
    expect(idleCssSource).toContain("-webkit-overflow-scrolling: touch");
  });

  it("keeps the document locked so the global slot viewport rules cannot steal mobile scroll", () => {
    expect(idleCssSource).toContain("body.businesses-route,");
    expect(idleCssSource).toContain("overflow: hidden");
    expect(idleCssSource).toContain("overscroll-behavior-y: contain");
  });
});


describe("Businesses main menu control", () => {
  it("renders status first and Ana Menü last in the header nav", () => {
    const statusIndex = idleIndexSource.indexOf("businesses-header-status");
    const menuIndex = idleIndexSource.indexOf('aria-label="Ana menüye dön"');

    expect(statusIndex).toBeGreaterThanOrEqual(0);
    expect(menuIndex).toBeGreaterThan(statusIndex);
    expect(idleIndexSource).toContain('class="back-link-icon"');
    expect(idleIndexSource).toContain("<span>ANA MENÜ</span>");
  });

  it("anchors the control from the canonical header rules without a trailing hotfix", () => {
    expect(idleCssSource).not.toContain("/* Final Ana Menü nav placement — structural override */");
    expect(idleCssSource).toContain(".businesses-header-status {");
    expect(idleCssSource).toContain("order: 1");
    expect(idleCssSource).toContain(".businesses-header-nav .back-link");
    expect(idleCssSource).toContain("order: 2");
    expect(idleCssSource).toContain("margin-left: auto");
    expect(idleCssSource).toContain("justify-content: flex-end");
    expect(idleCssSource).toContain("min-height: 44px");
    expect(idleCssSource).toContain("touch-action: manipulation");
  });
});


describe("Businesses dedicated minimal mobile shell", () => {
  it("renders one compact mobile brand row with Ana Menü on the right", () => {
    expect(idleIndexSource).toContain('class="businesses-mobile-brand"');
    expect(idleIndexSource).toContain('class="businesses-mobile-brand-crest"');
    expect(idleIndexSource).toContain(">FAHRİNİN YOLU</span>");
    expect(idleIndexSource).toContain('aria-label="Ana menüye dön"');
  });

  it("hides the redundant route topbar and desktop sidebar on phones", () => {
    expect(idleCssSource).toContain("/* Part 11 — dedicated minimal mobile shell */");
    expect(idleCssSource).toContain(".route-shell.is-businesses-page > .route-topbar");
    expect(idleCssSource).toContain(".route-shell.is-businesses-page .businesses-sidebar");
    expect(idleCssSource).toContain("display: none");
  });

  it("locks the mobile page title, wallet and club progress to the approved minimal hierarchy", () => {
    expect(idleCssSource).toContain("font-size: var(--idle-type-display-mobile)");
    expect(idleCssSource).toContain("min-height: 88px");
    expect(idleCssSource).toContain("font-size: 28px");
    expect(idleCssSource).toContain("min-height: 72px");
    expect(idleCssSource).toContain("height: 10px");
  });

  it("keeps two compact KPIs and one full-width green Collect All action", () => {
    expect(idleCssSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(idleCssSource).toContain("min-height: 70px");
    expect(idleCssSource).toContain("grid-column: 1 / -1");
    expect(idleCssSource).toContain("min-height: 58px");
    expect(idleCssSource).toContain("linear-gradient(135deg, #68f4ac, #4be995 62%, #39da83)");
  });

  it("keeps a 390px-specific fallback without changing the tablet breakpoint", () => {
    expect(idleCssSource).toContain("@media (max-width: 390px)");
    expect(idleCssSource).toContain("font-size: 38px");
    expect(idleCssSource).toContain("max-width: 126px");
    expect(idleCssSource).toContain("font-size: 26px");
  });
});


describe("Businesses premium design tokens", () => {
  it("locks the approved green-charcoal palette and restrained elevation system", () => {
    expect(idleCssSource).toContain("/* Businesses visual system v2");
    expect(idleCssSource).toContain("--idle-canvas: #0b1418");
    expect(idleCssSource).toContain("--idle-sidebar: #060c11");
    expect(idleCssSource).toContain("--idle-surface-raised: #151f25");
    expect(idleCssSource).toContain("--idle-text: #f2f4f3");
    expect(idleCssSource).toContain("--idle-green: #54f2a3");
    expect(idleCssSource).toContain("--idle-green-bright: #78f0aa");
    expect(idleCssSource).toContain("--idle-shadow-green");
  });

  it("locks the measured typography, geometry and spacing values from the approved references", () => {
    expect(idleCssSource).toContain('--idle-font-display: "Inter Tight"');
    expect(idleCssSource).toContain('--idle-font-ui: "Inter"');
    expect(idleCssSource).toContain("--idle-type-display-desktop: 60px");
    expect(idleCssSource).toContain("--idle-type-display-mobile: 40px");
    expect(idleCssSource).toContain("--idle-sidebar-width: 186px");
    expect(idleCssSource).toContain("--idle-content-gap: 25px");
    expect(idleCssSource).toContain("--idle-card-gap: 14px");
    expect(idleCssSource).toContain("--idle-radius-card: 14px");
    expect(idleCssSource).toContain("--idle-button-height: 52px");
    expect(idleCssSource).toContain("--idle-progress-height: 14px");
    expect(idleCssSource).toContain("--idle-business-image-ratio: 16 / 9");
  });

  it("keeps temporary cyan compatibility aliases only while the remaining Part 3–18 sections migrate", () => {
    expect(idleCssSource).toContain("--idle-cyan: var(--idle-green)");
    expect(idleCssSource).toContain("--idle-cyan-bright: var(--idle-green-bright)");
    expect(idleCssSource).toContain("--idle-cyan-soft: var(--idle-green-soft)");
    expect(idleCssSource).toContain("font-family: var(--idle-font-ui)");
  });
});


describe("Businesses premium route shell", () => {
  it("gives Businesses a wider premium desktop canvas without affecting other routes", () => {
    expect(idleCssSource).toContain("--idle-page-max: 1400px");
    expect(idleCssSource).toContain(".route-shell.is-businesses-page");
    expect(idleCssSource).toContain("width: min(100%, var(--idle-page-max))");
    expect(idleCssSource).toContain("overflow-x: clip");
  });

  it("keeps the Businesses route vertically scrollable and safe-area aware on mobile", () => {
    expect(idleCssSource).toContain("body.businesses-route");
    expect(idleCssSource).toContain("touch-action: pan-y");
    expect(idleCssSource).toContain("overscroll-behavior-y: contain");
    expect(idleCssSource).toContain("max(24px, env(safe-area-inset-bottom))");
    expect(idleCssSource).toContain("@media (max-width: 760px)");
  });

  it("provides dedicated desktop, tablet and small-phone breakpoints for the premium shell", () => {
    expect(idleCssSource).toContain("@media (min-width: 1280px)");
    expect(idleCssSource).toContain("@media (min-width: 761px) and (max-width: 1100px)");
    expect(idleCssSource).toContain("@media (max-width: 420px)");
  });
});



describe("Businesses measured desktop workspace", () => {
  it("renders the approved 186px sidebar shell and keeps the content column independent", () => {
    expect(idleIndexSource).toContain('class="businesses-workspace"');
    expect(idleIndexSource).toContain('class="businesses-sidebar"');
    expect(idleCssSource).toContain("/* Part 3 — measured desktop workspace + sidebar */");
    expect(idleCssSource).toContain("grid-template-columns: var(--idle-sidebar-width) minmax(0, 1fr)");
    expect(idleCssSource).toContain("gap: var(--idle-content-gap)");
    expect(idleCssSource).toContain("--idle-sidebar-width: 186px");
    expect(idleCssSource).toContain("--idle-content-gap: 25px");
  });

  it("shows the game navigation required by the approved reference", () => {
    expect(idleIndexSource).toContain(">SLOT</span>");
    expect(idleIndexSource).toContain(">RULET</span>");
    expect(idleIndexSource).toContain(">CADI KAZAN</span>");
    expect(idleIndexSource).toContain(">İŞLETMELER</span>");
    expect(idleIndexSource).toContain('aria-current="page"');
    expect(idleIndexSource).toContain(">FİNANS</span>");
    expect(idleIndexSource).toContain(">KULÜP</span>");
    expect(idleIndexSource).toContain(">AYARLAR</span>");
  });

  it("uses the approved charcoal-green shell instead of the old blue ambient foundation", () => {
    expect(idleCssSource).toContain("background: var(--idle-canvas, #0b1418)");
    expect(idleCssSource).toContain("rgba(84, 242, 163, .035)");
    expect(idleCssSource).toContain("var(--idle-sidebar)");
    expect(idleCssSource).toContain("var(--idle-green)");
  });

  it("keeps the sidebar desktop-only until the dedicated mobile composition is built", () => {
    expect(idleCssSource).toContain(".businesses-sidebar {");
    expect(idleCssSource).toContain("display: none");
    expect(idleCssSource).toContain("@media (min-width: 1101px)");
    expect(idleCssSource).toContain(".route-shell.is-businesses-page > .route-topbar");
  });
});


describe("Businesses premium command header", () => {
  it("keeps title, wallet and club progression as the global desktop hierarchy", () => {
    expect(idleIndexSource).toContain("FAHRİNİN YOLU // CLUB EMPIRE");
    expect(idleIndexSource).toContain("ORTAK BAKİYE");
    expect(idleIndexSource).toContain("KULÜP GELİŞİMİ");
    expect(idleIndexSource).toContain("data-idle-progression-levels");
    expect(idleIndexSource).toContain("data-idle-progression-track");
    expect(idleIndexSource).toContain("data-idle-active-businesses");
  });

  it("uses the measured Part 4 desktop composition and hides the redundant old nav row", () => {
    expect(idleCssSource).toContain("/* Part 4 — measured desktop header + overview */");
    expect(idleCssSource).toContain(".businesses-header-nav");
    expect(idleCssSource).toContain("display: none");
    expect(idleCssSource).toContain("grid-template-columns: minmax(0, 1fr) 292px");
    expect(idleCssSource).toContain("font-size: var(--idle-type-display-desktop)");
    expect(idleCssSource).toContain("min-height: 108px");
  });

  it("renders the club progression as a segmented green 27-step progress surface", () => {
    expect(idleCssSource).toContain("grid-template-columns: 210px minmax(0, 1fr) auto");
    expect(idleCssSource).toContain("height: var(--idle-progress-height)");
    expect(idleCssSource).toContain("calc((100% / 27) - 2px)");
    expect(idleCssSource).toContain("linear-gradient(90deg, var(--idle-green-deep), var(--idle-green))");
  });
});


describe("Businesses premium KPI command bar", () => {
  it("keeps hourly income, collectable cash and Collect All as the only command-level actions", () => {
    expect(idleIndexSource).toContain("business-command-income");
    expect(idleIndexSource).toContain("business-command-ready");
    expect(idleIndexSource).toContain("SAATLİK GELİR");
    expect(idleIndexSource).toContain("TOPLANABİLİR");
    expect(idleIndexSource).not.toContain("business-command-active");
  });

  it("keeps Collect All persistent with the live amount", () => {
    expect(idleIndexSource).toContain("data-idle-collect-all-value");
    expect(idleIndexSource).toContain("TÜM KASALAR");
    expect(idleIndexSource).toContain("business-collect-all-arrow");
    expect(idleIndexSource).toContain("collectAllValueNode.textContent = formatCredits(totalCollectableCents)");
  });

  it("uses three separate measured desktop cards rather than one fused dashboard strip", () => {
    expect(idleCssSource).toContain("grid-template-columns: minmax(0, .92fr) minmax(0, .92fr) minmax(0, 1.16fr)");
    expect(idleCssSource).toContain("gap: 12px");
    expect(idleCssSource).toContain("min-height: 92px");
    expect(idleCssSource).toContain("background: transparent");
    expect(idleCssSource).toContain("font-size: var(--idle-type-kpi)");
  });

  it("uses the approved green primary treatment for Tümünü Topla", () => {
    expect(idleCssSource).toContain("#64f5aa");
    expect(idleCssSource).toContain("#47e995");
    expect(idleCssSource).toContain("color: #06130c");
    expect(idleCssSource).toContain("width: 34px");
    expect(idleCssSource).toContain("height: 34px");
  });
});


describe("Businesses premium desktop cards", () => {
  it("renders the canonical hero-content card stack", () => {
    expect(componentsSource).toContain("business-card business-card--");
    expect(componentsSource).toContain("business-card-hero");
    expect(componentsSource).toContain("business-card-content");
    expect(componentsSource).toContain("business-card-identity-overlay");
    expect(componentsSource).toContain("business-card-balance");
    expect(componentsSource).toContain("business-card-stats");
    expect(componentsSource).toContain("business-card-vault");
    expect(componentsSource).toContain("business-card-actions");
    expect(componentsSource).not.toContain('class="business-row business-card');
  });

  it("tracks owned, locked, active, full and max states on the card shell", () => {
    expect(componentsSource).toContain("data-business-card-state");
    expect(componentsSource).toContain('row.dataset.businessOwnership = currentStage ? "owned" : "locked"');
    expect(componentsSource).toContain('"SATIN ALINMADI"');
    expect(componentsSource).toContain('"KASA DOLU"');
    expect(componentsSource).toContain('"MAX SEVİYE"');
  });

  it("uses a three-card desktop grid and deliberate single-card tablet/mobile flow", () => {
    expect(idleCssSource).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(idleCssSource).toContain("@media (min-width: 761px) and (max-width: 1100px)");
    expect(idleCssSource).toContain("max-width: 760px");
    expect(idleCssSource).toContain("grid-template-columns: 1fr");
  });
});


describe("Businesses premium card skeleton", () => {
  it("uses one canonical hierarchy without old business-row/action wrapper dependencies", () => {
    expect(componentsSource).not.toContain("business-card-metrics");
    expect(componentsSource).not.toContain("business-card-operations");
    expect(componentsSource).not.toContain("business-card-footer");
    expect(componentsSource).not.toContain("business-card-code");
    expect(componentsSource).not.toContain("business-card-milestone");
    expect(componentsSource).not.toContain("business-card-action--collect");
    expect(componentsSource).not.toContain("business-card-action--details");
    expect(idleCssSource).toContain("/* Part 5 — canonical BusinessCard skeleton */");
  });

  it("reserves distinct production media slots for Stadium, Club Store and Fan Club", () => {
    expect(componentsSource).toContain('imagePath: "/businesses/stadium.png"');
    expect(componentsSource).toContain('imagePath: "/businesses/club-store.png"');
    expect(componentsSource).toContain('imagePath: "/businesses/fan-club.png"');
    expect(componentsSource).toContain("business-card-media-slot");
    expect(componentsSource).toContain("business-card-media-placeholder");
  });
});


describe("Businesses hero identity overlay", () => {
  it("moves business identity out of the card body and onto the hero image", () => {
    const heroIndex = componentsSource.indexOf('class="business-card-hero business-card-visual"');
    const overlayIndex = componentsSource.indexOf('class="business-card-identity-overlay"');
    const contentIndex = componentsSource.indexOf('class="business-card-content business-card-body"');

    expect(heroIndex).toBeGreaterThanOrEqual(0);
    expect(overlayIndex).toBeGreaterThan(heroIndex);
    expect(contentIndex).toBeGreaterThan(overlayIndex);
    expect(componentsSource).not.toContain('class="business-card-identity business-card-header"');
  });

  it("renders a dedicated icon, name, live level subtitle and level badge on the hero", () => {
    expect(componentsSource).toContain("business-card-identity-icon");
    expect(componentsSource).toContain('icon: "◉"');
    expect(componentsSource).toContain('icon: "▦"');
    expect(componentsSource).toContain('icon: "✦"');
    expect(componentsSource).toContain("data-business-level");
    expect(componentsSource).toContain("data-business-level-mark");
  });

  it("anchors the identity bottom-left and the level badge top-right with readable image contrast", () => {
    expect(idleCssSource).toContain("/* Part 7 — business identity overlay on hero */");
    expect(idleCssSource).toContain(".business-card-identity-overlay");
    expect(idleCssSource).toContain("left: 14px");
    expect(idleCssSource).toContain("bottom: 14px");
    expect(idleCssSource).toContain(".business-card-identity-icon");
    expect(idleCssSource).toContain(".business-card-hero .business-card-level-mark");
    expect(idleCssSource).toContain("top: 12px");
    expect(idleCssSource).toContain("right: 12px");
    expect(idleCssSource).toContain("rgba(3, 8, 7, .78)");
  });

  it("keeps the live state badge separate at the hero top-left", () => {
    expect(idleCssSource).toContain(".business-card-state");
    expect(idleCssSource).toContain("left: 12px");
    expect(componentsSource).toContain("data-business-card-state");
  });
});


describe("Businesses card information hierarchy", () => {
  it("makes accrued cash the dominant canonical card value", () => {
    expect(componentsSource).toContain("business-card-balance-heading");
    expect(componentsSource).toContain("data-business-accrued-status");
    expect(idleCssSource).toContain(".business-card-balance > strong");
    expect(idleCssSource).toContain("font-size: var(--idle-type-money-xl)");
  });

  it("keeps only hourly income and Kasa Kapasitesi as the two canonical stats", () => {
    expect(componentsSource).toContain("business-card-stats");
    expect(componentsSource).toContain("SAATLİK GELİR");
    expect(componentsSource).toContain("KASA KAPASİTESİ");
    expect(componentsSource).not.toContain("data-business-daily");
  });

  it("shows the real collected-money vault progress with remaining capacity and ETA", () => {
    expect(componentsSource).toContain("KASADA BİRİKEN");
    expect(componentsSource).toContain("data-business-vault-fill");
    expect(componentsSource).toContain("data-business-vault-remaining");
    expect(componentsSource).toContain("data-business-vault-eta");
    expect(componentsSource).toContain("data-business-vault-progress");
    expect(componentsSource).toContain("business.liveAccruedMicrocents + business.liveRemainingCapacityMicrocents");
    expect(componentsSource).toContain("formatVaultEta(");
    expect(idleCssSource).toContain("height: var(--idle-progress-height)");
  });
});


describe("Businesses final card economy presentation", () => {
  it("uses exact live vault capacity rather than a display-only hourly approximation", () => {
    expect(componentsSource).toContain("const vaultCapacityMicrocents");
    expect(componentsSource).toContain("business.liveAccruedMicrocents + business.liveRemainingCapacityMicrocents");
    expect(componentsSource).toContain("formatCreditsFromMicrocents(vaultCapacityMicrocents)");
    expect(componentsSource).toContain("formatCreditsFromMicrocents(business.liveRemainingCapacityMicrocents)");
  });

  it("labels the lower bar as money accumulated in the vault instead of level progress", () => {
    expect(componentsSource).toContain("KASADA BİRİKEN");
    expect(componentsSource).toContain("vaultFillNode.textContent");
    expect(componentsSource).toContain("`%${fillPercent}`");
    expect(componentsSource).toContain("vaultProgressNode.style.width");
  });

  it("locks the final reference-like card geometry and green primary actions", () => {
    expect(idleCssSource).toContain("/* Part 8 — final business card economy + vault presentation */");
    expect(idleCssSource).toContain("height: var(--idle-progress-height)");
    expect(idleCssSource).toContain("calc(12.5% - 2px)");
    expect(idleCssSource).toContain("min-height: var(--idle-button-height)");
    expect(idleCssSource).toContain("linear-gradient(135deg, var(--idle-green-bright), var(--idle-green))");
    expect(idleCssSource).toContain(".business-card-vault-heading");
    expect(idleCssSource).toContain(".business-card-vault-helper");
  });
});


describe("Businesses premium action states", () => {
  it("keeps exactly two direct main-card actions: Collect and Details", () => {
    expect(componentsSource).toContain("data-business-collect");
    expect(componentsSource).toContain("data-business-details");
    expect(componentsSource).not.toContain("business-card-action--collect");
    expect(componentsSource).not.toContain("business-card-action--details");
    expect(componentsSource).not.toContain("data-business-upgrade");
    expect(componentsSource).not.toContain("data-business-vault-upgrade");
    expect((componentsSource.match(/data-business-details/g) ?? []).length).toBe(1);
  });

  it("keeps the collect state server-driven and the Details action always available", () => {
    expect(componentsSource).toContain("collectButton.dataset.actionState");
    expect(componentsSource).toContain('"full"');
    expect(componentsSource).toContain('"ready"');
    expect(componentsSource).toContain('"empty"');
    expect(idleCssSource).toContain(".business-card-primary:disabled");
    expect(idleCssSource).toContain(".business-card-details");
  });

  it("keeps upgrades and insufficient-balance guidance in Details", () => {
    expect(idleIndexSource).toContain("business-level-node-upgrade");
    expect(idleIndexSource).toContain("vault-level-node-upgrade");
    expect(idleIndexSource).toContain("Bakiye yetersiz");
    expect(idleIndexSource).toContain("Yükseltme sonrası Kasa Lv1'e döner");
  });

  it("keeps touch targets large and focus-visible", () => {
    expect(idleCssSource).toContain("min-height: 46px");
    expect(idleCssSource).toContain("--idle-touch-height: 48px");
    expect(idleCssSource).toContain(":focus-visible");
  });
});


describe("Businesses desktop visual parity polish", () => {
  it("locks the approved 1440-style card rhythm and equal desktop baselines", () => {
    expect(idleCssSource).toContain("/* Part 9 — desktop visual parity polish */");
    expect(idleCssSource).toContain("gap: var(--idle-card-gap)");
    expect(idleCssSource).toContain("min-height: 520px");
    expect(idleCssSource).toContain("aspect-ratio: 16 / 9");
    expect(idleCssSource).toContain("min-height: 210px");
    expect(idleCssSource).toContain("grid-template-rows: auto auto auto 1fr");
  });

  it("keeps measured value, stat, progress and action sizing consistent across all three cards", () => {
    expect(idleCssSource).toContain("min-height: 31px");
    expect(idleCssSource).toContain("min-height: 64px");
    expect(idleCssSource).toContain("min-height: 67px");
    expect(idleCssSource).toContain("height: var(--idle-progress-height)");
    expect(idleCssSource).toContain("min-height: 52px");
  });

  it("uses only restrained green hover and focus treatment on the final desktop cards", () => {
    expect(idleCssSource).toContain("border-color: rgba(84, 242, 163, .24)");
    expect(idleCssSource).toContain("background: rgba(84, 242, 163, .06)");
    expect(idleCssSource).toContain("box-shadow: var(--idle-focus-ring)");
    expect(idleCssSource).toContain("transform: translateY(-2px)");
  });
});


describe("Businesses dedicated tablet composition", () => {
  it("uses a two-column tablet business grid instead of shrinking the desktop layout", () => {
    expect(idleCssSource).toContain("/* Part 10 — tablet composition / 768–1100px */");
    expect(idleCssSource).toContain("@media (min-width: 761px) and (max-width: 1100px)");
    expect(idleCssSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(idleCssSource).toContain("min-height: 500px");
  });

  it("keeps tablet cards on a 16:9 hero with reference-like spacing and action sizing", () => {
    expect(idleCssSource).toContain("aspect-ratio: 16 / 9");
    expect(idleCssSource).toContain("min-height: 180px");
    expect(idleCssSource).toContain("gap: 14px");
    expect(idleCssSource).toContain("min-height: 50px");
  });

  it("wraps KPI cards cleanly and keeps Collect All full-width", () => {
    expect(idleCssSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(idleCssSource).toContain("grid-column: 1 / -1");
    expect(idleCssSource).toContain("min-height: 68px");
  });

  it("uses a tighter low-tablet fallback without switching to mobile composition early", () => {
    expect(idleCssSource).toContain("@media (min-width: 761px) and (max-width: 860px)");
    expect(idleCssSource).toContain("grid-template-columns: minmax(0, 1fr) 220px");
    expect(idleCssSource).toContain("font-size: 42px");
    expect(idleCssSource).toContain("min-height: 488px");
  });

  it("removes old cyan hover treatment from the tablet surface with final green overrides", () => {
    expect(idleCssSource).toContain("border-color: rgba(84, 242, 163, .2)");
    expect(idleCssSource).toContain("background: rgba(84, 242, 163, .05)");
    expect(idleCssSource).toContain("box-shadow: var(--idle-focus-ring)");
  });
});


describe("Businesses dedicated mobile cards", () => {
  it("uses the Part 12 single-column minimal card flow instead of shrinking desktop cards", () => {
    expect(idleCssSource).toContain("/* Part 12 — minimal mobile BusinessCard composition */");
    expect(idleCssSource).toContain("@media (max-width: 760px)");
    expect(idleCssSource).toContain("grid-template-columns: 1fr");
    expect(idleCssSource).toContain("grid-template-rows: auto auto");
    expect(idleCssSource).toContain("gap: 12px");
  });

  it("keeps a compact hero with name and live level over the image", () => {
    expect(idleCssSource).toContain("aspect-ratio: 16 / 7.4");
    expect(idleCssSource).toContain("min-height: 132px");
    expect(idleCssSource).toContain(".business-card-identity-overlay");
    expect(idleCssSource).toContain("grid-template-columns: 36px minmax(0, 1fr)");
    expect(idleCssSource).toContain("font-size: 19px");
  });

  it("keeps accrued money dominant and the two supporting stats in one compact row", () => {
    expect(idleCssSource).toContain("font-size: 27px");
    expect(idleCssSource).toContain("min-height: 54px");
    expect(idleCssSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(idleCssSource).toContain("font-size: 13px");
  });

  it("keeps vault progress readable without turning it into another dashboard panel", () => {
    expect(idleCssSource).toContain("height: 12px");
    expect(idleCssSource).toContain(".business-card-vault-helper");
    expect(idleCssSource).toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(idleCssSource).toContain("font-size: 10px");
  });

  it("keeps Topla and Detaylar as equal 48px mobile actions", () => {
    expect(idleCssSource).toContain(".business-card-actions");
    expect(idleCssSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(idleCssSource).toContain("min-height: 48px");
    expect(idleCssSource).toContain("@media (max-width: 430px)");
  });
});

describe("Businesses production image slots", () => {
  it("uses fixed drop-in asset paths so later PNG uploads need no layout changes", () => {
    expect(componentsSource).toContain('imagePath: "/businesses/stadium.png"');
    expect(componentsSource).toContain('imagePath: "/businesses/club-store.png"');
    expect(componentsSource).toContain('imagePath: "/businesses/fan-club.png"');
    expect(componentsSource).toContain("1600 × 900 PNG / WEBP");
  });

  it("renders real image elements with a safe placeholder fallback", () => {
    expect(componentsSource).toContain("function renderBusinessMedia");
    expect(componentsSource).toContain("data-business-image-slot");
    expect(componentsSource).toContain("data-business-image");
    expect(componentsSource).toContain('data-image-state="loading"');
    expect(componentsSource).not.toContain("<svg");
    expect(componentsSource).not.toContain("business-card-stadium-scene");
    expect(componentsSource).not.toContain("business-card-store-scene");
    expect(componentsSource).not.toContain("business-card-fan-scene");
  });

  it("hydrates loaded assets and leaves missing files as placeholders without broken-image chrome", () => {
    expect(idleIndexSource).toContain("function hydrateBusinessMedia");
    expect(idleIndexSource).toContain('slot.dataset.imageState = "ready"');
    expect(idleIndexSource).toContain('slot.dataset.imageState = "placeholder"');
    expect(idleIndexSource).toContain("image.naturalWidth > 0");
    expect(idleIndexSource).toContain("hydrateBusinessMedia(this.root)");
  });

  it("locks the media region to the approved 16:9 production geometry", () => {
    expect(idleCssSource).toContain("/* Part 6 — production image slots / placeholder system */");
    expect(idleCssSource).toContain("aspect-ratio: var(--idle-business-image-ratio)");
    expect(idleCssSource).toContain("min-height: var(--idle-business-image-min-height)");
    expect(idleCssSource).toContain("object-fit: cover");
    expect(idleCssSource).toContain('data-image-state="ready"');
    expect(idleCssSource).toContain('data-image-state="placeholder"');
  });

  it("removes the obsolete SVG milestone visual systems instead of keeping dead art CSS", () => {
    expect(idleCssSource).not.toContain("/* Part 9 — Stadium visual system / milestone art direction */");
    expect(idleCssSource).not.toContain("/* Part 10 — Club Store visual system / merchandise progression */");
    expect(idleCssSource).not.toContain("/* Part 11 — Fan Club visual system / supporter progression */");
    expect(componentsSource).not.toContain("getBusinessVisualStage");
    expect(componentsSource).not.toContain("row.dataset.visualStage");
  });
});


describe("Businesses detail panel architecture", () => {
  it("adds a Details entry point to every business card", () => {
    expect(componentsSource).toContain("data-business-details");
    expect(componentsSource).toContain("business-card-details");
    expect(componentsSource).toContain("DETAYLAR");
  });

  it("renders an accessible dialog shell with business and vault tabs", () => {
    expect(idleIndexSource).toContain("data-idle-detail-layer");
    expect(idleIndexSource).toContain('role="dialog"');
    expect(idleIndexSource).toContain('aria-modal="true"');
    expect(idleIndexSource).toContain('data-idle-detail-tab="business"');
    expect(idleIndexSource).toContain('data-idle-detail-tab="vault"');
    expect(idleIndexSource).toContain('data-idle-detail-panel="business"');
    expect(idleIndexSource).toContain('data-idle-detail-panel="vault"');
  });

  it("opens, closes and switches detail tabs without touching backend actions", () => {
    expect(idleIndexSource).toContain("openBusinessDetails");
    expect(idleIndexSource).toContain("closeBusinessDetails");
    expect(idleIndexSource).toContain("setDetailTab");
    expect(idleIndexSource).toContain('event.key === "Escape"');
    expect(idleIndexSource).toContain('button.matches("[data-business-details]")');
    expect(idleIndexSource).toContain('button.matches("[data-idle-detail-tab]")');
  });

  it("keeps only the three live essentials in the Details header summary", () => {
    expect(idleIndexSource).toContain("renderBusinessDetails");
    expect(idleIndexSource).toContain("BUSINESS_DETAIL_DEFINITIONS");
    expect(idleIndexSource).toContain("data-idle-detail-accrued");
    expect(idleIndexSource).toContain("data-idle-detail-hourly");
    expect(idleIndexSource).toContain("data-idle-detail-vault");
    expect(idleIndexSource).not.toContain("data-idle-detail-daily");
    expect(idleIndexSource).toContain("business.liveAccruedMicrocents + business.liveRemainingCapacityMicrocents");
    expect(idleIndexSource).not.toContain("data-idle-detail-current");
    expect(idleIndexSource).not.toContain("data-idle-next-comparison");
    expect(idleIndexSource).not.toContain("data-idle-vault-next");
  });

  it("keeps the drawer behavior while the final desktop shell overrides its visual system", () => {
    expect(idleCssSource).toContain("/* Part 12 — premium detail drawer / mobile fullscreen architecture */");
    expect(idleCssSource).toContain("/* Part 13 — green/charcoal Details shell */");
    expect(idleCssSource).toContain(".business-detail-drawer");
    expect(idleCssSource).toContain("width: min(680px, 72vw)");
    expect(idleCssSource).toContain("transform: translateX(104%)");
    expect(idleCssSource).toContain("width: 100vw");
    expect(idleCssSource).toContain("height: 100dvh");
    expect(idleCssSource).toContain("transform: translateY(102%)");
  });

  it("locks background scrolling and restores reduced-motion behavior", () => {
    expect(idleCssSource).toContain("body.business-detail-open");
    expect(idleCssSource).toContain("overflow: hidden");
    expect(idleCssSource).toContain("@media (prefers-reduced-motion: reduce)");
  });
});


describe("Businesses green charcoal Details shell", () => {
  it("uses the approved green charcoal surface and wider desktop drawer", () => {
    expect(idleCssSource).toContain("/* Part 13 — green/charcoal Details shell */");
    expect(idleCssSource).toContain("width: min(680px, 72vw)");
    expect(idleCssSource).toContain("border-left: 1px solid rgba(84, 242, 163, .14)");
    expect(idleCssSource).toContain("linear-gradient(180deg, #0d1718 0%, #0a1415 48%, #081011 100%)");
  });

  it("uses product typography instead of the old mono-heavy Details chrome", () => {
    expect(idleCssSource).toContain(".business-detail-heading h2");
    expect(idleCssSource).toContain("font-family: var(--idle-font-display)");
    expect(idleCssSource).toContain(".business-detail-tabs button");
    expect(idleCssSource).toContain("font-family: var(--idle-font-ui)");
  });

  it("renders three clean summary cards for accrued, hourly income and vault capacity", () => {
    expect(idleIndexSource).toContain("BİRİKMİŞ GELİR");
    expect(idleIndexSource).toContain("SAATLİK GELİR");
    expect(idleIndexSource).toContain("KASA KAPASİTESİ");
    expect(idleCssSource).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(idleCssSource).toContain("min-height: 78px");
  });

  it("uses restrained green active tabs, status badges and focus treatment", () => {
    expect(idleCssSource).toContain('business-detail-tabs button[data-active="true"]');
    expect(idleCssSource).toContain("linear-gradient(135deg, var(--idle-green-bright), var(--idle-green))");
    expect(idleCssSource).toContain("color: var(--idle-green-bright)");
    expect(idleCssSource).toContain("box-shadow: var(--idle-focus-ring)");
  });
});


describe("Businesses stage-card level progression", () => {
  it("renders the real Lv0-Lv8 route directly as stage cards", () => {
    expect(idleIndexSource).toContain("data-idle-business-level-tree");
    expect(idleIndexSource).toContain("renderBusinessLevelTree");
    expect(idleIndexSource).toContain("definition.levels.map");
    expect(idleIndexSource).toContain("businessLevelTreeNode.innerHTML");
    expect(idleIndexSource).toContain("business-level-node-income");
    expect(idleIndexSource).toContain("business-level-node-meta");
  });

  it("derives completed, current, next and locked states from the real current level", () => {
    expect(idleIndexSource).toContain("function getBusinessLevelState");
    expect(idleIndexSource).toContain('return "completed"');
    expect(idleIndexSource).toContain('return "current"');
    expect(idleIndexSource).toContain('return stageLevel === 0 ? "future" : "locked"');
    expect(idleIndexSource).toContain('data-level-state="');
  });

  it("shows clear hourly, daily, investment and payback information inside every stage", () => {
    expect(idleIndexSource).toContain("SAATLİK GELİR");
    expect(idleIndexSource).toContain("GÜNLÜK GELİR");
    expect(idleIndexSource).toContain("YATIRIM");
    expect(idleIndexSource).toContain("GERİ DÖNÜŞ");
    expect(idleIndexSource).toContain("stage.targetRoiDays");
  });

  it("puts the business upgrade action only on the immediate next stage", () => {
    expect(idleIndexSource).toContain("business-level-node-action");
    expect(idleIndexSource).toContain("business-level-node-upgrade");
    expect(idleIndexSource).toContain("data-idle-detail-upgrade");
    expect(idleIndexSource).toContain('button.matches("[data-idle-detail-upgrade]")');
    expect(idleIndexSource).toContain("upgradeIdleBusiness(businessId)");
    expect(idleIndexSource).toContain("Yükseltme sonrası Kasa Lv1'e döner");
    expect(idleIndexSource).toContain("Bakiye yetersiz");
  });

  it("keeps star milestones and premium stage states visible", () => {
    expect(idleIndexSource).toContain('stage.level >= 6');
    expect(idleIndexSource).toContain('★');
    expect(idleIndexSource).toContain("getBusinessLevelMilestone");
    expect(idleCssSource).toContain("/* Part 14 — premium business stage cards */");
    expect(idleCssSource).toContain('.business-level-node[data-level-state="completed"]');
    expect(idleCssSource).toContain('.business-level-node[data-level-state="current"]');
    expect(idleCssSource).toContain('.business-level-node[data-level-state="future"]');
    expect(idleCssSource).toContain('.business-level-node[data-level-state="locked"]');
  });
});


describe("Businesses premium business stage cards", () => {
  it("replaces the old four-box economy grid with a clearer income-first hierarchy", () => {
    expect(idleIndexSource).toContain("business-level-node-income");
    expect(idleIndexSource).toContain("business-level-node-meta");
    expect(idleIndexSource).not.toContain("business-level-node-economy");
    expect(idleCssSource).toContain("/* Part 14 — premium business stage cards */");
    expect(idleCssSource).toContain("font-size: 22px");
  });

  it("keeps investment and payback as secondary metadata instead of extra dashboard cards", () => {
    expect(idleIndexSource).toContain("<dl class=\"business-level-node-meta\">");
    expect(idleIndexSource).toContain("<dt>YATIRIM</dt>");
    expect(idleIndexSource).toContain("<dt>GERİ DÖNÜŞ</dt>");
    expect(idleCssSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });

  it("uses green state treatment for completed, current, next and locked stages", () => {
    expect(idleCssSource).toContain('.business-level-node[data-level-state="completed"]');
    expect(idleCssSource).toContain('.business-level-node[data-level-state="current"]');
    expect(idleCssSource).toContain('.business-level-node[data-level-state="future"]');
    expect(idleCssSource).toContain('.business-level-node[data-level-state="locked"]');
    expect(idleCssSource).toContain("background: var(--idle-green)");
    expect(idleCssSource).toContain("background: var(--idle-green-deep)");
  });

  it("keeps the upgrade CTA only on the immediate next stage and makes it a 48px green action", () => {
    expect(idleIndexSource).toContain("const actionMarkup = isImmediateFuture");
    expect(idleIndexSource).toContain("data-idle-detail-upgrade");
    expect(idleCssSource).toContain(".business-level-node-upgrade");
    expect(idleCssSource).toContain("min-height: 48px");
    expect(idleCssSource).toContain("linear-gradient(135deg, var(--idle-green-bright), var(--idle-green))");
  });
});


describe("Businesses stage-card vault progression", () => {
  it("renders the approved 1h-24h vault ladder directly as stage cards", () => {
    expect(idleIndexSource).toContain("data-idle-vault-level-tree");
    expect(idleIndexSource).toContain("renderVaultLevelTree");
    expect(idleIndexSource).toContain("VAULT_LEVELS.map");
    expect(idleIndexSource).toContain("1SA → 24SA");
    expect(idleIndexSource).toContain("vault-level-node-capacity");
    expect(idleIndexSource).toContain("vault-level-node-meta");
  });

  it("uses the approved vault costs without changing economy math", () => {
    expect(idleIndexSource).toContain("VAULT_UPGRADE_STEPS");
    expect(idleIndexSource).toContain("getVaultUpgradeCostCents");
    expect(idleIndexSource).toContain("step.costPercent");
    expect(idleIndexSource).toContain("vault.capacityHours");
  });

  it("derives completed, current, next and locked vault states from live level", () => {
    expect(idleIndexSource).toContain("function getVaultLevelState");
    expect(idleIndexSource).toContain('data-vault-state="');
    expect(idleIndexSource).toContain('"completed"');
    expect(idleIndexSource).toContain('"current"');
    expect(idleIndexSource).toContain('"future"');
    expect(idleIndexSource).toContain('"locked"');
  });

  it("puts the server-backed Kasa upgrade action only on the immediate next vault stage", () => {
    expect(idleIndexSource).toContain("vault-level-node-action");
    expect(idleIndexSource).toContain("vault-level-node-upgrade");
    expect(idleIndexSource).toContain("data-idle-detail-vault-upgrade");
    expect(idleIndexSource).toContain('button.matches("[data-idle-detail-vault-upgrade]")');
    expect(idleIndexSource).toContain("upgradeIdleVault(businessId)");
    expect(idleIndexSource).toContain("Bakiye yetersiz");
  });

  it("styles a premium responsive vault timeline with max-level treatment", () => {
    expect(idleCssSource).toContain("/* Part 15 — premium vault stage cards */");
    expect(idleCssSource).toContain(".vault-level-tree");
    expect(idleCssSource).toContain('.vault-level-node[data-vault-state="current"]');
    expect(idleCssSource).toContain('.vault-level-node[data-vault-state="future"]');
    expect(idleCssSource).toContain('.vault-level-node[data-vault-level="6"]');
    expect(idleCssSource).toContain(".vault-level-node-upgrade");
  });
});


describe("Businesses premium vault stage cards", () => {
  it("replaces the old two-box vault economy layout with a capacity-first hierarchy", () => {
    expect(idleIndexSource).toContain("vault-level-node-capacity");
    expect(idleIndexSource).toContain("vault-level-node-meta");
    expect(idleIndexSource).not.toContain("vault-level-node-economy");
    expect(idleCssSource).toContain("/* Part 15 — premium vault stage cards */");
    expect(idleCssSource).toContain("font-size: 22px");
  });

  it("keeps upgrade cost and the approved percent rule visible as secondary metadata", () => {
    expect(idleIndexSource).toContain("<dl class=\"vault-level-node-meta\">");
    expect(idleIndexSource).toContain("<dt>MALİYET KURALI</dt>");
    expect(idleIndexSource).toContain("İşletme bedelinin %");
    expect(idleCssSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });

  it("uses the same green progression states as business stages", () => {
    expect(idleCssSource).toContain('.vault-level-node[data-vault-state="completed"]');
    expect(idleCssSource).toContain('.vault-level-node[data-vault-state="current"]');
    expect(idleCssSource).toContain('.vault-level-node[data-vault-state="future"]');
    expect(idleCssSource).toContain('.vault-level-node[data-vault-state="locked"]');
    expect(idleCssSource).toContain("background: var(--idle-green)");
    expect(idleCssSource).toContain("background: var(--idle-green-deep)");
  });

  it("keeps the next-stage Kasa CTA 48px and gives 24h max a distinct final treatment", () => {
    expect(idleIndexSource).toContain('state === "future" && costCents !== null');
    expect(idleIndexSource).toContain("data-idle-detail-vault-upgrade");
    expect(idleCssSource).toContain(".vault-level-node-upgrade");
    expect(idleCssSource).toContain("min-height: 48px");
    expect(idleCssSource).toContain('.vault-level-node[data-vault-level="6"][data-vault-state="current"]');
  });
});


describe("Businesses final mobile Details composition", () => {
  it("locks Details to a true fullscreen mobile drawer with a single scroll region", () => {
    expect(idleCssSource).toContain("/* Part 16 — final mobile Details fullscreen composition */");
    expect(idleCssSource).toContain("width: 100%");
    expect(idleCssSource).toContain("height: 100dvh");
    expect(idleCssSource).toContain("grid-template-rows: auto auto auto auto minmax(0, 1fr)");
    expect(idleCssSource).toContain("overflow: hidden");
    expect(idleCssSource).toContain("touch-action: none");
    expect(idleCssSource).toContain("touch-action: pan-y");
  });

  it("keeps the mobile header tabs and summary outside the scrolling stage list", () => {
    expect(idleCssSource).toContain(".business-detail-header");
    expect(idleCssSource).toContain(".business-detail-tabs");
    expect(idleCssSource).toContain(".business-detail-summary");
    expect(idleCssSource).toContain(".business-detail-scroll");
    expect(idleCssSource).toContain("min-height: 0");
    expect(idleCssSource).toContain("overflow-y: auto");
    expect(idleCssSource).toContain("overscroll-behavior-y: contain");
  });

  it("uses a readable mobile summary with accrued money dominant", () => {
    expect(idleCssSource).toContain(".business-detail-summary > div:first-child");
    expect(idleCssSource).toContain("grid-column: 1 / -1");
    expect(idleCssSource).toContain("font-size: 20px");
    expect(idleCssSource).toContain("font-size: 15px");
  });

  it("keeps core Details touch targets at least 44-48px", () => {
    expect(idleCssSource).toContain("min-height: 46px");
    expect(idleCssSource).toContain("min-height: 48px");
    expect(idleCssSource).toContain("touch-action: manipulation");
  });

  it("keeps short phone landscape usable with a two-column fullscreen layout", () => {
    expect(idleCssSource).toContain("@media (orientation: landscape) and (max-height: 520px) and (max-width: 950px)");
    expect(idleCssSource).toContain("grid-template-columns: minmax(220px, .7fr) minmax(0, 1.3fr)");
    expect(idleCssSource).toContain("grid-row: 2 / 4");
    expect(idleCssSource).toContain("padding-bottom: max(18px, env(safe-area-inset-bottom))");
  });
});


describe("Businesses upgrade feedback choreography", () => {
  it("captures before and after server-backed state for successful upgrades", () => {
    expect(idleIndexSource).toContain("getBusinessSnapshot");
    expect(idleIndexSource).toContain("playUpgradeFeedback");
    expect(idleIndexSource).toContain('type UpgradeFeedbackKind = "business" | "vault"');
    expect(idleIndexSource).toContain("before.businessLevel !== after.businessLevel");
    expect(idleIndexSource).toContain("before.vaultLevel !== after.vaultLevel");
  });

  it("wires both card and Details upgrade actions into feedback without affecting Collect", () => {
    expect(idleIndexSource).toContain('() => upgradeIdleBusiness(businessId),\n        "business"');
    expect(idleIndexSource).toContain('() => upgradeIdleVault(businessId),\n        "vault"');
    expect(idleIndexSource).toContain("void this.runCollectBusiness(businessId)");
    expect(idleIndexSource).toContain("const result = await collectIdleBusiness(businessId);");
    expect(idleIndexSource).toContain("upgradeFeedback?: UpgradeFeedbackKind");
  });

  it("shows a live count-up status toast for income and vault capacity", () => {
    expect(idleIndexSource).toContain("business-upgrade-toast");
    expect(idleIndexSource).toContain('toast.setAttribute("aria-live", "polite")');
    expect(idleIndexSource).toContain("deltaHourly * eased");
    expect(idleIndexSource).toContain("afterVault.capacityHours - beforeVault.capacityHours");
    expect(idleIndexSource).toContain("const duration = reducedMotion ? 0 : 860");
  });

  it("applies restrained cyan sweep, level, number and visual transition animations", () => {
    expect(idleCssSource).toContain("/* Part 16 — premium upgrade feedback choreography */");
    expect(idleCssSource).toContain("@keyframes idle-upgrade-sweep");
    expect(idleCssSource).toContain("@keyframes idle-upgrade-level-pop");
    expect(idleCssSource).toContain("@keyframes idle-upgrade-number-rise");
    expect(idleCssSource).toContain("@keyframes idle-upgrade-visual-lift");
    expect(idleCssSource).toContain("@keyframes idle-upgrade-vault-pulse");
  });

  it("keeps upgrade feedback mobile-safe and honors reduced motion", () => {
    expect(idleCssSource).toContain(".business-detail-drawer > .business-upgrade-toast");
    expect(idleCssSource).toContain("@media (max-width: 420px)");
    expect(idleCssSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(idleCssSource).toContain("animation: none");
  });
});


describe("Businesses collect and completion polish", () => {
  it("uses the server-confirmed collected amount for individual and collect-all feedback", () => {
    expect(idleIndexSource).toContain("runCollectBusiness");
    expect(idleIndexSource).toContain("result.collectedCents");
    expect(idleIndexSource).toContain("playCollectFeedback");
    expect(idleIndexSource).toContain("playCollectAllFeedback");
    expect(idleIndexSource).toContain("GELİR TOPLANDI");
    expect(idleIndexSource).toContain("TÜM KASALAR TOPLANDI");
  });

  it("keeps visible money formatting currency-prefixed", () => {
    expect(idleIndexSource).toContain("return `$");
  });

  it("exposes explicit locked, active and max card-level marks", () => {
    expect(componentsSource).toContain("data-business-level-mark");
    expect(componentsSource).toContain("levelMarkNode.dataset.levelState");
    expect(componentsSource).toContain("\"LOCK\"");
    expect(componentsSource).toContain("\"MAX\"");
  });

  it("visually distinguishes full vault and max-level completion without changing economy logic", () => {
    expect(idleCssSource).toContain("/* Part 17 — collect / full-vault / max-level polish */");
    expect(idleCssSource).toContain(".business-card[data-business-status=\"full\"]");
    expect(idleCssSource).toContain(".business-card[data-business-level=\"8\"]");
    expect(idleCssSource).toContain(".business-card-level-mark[data-level-state=\"max\"]");
    expect(idleCssSource).toContain(".business-collect-toast");
    expect(idleCssSource).toContain(".business-collect-all-toast");
  });

  it("keeps collection feedback restrained and reduced-motion safe", () => {
    expect(idleCssSource).toContain("@keyframes idle-collect-card-flash");
    expect(idleCssSource).toContain("@keyframes idle-collect-toast-in");
    expect(idleCssSource).toContain("@media (prefers-reduced-motion: reduce)");
  });
});


describe("Businesses final responsive QA", () => {
  it("covers real phone landscape widths with a short-height fullscreen Details layout", () => {
    expect(idleCssSource).toContain("/* Part 18 — final responsive QA / short mobile landscape */");
    expect(idleCssSource).toContain("@media (orientation: landscape) and (max-height: 520px) and (max-width: 950px)");
    expect(idleCssSource).toContain("width: 100vw");
    expect(idleCssSource).toContain("height: 100dvh");
    expect(idleCssSource).toContain("transform: translateY(102%)");
    expect(idleCssSource).toContain("max(8px, env(safe-area-inset-bottom))");
  });

  it("keeps primary mobile touch targets comfortably large", () => {
    expect(idleCssSource).toContain(".business-card-primary,");
    expect(idleCssSource).toContain(".business-card-details");
    expect(idleCssSource).toContain("--idle-touch-height: 48px");
  });

  it("keeps the short landscape Details content scrollable and touch-safe", () => {
    expect(idleCssSource).toContain(".business-detail-scroll");
    expect(idleCssSource).toContain("-webkit-overflow-scrolling: touch");
    expect(idleCssSource).toContain("padding-bottom: max(18px, env(safe-area-inset-bottom))");
  });
});



describe("Businesses premium typography pass", () => {
  it("uses one corporate sans-serif system across the main screen and Details", () => {
    expect(idleCssSource).toContain("--idle-font-ui: Inter, ui-sans-serif, system-ui");
    expect(idleCssSource).toContain(".business-detail-drawer {");
    expect(idleCssSource).toContain("font-family: var(--idle-font-ui)");
  });

  it("keeps main-card names, vault copy and actions readable from canonical mobile rules", () => {
    expect(idleCssSource).not.toContain("/* Mobile readability hotfix — titles, vault copy, primary actions */");
    expect(idleCssSource).toContain(".business-row-title strong");
    expect(idleCssSource).toContain("font-size: 22px");
    expect(idleCssSource).toContain("text-overflow: clip");
    expect(idleCssSource).toContain("white-space: normal");
    expect(idleCssSource).toContain(".business-card-vault-helper small");
    expect(idleCssSource).toContain("font-size: 12px");
    expect(idleCssSource).toContain(".business-card-primary,");
    expect(idleCssSource).toContain("font-size: 13px");
  });

  it("keeps Details tabs and stage-card CTAs readable", () => {
    expect(idleCssSource).toContain(".business-detail-tabs button");
    expect(idleCssSource).toContain(".business-level-node-upgrade");
    expect(idleCssSource).toContain(".vault-level-node-upgrade");
    expect(idleCssSource).toContain("--idle-touch-height: 48px");
  });
});


describe("Businesses refinement final responsive regression", () => {
  it("keeps the main card information stack simple on phone widths", () => {
    expect(idleCssSource).toContain("@media (max-width: 760px)");
    expect(idleCssSource).toContain(".business-card-quick-stats");
    expect(idleCssSource).toContain(".business-card-vault-status");
    expect(idleCssSource).toContain("grid-template-columns: 1fr");
  });

  it("lets vault timing wrap on narrow phones", () => {
    expect(idleCssSource).toContain("@media (max-width: 760px)");
    expect(idleCssSource).toContain(".business-card-vault-helper");
    expect(idleCssSource).toContain("flex-wrap: wrap");
    expect(idleCssSource).toContain("flex-basis: 100%");
  });

  it("keeps dense Details stage cards readable on phone widths", () => {
    expect(idleCssSource).toContain(".business-detail-summary");
    expect(idleCssSource).toContain(".business-level-node-income");
    expect(idleCssSource).toContain(".business-level-node-meta");
    expect(idleCssSource).toContain(".vault-level-node-capacity");
    expect(idleCssSource).toContain(".vault-level-node-meta");
    expect(idleCssSource).toContain(".business-level-node-card");
    expect(idleCssSource).toContain(".vault-level-node-card");
  });

  it("keeps the simplified main-card action contract intact", () => {
    expect(componentsSource).toContain("data-business-collect");
    expect(componentsSource).toContain("data-business-details");
    expect(componentsSource).not.toContain("business-card-action--collect");
    expect(componentsSource).not.toContain("business-card-action--details");
    expect(componentsSource).not.toContain("data-business-upgrade");
    expect(componentsSource).not.toContain("data-business-vault-upgrade");
    expect((componentsSource.match(/data-business-details/g) ?? []).length).toBe(1);
    expect(idleIndexSource).toContain('button.matches("[data-business-details]")');
  });

  it("retains all critical live state and Details upgrade regression hooks", () => {
    expect(componentsSource).toContain('"KASA DOLU"');
    expect(componentsSource).toContain('"MAX SEVİYE"');
    expect(idleIndexSource).toContain("runCollectBusiness");
    expect(idleIndexSource).toContain("runCollectAll");
    expect(idleIndexSource).toContain("data-idle-detail-upgrade");
    expect(idleIndexSource).toContain("data-idle-detail-vault-upgrade");
  });
});


describe("Businesses legacy CSS cleanup", () => {
  it("removes the pre-v2 legacy Businesses layer and temporary hotfix blocks", () => {
    expect(idleCssSource).not.toContain("/* Hotfix — reset legacy Businesses grid inheritance */");
    expect(idleCssSource).not.toContain("/* Mobile main-menu hard alignment */");
    expect(idleCssSource).not.toContain("/* Final Ana Menü nav placement — structural override */");
    expect(idleCssSource).not.toContain("grid-template-columns: minmax(210px, 1.3fr)");
    expect(idleCssSource).not.toContain('font: 700 8px/1.2 "DM Mono", monospace');
  });

  it("keeps the needed header and tablet behavior inside the canonical Part 3–8 rules", () => {
    expect(idleCssSource).toContain("/* Part 3–8 — final Businesses command + card architecture */");
    expect(idleCssSource).toContain(".route-shell.is-businesses-page .businesses-header {");
    expect(idleCssSource).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(idleCssSource).toContain("align-items: stretch");
    expect(idleCssSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(idleCssSource).toContain("min-height: 168px");
  });

  it("keeps new parts canonical without reintroducing the deleted legacy layer", () => {
    expect(idleCssSource).not.toContain("/* Hotfix — reset legacy Businesses grid inheritance */");
    expect(idleCssSource).not.toContain("/* Mobile readability hotfix — titles, vault copy, primary actions */");
    expect(idleCssSource).not.toContain("/* Mobile main-menu hard alignment */");
    expect(idleCssSource).not.toContain("grid-template-columns: minmax(210px, 1.3fr)");
  });
});
