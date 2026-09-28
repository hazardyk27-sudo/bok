import { describe, expect, it } from "vitest";
import { assertIdleActionReceiptReplay, debitIdleCredits, resolveBusinessUpgrade, resolveVaultUpgrade } from "./policy";

describe("idle collect idempotency replay", () => {
  const receipt = {
    sessionId: "11111111-1111-4111-8111-111111111111",
    businessId: "stadium" as const,
    actionType: "COLLECT",
  };

  it("accepts repeated replay checks for the same collect identity", () => {
    expect(() => assertIdleActionReceiptReplay(receipt, receipt)).not.toThrow();
    expect(() => assertIdleActionReceiptReplay(receipt, receipt)).not.toThrow();
    expect(() => assertIdleActionReceiptReplay(receipt, receipt)).not.toThrow();
  });

  it("rejects reuse across another session", () => {
    expect(() => assertIdleActionReceiptReplay(receipt, {
      ...receipt,
      sessionId: "22222222-2222-4222-8222-222222222222",
    })).toThrow("IDEMPOTENCY_KEY_REUSED");
  });

  it("rejects reuse across another business", () => {
    expect(() => assertIdleActionReceiptReplay(receipt, {
      ...receipt,
      businessId: "club-store",
    })).toThrow("IDEMPOTENCY_KEY_REUSED");
  });

  it("rejects reuse for another action type", () => {
    expect(() => assertIdleActionReceiptReplay(receipt, {
      ...receipt,
      actionType: "BUSINESS_UPGRADE",
    })).toThrow("IDEMPOTENCY_KEY_REUSED");
  });
});


describe("main business upgrade policy", () => {
  const levels = [
    { level: 0, costCents: 50_000 },
    { level: 1, costCents: 200_000 },
    { level: 2, costCents: 500_000 },
    { level: 8, costCents: 2_000_000_000 },
  ] as const;

  it("purchases an unowned business at level 0", () => {
    expect(resolveBusinessUpgrade(null, levels, 100_000)).toEqual({
      targetBusinessLevel: 0,
      costCents: 50_000,
      balanceAfterCents: 50_000,
      resetVaultLevel: 1,
    });
  });

  it("advances exactly one level and resets Kasa to level 1", () => {
    expect(resolveBusinessUpgrade(0, levels, 300_000)).toEqual({
      targetBusinessLevel: 1,
      costCents: 200_000,
      balanceAfterCents: 100_000,
      resetVaultLevel: 1,
    });
  });

  it("rejects the upgrade when balance is insufficient", () => {
    expect(() => resolveBusinessUpgrade(1, levels, 499_999))
      .toThrow("INSUFFICIENT_IDLE_CREDITS");
  });

  it("rejects upgrades beyond the configured maximum", () => {
    expect(() => resolveBusinessUpgrade(8, levels, 3_000_000_000))
      .toThrow("IDLE_BUSINESS_MAX_LEVEL");
  });
});


describe("vault upgrade policy", () => {
  const steps = [
    { fromLevel: 1, toLevel: 2, costPercent: 5 },
    { fromLevel: 2, toLevel: 3, costPercent: 10 },
    { fromLevel: 3, toLevel: 4, costPercent: 15 },
    { fromLevel: 4, toLevel: 5, costPercent: 25 },
    { fromLevel: 5, toLevel: 6, costPercent: 40 },
  ] as const;

  it("prices Lv1 to Lv2 at five percent of the current main tier", () => {
    expect(resolveVaultUpgrade(1, 200_000, steps, 50_000)).toEqual({
      targetVaultLevel: 2,
      costCents: 10_000,
      balanceAfterCents: 40_000,
    });
  });

  it("prices Lv5 to Lv6 at forty percent of the current main tier", () => {
    expect(resolveVaultUpgrade(5, 500_000, steps, 250_000)).toEqual({
      targetVaultLevel: 6,
      costCents: 200_000,
      balanceAfterCents: 50_000,
    });
  });

  it("rejects Kasa upgrades for an unowned business", () => {
    expect(() => resolveVaultUpgrade(1, null, steps, 100_000))
      .toThrow("IDLE_BUSINESS_NOT_OWNED");
  });

  it("rejects Kasa upgrades beyond Lv6", () => {
    expect(() => resolveVaultUpgrade(6, 200_000, steps, 500_000))
      .toThrow("IDLE_VAULT_MAX_LEVEL");
  });
});


describe("insufficient idle balance policy", () => {
  const vaultSteps = [
    { fromLevel: 1, toLevel: 2, costPercent: 5 },
    { fromLevel: 2, toLevel: 3, costPercent: 10 },
    { fromLevel: 3, toLevel: 4, costPercent: 15 },
    { fromLevel: 4, toLevel: 5, costPercent: 25 },
    { fromLevel: 5, toLevel: 6, costPercent: 40 },
  ] as const;

  it("allows an exact-balance debit and leaves zero", () => {
    expect(debitIdleCredits(50_000, 50_000)).toBe(0);
  });

  it("rejects a one-cent-short main business purchase", () => {
    const levels = [{ level: 0, costCents: 50_000 }] as const;
    expect(() => resolveBusinessUpgrade(null, levels, 49_999))
      .toThrow("INSUFFICIENT_IDLE_CREDITS");
  });

  it("rejects a one-cent-short Kasa upgrade", () => {
    expect(() => resolveVaultUpgrade(1, 200_000, vaultSteps, 9_999))
      .toThrow("INSUFFICIENT_IDLE_CREDITS");
  });

  it("rejects invalid negative wallet balances before any debit", () => {
    expect(() => debitIdleCredits(-1, 0))
      .toThrow("INVALID_IDLE_WALLET_BALANCE");
  });

  it("rejects invalid debit costs", () => {
    expect(() => debitIdleCredits(10_000, -1))
      .toThrow("INVALID_IDLE_DEBIT_COST");
  });
});
