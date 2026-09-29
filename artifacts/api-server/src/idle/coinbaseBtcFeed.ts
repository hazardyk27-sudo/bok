import { MARKET_CONFIG } from "../../../cascade-8/src/idle/config";
import type {
  TicketMarketFeedStatus,
  TicketMarketSource,
} from "../../../cascade-8/src/idle/types";
import { parseBtcUsdQuoteToMicrodollars } from "./fixedPoint";

export const COINBASE_ADVANCED_MARKET_DATA_URL =
  "wss://advanced-trade-ws.coinbase.com";

export const COINBASE_BTC_USD_PRODUCT_ID = "BTC-USD" as const;
export const COINBASE_MARKET_TRADES_CHANNEL =
  "market_trades" as const;
export const COINBASE_HEARTBEATS_CHANNEL =
  "heartbeats" as const;
export const COINBASE_RECONNECT_DELAY_MS = 1_500;

type CoinbaseMarketTrade = {
  trade_id?: unknown;
  product_id?: unknown;
  price?: unknown;
  size?: unknown;
  side?: unknown;
  time?: unknown;
};

type CoinbaseMarketTradeEvent = {
  type?: unknown;
  trades?: unknown;
};

type CoinbaseMarketTradesEnvelope = {
  channel?: unknown;
  timestamp?: unknown;
  sequence_num?: unknown;
  events?: unknown;
};

export type CoinbaseBtcQuoteUpdate = {
  source: Extract<TicketMarketSource, "coinbase-btc-usd">;
  priceMicrodollars: number;
  tradeTimeMs: number;
  envelopeTimeMs: number;
  receivedAtMs: number;
  connectionEpoch: number;
  /**
   * True only for the first valid BTC-USD quote after each connection opens.
   * The future market coordinator must accept it as the new BTC baseline
   * without moving the ticket price.
   */
  rebaseline: boolean;
};

export type CoinbaseBtcFeedSnapshot = {
  source: Extract<TicketMarketSource, "coinbase-btc-usd">;
  status: TicketMarketFeedStatus;
  connectionEpoch: number;
  latestQuote: CoinbaseBtcQuoteUpdate | null;
};

type WebSocketMessageLike = {
  data?: unknown;
};

type WebSocketLike = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    type: "open",
    listener: () => void,
  ): void;
  addEventListener(
    type: "message",
    listener: (event: WebSocketMessageLike) => void,
  ): void;
  addEventListener(
    type: "close",
    listener: () => void,
  ): void;
  addEventListener(
    type: "error",
    listener: () => void,
  ): void;
};

export type CoinbaseBtcFeedOptions = {
  onQuote?: (quote: CoinbaseBtcQuoteUpdate) => void;
  onStatusChange?: (
    snapshot: CoinbaseBtcFeedSnapshot,
  ) => void;
  reconnectDelayMs?: number;
  now?: () => number;
  createWebSocket?: (url: string) => WebSocketLike;
  setTimeoutFn?: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (
    handle: ReturnType<typeof setTimeout>,
  ) => void;
};

function parseRfc3339Timestamp(
  value: unknown,
  errorCode: string,
) {
  if (typeof value !== "string") {
    throw new Error(errorCode);
  }

  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(errorCode);
  }

  return parsed;
}

function defaultCreateWebSocket(url: string): WebSocketLike {
  const WebSocketConstructor = (
    globalThis as typeof globalThis & {
      WebSocket?: new (url: string) => WebSocketLike;
    }
  ).WebSocket;

  if (!WebSocketConstructor) {
    throw new Error("IDLE_WEBSOCKET_RUNTIME_UNAVAILABLE");
  }

  return new WebSocketConstructor(url);
}

export function buildCoinbaseBtcUsdSubscriptions() {
  return [
    JSON.stringify({
      type: "subscribe",
      channel: COINBASE_MARKET_TRADES_CHANNEL,
      product_ids: [COINBASE_BTC_USD_PRODUCT_ID],
    }),
    JSON.stringify({
      type: "subscribe",
      channel: COINBASE_HEARTBEATS_CHANNEL,
    }),
  ];
}

