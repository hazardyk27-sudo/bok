import { describe, expect, it } from "vitest";
import { assertIdleActionReceiptReplay, resolveBusinessUpgrade } from "./policy";

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
