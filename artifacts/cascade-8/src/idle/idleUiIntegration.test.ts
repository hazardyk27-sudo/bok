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
    expect(componentsSource).toContain("walletBalanceCents < vaultUpgrade.costCents");
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