/**
 * Parses one Advanced Trade market_trades envelope and returns the latest
 * valid BTC-USD trade in that envelope.
 *
 * Coinbase batches public trades over roughly 250 ms, so one message can hold
 * multiple trades. The parser selects the trade with the newest RFC3339 trade
 * timestamp and keeps the documented price string exact until fixedPoint.ts.
 * Other channels, products, and envelopes with no BTC-USD trades are ignored.
 */
export function parseCoinbaseBtcUsdMarketTradesMessage(
  rawMessage: string,
) {
  let payload: CoinbaseMarketTradesEnvelope;

  try {
    payload = JSON.parse(rawMessage) as CoinbaseMarketTradesEnvelope;
  } catch {
    throw new Error("INVALID_IDLE_COINBASE_MESSAGE_JSON");
  }

  if (payload.channel !== COINBASE_MARKET_TRADES_CHANNEL) {
    return null;
  }

  if (!Array.isArray(payload.events)) {
    throw new Error("INVALID_IDLE_COINBASE_MARKET_TRADES_EVENTS");
  }

  const envelopeTimeMs = parseRfc3339Timestamp(
    payload.timestamp,
    "INVALID_IDLE_COINBASE_ENVELOPE_TIME",
  );

  let latest:
    | {
        priceMicrodollars: number;
        tradeTimeMs: number;
      }
    | null = null;

  for (const event of payload.events) {
    if (
      typeof event !== "object"
      || event === null
    ) {
      continue;
    }

    const trades = (
      event as CoinbaseMarketTradeEvent
    ).trades;
    if (!Array.isArray(trades)) continue;

    for (const trade of trades) {
      if (
        typeof trade !== "object"
        || trade === null
      ) {
        continue;
      }

      const candidate = trade as CoinbaseMarketTrade;
      if (
        candidate.product_id !== COINBASE_BTC_USD_PRODUCT_ID
      ) {
        continue;
      }

      if (typeof candidate.price !== "string") {
        throw new Error(
          "INVALID_IDLE_COINBASE_TRADE_PRICE",
        );
      }

      const tradeTimeMs = parseRfc3339Timestamp(
        candidate.time,
        "INVALID_IDLE_COINBASE_TRADE_TIME",
      );
      const priceMicrodollars =
        parseBtcUsdQuoteToMicrodollars(
          candidate.price,
        );

      if (
        latest === null
        || tradeTimeMs > latest.tradeTimeMs
      ) {
        latest = {
          priceMicrodollars,
          tradeTimeMs,
        };
      }
    }
  }

  if (!latest) return null;

  return {
    ...latest,
    envelopeTimeMs,
  };
}

/**
 * Backend-only Coinbase Advanced Trade BTC-USD backup feed.
 *
 * The public market-data endpoint does not require JWT authentication for this
 * channel. On open, the feed subscribes to BTC-USD market_trades plus the
 * heartbeats channel so an otherwise quiet connection is kept alive.
 *
 * This feed is deliberately independent in Part 16. Part 17 owns stale
 * detection/provider selection and failover activation.
 */
export class CoinbaseBtcUsdFeed {
  private readonly source =
    MARKET_CONFIG.backupFeed as Extract<
      TicketMarketSource,
      "coinbase-btc-usd"
    >;

  private readonly onQuote?: (
    quote: CoinbaseBtcQuoteUpdate,
  ) => void;

  private readonly onStatusChange?: (
    snapshot: CoinbaseBtcFeedSnapshot,
  ) => void;

  private readonly reconnectDelayMs: number;
  private readonly now: () => number;
  private readonly createWebSocket: (
    url: string,
  ) => WebSocketLike;
  private readonly setTimeoutFn:
    CoinbaseBtcFeedOptions["setTimeoutFn"];
  private readonly clearTimeoutFn:
    CoinbaseBtcFeedOptions["clearTimeoutFn"];

  private socket: WebSocketLike | null = null;
  private reconnectTimer:
    | ReturnType<typeof setTimeout>
    | null = null;

  private running = false;
  private connectionEpoch = 0;
  private awaitingRebaseline = true;
  private status: TicketMarketFeedStatus = "FROZEN";
  private latestQuote: CoinbaseBtcQuoteUpdate | null = null;

