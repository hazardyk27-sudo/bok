import { describe, expect, it } from "vitest";
import {
  MARKET_CONFIG,
  MAX_STADIUM_LEVEL,
  MAX_STADIUM_SEATS,
  MAX_SPEED_LEVEL,
  MAX_STORAGE_LEVEL,
  SEAT_PRICE_BANDS,
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

  it("locks the accepted broad seat-price bands through 500k", () => {
    expect(SEAT_PRICE_BANDS.map((entry) => [
      entry.startSeat,
      entry.endSeatExclusive,
      entry.unitPriceCents,
    ])).toEqual([
      [0, 50_000, 300],
      [50_000, 150_000, 500],
      [150_000, 250_000, 1_000],
      [250_000, 350_000, 2_000],
      [350_000, 450_000, 3_000],
      [450_000, 500_000, 5_000],
    ]);
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
      btcSensitivity: 300,
      initialTicketPriceMicrodollars: 8_000_000,
      minTicketPriceMicrodollars: 100_000,
      maxTicketPriceMicrodollars: 20_000_000,
      historyRetentionMs: 86_400_000,
      primaryFeed: "binance-btcusdt",
      backupFeed: "coinbase-btc-usd",
    });
  });
});
