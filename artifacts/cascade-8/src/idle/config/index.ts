import type { BusinessDefinition } from "../types";


/**
 * Canonical Stadium redesign configuration.
 *
 * These tables implement STADIUM_ECONOMY_SPEC.md and are the source of truth
 * for the new ticket economy. The legacy direct-cash exports below remain
 * temporarily only so the existing UI/backend can compile while later parts
 * migrate consumers onto this model.
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

export const PRE_200K_SEAT_PRICE_BANDS = [
  { startSeat: 0, endSeatExclusive: 1_000, unitPriceCents: 100 },
  { startSeat: 1_000, endSeatExclusive: 5_000, unitPriceCents: 300 },
  { startSeat: 5_000, endSeatExclusive: 10_000, unitPriceCents: 500 },
  { startSeat: 10_000, endSeatExclusive: 20_000, unitPriceCents: 1_000 },
  { startSeat: 20_000, endSeatExclusive: 35_000, unitPriceCents: 2_000 },
  { startSeat: 35_000, endSeatExclusive: 50_000, unitPriceCents: 5_000 },
  { startSeat: 50_000, endSeatExclusive: 75_000, unitPriceCents: 10_000 },
  { startSeat: 75_000, endSeatExclusive: 100_000, unitPriceCents: 25_000 },
  { startSeat: 100_000, endSeatExclusive: 150_000, unitPriceCents: 50_000 },
  { startSeat: 150_000, endSeatExclusive: 200_000, unitPriceCents: 100_000 },
] as const;

export const POST_200K_SEAT_PRICING = {
  startsAtSeats: 200_000,
  hardMaxSeats: 500_000,
  blockSizeSeats: 25_000,
  baseUnitPriceCents: 100_000,
  growthNumerator: 110,
  growthDenominator: 100,
} as const;

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
  btcSensitivity: 15,
  initialTicketPriceMicrodollars: 4_000_000,
  minTicketPriceMicrodollars: 200_000,
  maxTicketPriceMicrodollars: 10_000_000,
  historyRetentionMs: 24 * 60 * 60 * 1_000,
  primaryFeed: "binance-btcusdt",
  backupFeed: "coinbase-btc-usd",
} as const;

export const MAX_STADIUM_LEVEL = STADIUM_LEVELS.at(-1)!.level;
export const MAX_SPEED_LEVEL = SPEED_LEVELS.at(-1)!.level;
export const MAX_STORAGE_LEVEL = STORAGE_LEVELS.at(-1)!.level;
export const MAX_STADIUM_SEATS = POST_200K_SEAT_PRICING.hardMaxSeats;

export const STADIUM_BUSINESS = {
  id: "stadium",
  label: "Stadyum",
  levels: [
    {
      level: 0,
      name: "Yerel Stadyum",
      costCents: 50_000,
      dailyIncomeCents: 10_000,
      hourlyIncomeDisplayCents: 417,
      targetRoiDays: 5,
    },
    {
      level: 1,
      name: "Kulüp Stadyumu",
      costCents: 200_000,
      dailyIncomeCents: 36_000,
      hourlyIncomeDisplayCents: 1_500,
      targetRoiDays: 5.6,
    },
    {
      level: 2,
      name: "Profesyonel Stadyum",
      costCents: 500_000,
      dailyIncomeCents: 86_000,
      hourlyIncomeDisplayCents: 3_583,
      targetRoiDays: 10,
    },
    {
      level: 3,
      name: "Büyük Stadyum",
      costCents: 2_000_000,
      dailyIncomeCents: 152_700,
      hourlyIncomeDisplayCents: 6_361,
      targetRoiDays: 30,
    },
    {
      level: 4,
      name: "Ulusal Stadyum",
      costCents: 8_000_000,
      dailyIncomeCents: 286_000,
      hourlyIncomeDisplayCents: 11_917,
      targetRoiDays: 60,
    },
    {
      level: 5,
      name: "Elit Stadyum",
      costCents: 30_000_000,
      dailyIncomeCents: 619_300,
      hourlyIncomeDisplayCents: 25_806,
      targetRoiDays: 90,
    },
    {
      level: 6,
      name: "Stadyum ★1",
      costCents: 120_000_000,
      dailyIncomeCents: 1_476_500,
      hourlyIncomeDisplayCents: 61_520,
      targetRoiDays: 140,
    },
    {
      level: 7,
      name: "Stadyum ★2",
      costCents: 500_000_000,
      dailyIncomeCents: 4_108_100,
      hourlyIncomeDisplayCents: 171_169,
      targetRoiDays: 190,
    },
    {
      level: 8,
      name: "Stadyum ★3",
      costCents: 2_000_000_000,
      dailyIncomeCents: 12_441_400,
      hourlyIncomeDisplayCents: 518_391,
      targetRoiDays: 240,
    },
  ],
} as const satisfies BusinessDefinition;


export const CLUB_STORE_BUSINESS = {
  id: "club-store",
  label: "Kulüp Mağazası",
  levels: [
    {
      level: 0,
      name: "Taraftar Ürün Standı",
      costCents: 30_000,
      dailyIncomeCents: 7_500,
      hourlyIncomeDisplayCents: 313,
      targetRoiDays: 4,
    },
    {
      level: 1,
      name: "Kulüp Mağazası",
      costCents: 120_000,
      dailyIncomeCents: 27_500,
      hourlyIncomeDisplayCents: 1_146,
      targetRoiDays: 6,
    },
    {
      level: 2,
      name: "Resmî Kulüp Mağazası",
      costCents: 300_000,
      dailyIncomeCents: 57_500,
      hourlyIncomeDisplayCents: 2_396,
      targetRoiDays: 10,
    },
    {
      level: 3,
      name: "Ana Kulüp Mağazası",
      costCents: 1_000_000,
      dailyIncomeCents: 97_500,
      hourlyIncomeDisplayCents: 4_063,
      targetRoiDays: 25,
    },
    {
      level: 4,
      name: "Ulusal Mağaza Ağı",
      costCents: 3_500_000,
      dailyIncomeCents: 167_500,
      hourlyIncomeDisplayCents: 6_979,
      targetRoiDays: 50,
    },
    {
      level: 5,
      name: "Uluslararası Mağaza Ağı",
      costCents: 12_000_000,
      dailyIncomeCents: 317_500,
      hourlyIncomeDisplayCents: 13_229,
      targetRoiDays: 80,
    },
    {
      level: 6,
      name: "Kulüp Markası ★1",
      costCents: 45_000_000,
      dailyIncomeCents: 692_500,
      hourlyIncomeDisplayCents: 28_854,
      targetRoiDays: 120,
    },
    {
      level: 7,
      name: "Kulüp Markası ★2",
      costCents: 180_000_000,
      dailyIncomeCents: 1_751_300,
      hourlyIncomeDisplayCents: 72_972,
      targetRoiDays: 170,
    },
    {
      level: 8,
      name: "Kulüp Markası ★3",
      costCents: 700_000_000,
      dailyIncomeCents: 4_933_100,
      hourlyIncomeDisplayCents: 205_545,
      targetRoiDays: 220,
    },
  ],
} as const satisfies BusinessDefinition;


export const FAN_CLUB_BUSINESS = {
  id: "fan-club",
  label: "Taraftar Kulübü",
  levels: [
    {
      level: 0,
      name: "Yerel Taraftar Grubu",
      costCents: 10_000,
      dailyIncomeCents: 3_300,
      hourlyIncomeDisplayCents: 139,
      targetRoiDays: 3,
    },
    {
      level: 1,
      name: "Resmî Taraftar Kulübü",
      costCents: 40_000,
      dailyIncomeCents: 11_300,
      hourlyIncomeDisplayCents: 472,
      targetRoiDays: 5,
    },
    {
      level: 2,
      name: "Üyelik Programı",
      costCents: 100_000,
      dailyIncomeCents: 23_800,
      hourlyIncomeDisplayCents: 993,
      targetRoiDays: 8,
    },
    {
      level: 3,
      name: "Premium Üyelik",
      costCents: 300_000,
      dailyIncomeCents: 40_500,
      hourlyIncomeDisplayCents: 1_688,
      targetRoiDays: 18,
    },
    {
      level: 4,
      name: "Ulusal Taraftar Ağı",
      costCents: 1_000_000,
      dailyIncomeCents: 69_100,
      hourlyIncomeDisplayCents: 2_878,
      targetRoiDays: 35,
    },
    {
      level: 5,
      name: "Uluslararası Taraftar Kulübü",
      costCents: 3_500_000,
      dailyIncomeCents: 127_400,
      hourlyIncomeDisplayCents: 5_309,
      targetRoiDays: 60,
    },
    {
      level: 6,
      name: "Taraftar Ağı ★1",
      costCents: 12_000_000,
      dailyIncomeCents: 247_400,
      hourlyIncomeDisplayCents: 10_309,
      targetRoiDays: 100,
    },
    {
      level: 7,
      name: "Taraftar Ağı ★2",
      costCents: 45_000_000,
      dailyIncomeCents: 547_400,
      hourlyIncomeDisplayCents: 22_809,
      targetRoiDays: 150,
    },
    {
      level: 8,
      name: "Taraftar Ağı ★3",
      costCents: 150_000_000,
      dailyIncomeCents: 1_297_400,
      hourlyIncomeDisplayCents: 54_059,
      targetRoiDays: 200,
    },
  ],
} as const satisfies BusinessDefinition;


export const VAULT_LEVELS = [
  { level: 1, capacityHours: 1 },
  { level: 2, capacityHours: 2 },
  { level: 3, capacityHours: 4 },
  { level: 4, capacityHours: 8 },
  { level: 5, capacityHours: 12 },
  { level: 6, capacityHours: 24 },
] as const;

export type VaultLevel = (typeof VAULT_LEVELS)[number]["level"];

export const DEFAULT_VAULT_LEVEL: VaultLevel = 1;
export const MAX_VAULT_LEVEL: VaultLevel = 6;


export const VAULT_UPGRADE_STEPS = [
  { fromLevel: 1, toLevel: 2, costPercent: 5 },
  { fromLevel: 2, toLevel: 3, costPercent: 10 },
  { fromLevel: 3, toLevel: 4, costPercent: 15 },
  { fromLevel: 4, toLevel: 5, costPercent: 25 },
  { fromLevel: 5, toLevel: 6, costPercent: 40 },
] as const;

export const TOTAL_VAULT_UPGRADE_COST_PERCENT = VAULT_UPGRADE_STEPS.reduce(
  (total, step) => total + step.costPercent,
  0,
);
