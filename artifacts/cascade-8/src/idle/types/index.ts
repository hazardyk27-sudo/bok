// Canonical Stadium/ticket-market types for the 2026-09-29 redesign.
// See ../STADIUM_ECONOMY_SPEC.md. These are the target contracts for the new
// backend/frontend implementation. Part 25 removed the retired direct-cash
// business/vault client contracts; persisted legacy SQL rows remain migration-safe.

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

