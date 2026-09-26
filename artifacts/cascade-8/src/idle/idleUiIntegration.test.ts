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
    expect(idleCssSource).toContain("html.businesses-route .app-shell.is-businesses-page");
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
    expect(idleCssSource).toContain("--idle-page-max: 1240px");
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



describe("Businesses premium command header", () => {
  it("keeps title, wallet and compact club progression as the global hierarchy", () => {
    expect(idleIndexSource).toContain("FAHRİNİN YOLU // CLUB EMPIRE");
    expect(idleIndexSource).toContain("ORTAK BAKİYE");
    expect(idleIndexSource).toContain("KULÜP GELİŞİMİ");
    expect(idleIndexSource).toContain("data-idle-progression-levels");
    expect(idleIndexSource).toContain("data-idle-progression-track");
    expect(idleIndexSource).toContain("data-idle-active-businesses");
  });

  it("uses the rebuilt responsive header architecture", () => {
    expect(idleCssSource).toContain("/* Part 3–8 — final Businesses command + card architecture */");
    expect(idleCssSource).toContain(".businesses-header-main");
    expect(idleCssSource).toContain(".businesses-progression");
    expect(idleCssSource).toContain("minmax(250px, 300px)");
    expect(idleCssSource).toContain("@media (max-width: 760px)");
  });
});


