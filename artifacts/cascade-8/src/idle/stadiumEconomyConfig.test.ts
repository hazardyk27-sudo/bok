import { describe, expect, it } from "vitest";
import {
  MARKET_CONFIG,
  MAX_STADIUM_LEVEL,
  MAX_STADIUM_SEATS,
  MAX_SPEED_LEVEL,
  MAX_STORAGE_LEVEL,
  POST_200K_SEAT_PRICING,
  PRE_200K_SEAT_PRICE_BANDS,
  SPEED_LEVELS,
  STADIUM_LEVELS,
  STORAGE_LEVELS,
} from "./config";

describe("canonical Stadium economy config", () => {
  it("locks the accepted 10-level Stadium capacity and unlock-cost curve", () => {
    expect(STADIUM_LEVELS.map((entry) => entry.maxSeats)).toEqual([
      1_000,
      5_000,
      10_000,
      20_000,
      35_000,
      50_000,
      75_000,
      100_000,
      150_000,
      500_000,
    ]);

    expect(STADIUM_LEVELS.map((entry) => entry.unlockCostCents)).toEqual([
      0,
      500_000,
      1_500_000,
      5_000_000,
      15_000_000,
      50_000_000,
      150_000_000,
      400_000_000,
      1_000_000_000,
      2_000_000_000,
    ]);

    expect(MAX_STADIUM_LEVEL).toBe(10);
    expect(MAX_STADIUM_SEATS).toBe(500_000);
  });

  it("locks the pre-200k seat bands and 25k post-200k growth rule", () => {
    expect(PRE_200K_SEAT_PRICE_BANDS.map((entry) => [
      entry.startSeat,
      entry.endSeatExclusive,
      entry.unitPriceCents,
    ])).toEqual([
      [0, 1_000, 100],
      [1_000, 5_000, 300],
      [5_000, 10_000, 500],
      [10_000, 20_000, 1_000],
      [20_000, 35_000, 2_000],
      [35_000, 50_000, 5_000],
      [50_000, 75_000, 10_000],
      [75_000, 100_000, 25_000],
      [100_000, 150_000, 50_000],
      [150_000, 200_000, 100_000],
    ]);

    expect(POST_200K_SEAT_PRICING).toEqual({
      startsAtSeats: 200_000,
      hardMaxSeats: 500_000,
      blockSizeSeats: 25_000,
      baseUnitPriceCents: 100_000,
      growthNumerator: 110,
      growthDenominator: 100,
    });
  });

  it("locks the independent 20-level speed curve", () => {
    expect(SPEED_LEVELS).toHaveLength(20);
    expect(SPEED_LEVELS[0]).toEqual({
      level: 1,
      microTicketsPerSeatPerHour: 2_000,
      upgradeCostCents: 0,
    });
    expect(SPEED_LEVELS.at(-1)).toEqual({
      level: 20,
      microTicketsPerSeatPerHour: 104_170,
      upgradeCostCents: 3_000_000_000,
    });
    expect(MAX_SPEED_LEVEL).toBe(20);
  });

  it("locks the independent 20-level storage curve", () => {
    expect(STORAGE_LEVELS).toHaveLength(20);
    expect(STORAGE_LEVELS[0]).toEqual({
      level: 1,
      capacityTickets: 25,
      upgradeCostCents: 0,
    });
    expect(STORAGE_LEVELS.at(-1)).toEqual({
      level: 20,
      capacityTickets: 500_000,
      upgradeCostCents: 1_000_000_000,
    });
    expect(MAX_STORAGE_LEVEL).toBe(20);
  });

  it("locks the accepted global BTC market baseline", () => {
    expect(MARKET_CONFIG).toMatchObject({
      tickMs: 5_000,
      btcSensitivity: 15,
      initialTicketPriceMicrodollars: 4_000_000,
      minTicketPriceMicrodollars: 200_000,
      maxTicketPriceMicrodollars: 10_000_000,
      historyRetentionMs: 86_400_000,
      primaryFeed: "binance-btcusdt",
      backupFeed: "coinbase-btc-usd",
    });
  });
});
