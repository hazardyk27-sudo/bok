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
  it("exposes Kasa upgrade as a secondary control on every business row", () => {
    expect(componentsSource).toContain("data-business-vault-upgrade");
    expect(componentsSource).toContain("getIdleVaultUpgradePreview(business)");
    expect(componentsSource).toContain("vaultUpgrade.isMaxLevel");
    expect(componentsSource).toContain("walletBalanceCents >= vaultCostCents");
  });

  it("wires the Kasa control to the real vault upgrade service", () => {
    expect(idleIndexSource).toContain("upgradeIdleVault,");
    expect(idleIndexSource).toContain(
      'button.matches("[data-business-vault-upgrade]")',
    );
    expect(idleIndexSource).toContain("upgradeIdleVault(businessId)");
  });

  it("keeps collect and main business upgrade actions alongside Kasa", () => {
    expect(idleIndexSource).toContain("collectIdleBusiness(businessId)");
    expect(idleIndexSource).toContain("upgradeIdleBusiness(businessId)");
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

  it("shows richer business information for readability", () => {
    expect(componentsSource).toContain("SAATLİK GELİR");
    expect(componentsSource).toContain("data-business-daily");
    expect(componentsSource).toContain("KASA KAPASİTESİ");
    expect(componentsSource).toContain("data-business-vault-fill");
    expect(componentsSource).toContain("data-business-vault-progress");
  });
});


describe("Businesses mobile scrolling", () => {
  it("keeps Businesses vertically scrollable on small screens without changing other game routes", () => {
    expect(mainSource).toContain('document.documentElement.classList.add("businesses-route")');
    expect(mainSource).toContain('document.body.classList.add("businesses-route")');
    expect(idleCssSource).toContain("html.businesses-route #app");
    expect(idleCssSource).toContain("html.businesses-route .app-shell.is-businesses-page");
    expect(idleCssSource).toContain("overflow-y: auto");
  });
});


