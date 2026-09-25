// Shared frontend types for the Idle / İşletmeler module.

export const BUSINESS_IDS = ["stadium", "club-store", "fan-club"] as const;

export type BusinessId = (typeof BUSINESS_IDS)[number];

export type BusinessLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type BusinessStageConfig = {
  level: BusinessLevel;
  name: string;
  costCents: number;
  /**
   * Canonical income value for economy calculations.
   * Later accrual utilities derive precise sub-hour rates from this value.
   */
  dailyIncomeCents: number;
  /**
   * Rounded hourly value approved for display only.
   * Economy logic must not use this as its source of truth.
   */
  hourlyIncomeDisplayCents: number;
  targetRoiDays: number;
};

export type BusinessDefinition = {
  id: BusinessId;
  label: string;
  levels: readonly BusinessStageConfig[];
};


export type IdleBusinessServerState = {
  businessId: BusinessId;
  businessLevel: BusinessLevel | null;
  vaultLevel: number;
  accruedMicrocents: number;
  vaultCapacityMicrocents: number;
  remainingCapacityMicrocents: number;
  isVaultFull: boolean;
  checkpointAt: string;
};

export type IdleStateResponse = {
  sessionId: string;
  serverTime: string;
  wallet: { sessionId: string; balanceCents: number };
  businesses: IdleBusinessServerState[];
};

export type IdleStateEnvelope = {
  snapshot: IdleStateResponse;
  receivedAtMs: number;
};

export type IdleVaultStatus = "UNOWNED" | "EARNING" | "FULL";

export type IdleLiveBusinessState = IdleBusinessServerState & {
  liveAccruedMicrocents: number;
  liveRemainingCapacityMicrocents: number;
  liveIsVaultFull: boolean;
  vaultFillRatio: number;
  vaultStatus: IdleVaultStatus;
  collectableCents: number;
  canCollect: boolean;
};


export type IdleCollectResponse = {
  serverTime: string;
  businessId: BusinessId;
  collectedCents: number;
  remainderMicrocents: number;
  balanceCents: number;
  replayed: boolean;
  business: IdleBusinessServerState;
};


export type IdleBusinessUpgradeResponse = {
  serverTime: string;
  businessId: BusinessId;
  targetBusinessLevel: BusinessLevel;
  costCents: number;
  balanceCents: number;
  replayed: boolean;
  business: IdleBusinessServerState;
};