  constructor(options: CoinbaseBtcFeedOptions = {}) {
    this.onQuote = options.onQuote;
    this.onStatusChange = options.onStatusChange;
    this.reconnectDelayMs =
      options.reconnectDelayMs ?? COINBASE_RECONNECT_DELAY_MS;
    this.now = options.now ?? Date.now;
    this.createWebSocket =
      options.createWebSocket ?? defaultCreateWebSocket;
    this.setTimeoutFn =
      options.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn =
      options.clearTimeoutFn ?? clearTimeout;

    if (
      !Number.isSafeInteger(this.reconnectDelayMs)
      || this.reconnectDelayMs < 0
    ) {
      throw new Error(
        "INVALID_IDLE_COINBASE_RECONNECT_DELAY",
      );
    }
  }

  getSnapshot(): CoinbaseBtcFeedSnapshot {
    return {
      source: this.source,
      status: this.status,
      connectionEpoch: this.connectionEpoch,
      latestQuote: this.latestQuote
        ? { ...this.latestQuote }
        : null,
    };
  }

  start() {
    if (this.running) return;

    this.running = true;
    this.setStatus("CONNECTING");
    this.openConnection();
  }

  stop() {
    this.running = false;

    if (this.reconnectTimer !== null) {
      this.clearTimeoutFn?.(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const socket = this.socket;
    this.socket = null;

    try {
      socket?.close(1000, "idle-market-stop");
    } finally {
      this.awaitingRebaseline = true;
      this.setStatus("FROZEN");
    }
  }

  private setStatus(status: TicketMarketFeedStatus) {
    if (this.status === status) return;
    this.status = status;
    this.onStatusChange?.(this.getSnapshot());
  }

  private openConnection() {
    if (!this.running) return;

    this.connectionEpoch += 1;
    const epoch = this.connectionEpoch;
    this.awaitingRebaseline = true;
    this.setStatus("CONNECTING");

    let socket: WebSocketLike;
    try {
      socket = this.createWebSocket(
        COINBASE_ADVANCED_MARKET_DATA_URL,
      );
    } catch {
      this.scheduleReconnect(epoch);
      return;
    }

    this.socket = socket;

    socket.addEventListener("open", () => {
      if (
        !this.running
        || epoch !== this.connectionEpoch
      ) {
        return;
      }

      this.setStatus("REBASELINING");

      try {
        for (
          const subscription
          of buildCoinbaseBtcUsdSubscriptions()
        ) {
          socket.send(subscription);
        }
      } catch {
        try {
          socket.close();
        } catch {
          this.scheduleReconnect(epoch);
        }
      }
    });

    socket.addEventListener("message", (event) => {
      if (
        !this.running
        || epoch !== this.connectionEpoch
        || typeof event.data !== "string"
      ) {
        return;
      }

      let parsed: ReturnType<
        typeof parseCoinbaseBtcUsdMarketTradesMessage
      >;

      try {
        parsed =
          parseCoinbaseBtcUsdMarketTradesMessage(
            event.data,
          );
      } catch {
        return;
      }

      if (!parsed) return;

      const quote: CoinbaseBtcQuoteUpdate = {
        source: this.source,
        ...parsed,
        receivedAtMs: this.now(),
        connectionEpoch: epoch,
        rebaseline: this.awaitingRebaseline,
      };

      this.awaitingRebaseline = false;
      this.latestQuote = quote;
      this.setStatus("LIVE");
      this.onQuote?.({ ...quote });
    });

    socket.addEventListener("error", () => {
      if (
        !this.running
        || epoch !== this.connectionEpoch
      ) {
        return;
      }

      try {
        socket.close();
      } catch {
        this.scheduleReconnect(epoch);
      }
    });

    socket.addEventListener("close", () => {
      if (this.socket === socket) {
        this.socket = null;
      }

      if (
        !this.running
        || epoch !== this.connectionEpoch
      ) {
        return;
      }

      this.awaitingRebaseline = true;
      this.scheduleReconnect(epoch);
    });
  }

  private scheduleReconnect(epoch: number) {
    if (
      !this.running
      || epoch !== this.connectionEpoch
      || this.reconnectTimer !== null
    ) {
      return;
    }

    this.setStatus("CONNECTING");

    this.reconnectTimer = this.setTimeoutFn?.(() => {
      this.reconnectTimer = null;

      if (
        !this.running
        || epoch !== this.connectionEpoch
      ) {
        return;
      }

      this.openConnection();
    }, this.reconnectDelayMs) ?? null;
  }
}
