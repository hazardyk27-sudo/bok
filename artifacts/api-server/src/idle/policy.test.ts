import { describe, expect, it } from "vitest";
import { assertIdleActionReceiptReplay } from "./policy";

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
