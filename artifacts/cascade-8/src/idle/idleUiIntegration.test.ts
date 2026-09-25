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
