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
