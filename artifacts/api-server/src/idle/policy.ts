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


export type IdleBusinessUpgradeStage = {
  level: number;
  costCents: number;
};

export function resolveBusinessUpgrade(
  currentBusinessLevel: number | null,
  levels: readonly IdleBusinessUpgradeStage[],
  balanceCents: number,
) {
  const targetBusinessLevel = currentBusinessLevel === null
    ? 0
    : currentBusinessLevel + 1;
  const targetStage = levels.find(
    (stage) => stage.level === targetBusinessLevel,
  );

  if (!targetStage) throw new Error("IDLE_BUSINESS_MAX_LEVEL");
  if (!Number.isSafeInteger(balanceCents) || balanceCents < 0) {
    throw new Error("INVALID_IDLE_WALLET_BALANCE");
  }
  if (balanceCents < targetStage.costCents) {
    throw new Error("INSUFFICIENT_IDLE_CREDITS");
  }

  return {
    targetBusinessLevel,
    costCents: targetStage.costCents,
    balanceAfterCents: balanceCents - targetStage.costCents,
    resetVaultLevel: 1 as const,
  };
}


export type IdleVaultUpgradeStep = {
  fromLevel: number;
  toLevel: number;
  costPercent: number;
};

export function resolveVaultUpgrade(
  currentVaultLevel: number,
  currentBusinessCostCents: number | null,
  steps: readonly IdleVaultUpgradeStep[],
  balanceCents: number,
) {
  if (currentBusinessCostCents === null) {
    throw new Error("IDLE_BUSINESS_NOT_OWNED");
  }

  const step = steps.find((entry) => entry.fromLevel === currentVaultLevel);
  if (!step) throw new Error("IDLE_VAULT_MAX_LEVEL");

  const costCents = currentBusinessCostCents * step.costPercent / 100;
  if (!Number.isSafeInteger(costCents) || costCents < 0) {
    throw new Error("INVALID_IDLE_VAULT_UPGRADE_COST");
  }
  if (!Number.isSafeInteger(balanceCents) || balanceCents < 0) {
    throw new Error("INVALID_IDLE_WALLET_BALANCE");
  }
  if (balanceCents < costCents) {
    throw new Error("INSUFFICIENT_IDLE_CREDITS");
  }

  return {
    targetVaultLevel: step.toLevel,
    costCents,
    balanceAfterCents: balanceCents - costCents,
  };
}
