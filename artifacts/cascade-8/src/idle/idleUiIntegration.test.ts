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

  it("shows the next business target with cost and real hourly income gain", () => {
    expect(componentsSource).toContain("data-business-next-panel");
    expect(componentsSource).toContain("data-business-next-name");
    expect(componentsSource).toContain("data-business-next-cost");
    expect(componentsSource).toContain("data-business-next-gain");
    expect(componentsSource).toContain("incomeGainCents");
    expect(componentsSource).toContain("incomeGainPercent");
    expect(componentsSource).toContain('"ZİRVEYE ULAŞTI"');
  });

  it("styles accrued cash and the next-upgrade panel as the dominant hierarchy", () => {
    expect(idleCssSource).toContain("/* Part 6 — card information hierarchy / upgrade target */");
    expect(idleCssSource).toContain(".business-card-accrued-heading");
    expect(idleCssSource).toContain("font-size: clamp(29px, 2.4vw, 36px)");
    expect(idleCssSource).toContain(".business-card-next");
    expect(idleCssSource).toContain('.business-card-next[data-next-state="max"]');
  });
});


describe("Businesses premium action states", () => {
  it("exposes explicit collect, upgrade and vault action states", () => {
    expect(componentsSource).toContain('data-action-state="loading"');
    expect(componentsSource).toContain('collectButton.dataset.actionState = busy');
    expect(componentsSource).toContain('upgradeButton.dataset.actionState = busy');
    expect(componentsSource).toContain('vaultUpgradeButton.dataset.actionState = busy');
    expect(componentsSource).toContain('"insufficient"');
    expect(componentsSource).toContain('"purchase"');
    expect(componentsSource).toContain('"max"');
    expect(componentsSource).toContain('"full"');
  });

  it("shows visible guidance for disabled and risky upgrade states", () => {
    expect(componentsSource).toContain("data-business-collect-note");
    expect(componentsSource).toContain("data-business-upgrade-note");
    expect(componentsSource).toContain("Bakiye yetersiz.");
    expect(componentsSource).toContain("Yükseltmede Kasa Lv1'e döner");
    expect(componentsSource).toContain("Tüm seviyeler tamamlandı");
    expect(componentsSource).toContain("Kasa maksimum seviyede.");
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
    expect(idleCssSource).toContain(".business-card-action--upgrade");
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
