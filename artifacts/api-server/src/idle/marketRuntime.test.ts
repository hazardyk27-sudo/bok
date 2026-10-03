import { describe, expect, it } from "vitest";
import { MarketFeedCoordinator } from "./marketFeedCoordinator";
import {
  TicketMarketRuntime,
  getDelayUntilNextMarketTick,
  type RuntimeMarketFeed,
  type RuntimeMarketLeadershipClient,
  type RuntimeMarketPersistence,
  type RuntimeMarketPersistenceClient,
  type RuntimePersistedMarketState,
} from "./marketRuntime";

class FakeFeed implements RuntimeMarketFeed {
  started = 0;
  stopped = 0;

  constructor(
    private snapshot: ReturnType<RuntimeMarketFeed["getSnapshot"]>,
  ) {}

  start() {
    this.started += 1;
  }

  stop() {
    this.stopped += 1;
  }

  getSnapshot() {
    return this.snapshot;
  }

  setSnapshot(
    snapshot: ReturnType<RuntimeMarketFeed["getSnapshot"]>,
  ) {
    this.snapshot = snapshot;
  }
}

class FakePersistence implements RuntimeMarketPersistence {
  persistCalls = 0;
  history: Array<{
    priceMicrodollars: number;
    source: "binance-btcusdt" | "coinbase-btc-usd" | "none";
    tickAt: Date;
  }> = [];

  constructor(public state: RuntimePersistedMarketState) {}

  async ensureCurrentState() {
    return { ...this.state, tickAt: new Date(this.state.tickAt.getTime()) };
  }

  async getCurrentState() {
    return { ...this.state, tickAt: new Date(this.state.tickAt.getTime()) };
  }

  async getCurrentStateOnClient(
    _client: RuntimeMarketPersistenceClient,
  ) {
    return { ...this.state, tickAt: new Date(this.state.tickAt.getTime()) };
  }

  async getHistory() {
    return this.history.map((point) => ({
      ...point,
      tickAt: new Date(point.tickAt.getTime()),
    }));
  }

  async persistAuthoritativeTickOnClient(
    _client: RuntimeMarketPersistenceClient,
    tick: {
      priceMicrodollars: number;
      source: RuntimePersistedMarketState["source"];
      feedStatus: RuntimePersistedMarketState["feedStatus"];
      tickAt: Date;
    },
  ) {
    this.persistCalls += 1;
    this.state = {
      ...tick,
      tickAt: new Date(tick.tickAt.getTime()),
    };
    this.history.push({
      priceMicrodollars: tick.priceMicrodollars,
      source: tick.source,
      tickAt: new Date(tick.tickAt.getTime()),
    });

    return {
      state: {
        ...this.state,
        tickAt: new Date(this.state.tickAt.getTime()),
      },
    };
  }
}

class FakeLeadership {
  released = 0;

  constructor(public leader = true) {}

  async runIfLeader<T>(
    write: (
      client: RuntimeMarketLeadershipClient,
    ) => Promise<T>,
  ) {
    if (!this.leader) {
      return {
        executed: false as const,
        value: null,
      };
    }

    return {
      executed: true as const,
      value: await write({
        query: async () => ({ rows: [] }),
        release: () => undefined,
      } as unknown as RuntimeMarketLeadershipClient),
    };
  }

  async release() {
    this.released += 1;
    this.leader = false;
    return true;
  }
}

function frozenFeed(
  source: "binance-btcusdt" | "coinbase-btc-usd",
): ReturnType<RuntimeMarketFeed["getSnapshot"]> {
  return {
    source,
    status: "FROZEN",
    connectionEpoch: 0,
    latestQuote: null,
  };
}

function liveFeed(input: {
  source: "binance-btcusdt" | "coinbase-btc-usd";
  priceMicrodollars: number;
  receivedAtMs: number;
  connectionEpoch?: number;
  rebaseline?: boolean;
}): ReturnType<RuntimeMarketFeed["getSnapshot"]> {
  const connectionEpoch = input.connectionEpoch ?? 1;
  return {
    source: input.source,
    status: "LIVE",
    connectionEpoch,
    latestQuote: {
      source: input.source,
      priceMicrodollars: input.priceMicrodollars,
      receivedAtMs: input.receivedAtMs,
      connectionEpoch,
      rebaseline: input.rebaseline ?? false,
    },
  };
}

function baseState(): RuntimePersistedMarketState {
  return {
    priceMicrodollars: 5_000_000,
    source: "none",
    feedStatus: "FROZEN",
    tickAt: new Date(100_000),
  };
}

