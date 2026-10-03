import { describe, expect, it } from "vitest";
import {
  MAX_MARKET_HISTORY_ROWS,
  getMarketHistoryRetentionCutoff,
  isSameAuthoritativeMarketTick,
  validateAuthoritativeMarketTick,
} from "./marketPersistencePolicy";

describe("ticket market persistence policy", () => {
  it("caps a perfect 5-second 24-hour history at exactly 17,280 points", () => {
    expect(MAX_MARKET_HISTORY_ROWS).toBe(17_280);
  });

  it("uses a strict 24-hour cutoff", () => {
    const asOf = new Date("2026-09-29T20:00:00.000Z");
    expect(
      getMarketHistoryRetentionCutoff(asOf).toISOString(),
    ).toBe("2026-09-28T20:00:00.000Z");
  });

  it("accepts the canonical price floor and ceiling", () => {
    expect(validateAuthoritativeMarketTick({
      priceMicrodollars: 100_000,
      source: "binance-btcusdt",
      feedStatus: "LIVE",
      tickAt: new Date("2026-09-29T20:00:00.000Z"),
    }).priceMicrodollars).toBe(100_000);

    expect(validateAuthoritativeMarketTick({
      priceMicrodollars: 20_000_000,
      source: "coinbase-btc-usd",
      feedStatus: "REBASELINING",
      tickAt: new Date("2026-09-29T20:00:05.000Z"),
    }).priceMicrodollars).toBe(20_000_000);
  });

  it("allows frozen global state with no active provider", () => {
    expect(validateAuthoritativeMarketTick({
      priceMicrodollars: 8_000_000,
      source: "none",
      feedStatus: "FROZEN",
      tickAt: new Date("2026-09-29T20:00:00.000Z"),
    })).toMatchObject({
      source: "none",
      feedStatus: "FROZEN",
    });
  });

  it("rejects prices outside the accepted hard market range", () => {
    expect(() => validateAuthoritativeMarketTick({
      priceMicrodollars: 99_999,
      source: "binance-btcusdt",
      feedStatus: "LIVE",
      tickAt: new Date(),
    })).toThrow("INVALID_IDLE_MARKET_PRICE");

    expect(() => validateAuthoritativeMarketTick({
      priceMicrodollars: 20_000_001,
      source: "binance-btcusdt",
      feedStatus: "LIVE",
      tickAt: new Date(),
    })).toThrow("INVALID_IDLE_MARKET_PRICE");
  });

  it("compares exact authoritative tick identity including status and timestamp", () => {
    const left = validateAuthoritativeMarketTick({
      priceMicrodollars: 8_000_000,
      source: "binance-btcusdt",
      feedStatus: "LIVE",
      tickAt: new Date("2026-09-29T20:00:00.000Z"),
    });

    const same = validateAuthoritativeMarketTick({
      priceMicrodollars: 8_000_000,
      source: "binance-btcusdt",
      feedStatus: "LIVE",
      tickAt: new Date("2026-09-29T20:00:00.000Z"),
    });

    const changedStatus = validateAuthoritativeMarketTick({
      priceMicrodollars: 8_000_000,
      source: "binance-btcusdt",
      feedStatus: "REBASELINING",
      tickAt: new Date("2026-09-29T20:00:00.000Z"),
    });

    expect(isSameAuthoritativeMarketTick(left, same)).toBe(true);
    expect(
      isSameAuthoritativeMarketTick(left, changedStatus),
    ).toBe(false);
  });

  it("rejects invalid dates", () => {
    expect(() => getMarketHistoryRetentionCutoff(
      new Date(Number.NaN),
    )).toThrow("INVALID_IDLE_MARKET_RETENTION_TIME");
  });
});
