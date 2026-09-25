import type { IdleBusinessId } from "./storage";

export type IdleActionReceiptIdentity = {
  sessionId: string;
  businessId: IdleBusinessId;
  actionType: string;
};

export function assertIdleActionReceiptReplay(
  receipt: IdleActionReceiptIdentity,
  expected: IdleActionReceiptIdentity,
) {
  if (
    receipt.sessionId !== expected.sessionId
    || receipt.businessId !== expected.businessId
    || receipt.actionType !== expected.actionType
  ) {
    throw new Error("IDEMPOTENCY_KEY_REUSED");
  }
}
