import { describe, expect, it } from "vitest";
import {
  BINANCE_BTCUSDT_TRADE_STREAM_URL,
  BinanceBtcUsdtFeed,
  parseBinanceBtcUsdtTradeMessage,
} from "./binanceBtcFeed";

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

  closeCalls = 0;

  addEventListener(
    type: keyof ListenerMap,
    listener: ListenerMap[typeof type][number],
  ) {
    (this.listeners[type] as Array<typeof listener>)
      .push(listener);
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

function tradeMessage(
  price: string,
  eventTime = 1_700_000_000_001,
  tradeTime = 1_700_000_000_000,
) {
  return JSON.stringify({
    e: "trade",
    E: eventTime,
    s: "BTCUSDT",
    t: 123,
    p: price,
    q: "0.001",
    T: tradeTime,
    m: false,
    M: true,
  });
}

describe("Binance BTCUSDT primary feed", () => {
  it("uses the official raw BTCUSDT Spot trade stream", () => {
    expect(BINANCE_BTCUSDT_TRADE_STREAM_URL).toBe(
      "wss://stream.binance.com:9443/ws/btcusdt@trade",
    );
  });

  it("parses the Binance price string through exact microdollar precision", () => {
    expect(
      parseBinanceBtcUsdtTradeMessage(
        tradeMessage("100000.123456"),
      ),
    ).toEqual({
      priceMicrodollars: 100_000_123_456,
      eventTimeMs: 1_700_000_000_001,
      tradeTimeMs: 1_700_000_000_000,
    });
  });

  it("ignores messages that are not BTCUSDT raw trade events", () => {
    expect(parseBinanceBtcUsdtTradeMessage(JSON.stringify({
      e: "trade",
      E: 1,
      s: "ETHUSDT",
      p: "3000.00",
      T: 1,
    }))).toBeNull();

    expect(parseBinanceBtcUsdtTradeMessage(JSON.stringify({
      e: "24hrTicker",
      E: 1,
      s: "BTCUSDT",
      p: "100000.00",
      T: 1,
    }))).toBeNull();
  });

  it("rejects malformed trade payloads without converting them to floating point", () => {
    expect(() => parseBinanceBtcUsdtTradeMessage("{"))
      .toThrow("INVALID_IDLE_BINANCE_MESSAGE_JSON");

    expect(() => parseBinanceBtcUsdtTradeMessage(JSON.stringify({
      e: "trade",
      E: 1,
      s: "BTCUSDT",
      p: 100000.12,
      T: 1,
    }))).toThrow("INVALID_IDLE_BINANCE_TRADE_PRICE");
  });

  it("marks the first valid quote of each connection as a rebaseline", () => {
    const sockets: MockSocket[] = [];
    const quotes: Array<{ rebaseline: boolean; connectionEpoch: number }> = [];

    const feed = new BinanceBtcUsdtFeed({
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
    sockets[0]!.emitMessage(tradeMessage("100000.00"));
    sockets[0]!.emitMessage(tradeMessage("100010.00"));

    expect(quotes).toEqual([
      { rebaseline: true, connectionEpoch: 1 },
      { rebaseline: false, connectionEpoch: 1 },
    ]);
    expect(feed.getSnapshot().status).toBe("LIVE");

    feed.stop();
  });

  it("reconnects after close and re-baselines the first quote on the new socket", () => {
    const sockets: MockSocket[] = [];
    const scheduled: Array<() => void> = [];
    const quotes: Array<{ rebaseline: boolean; connectionEpoch: number }> = [];

    const feed = new BinanceBtcUsdtFeed({
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
    sockets[0]!.emitMessage(tradeMessage("100000.00"));
    sockets[0]!.emitClose();

    expect(scheduled).toHaveLength(1);
    scheduled[0]!();

    expect(sockets).toHaveLength(2);
    sockets[1]!.emitOpen();
    sockets[1]!.emitMessage(tradeMessage("99900.00"));

    expect(quotes).toEqual([
      { rebaseline: true, connectionEpoch: 1 },
      { rebaseline: true, connectionEpoch: 2 },
    ]);

    feed.stop();
  });

  it("keeps the latest valid quote in backend memory", () => {
    const sockets: MockSocket[] = [];

    const feed = new BinanceBtcUsdtFeed({
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
      tradeMessage("99999.500001"),
    );

    expect(feed.getSnapshot()).toMatchObject({
      source: "binance-btcusdt",
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