describe("Businesses premium design tokens", () => {
  it("scopes the premium palette, spacing and elevation system to Businesses", () => {
    expect(idleCssSource).toContain("--idle-canvas: #050816");
    expect(idleCssSource).toContain("--idle-surface-raised: #10213c");
    expect(idleCssSource).toContain("--idle-text: #f4f8ff");
    expect(idleCssSource).toContain("--idle-cyan: #46c8ff");
    expect(idleCssSource).toContain("--idle-violet-ambient: #7258ff");
    expect(idleCssSource).toContain("--idle-space-7: 48px");
    expect(idleCssSource).toContain("--idle-shadow-raised");
  });

  it("uses the token system in the current Businesses surface instead of leaving it unused", () => {
    expect(idleCssSource).toContain("color: var(--idle-text)");
    expect(idleCssSource).toContain("background: var(--idle-surface-2)");
    expect(idleCssSource).toContain("color: var(--idle-cyan)");
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
  it("shows a clear club-operations identity and shared wallet hierarchy", () => {
    expect(idleIndexSource).toContain("KULÜP OPERASYON MERKEZİ");
    expect(idleIndexSource).toContain("FAHRİNİN YOLU // CLUB EMPIRE");
    expect(idleIndexSource).toContain("ORTAK BAKİYE");
    expect(idleIndexSource).toContain("TÜM OYUNLARDA KULLANILIR");
  });

  it("renders and updates the global 27-level club progression", () => {
    expect(idleIndexSource).toContain("TOTAL_BUSINESS_PROGRESSION_LEVELS");
    expect(idleIndexSource).toContain("data-idle-progression-levels");
    expect(idleIndexSource).toContain("data-idle-progression-track");
    expect(idleIndexSource).toContain("data-idle-progression-bar");
    expect(idleIndexSource).toContain("completedBusinessLevels");
    expect(idleIndexSource).toContain('progressionTrackNode.setAttribute(');
  });

  it("uses a responsive premium header layout on desktop and mobile", () => {
    expect(idleCssSource).toContain("/* Part 3 — premium command header */");
    expect(idleCssSource).toContain(".businesses-header-main");
    expect(idleCssSource).toContain(".businesses-progression");
    expect(idleCssSource).toContain("grid-template-columns: minmax(0, 1fr) minmax(270px, 330px)");
    expect(idleCssSource).toContain("grid-template-columns: minmax(0, 1fr) minmax(128px, 42%)");
  });
});


describe("Businesses premium KPI command bar", () => {
  it("presents the three core KPIs as a dedicated command surface", () => {
    expect(idleIndexSource).toContain("business-command-bar");
    expect(idleIndexSource).toContain("PASİF GELİR HIZI");
    expect(idleIndexSource).toContain("KASALARDA HAZIR");
    expect(idleIndexSource).toContain("GELİR ÜRETİYOR");
  });

  it("keeps Collect All as a persistent primary action with a live amount", () => {
    expect(idleIndexSource).toContain("data-idle-collect-all-value");
    expect(idleIndexSource).toContain("TÜM KASALAR");
    expect(idleIndexSource).toContain("business-collect-all-arrow");
    expect(idleIndexSource).toContain("collectAllValueNode.textContent = formatCredits(totalCollectableCents)");
    expect(idleIndexSource).toContain("commandBarNode.dataset.collectable");
  });

  it("styles the KPI surface responsively for desktop, tablet and mobile", () => {
    expect(idleCssSource).toContain("/* Part 4 — premium KPI command bar */");
    expect(idleCssSource).toContain("grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(240px, 1.12fr)");
    expect(idleCssSource).toContain(".business-collect-all-value");
    expect(idleCssSource).toContain(".business-command-bar[data-collectable=\"ready\"]");
    expect(idleCssSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });

  it("keeps visible money values currency-prefixed", () => {
    expect(idleIndexSource).toContain("return `$");
  });
});


describe("Businesses premium desktop cards", () => {
  it("renders three semantic premium business cards with dedicated visual and body regions", () => {
    expect(componentsSource).toContain("business-card business-card--");
    expect(componentsSource).toContain("business-card-visual");
    expect(componentsSource).toContain("business-card-body");
    expect(componentsSource).toContain("business-card-header");
    expect(componentsSource).toContain("business-card-metrics");
    expect(componentsSource).toContain("business-card-actions");
    expect(componentsSource).toContain("9 SEVİYELİ GELİŞİM");
    expect(componentsSource).toContain("LV0 → LV8");
  });

  it("tracks owned, locked, active, full and max states on the card shell", () => {
    expect(componentsSource).toContain("data-business-card-state");
    expect(componentsSource).toContain('row.dataset.businessOwnership = currentStage ? "owned" : "locked"');
    expect(componentsSource).toContain('row.dataset.businessLevel = currentStage ? String(currentStage.level) : "unowned"');
    expect(componentsSource).toContain('"SATIN ALINMADI"');
    expect(componentsSource).toContain('"KASA DOLU"');
    expect(componentsSource).toContain('"MAX SEVİYE"');
  });

  it("uses a three-card desktop grid with tablet and mobile fallbacks", () => {
    expect(idleCssSource).toContain("/* Part 5 — desktop premium business card skeleton */");
    expect(idleCssSource).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(idleCssSource).toContain("@media (min-width: 761px) and (max-width: 1100px)");
    expect(idleCssSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(idleCssSource).toContain(".business-card-visual");
    expect(idleCssSource).toContain(".business-card-body");
  });
});


describe("Businesses premium card skeleton", () => {
  it("renders each business as a visual premium card rather than a table row", () => {
    expect(componentsSource).toContain("business-row business-card business-card--");
    expect(componentsSource).toContain("business-card-visual");
    expect(componentsSource).toContain("business-card-body");
    expect(componentsSource).toContain("business-card-header");
    expect(componentsSource).toContain("business-card-metrics");
    expect(componentsSource).toContain("business-card-actions");
  });

  it("keeps live ownership and card state connected to real business data", () => {
    expect(componentsSource).toContain("data-business-ownership");
    expect(componentsSource).toContain("data-business-card-state");
    expect(componentsSource).toContain('row.dataset.businessOwnership = currentStage ? "owned" : "locked"');
    expect(componentsSource).toContain('"SATIN ALINMADI"');
    expect(componentsSource).toContain('"KASA DOLU"');
    expect(componentsSource).toContain('"MAX SEVİYE"');
  });

  it("uses a three-card desktop grid with tablet and mobile fallbacks", () => {
    expect(idleCssSource).toContain("/* Part 5 — desktop premium business card skeleton */");
    expect(idleCssSource).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(idleCssSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(idleCssSource).toContain(".business-card:last-child");
    expect(idleCssSource).toContain("grid-template-columns: 1fr");
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
  it("makes accrued cash the primary card value and exposes live vault timing", () => {
    expect(componentsSource).toContain("business-card-accrued-heading");
    expect(componentsSource).toContain("data-business-accrued-status");
    expect(componentsSource).toContain("data-business-vault-eta");
    expect(componentsSource).toContain("formatVaultEta(");
    expect(componentsSource).toContain('"TOPLAMAYA HAZIR"');
    expect(componentsSource).toContain('"GELİR BİRİKİYOR"');
  });

  it("removes upgrade comparison content from the main card while keeping it for Details", () => {
    expect(componentsSource).not.toContain("data-business-next-panel");
    expect(componentsSource).not.toContain("data-business-next-name");
    expect(componentsSource).not.toContain("data-business-next-cost");
    expect(componentsSource).not.toContain("data-business-next-gain");
    expect(idleIndexSource).toContain("data-idle-next-comparison");
    expect(idleIndexSource).toContain('"ZİRVEYE ULAŞTI"');
  });

  it("merges hourly income and vault capacity into one main-card panel", () => {
    expect(componentsSource).toContain("business-card-operations");
    expect(componentsSource).toContain("business-card-vault-heading");
    expect(componentsSource).toContain("business-card-vault-meta");
    expect(componentsSource).toContain("business-card-vault-meter");
    expect(idleCssSource).toContain("/* Main-card refinement — simplified hierarchy / unified economy panel */");
    expect(idleCssSource).toContain("/* Main-card refinement — Parts 3–4 meter + action layout */");
    expect(idleCssSource).toContain("grid-template-columns: minmax(0, .84fr) minmax(0, 1.16fr)");
    expect(idleCssSource).toContain("grid-column: 1 / -1");
    expect(idleCssSource).toContain("height: 8px");
  });
});


describe("Businesses premium action states", () => {
  it("keeps collect and vault actions on the main card while business upgrades stay in Details", () => {
    expect(componentsSource).toContain('data-action-state="loading"');
    expect(componentsSource).toContain('collectButton.dataset.actionState = busy');
    expect(componentsSource).toContain('vaultUpgradeButton.dataset.actionState = busy');
    expect(componentsSource).not.toContain('data-business-upgrade');
    expect(idleIndexSource).toContain('data-idle-detail-upgrade');
    expect(idleIndexSource).toContain('"purchase"');
    expect(componentsSource).toContain('"insufficient"');
    expect(componentsSource).toContain('"max"');
    expect(componentsSource).toContain('"full"');
  });

  it("removes tiny action notes from main cards without removing Details guidance", () => {
    expect(componentsSource).not.toContain("data-business-collect-note");
    expect(componentsSource).not.toContain("data-business-upgrade-note");
    expect(componentsSource).toContain("Bakiye yetersiz.");
    expect(componentsSource).toContain("Kasa maksimum seviyede.");
    expect(idleIndexSource).toContain("Yükseltme sonrası Kasa Lv1'e döner");
    expect(idleIndexSource).toContain("İşletme gelişiminin zirvesindesin");
  });

  it("replaces the removed main-card upgrade slot with a single Details action", () => {
    expect(componentsSource).toContain("business-card-action--details");
    expect(componentsSource).toContain("business-card-secondary business-card-details");
    expect((componentsSource.match(/data-business-details/g) ?? []).length).toBe(1);
    expect(idleCssSource).toContain("grid-template-columns: minmax(0, 1.12fr) minmax(0, .88fr)");
    expect(idleCssSource).toContain(".business-card-action--details .business-card-details");
  });

  it("styles ready, insufficient, max, locked and busy actions distinctly", () => {
    expect(idleCssSource).toContain("/* Part 7 — premium action / state system */");
    expect(idleCssSource).toContain('[data-action-state="ready"]');
    expect(idleCssSource).toContain('[data-action-state="insufficient"]');
    expect(idleCssSource).toContain('[data-action-state="max"]');
    expect(idleCssSource).toContain('[data-action-state="locked"]');
    expect(idleCssSource).toContain('[data-action-state="busy"]');
    expect(idleCssSource).toContain("@keyframes idle-action-busy");
    expect(idleCssSource).toContain(":focus-visible");
  });

  it("keeps touch targets premium-sized and honors reduced motion", () => {
    expect(idleCssSource).toContain("min-height: 48px");
    expect(idleCssSource).toContain("@media (prefers-reduced-motion: reduce)");
  });
});


describe("Businesses dedicated mobile cards", () => {
  it("uses a mobile-specific layered card composition instead of shrinking desktop cards", () => {
    expect(idleCssSource).toContain("/* Part 8 — dedicated mobile business-card architecture */");
    expect(idleCssSource).toContain("margin-top: -24px");
    expect(idleCssSource).toContain("border-radius: 18px");
    expect(idleCssSource).toContain("grid-template-columns: 1fr");
    expect(idleCssSource).toContain(".business-card-action--collect");
    expect(idleCssSource).toContain(".business-card-action--details");
    expect(idleCssSource).toContain(".business-card-operations");
  });

  it("keeps the mobile value hierarchy large and touch-first", () => {
    expect(idleCssSource).toContain("font-size: clamp(28px, 9vw, 34px)");
    expect(idleCssSource).toContain("min-height: 50px");
    expect(idleCssSource).toContain("min-height: 132px");
  });

  it("includes small-phone and mobile-landscape card adaptations", () => {
    expect(idleCssSource).toContain("@media (max-width: 420px)");
    expect(idleCssSource).toContain("@media (max-width: 760px) and (orientation: landscape)");
    expect(idleCssSource).toContain("min-height: 118px");
    expect(idleCssSource).toContain("min-height: 110px");
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

  it("shows a Stadium milestone badge that changes with progression", () => {
    expect(componentsSource).toContain("data-business-milestone");
    expect(componentsSource).toContain('"STADIUM"');
    expect(componentsSource).toContain('`${visualPrefix} // LOCAL`');
    expect(componentsSource).toContain('`${visualPrefix} // PRO`');
    expect(componentsSource).toContain('`${visualPrefix} // ELITE`');
    expect(componentsSource).toContain('`${visualPrefix} // ICON`');
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

  it("keeps the shared level milestone mapping while using Club Store labels", () => {
    expect(componentsSource).toContain('business.businessId === "club-store"');
    expect(componentsSource).toContain("data-business-milestone");
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

  it("uses Fan Club milestone labels through the shared progression stage map", () => {
    expect(componentsSource).toContain('"FAN CLUB"');
    expect(componentsSource).toContain("data-business-milestone");
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

  it("keeps the detail header and summary synchronized with live business state", () => {
    expect(idleIndexSource).toContain("renderBusinessDetails");
    expect(idleIndexSource).toContain("BUSINESS_DETAIL_DEFINITIONS");
    expect(idleIndexSource).toContain("data-idle-detail-hourly");
    expect(idleIndexSource).toContain("data-idle-detail-daily");
    expect(idleIndexSource).toContain("data-idle-detail-vault");
    expect(idleIndexSource).toContain("data-idle-detail-current");
    expect(idleIndexSource).toContain("data-idle-detail-next");
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


describe("Businesses real level tree", () => {
  it("replaces the business roadmap placeholder with a live Lv0-Lv8 tree", () => {
    expect(idleIndexSource).toContain("data-idle-business-level-tree");
    expect(idleIndexSource).toContain("renderBusinessLevelTree");
    expect(idleIndexSource).toContain("definition.levels.map");
    expect(idleIndexSource).toContain("businessLevelTreeNode.innerHTML");
  });

  it("derives completed, current, future and locked states from the real current level", () => {
    expect(idleIndexSource).toContain("function getBusinessLevelState");
    expect(idleIndexSource).toContain('return "completed"');
    expect(idleIndexSource).toContain('return "current"');
    expect(idleIndexSource).toContain('return stageLevel === 0 ? "future" : "locked"');
    expect(idleIndexSource).toContain('return "locked"');
    expect(idleIndexSource).toContain('data-level-state="');
  });

  it("keeps every real stage name, cost and passive-income target visible", () => {
    expect(idleIndexSource).toContain("stage.name");
    expect(idleIndexSource).toContain("stage.hourlyIncomeDisplayCents");
    expect(idleIndexSource).toContain("stage.dailyIncomeCents");
    expect(idleIndexSource).toContain("stage.costCents");
    expect(idleIndexSource).toContain("stage.targetRoiDays");
  });

  it("surfaces star milestones as aspirational progression targets", () => {
    expect(idleIndexSource).toContain('stage.level >= 6');
    expect(idleIndexSource).toContain('★');
    expect(idleIndexSource).toContain("getBusinessLevelMilestone");
    expect(idleIndexSource).toContain('"ICON"');
  });

  it("visually distinguishes completed, current, future and locked nodes", () => {
    expect(idleCssSource).toContain("/* Part 13 — real Lv0–Lv8 business level tree */");
    expect(idleCssSource).toContain('.business-level-node[data-level-state="completed"]');
    expect(idleCssSource).toContain('.business-level-node[data-level-state="current"]');
    expect(idleCssSource).toContain('.business-level-node[data-level-state="future"]');
    expect(idleCssSource).toContain('.business-level-node[data-level-state="locked"]');
    expect(idleCssSource).toContain('.business-level-node[data-level="8"]');
  });

  it("keeps the nine-stage tree readable on small mobile screens", () => {
    expect(idleCssSource).toContain(".business-level-tree-legend");
    expect(idleCssSource).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(idleCssSource).toContain("grid-template-columns: 1fr");
  });
});


describe("Businesses next-level comparison card", () => {
  it("shows current and target income side-by-side with real upgrade economics", () => {
    expect(idleIndexSource).toContain("data-idle-next-comparison");
    expect(idleIndexSource).toContain("data-idle-next-current-hourly");
    expect(idleIndexSource).toContain("data-idle-next-target-hourly");
    expect(idleIndexSource).toContain("data-idle-next-hourly-gain");
    expect(idleIndexSource).toContain("data-idle-next-daily-gain");
    expect(idleIndexSource).toContain("data-idle-next-cost");
  });

  it("calculates hourly, daily and percentage gains from real level definitions", () => {
    expect(idleIndexSource).toContain("hourlyGainCents");
    expect(idleIndexSource).toContain("dailyGainCents");
    expect(idleIndexSource).toContain("gainPercent");
    expect(idleIndexSource).toContain("nextStage.hourlyIncomeDisplayCents");
    expect(idleIndexSource).toContain("nextStage.dailyIncomeCents");
    expect(idleIndexSource).toContain("nextStage.costCents");
  });

  it("connects the detail CTA to the existing business upgrade action", () => {
    expect(idleIndexSource).toContain("data-idle-detail-upgrade");
    expect(idleIndexSource).toContain('button.matches("[data-idle-detail-upgrade]")');
    expect(idleIndexSource).toContain("upgradeIdleBusiness(businessId)");
    expect(idleIndexSource).toContain("detailUpgradeButton.dataset.actionState");
    expect(idleIndexSource).toContain('"insufficient"');
    expect(idleIndexSource).toContain('"purchase"');
    expect(idleIndexSource).toContain('"max"');
  });

  it("warns about vault reset and insufficient balance in the comparison card", () => {
    expect(idleIndexSource).toContain("Yükseltme sonrası Kasa Lv1'e döner");
    expect(idleIndexSource).toContain("Bakiye yetersiz");
    expect(idleIndexSource).toContain("shortfallCents");
  });

  it("has premium desktop and mobile comparison layouts", () => {
    expect(idleCssSource).toContain("/* Part 14 — next-level comparison card */");
    expect(idleCssSource).toContain(".business-next-comparison-flow");
    expect(idleCssSource).toContain(".business-next-comparison-deltas");
    expect(idleCssSource).toContain(".business-next-comparison-cta");
    expect(idleCssSource).toContain("grid-template-columns: minmax(0, 1fr) 36px minmax(0, 1fr)");
    expect(idleCssSource).toContain("grid-template-columns: 1fr 1fr");
  });
});


describe("Businesses vault progression tree", () => {
  it("replaces the vault placeholder with the real 1h-24h progression tree", () => {
    expect(idleIndexSource).toContain("data-idle-vault-level-tree");
    expect(idleIndexSource).toContain("renderVaultLevelTree");
    expect(idleIndexSource).toContain("VAULT_LEVELS.map");
    expect(idleIndexSource).toContain("1SA → 24SA");
  });

  it("uses the approved 1, 2, 4, 8, 12 and 24 hour capacity ladder", () => {
    expect(idleIndexSource).toContain("vault.capacityHours");
    expect(idleIndexSource).toContain("VAULT_UPGRADE_STEPS");
    expect(idleIndexSource).toContain("getVaultUpgradeCostCents");
    expect(idleIndexSource).toContain("step.costPercent");
  });

  it("derives completed, current, next and locked vault states from live level", () => {
    expect(idleIndexSource).toContain("function getVaultLevelState");
    expect(idleIndexSource).toContain('data-vault-state="');
    expect(idleIndexSource).toContain('"completed"');
    expect(idleIndexSource).toContain('"current"');
    expect(idleIndexSource).toContain('"future"');
    expect(idleIndexSource).toContain('"locked"');
  });

  it("connects the Details vault CTA to the existing server-backed upgrade action", () => {
    expect(idleIndexSource).toContain("data-idle-detail-vault-upgrade");
    expect(idleIndexSource).toContain('button.matches("[data-idle-detail-vault-upgrade]")');
    expect(idleIndexSource).toContain("upgradeIdleVault(businessId)");
    expect(idleIndexSource).toContain("getIdleVaultUpgradePreview(business)");
    expect(idleIndexSource).toContain("detailVaultUpgradeButton.dataset.actionState");
  });

  it("keeps the vault reset rule clearly visible without changing the economy", () => {
    expect(idleIndexSource).toContain("İŞLETME YÜKSELTME UYARISI");
    expect(idleIndexSource).toContain("Kasa Lv1'e sıfırlanır");
    expect(idleIndexSource).toContain("Birikmiş gelir korunur");
  });

  it("styles a premium responsive vault timeline with max-level treatment", () => {
    expect(idleCssSource).toContain("/* Part 15 — real 1h→24h vault progression tree */");
    expect(idleCssSource).toContain(".vault-level-tree");
    expect(idleCssSource).toContain('.vault-level-node[data-vault-state="current"]');
    expect(idleCssSource).toContain('.vault-level-node[data-vault-state="future"]');
    expect(idleCssSource).toContain('.vault-level-node[data-vault-level="6"]');
    expect(idleCssSource).toContain(".business-vault-detail-cta");
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

  it("keeps primary mobile touch targets at least 44px tall", () => {
    expect(idleCssSource).toContain("/* Part 18 — final mobile touch-target QA */");
    expect(idleCssSource).toContain(".route-shell.is-businesses-page .business-vault-upgrade,");
    expect(idleCssSource).toContain(".route-shell.is-businesses-page .business-card-details");
    expect(idleCssSource).toContain("min-height: 44px");
  });

  it("keeps the short landscape Details content scrollable and touch-safe", () => {
    expect(idleCssSource).toContain(".business-detail-scroll");
    expect(idleCssSource).toContain("-webkit-overflow-scrolling: touch");
    expect(idleCssSource).toContain("padding-bottom: max(18px, env(safe-area-inset-bottom))");
  });
});
