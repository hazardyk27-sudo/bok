import { describe, expect, it } from "vitest";
import {
  MARKET_FEED_STALE_AFTER_MS,
  MARKET_RECONNECT_MAX_DELAY_MS,
  calculateReconnectBackoffMs,
  deriveMarketFeedHealth,
} from "./marketFeedHealth";

describe("market feed health and reconnect policy", () => {
  it("marks a feed stale after three missed 5-second market ticks", () => {
    expect(MARKET_FEED_STALE_AFTER_MS).toBe(15_000);

    const fresh = deriveMarketFeedHealth({
      source: "binance-btcusdt",
      status: "LIVE",
      connectionEpoch: 1,
      latestQuote: {
        source: "binance-btcusdt",
        priceMicrodollars: 100_000_000_000,
        receivedAtMs: 100_000,
        connectionEpoch: 1,
        rebaseline: false,
      },
    }, 115_000);

    expect(fresh.healthy).toBe(true);
    expect(fresh.derivedStatus).toBe("LIVE");
    expect(fresh.quoteAgeMs).toBe(15_000);

    const stale = deriveMarketFeedHealth({
      source: "binance-btcusdt",
      status: "LIVE",
      connectionEpoch: 1,
      latestQuote: {
        source: "binance-btcusdt",
        priceMicrodollars: 100_000_000_000,
        receivedAtMs: 100_000,
        connectionEpoch: 1,
        rebaseline: false,
      },
    }, 115_001);

    expect(stale.healthy).toBe(false);
    expect(stale.derivedStatus).toBe("STALE");
  });

  it("does not treat CONNECTING/FROZEN transport state as healthy merely because an old quote exists", () => {
    for (const status of ["CONNECTING", "FROZEN"] as const) {
      const health = deriveMarketFeedHealth({
        source: "coinbase-btc-usd",
        status,
        connectionEpoch: 2,
        latestQuote: {
          source: "coinbase-btc-usd",
          priceMicrodollars: 99_000_000_000,
          receivedAtMs: 100_000,
          connectionEpoch: 2,
          rebaseline: false,
        },
      }, 100_001);

      expect(health.healthy).toBe(false);
    }
  });

  it("uses capped exponential reconnect backoff", () => {
    expect(calculateReconnectBackoffMs(0)).toBe(1_500);
    expect(calculateReconnectBackoffMs(1)).toBe(3_000);
    expect(calculateReconnectBackoffMs(2)).toBe(6_000);
    expect(calculateReconnectBackoffMs(3)).toBe(12_000);
    expect(calculateReconnectBackoffMs(4)).toBe(24_000);
    expect(calculateReconnectBackoffMs(5))
      .toBe(MARKET_RECONNECT_MAX_DELAY_MS);
    expect(calculateReconnectBackoffMs(20))
      .toBe(MARKET_RECONNECT_MAX_DELAY_MS);
  });

  it("supports a larger injected base delay without violating the cap contract", () => {
    expect(calculateReconnectBackoffMs(
      0,
      45_000,
      45_000,
    )).toBe(45_000);
  });

  it("rejects invalid reconnect and clock inputs", () => {
    expect(() => calculateReconnectBackoffMs(-1))
      .toThrow("INVALID_IDLE_MARKET_RECONNECT_BACKOFF");

    expect(() => deriveMarketFeedHealth({
      source: "binance-btcusdt",
      status: "LIVE",
      connectionEpoch: 1,
      latestQuote: null,
    }, -1)).toThrow("INVALID_IDLE_MARKET_HEALTH_CLOCK");
  });
});
