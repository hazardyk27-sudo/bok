/**
 * Canonical Stadium redesign configuration.
 *
 * These tables implement STADIUM_ECONOMY_SPEC.md and are the source of truth
 * for the ticket economy. Part 25 removed the retired passive-cash business
 * and Vault configuration; persisted legacy SQL rows remain untouched.
 */
export const TICKET_MICRO_UNITS = 1_000_000;
export const MARKET_MICRODOLLARS_PER_DOLLAR = 1_000_000;

export const STADIUM_LEVELS = [
  { level: 1, maxSeats: 1_000, unlockCostCents: 0 },
  { level: 2, maxSeats: 5_000, unlockCostCents: 500_000 },
  { level: 3, maxSeats: 10_000, unlockCostCents: 1_500_000 },
  { level: 4, maxSeats: 20_000, unlockCostCents: 5_000_000 },
  { level: 5, maxSeats: 35_000, unlockCostCents: 15_000_000 },
  { level: 6, maxSeats: 50_000, unlockCostCents: 50_000_000 },
  { level: 7, maxSeats: 75_000, unlockCostCents: 150_000_000 },
  { level: 8, maxSeats: 100_000, unlockCostCents: 400_000_000 },
  { level: 9, maxSeats: 150_000, unlockCostCents: 1_000_000_000 },
  { level: 10, maxSeats: 500_000, unlockCostCents: 2_000_000_000 },
] as const;

export const SEAT_PRICE_BANDS = [
  { startSeat: 0, endSeatExclusive: 50_000, unitPriceCents: 300 },
  { startSeat: 50_000, endSeatExclusive: 150_000, unitPriceCents: 500 },
  { startSeat: 150_000, endSeatExclusive: 250_000, unitPriceCents: 1_000 },
  { startSeat: 250_000, endSeatExclusive: 350_000, unitPriceCents: 2_000 },
  { startSeat: 350_000, endSeatExclusive: 450_000, unitPriceCents: 3_000 },
  { startSeat: 450_000, endSeatExclusive: 500_000, unitPriceCents: 5_000 },
] as const;

export const SPEED_LEVELS = [
  { level: 1, microTicketsPerSeatPerHour: 2_000, upgradeCostCents: 0 },
  { level: 2, microTicketsPerSeatPerHour: 2_500, upgradeCostCents: 100_000 },
  { level: 3, microTicketsPerSeatPerHour: 3_000, upgradeCostCents: 250_000 },
  { level: 4, microTicketsPerSeatPerHour: 3_700, upgradeCostCents: 500_000 },
  { level: 5, microTicketsPerSeatPerHour: 4_600, upgradeCostCents: 1_000_000 },
  { level: 6, microTicketsPerSeatPerHour: 5_700, upgradeCostCents: 2_000_000 },
  { level: 7, microTicketsPerSeatPerHour: 7_000, upgradeCostCents: 4_000_000 },
  { level: 8, microTicketsPerSeatPerHour: 8_600, upgradeCostCents: 7_500_000 },
  { level: 9, microTicketsPerSeatPerHour: 10_500, upgradeCostCents: 12_500_000 },
  { level: 10, microTicketsPerSeatPerHour: 13_000, upgradeCostCents: 20_000_000 },
  { level: 11, microTicketsPerSeatPerHour: 16_000, upgradeCostCents: 35_000_000 },
  { level: 12, microTicketsPerSeatPerHour: 19_700, upgradeCostCents: 60_000_000 },
  { level: 13, microTicketsPerSeatPerHour: 24_300, upgradeCostCents: 100_000_000 },
  { level: 14, microTicketsPerSeatPerHour: 29_900, upgradeCostCents: 160_000_000 },
  { level: 15, microTicketsPerSeatPerHour: 36_800, upgradeCostCents: 250_000_000 },
  { level: 16, microTicketsPerSeatPerHour: 45_300, upgradeCostCents: 400_000_000 },
  { level: 17, microTicketsPerSeatPerHour: 55_800, upgradeCostCents: 600_000_000 },
  { level: 18, microTicketsPerSeatPerHour: 68_700, upgradeCostCents: 900_000_000 },
  { level: 19, microTicketsPerSeatPerHour: 84_600, upgradeCostCents: 1_300_000_000 },
  { level: 20, microTicketsPerSeatPerHour: 104_170, upgradeCostCents: 3_000_000_000 },
] as const;

export const STORAGE_LEVELS = [
  { level: 1, capacityTickets: 25, upgradeCostCents: 0 },
  { level: 2, capacityTickets: 50, upgradeCostCents: 50_000 },
  { level: 3, capacityTickets: 100, upgradeCostCents: 100_000 },
  { level: 4, capacityTickets: 200, upgradeCostCents: 200_000 },
  { level: 5, capacityTickets: 400, upgradeCostCents: 400_000 },
  { level: 6, capacityTickets: 750, upgradeCostCents: 750_000 },
  { level: 7, capacityTickets: 1_250, upgradeCostCents: 1_500_000 },
  { level: 8, capacityTickets: 2_000, upgradeCostCents: 3_000_000 },
  { level: 9, capacityTickets: 3_500, upgradeCostCents: 6_000_000 },
  { level: 10, capacityTickets: 6_000, upgradeCostCents: 10_000_000 },
  { level: 11, capacityTickets: 10_000, upgradeCostCents: 17_500_000 },
  { level: 12, capacityTickets: 17_000, upgradeCostCents: 30_000_000 },
  { level: 13, capacityTickets: 28_000, upgradeCostCents: 50_000_000 },
  { level: 14, capacityTickets: 45_000, upgradeCostCents: 80_000_000 },
  { level: 15, capacityTickets: 70_000, upgradeCostCents: 120_000_000 },
  { level: 16, capacityTickets: 105_000, upgradeCostCents: 180_000_000 },
  { level: 17, capacityTickets: 155_000, upgradeCostCents: 260_000_000 },
  { level: 18, capacityTickets: 230_000, upgradeCostCents: 380_000_000 },
  { level: 19, capacityTickets: 340_000, upgradeCostCents: 520_000_000 },
  { level: 20, capacityTickets: 500_000, upgradeCostCents: 1_000_000_000 },
] as const;

export const MARKET_CONFIG = {
  tickMs: 5_000,
  btcSensitivity: 20,
  initialTicketPriceMicrodollars: 8_000_000,
  minTicketPriceMicrodollars: 100_000,
  maxTicketPriceMicrodollars: 20_000_000,
  historyRetentionMs: 24 * 60 * 60 * 1_000,
  primaryFeed: "binance-btcusdt",
  backupFeed: "coinbase-btc-usd",
} as const;

export const MAX_STADIUM_LEVEL = STADIUM_LEVELS.at(-1)!.level;
export const MAX_SPEED_LEVEL = SPEED_LEVELS.at(-1)!.level;
export const MAX_STORAGE_LEVEL = STORAGE_LEVELS.at(-1)!.level;
export const MAX_STADIUM_SEATS = SEAT_PRICE_BANDS.at(-1)!.endSeatExclusive;
