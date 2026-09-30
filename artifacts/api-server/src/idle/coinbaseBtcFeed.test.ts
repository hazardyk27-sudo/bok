import { describe, expect, it } from "vitest";
import {
  COINBASE_ADVANCED_MARKET_DATA_URL,
  COINBASE_BTC_USD_PRODUCT_ID,
  COINBASE_HEARTBEATS_CHANNEL,
  COINBASE_MARKET_TRADES_CHANNEL,
  CoinbaseBtcUsdFeed,
  buildCoinbaseBtcUsdSubscriptions,
  parseCoinbaseBtcUsdMarketTradesMessage,
} from "./coinbaseBtcFeed";

type ListenerMap = {
  open: Array<() => void>;
  message: Array<(event: { data?: unknown }) => void>;
  close: Array<() => void>;
  error: Array<() => void>;
};

class MockSocket {
  readonly listeners: ListenerMap = {
    open: [],
    message: [],
    close: [],
    error: [],
  };

  readonly sent: string[] = [];
  closeCalls = 0;

  addEventListener(
    type: keyof ListenerMap,
    listener: ListenerMap[typeof type][number],
  ) {
    (this.listeners[type] as Array<typeof listener>)
      .push(listener);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closeCalls += 1;
  }

  emitOpen() {
    for (const listener of this.listeners.open) listener();
  }

  emitMessage(data: unknown) {
    for (const listener of this.listeners.message) {
      listener({ data });
    }
  }

  emitClose() {
    for (const listener of this.listeners.close) listener();
  }
}

function marketTradesMessage(options: {
  price?: string;
  productId?: string;
  tradeTime?: string;
  envelopeTime?: string;
} = {}) {
  return JSON.stringify({
    channel: "market_trades",
    timestamp:
      options.envelopeTime ?? "2026-09-29T12:00:00.500Z",
    sequence_num: 12,
    events: [
      {
        type: "update",
        trades: [
          {
            trade_id: "100",
            product_id:
              options.productId ?? "BTC-USD",
            price:
              options.price ?? "100000.123456",
            size: "0.001",
            side: "BUY",
            time:
              options.tradeTime ??
              "2026-09-29T12:00:00.250Z",
          },
        ],
      },
    ],
  });
}

