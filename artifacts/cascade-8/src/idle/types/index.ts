// Canonical Stadium/ticket-market types for the 2026-09-29 redesign.
// See ../STADIUM_ECONOMY_SPEC.md. These are the target contracts for the new
// backend/frontend implementation. Legacy business/direct-cash types remain
// temporarily below until their consumers are migrated in later parts.

export type StadiumLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type SpeedLevel =
  | 1 | 2 | 3 | 4 | 5
  | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15
  | 16 | 17 | 18 | 19 | 20;

export type StorageLevel = SpeedLevel;

export type StadiumProductionStatus =
  | "NO_SEATS"
  | "PRODUCING"
  | "STORAGE_FULL";

export type TicketMarketSource =
  | "binance-btcusdt"
  | "coinbase-btc-usd"
  | "none";

export type TicketMarketFeedStatus =
  | "CONNECTING"
  | "REBASELINING"
  | "LIVE"
  | "STALE"
  | "FROZEN";

export type SharedWalletState = {
  sessionId: string;
  balanceCents: number;
};

/**
 * Server-authoritative Stadium snapshot at productionCheckpointAt.
 *
 * Tickets are persisted in microtickets:
 *   1 ticket = 1,000,000 microtickets.
 *
 * Money in the shared wallet remains integer cents. Ticket-market prices use
 * microdollars so sub-cent market prices can be settled without float drift.
 */
export type IdleStadiumServerState = {
  stadiumLevel: StadiumLevel;
  ownedSeats: number;
  maxSeatCapacity: number;
  speedLevel: SpeedLevel;
  storageLevel: StorageLevel;
  storedMicroTickets: number;
  storageCapacityTickets: number;
  remainingStorageMicroTickets: number;
  productionRateMicroTicketsPerHour: number;
  isStorageFull: boolean;
  productionStatus: StadiumProductionStatus;
  productionCheckpointAt: string;
};

export type TicketMarketSnapshot = {
  priceMicrodollars: number;
  tickAt: string;
  source: TicketMarketSource;
  feedStatus: TicketMarketFeedStatus;
};

export type TicketMarketHistoryPoint = {
  tickAt: string;
  priceMicrodollars: number;
};

export type IdleStadiumStateResponse = {
  sessionId: string;
  serverTime: string;
  wallet: SharedWalletState;
  stadium: IdleStadiumServerState;
  market: TicketMarketSnapshot;
};

export type IdleStadiumStateEnvelope = {
  snapshot: IdleStadiumStateResponse;
  receivedAtMs: number;
};

export type IdleLiveStadiumState = IdleStadiumServerState & {
  liveStoredMicroTickets: number;
  liveRemainingStorageMicroTickets: number;
  liveIsStorageFull: boolean;
  liveProductionStatus: StadiumProductionStatus;
  storageFillRatio: number;
};

export type IdleTicketMarketCurrentResponse = {
  serverTime: string;
  market: TicketMarketSnapshot;
};

export type IdleTicketMarketHistoryResponse = {
  serverTime: string;
  windowHours: 24;
  points: TicketMarketHistoryPoint[];
};

/**
 * JSON payload carried by the SSE `event: market` frame.
 * The SSE event name itself is transport metadata, so the data payload is the
 * canonical market snapshot directly.
 */
export type IdleTicketMarketLiveEvent = TicketMarketSnapshot;

export type IdleSeatPurchaseResponse = {
  serverTime: string;
  purchasedSeats: number;
  costCents: number;
  balanceCents: number;
  replayed: boolean;
  stadium: IdleStadiumServerState;
};

export type IdleStadiumLevelUpgradeResponse = {
  serverTime: string;
  targetStadiumLevel: StadiumLevel;
  costCents: number;
  balanceCents: number;
  replayed: boolean;
  stadium: IdleStadiumServerState;
};

export type IdleSpeedUpgradeResponse = {
  serverTime: string;
  targetSpeedLevel: SpeedLevel;
  costCents: number;
  balanceCents: number;
  replayed: boolean;
  stadium: IdleStadiumServerState;
};

export type IdleStorageUpgradeResponse = {
  serverTime: string;
  targetStorageLevel: StorageLevel;
  costCents: number;
  balanceCents: number;
  replayed: boolean;
  stadium: IdleStadiumServerState;
};

export type IdleTicketSaleResponse = {
  serverTime: string;
  soldTickets: number;
  executionPriceMicrodollars: number;
  grossSaleMicrodollars: number;
  walletCreditCents: number;
  saleRemainderMicrodollars: number;
  balanceCents: number;
  replayed: boolean;
  stadium: IdleStadiumServerState;
  market: TicketMarketSnapshot;
};


// ---------------------------------------------------------------------------
// LEGACY COMPATIBILITY TYPES
// ---------------------------------------------------------------------------
// These exist only to keep the currently mounted three-business/direct-cash
// UI and API compiling while Parts 4+ migrate consumers to the canonical
// Stadium model above. Do not add new features to these legacy contracts.

/**
 * Active business scope for the Stadium ticket-economy migration.
 *
 * Club Store / Fan Club identifiers remain in BUSINESS_IDS strictly for
 * migration-safe legacy row/type compatibility. New UI/API behavior must use
 * ACTIVE_BUSINESS_IDS instead.
 */
export const ACTIVE_BUSINESS_IDS = ["stadium"] as const;
export type ActiveBusinessId = (typeof ACTIVE_BUSINESS_IDS)[number];

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


export type IdleVaultUpgradeResponse = {
  serverTime: string;
  businessId: BusinessId;
  targetVaultLevel: number;
  costCents: number;
  balanceCents: number;
  replayed: boolean;
  business: IdleBusinessServerState;
};


export type IdleVaultUpgradePreview = {
  isOwned: boolean;
  isMaxLevel: boolean;
  canUpgrade: boolean;
  currentVaultLevel: number;
  currentCapacityHours: number;
  nextVaultLevel: number | null;
  nextCapacityHours: number | null;
  costCents: number | null;
};


export type IdleCollectAllResponse = {
  serverTime: string;
  collectedCents: number;
  balanceCents: number;
  replayed: boolean;
  collections: Array<{
    businessId: BusinessId;
    collectedCents: number;
    replayed: boolean;
  }>;
  businesses: IdleBusinessServerState[];
};