describe("global ticket market runtime", () => {
  it("restores persisted price on startup and schedules the next aligned 5-second tick", async () => {
    const binance = new FakeFeed(
      frozenFeed("binance-btcusdt"),
    );
    const coinbase = new FakeFeed(
      frozenFeed("coinbase-btc-usd"),
    );
    const persistence = new FakePersistence(baseState());
    const leadership = new FakeLeadership();
    const scheduled: Array<{ delayMs: number }> = [];

    const runtime = new TicketMarketRuntime({
      binance,
      coinbase,
      coordinator: new MarketFeedCoordinator(),
      persistence,
      leadership,
      now: () => new Date(103_000),
      setTimeoutFn: (_callback, delayMs) => {
        scheduled.push({ delayMs });
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutFn: () => undefined,
    });

    await runtime.start();

    expect(runtime.getCurrentSnapshot()).toEqual({
      priceMicrodollars: 5_000_000,
      source: "none",
      feedStatus: "FROZEN",
      tickAt: new Date(100_000).toISOString(),
    });
    expect(binance.started).toBe(1);
    expect(coinbase.started).toBe(1);
    expect(scheduled).toEqual([{ delayMs: 2_000 }]);
    expect(getDelayUntilNextMarketTick(new Date(105_000)))
      .toBe(5_000);

    await runtime.stop();
  });

  it("re-baselines the first healthy BTC quote after restart before applying movement", async () => {
    const binance = new FakeFeed(liveFeed({
      source: "binance-btcusdt",
      priceMicrodollars: 100_000_000_000,
      receivedAtMs: 104_000,
      rebaseline: true,
    }));
    const coinbase = new FakeFeed(
      frozenFeed("coinbase-btc-usd"),
    );
    const persistence = new FakePersistence(baseState());
    const runtime = new TicketMarketRuntime({
      binance,
      coinbase,
      coordinator: new MarketFeedCoordinator(),
      persistence,
      leadership: new FakeLeadership(),
    });

    await runtime.runOneTick(new Date(105_000));

    expect(persistence.state).toMatchObject({
      priceMicrodollars: 5_000_000,
      source: "binance-btcusdt",
      feedStatus: "REBASELINING",
    });

    binance.setSnapshot(liveFeed({
      source: "binance-btcusdt",
      priceMicrodollars: 100_100_000_000,
      receivedAtMs: 109_000,
    }));

    await runtime.runOneTick(new Date(110_000));

    expect(persistence.state).toMatchObject({
      // +0.1% BTC ×300 = +30% ticket: $5.00 -> $6.50.
      priceMicrodollars: 6_500_000,
      source: "binance-btcusdt",
      feedStatus: "LIVE",
    });
  });

  it("freezes through a full outage and re-baselines Coinbase before backup movement resumes", async () => {
    const binance = new FakeFeed(liveFeed({
      source: "binance-btcusdt",
      priceMicrodollars: 100_000_000_000,
      receivedAtMs: 104_000,
    }));
    const coinbase = new FakeFeed(
      frozenFeed("coinbase-btc-usd"),
    );
    const persistence = new FakePersistence({
      ...baseState(),
      priceMicrodollars: 4_000_000,
    });
    const runtime = new TicketMarketRuntime({
      binance,
      coinbase,
      coordinator: new MarketFeedCoordinator(),
      persistence,
      leadership: new FakeLeadership(),
    });

    await runtime.runOneTick(new Date(105_000));

    binance.setSnapshot(liveFeed({
      source: "binance-btcusdt",
      priceMicrodollars: 100_100_000_000,
      receivedAtMs: 109_000,
    }));
    await runtime.runOneTick(new Date(110_000));
    expect(persistence.state.priceMicrodollars).toBe(5_200_000);

    binance.setSnapshot(
      frozenFeed("binance-btcusdt"),
    );
    await runtime.runOneTick(new Date(115_000));

    expect(persistence.state).toMatchObject({
      priceMicrodollars: 5_200_000,
      source: "none",
      feedStatus: "FROZEN",
    });

    coinbase.setSnapshot(liveFeed({
      source: "coinbase-btc-usd",
      priceMicrodollars: 100_000_000_000,
      receivedAtMs: 119_000,
    }));
    await runtime.runOneTick(new Date(120_000));

    expect(persistence.state).toMatchObject({
      priceMicrodollars: 5_200_000,
      source: "coinbase-btc-usd",
      feedStatus: "REBASELINING",
    });

    coinbase.setSnapshot(liveFeed({
      source: "coinbase-btc-usd",
      priceMicrodollars: 100_100_000_000,
      receivedAtMs: 124_000,
    }));
    await runtime.runOneTick(new Date(125_000));

    expect(persistence.state).toMatchObject({
      priceMicrodollars: 6_760_000,
      source: "coinbase-btc-usd",
      feedStatus: "LIVE",
    });
  });

  it("never persists on a follower and mirrors the DB leader state for local live clients", async () => {
    const persistence = new FakePersistence(baseState());
    const leadership = new FakeLeadership(false);
    const runtime = new TicketMarketRuntime({
      binance: new FakeFeed(
        frozenFeed("binance-btcusdt"),
      ),
      coinbase: new FakeFeed(
        frozenFeed("coinbase-btc-usd"),
      ),
      coordinator: new MarketFeedCoordinator(),
      persistence,
      leadership,
    });

    const observed: number[] = [];
    runtime.subscribe((snapshot) => {
      observed.push(snapshot.priceMicrodollars);
    });

    persistence.state = {
      priceMicrodollars: 4_200_000,
      source: "binance-btcusdt",
      feedStatus: "LIVE",
      tickAt: new Date(105_000),
    };

    const result = await runtime.runOneTick(
      new Date(110_000),
    );

    expect(result.executed).toBe(false);
    expect(persistence.persistCalls).toBe(0);
    expect(runtime.getCurrentSnapshot()?.priceMicrodollars)
      .toBe(4_200_000);
    expect(observed).toEqual([4_200_000]);
  });
});