describe("Businesses premium KPI command bar", () => {
  it("reduces the command surface to hourly income, collectable cash and Collect All", () => {
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

  it("uses a simpler three-part desktop surface and mobile fallback", () => {
    expect(idleCssSource).toContain("minmax(280px, 1.2fr)");
    expect(idleCssSource).toContain(".business-summary-collect-all");
    expect(idleCssSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });
});


describe("Businesses premium desktop cards", () => {
  it("renders three clear business cards with one visual region and one information body", () => {
    expect(componentsSource).toContain("business-card business-card--");
    expect(componentsSource).toContain("business-card-visual");
    expect(componentsSource).toContain("business-card-body");
    expect(componentsSource).toContain("business-card-header");
    expect(componentsSource).toContain("business-card-accrued");
    expect(componentsSource).toContain("business-card-quick-stats");
    expect(componentsSource).toContain("business-card-vault-status");
    expect(componentsSource).toContain("business-card-actions");
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
  it("avoids the old mini-dashboard structure on each card", () => {
    expect(componentsSource).not.toContain("business-card-metrics");
    expect(componentsSource).not.toContain("business-card-operations");
    expect(componentsSource).not.toContain("business-card-footer");
    expect(componentsSource).not.toContain("business-card-code");
    expect(componentsSource).not.toContain("business-card-milestone");
  });

  it("reserves distinct visual identity areas for Stadium, Club Store and Fan Club", () => {
    expect(componentsSource).toContain("business-card-art--stadium");
    expect(componentsSource).toContain("business-card-art--club-store");
    expect(componentsSource).toContain("business-card-art--fan-club");
    expect(idleCssSource).toContain(".business-card--club-store .business-card-visual");
    expect(idleCssSource).toContain(".business-card--fan-club .business-card-visual");
  });
});


describe("Businesses card information hierarchy", () => {
  it("makes accrued cash the dominant card value", () => {
    expect(componentsSource).toContain("business-card-accrued-heading");
    expect(componentsSource).toContain("data-business-accrued-status");
    expect(idleCssSource).toContain(".business-card-accrued > strong");
    expect(idleCssSource).toContain("font-size: clamp(28px, 2.5vw, 35px)");
  });

  it("keeps only hourly income and Kasa as quick stats", () => {
    expect(componentsSource).toContain("business-card-quick-stats");
    expect(componentsSource).toContain("SAATLİK GELİR");
    expect(componentsSource).toContain("<span>KASA</span>");
    expect(componentsSource).not.toContain("data-business-daily");
  });

  it("keeps vault fullness and ETA as one readable status line plus progress bar", () => {
    expect(componentsSource).toContain("business-card-vault-status");
    expect(componentsSource).toContain("data-business-vault-fill");
    expect(componentsSource).toContain("data-business-vault-eta");
    expect(componentsSource).toContain("data-business-vault-progress");
    expect(componentsSource).toContain("formatVaultEta(");
    expect(idleCssSource).toContain("height: 8px");
  });
});


describe("Businesses premium action states", () => {
  it("keeps exactly two main-card actions: Collect and Details", () => {
    expect(componentsSource).toContain("business-card-action--collect");
    expect(componentsSource).toContain("business-card-action--details");
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


describe("Businesses dedicated mobile cards", () => {
  it("uses a single-column card flow instead of shrinking the desktop grid", () => {
    expect(idleCssSource).toContain("@media (max-width: 760px)");
    expect(idleCssSource).toContain(".business-list");
    expect(idleCssSource).toContain("grid-template-columns: 1fr");
    expect(idleCssSource).toContain("grid-template-rows: 126px auto");
  });

  it("keeps the two primary actions side-by-side on phone widths", () => {
    expect(idleCssSource).toContain(".business-card-actions");
    expect(idleCssSource).toContain("minmax(0, 1.08fr) minmax(0, .92fr)");
    expect(idleCssSource).toContain("@media (max-width: 430px)");
    expect(idleCssSource).toContain("grid-template-columns: 1fr 1fr");
  });

  it("lets vault timing wrap instead of becoming unreadable", () => {
    expect(idleCssSource).toContain(".business-card-vault-meta");
    expect(idleCssSource).toContain("flex-wrap: wrap");
    expect(idleCssSource).toContain("flex-basis: 100%");
  });
});

describe("Businesses Stadium milestone visuals", () => {
  it("renders a real vector Stadium scene instead of the generic placeholder geometry", () => {
    expect(componentsSource).toContain("business-card-stadium-scene");
    expect(componentsSource).toContain('viewBox="0 0 420 190"');
    expect(componentsSource).toContain("stadium-floodlights");
    expect(componentsSource).toContain("stadium-shell");
    expect(componentsSource).toContain("stadium-pitch");
    expect(componentsSource).toContain("stadium-crowd");
  });

  it("maps real business levels into locked, local, pro, elite and landmark visual milestones", () => {
    expect(componentsSource).toContain("function getBusinessVisualStage");
    expect(componentsSource).toContain('return "locked"');
    expect(componentsSource).toContain('return "local"');
    expect(componentsSource).toContain('return "pro"');
    expect(componentsSource).toContain('return "elite"');
    expect(componentsSource).toContain('return "landmark"');
    expect(componentsSource).toContain("row.dataset.visualStage = visualStage");
  });

  it("keeps Stadium progression visual-only instead of adding another card label", () => {
    expect(componentsSource).not.toContain("data-business-milestone");
    expect(componentsSource).toContain("row.dataset.visualStage = visualStage");
  });

  it("styles each milestone with increasingly premium lighting and architecture", () => {
    expect(idleCssSource).toContain("/* Part 9 — Stadium visual system / milestone art direction */");
    expect(idleCssSource).toContain('[data-visual-stage="locked"]');
    expect(idleCssSource).toContain('[data-visual-stage="local"]');
    expect(idleCssSource).toContain('[data-visual-stage="pro"]');
    expect(idleCssSource).toContain('[data-visual-stage="elite"]');
    expect(idleCssSource).toContain('[data-visual-stage="landmark"]');
    expect(idleCssSource).toContain(".stadium-star-crown");
  });
});


describe("Businesses Club Store milestone visuals", () => {
  it("renders a real Club Store vector scene with retail merchandise details", () => {
    expect(componentsSource).toContain("business-card-store-scene");
    expect(componentsSource).toContain("store-shell");
    expect(componentsSource).toContain("store-signage");
    expect(componentsSource).toContain("store-merch");
    expect(componentsSource).toContain("store-shelves");
    expect(componentsSource).toContain("store-premium-rack");
  });

  it("keeps the shared level milestone mapping without an extra Club Store text badge", () => {
    expect(componentsSource).not.toContain("data-business-milestone");
    expect(componentsSource).toContain("row.dataset.visualStage = visualStage");
  });

  it("styles the Store across locked, local, pro, elite and iconic flagship states", () => {
    expect(idleCssSource).toContain("/* Part 10 — Club Store visual system / merchandise progression */");
    expect(idleCssSource).toContain('.business-card--club-store[data-visual-stage="locked"]');
    expect(idleCssSource).toContain('.business-card--club-store[data-visual-stage="local"]');
    expect(idleCssSource).toContain('.business-card--club-store[data-visual-stage="pro"]');
    expect(idleCssSource).toContain('.business-card--club-store[data-visual-stage="elite"]');
    expect(idleCssSource).toContain('.business-card--club-store[data-visual-stage="landmark"]');
    expect(idleCssSource).toContain(".store-flagship-mark");
  });

  it("includes dedicated mobile sizing for the Club Store hero art", () => {
    expect(idleCssSource).toContain(".business-card--club-store .business-card-store-scene svg");
    expect(idleCssSource).toContain("min-height: 148px");
    expect(idleCssSource).toContain("min-height: 134px");
  });
});


describe("Businesses Fan Club milestone visuals", () => {
  it("renders a real supporter lounge scene with media, seating and fan atmosphere", () => {
    expect(componentsSource).toContain("business-card-fan-scene");
    expect(componentsSource).toContain("fan-lounge-shell");
    expect(componentsSource).toContain("fan-media");
    expect(componentsSource).toContain("fan-seating");
    expect(componentsSource).toContain("fan-supporters");
    expect(componentsSource).toContain("fan-flags");
    expect(componentsSource).toContain("fan-scarves");
  });

  it("uses the shared progression stage map without an extra Fan Club text badge", () => {
    expect(componentsSource).not.toContain("data-business-milestone");
    expect(componentsSource).toContain("row.dataset.visualStage = visualStage");
  });

  it("styles locked, local, pro, elite and iconic supporter headquarters states", () => {
    expect(idleCssSource).toContain("/* Part 11 — Fan Club visual system / supporter progression */");
    expect(idleCssSource).toContain('.business-card--fan-club[data-visual-stage="locked"]');
    expect(idleCssSource).toContain('.business-card--fan-club[data-visual-stage="local"]');
    expect(idleCssSource).toContain('.business-card--fan-club[data-visual-stage="pro"]');
    expect(idleCssSource).toContain('.business-card--fan-club[data-visual-stage="elite"]');
    expect(idleCssSource).toContain('.business-card--fan-club[data-visual-stage="landmark"]');
    expect(idleCssSource).toContain(".fan-icon-crown");
  });

  it("keeps the Fan Club hero tuned for mobile and reduced motion", () => {
    expect(idleCssSource).toContain(".business-card--fan-club .business-card-fan-scene svg");
    expect(idleCssSource).toContain("min-height: 148px");
    expect(idleCssSource).toContain("min-height: 134px");
    expect(idleCssSource).toContain("@media (prefers-reduced-motion: reduce)");
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

  it("keeps the compact header summary synchronized with live business state", () => {
    expect(idleIndexSource).toContain("renderBusinessDetails");
    expect(idleIndexSource).toContain("BUSINESS_DETAIL_DEFINITIONS");
    expect(idleIndexSource).toContain("data-idle-detail-hourly");
    expect(idleIndexSource).toContain("data-idle-detail-daily");
    expect(idleIndexSource).toContain("data-idle-detail-vault");
    expect(idleIndexSource).not.toContain("data-idle-detail-current");
    expect(idleIndexSource).not.toContain("data-idle-next-comparison");
    expect(idleIndexSource).not.toContain("data-idle-vault-next");
  });

  it("uses a desktop side drawer and a mobile fullscreen details composition", () => {
    expect(idleCssSource).toContain("/* Part 12 — premium detail drawer / mobile fullscreen architecture */");
    expect(idleCssSource).toContain(".business-detail-drawer");
    expect(idleCssSource).toContain("width: min(560px, 96vw)");
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


describe("Businesses stage-card level progression", () => {
  it("renders the real Lv0-Lv8 route directly as stage cards", () => {
    expect(idleIndexSource).toContain("data-idle-business-level-tree");
    expect(idleIndexSource).toContain("renderBusinessLevelTree");
    expect(idleIndexSource).toContain("definition.levels.map");
    expect(idleIndexSource).toContain("businessLevelTreeNode.innerHTML");
    expect(idleIndexSource).toContain("business-level-node-economy");
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
    expect(idleCssSource).toContain("/* Part 13 — stage-card business progression */");
    expect(idleCssSource).toContain('.business-level-node[data-level-state="completed"]');
    expect(idleCssSource).toContain('.business-level-node[data-level-state="current"]');
    expect(idleCssSource).toContain('.business-level-node[data-level-state="future"]');
    expect(idleCssSource).toContain('.business-level-node[data-level-state="locked"]');
  });
});


describe("Businesses stage-card vault progression", () => {
  it("renders the approved 1h-24h vault ladder directly as stage cards", () => {
    expect(idleIndexSource).toContain("data-idle-vault-level-tree");
    expect(idleIndexSource).toContain("renderVaultLevelTree");
    expect(idleIndexSource).toContain("VAULT_LEVELS.map");
    expect(idleIndexSource).toContain("1SA → 24SA");
    expect(idleIndexSource).toContain("vault-level-node-economy");
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
    expect(idleCssSource).toContain("/* Part 15 — stage-card vault progression */");
    expect(idleCssSource).toContain(".vault-level-tree");
    expect(idleCssSource).toContain('.vault-level-node[data-vault-state="current"]');
    expect(idleCssSource).toContain('.vault-level-node[data-vault-state="future"]');
    expect(idleCssSource).toContain('.vault-level-node[data-vault-level="6"]');
    expect(idleCssSource).toContain(".vault-level-node-upgrade");
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
    expect(idleCssSource).toContain(".business-card-vault-meta small");
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
    expect(idleCssSource).toContain("@media (max-width: 430px)");
    expect(idleCssSource).toContain(".business-card-vault-meta");
    expect(idleCssSource).toContain("flex-wrap: wrap");
    expect(idleCssSource).toContain("flex-basis: 100%");
  });

  it("keeps dense Details stage cards readable on phone widths", () => {
    expect(idleCssSource).toContain(".business-detail-summary");
    expect(idleCssSource).toContain(".business-level-node-economy");
    expect(idleCssSource).toContain(".vault-level-node-economy");
    expect(idleCssSource).toContain(".business-level-node-card");
    expect(idleCssSource).toContain(".vault-level-node-card");
  });

  it("keeps the simplified main-card action contract intact", () => {
    expect(componentsSource).toContain("business-card-action--collect");
    expect(componentsSource).toContain("business-card-action--details");
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

  it("cuts the stylesheet down instead of stacking another override layer", () => {
    expect(idleCssSource.split("\n").length).toBeLessThan(4000);
  });
});
