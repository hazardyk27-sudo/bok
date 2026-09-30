import { describe, expect, it } from "vitest";
import { MarketFeedCoordinator } from "./marketFeedCoordinator";

function feedSnapshot(input: {
  source: "binance-btcusdt" | "coinbase-btc-usd";
  status?: "LIVE" | "CONNECTING" | "REBASELINING" | "STALE" | "FROZEN";
  connectionEpoch?: number;
  priceMicrodollars?: number;
  receivedAtMs?: number;
  rebaseline?: boolean;
}) {
  const connectionEpoch = input.connectionEpoch ?? 1;
  return {
    source: input.source,
    status: input.status ?? "LIVE",
    connectionEpoch,
    latestQuote: input.priceMicrodollars === undefined
      ? null
      : {
          source: input.source,
          priceMicrodollars: input.priceMicrodollars,
          receivedAtMs: input.receivedAtMs ?? 100_000,
          connectionEpoch,
          rebaseline: input.rebaseline ?? false,
        },
  };
}

describe("BTC market feed failover coordinator", () => {
  it("prefers healthy Binance and re-baselines only once for the connection epoch", () => {
    const coordinator = new MarketFeedCoordinator();

    const binance = feedSnapshot({
      source: "binance-btcusdt",
      priceMicrodollars: 100_000_000_000,
      receivedAtMs: 100_000,
      connectionEpoch: 1,
      rebaseline: true,
    });
    const coinbase = feedSnapshot({
      source: "coinbase-btc-usd",
      priceMicrodollars: 100_010_000_000,
      receivedAtMs: 100_000,
      connectionEpoch: 1,
    });

    const first = coordinator.select({
      binance,
      coinbase,
      nowMs: 101_000,
    });

    expect(first).toMatchObject({
      source: "binance-btcusdt",
      feedStatus: "REBASELINING",
      priceMicrodollars: 100_000_000_000,
      shouldRebaselineBtc: true,
    });

    const second = coordinator.select({
      binance,
      coinbase,
      nowMs: 102_000,
    });

    expect(second).toMatchObject({
      source: "binance-btcusdt",
      feedStatus: "LIVE",
      shouldRebaselineBtc: false,
    });
  });

  it("fails over to healthy Coinbase when Binance becomes stale", () => {
    const coordinator = new MarketFeedCoordinator();

    coordinator.select({
      binance: feedSnapshot({
        source: "binance-btcusdt",
        priceMicrodollars: 100_000_000_000,
        receivedAtMs: 100_000,
      }),
      coinbase: feedSnapshot({
        source: "coinbase-btc-usd",
        priceMicrodollars: 100_010_000_000,
        receivedAtMs: 100_000,
      }),
      nowMs: 101_000,
    });

    const failedOver = coordinator.select({
      binance: feedSnapshot({
        source: "binance-btcusdt",
        priceMicrodollars: 100_000_000_000,
        receivedAtMs: 100_000,
      }),
      coinbase: feedSnapshot({
        source: "coinbase-btc-usd",
        priceMicrodollars: 99_900_000_000,
        receivedAtMs: 116_000,
      }),
      nowMs: 116_001,
    });

    expect(failedOver.primary.derivedStatus).toBe("STALE");
    expect(failedOver).toMatchObject({
      source: "coinbase-btc-usd",
      feedStatus: "REBASELINING",
      priceMicrodollars: 99_900_000_000,
      shouldRebaselineBtc: true,
    });

    const steadyBackup = coordinator.select({
      binance: feedSnapshot({
        source: "binance-btcusdt",
        priceMicrodollars: 100_000_000_000,
        receivedAtMs: 100_000,
      }),
      coinbase: feedSnapshot({
        source: "coinbase-btc-usd",
        priceMicrodollars: 99_905_000_000,
        receivedAtMs: 120_000,
      }),
      nowMs: 120_001,
    });

    expect(steadyBackup).toMatchObject({
      source: "coinbase-btc-usd",
      feedStatus: "LIVE",
      shouldRebaselineBtc: false,
    });
  });

  it("returns to Binance when the primary recovers and re-baselines the provider switch", () => {
    const coordinator = new MarketFeedCoordinator();

    coordinator.select({
      binance: feedSnapshot({
        source: "binance-btcusdt",
        status: "CONNECTING",
      }),
      coinbase: feedSnapshot({
        source: "coinbase-btc-usd",
        priceMicrodollars: 99_000_000_000,
        receivedAtMs: 100_000,
      }),
      nowMs: 100_001,
    });

    const recovered = coordinator.select({
      binance: feedSnapshot({
        source: "binance-btcusdt",
        priceMicrodollars: 100_100_000_000,
        receivedAtMs: 105_000,
        connectionEpoch: 2,
      }),
      coinbase: feedSnapshot({
        source: "coinbase-btc-usd",
        priceMicrodollars: 99_100_000_000,
        receivedAtMs: 105_000,
      }),
      nowMs: 105_001,
    });

    expect(recovered).toMatchObject({
      source: "binance-btcusdt",
      feedStatus: "REBASELINING",
      shouldRebaselineBtc: true,
      connectionEpoch: 2,
    });
  });

  it("re-baselines a reconnect even when the provider itself did not change", () => {
    const coordinator = new MarketFeedCoordinator();

    coordinator.select({
      binance: feedSnapshot({
        source: "binance-btcusdt",
        priceMicrodollars: 100_000_000_000,
        connectionEpoch: 1,
      }),
      coinbase: feedSnapshot({
        source: "coinbase-btc-usd",
        status: "FROZEN",
      }),
      nowMs: 100_001,
    });

    const reconnect = coordinator.select({
      binance: feedSnapshot({
        source: "binance-btcusdt",
        priceMicrodollars: 101_000_000_000,
        receivedAtMs: 105_000,
        connectionEpoch: 2,
      }),
      coinbase: feedSnapshot({
        source: "coinbase-btc-usd",
        status: "FROZEN",
      }),
      nowMs: 105_001,
    });

    expect(reconnect).toMatchObject({
      source: "binance-btcusdt",
      feedStatus: "REBASELINING",
      shouldRebaselineBtc: true,
      connectionEpoch: 2,
    });
  });

  it("freezes the market when neither provider has a fresh quote", () => {
    const coordinator = new MarketFeedCoordinator();

    const frozen = coordinator.select({
      binance: feedSnapshot({
        source: "binance-btcusdt",
        priceMicrodollars: 100_000_000_000,
        receivedAtMs: 50_000,
      }),
      coinbase: feedSnapshot({
        source: "coinbase-btc-usd",
        priceMicrodollars: 100_100_000_000,
        receivedAtMs: 50_000,
      }),
      nowMs: 100_000,
    });

    expect(frozen).toMatchObject({
      source: "none",
      feedStatus: "FROZEN",
      priceMicrodollars: null,
      connectionEpoch: null,
      shouldRebaselineBtc: false,
    });
    expect(coordinator.getActiveSource()).toBe("none");
  });

  it("re-baselines after a full outage before any ticket-price movement resumes", () => {
    const coordinator = new MarketFeedCoordinator();

    coordinator.select({
      binance: feedSnapshot({
        source: "binance-btcusdt",
        priceMicrodollars: 100_000_000_000,
        receivedAtMs: 100_000,
      }),
      coinbase: feedSnapshot({
        source: "coinbase-btc-usd",
        status: "FROZEN",
      }),
      nowMs: 100_001,
    });

    coordinator.select({
      binance: feedSnapshot({
        source: "binance-btcusdt",
        status: "CONNECTING",
      }),
      coinbase: feedSnapshot({
        source: "coinbase-btc-usd",
        status: "CONNECTING",
      }),
      nowMs: 120_000,
    });

    const afterOutage = coordinator.select({
      binance: feedSnapshot({
        source: "binance-btcusdt",
        priceMicrodollars: 105_000_000_000,
        receivedAtMs: 130_000,
        connectionEpoch: 2,
      }),
      coinbase: feedSnapshot({
        source: "coinbase-btc-usd",
        status: "CONNECTING",
      }),
      nowMs: 130_001,
    });

    expect(afterOutage).toMatchObject({
      source: "binance-btcusdt",
      feedStatus: "REBASELINING",
      shouldRebaselineBtc: true,
    });
  });
});