describe("Coinbase BTC-USD backup feed", () => {
  it("uses the current public Advanced Trade market-data endpoint", () => {
    expect(COINBASE_ADVANCED_MARKET_DATA_URL).toBe(
      "wss://advanced-trade-ws.coinbase.com",
    );
    expect(COINBASE_BTC_USD_PRODUCT_ID).toBe("BTC-USD");
  });

  it("builds separate market_trades and heartbeats subscription messages", () => {
    const subscriptions =
      buildCoinbaseBtcUsdSubscriptions().map(
        (item) => JSON.parse(item),
      );

    expect(subscriptions).toEqual([
      {
        type: "subscribe",
        channel: COINBASE_MARKET_TRADES_CHANNEL,
        product_ids: ["BTC-USD"],
      },
      {
        type: "subscribe",
        channel: COINBASE_HEARTBEATS_CHANNEL,
      },
    ]);
  });

  it("parses exact BTC-USD trade price strings from batched market trades", () => {
    expect(
      parseCoinbaseBtcUsdMarketTradesMessage(
        marketTradesMessage(),
      ),
    ).toEqual({
      priceMicrodollars: 100_000_123_456,
      tradeTimeMs: Date.parse(
        "2026-09-29T12:00:00.250Z",
      ),
      envelopeTimeMs: Date.parse(
        "2026-09-29T12:00:00.500Z",
      ),
    });
  });

  it("selects the newest BTC-USD trade from a batched envelope", () => {
    const message = JSON.stringify({
      channel: "market_trades",
      timestamp: "2026-09-29T12:00:01.000Z",
      sequence_num: 13,
      events: [
        {
          type: "update",
          trades: [
            {
              trade_id: "1",
              product_id: "BTC-USD",
              price: "99999.00",
              size: "0.1",
              side: "BUY",
              time: "2026-09-29T12:00:00.100Z",
            },
            {
              trade_id: "2",
              product_id: "BTC-USD",
              price: "100001.25",
              size: "0.1",
              side: "SELL",
              time: "2026-09-29T12:00:00.900Z",
            },
          ],
        },
      ],
    });

    expect(
      parseCoinbaseBtcUsdMarketTradesMessage(message),
    ).toMatchObject({
      priceMicrodollars: 100_001_250_000,
      tradeTimeMs: Date.parse(
        "2026-09-29T12:00:00.900Z",
      ),
    });
  });

  it("ignores other channels and envelopes without BTC-USD trades", () => {
    expect(
      parseCoinbaseBtcUsdMarketTradesMessage(
        JSON.stringify({
          channel: "heartbeats",
          timestamp: "2026-09-29T12:00:00Z",
          events: [],
        }),
      ),
    ).toBeNull();

    expect(
      parseCoinbaseBtcUsdMarketTradesMessage(
        marketTradesMessage({
          productId: "ETH-USD",
        }),
      ),
    ).toBeNull();
  });

  it("rejects malformed market-trade envelopes and prices", () => {
    expect(() =>
      parseCoinbaseBtcUsdMarketTradesMessage("{"),
    ).toThrow("INVALID_IDLE_COINBASE_MESSAGE_JSON");

    expect(() =>
      parseCoinbaseBtcUsdMarketTradesMessage(
        JSON.stringify({
          channel: "market_trades",
          timestamp: "2026-09-29T12:00:00Z",
          events: "bad",
        }),
      ),
    ).toThrow(
      "INVALID_IDLE_COINBASE_MARKET_TRADES_EVENTS",
    );

    expect(() =>
      parseCoinbaseBtcUsdMarketTradesMessage(
        JSON.stringify({
          channel: "market_trades",
          timestamp: "2026-09-29T12:00:00Z",
          events: [
            {
              type: "update",
              trades: [
                {
                  product_id: "BTC-USD",
                  price: 100000.12,
                  time: "2026-09-29T12:00:00Z",
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow("INVALID_IDLE_COINBASE_TRADE_PRICE");
  });

  it("subscribes on open and marks the first valid quote as a rebaseline", () => {
    const sockets: MockSocket[] = [];
    const quotes: Array<{
      rebaseline: boolean;
      connectionEpoch: number;
    }> = [];

    const feed = new CoinbaseBtcUsdFeed({
      now: () => 1_800_000_000_000,
      createWebSocket: () => {
        const socket = new MockSocket();
        sockets.push(socket);
        return socket;
      },
      onQuote: (quote) => {
        quotes.push({
          rebaseline: quote.rebaseline,
          connectionEpoch: quote.connectionEpoch,
        });
      },
    });

    feed.start();
    sockets[0]!.emitOpen();

    expect(
      sockets[0]!.sent.map((item) => JSON.parse(item)),
    ).toEqual([
      {
        type: "subscribe",
        channel: "market_trades",
        product_ids: ["BTC-USD"],
      },
      {
        type: "subscribe",
        channel: "heartbeats",
      },
    ]);

    sockets[0]!.emitMessage(marketTradesMessage());
    sockets[0]!.emitMessage(
      marketTradesMessage({
        price: "100010.00",
        tradeTime: "2026-09-29T12:00:01Z",
      }),
    );

    expect(quotes).toEqual([
      { rebaseline: true, connectionEpoch: 1 },
      { rebaseline: false, connectionEpoch: 1 },
    ]);
    expect(feed.getSnapshot().status).toBe("LIVE");

    feed.stop();
  });

  it("reconnects and re-baselines the first valid quote on the new connection", () => {
    const sockets: MockSocket[] = [];
    const scheduled: Array<() => void> = [];
    const quotes: Array<{
      rebaseline: boolean;
      connectionEpoch: number;
    }> = [];

    const feed = new CoinbaseBtcUsdFeed({
      reconnectDelayMs: 5,
      createWebSocket: () => {
        const socket = new MockSocket();
        sockets.push(socket);
        return socket;
      },
      setTimeoutFn: (callback) => {
        scheduled.push(callback);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutFn: () => undefined,
      onQuote: (quote) => {
        quotes.push({
          rebaseline: quote.rebaseline,
          connectionEpoch: quote.connectionEpoch,
        });
      },
    });

    feed.start();
    sockets[0]!.emitOpen();
    sockets[0]!.emitMessage(marketTradesMessage());
    sockets[0]!.emitClose();

    expect(scheduled).toHaveLength(1);
    scheduled[0]!();

    expect(sockets).toHaveLength(2);
    sockets[1]!.emitOpen();
    sockets[1]!.emitMessage(
      marketTradesMessage({
        price: "99900.00",
        tradeTime: "2026-09-29T12:01:00Z",
        envelopeTime: "2026-09-29T12:01:00.100Z",
      }),
    );

    expect(quotes).toEqual([
      { rebaseline: true, connectionEpoch: 1 },
      { rebaseline: true, connectionEpoch: 2 },
    ]);

    feed.stop();
  });

  it("keeps the latest valid Coinbase quote in backend memory", () => {
    const sockets: MockSocket[] = [];

    const feed = new CoinbaseBtcUsdFeed({
      now: () => 1_800_000_000_123,
      createWebSocket: () => {
        const socket = new MockSocket();
        sockets.push(socket);
        return socket;
      },
    });

    feed.start();
    sockets[0]!.emitOpen();
    sockets[0]!.emitMessage(
      marketTradesMessage({
        price: "99999.500001",
      }),
    );

    expect(feed.getSnapshot()).toMatchObject({
      source: "coinbase-btc-usd",
      status: "LIVE",
      connectionEpoch: 1,
      latestQuote: {
        priceMicrodollars: 99_999_500_001,
        receivedAtMs: 1_800_000_000_123,
        rebaseline: true,
      },
    });

    feed.stop();
  });
});
