import { MARKET_CONFIG } from "../../../cascade-8/src/idle/config";
import type {
  TicketMarketFeedStatus,
  TicketMarketSource,
} from "../../../cascade-8/src/idle/types";
import { parseBtcUsdQuoteToMicrodollars } from "./fixedPoint";
import {
  MARKET_RECONNECT_MAX_DELAY_MS,
  calculateReconnectBackoffMs,
} from "./marketFeedHealth";

export const BINANCE_BTCUSDT_TRADE_STREAM_URL =
  "wss://stream.binance.com:9443/ws/btcusdt@trade";

export const BINANCE_BTCUSDT_SYMBOL = "BTCUSDT" as const;
export const BINANCE_RECONNECT_DELAY_MS = 1_500;

type BinanceTradePayload = {
  e?: unknown;
  E?: unknown;
  s?: unknown;
  p?: unknown;
  T?: unknown;
};

export type BinanceBtcQuoteUpdate = {
  source: Extract<TicketMarketSource, "binance-btcusdt">;
  priceMicrodollars: number;
  eventTimeMs: number;
  tradeTimeMs: number;
  receivedAtMs: number;
  connectionEpoch: number;
  /**
   * True only for the first valid quote after each connection opens.
   * The future 5-second market sampler must use that quote as its BTC baseline
   * and must not turn the reconnect/provider gap into a ticket-price move.
   */
  rebaseline: boolean;
};

export type BinanceBtcFeedSnapshot = {
  source: Extract<TicketMarketSource, "binance-btcusdt">;
  status: TicketMarketFeedStatus;
  connectionEpoch: number;
  latestQuote: BinanceBtcQuoteUpdate | null;
};

type WebSocketMessageLike = {
  data?: unknown;
};

type WebSocketLike = {
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

export type BinanceBtcFeedOptions = {
  onQuote?: (quote: BinanceBtcQuoteUpdate) => void;
  onStatusChange?: (
    snapshot: BinanceBtcFeedSnapshot,
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

function requireSafePositiveTimestamp(
  value: unknown,
  errorCode: string,
) {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value <= 0
  ) {
    throw new Error(errorCode);
  }
  return value;
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

/**
 * Parses one raw Binance Spot BTCUSDT trade-stream message.
 *
 * Non-trade / other-symbol messages are ignored rather than treated as a quote.
 * The Binance price string stays a string until fixedPoint.ts converts it to
 * exact integer microdollars.
 */
export function parseBinanceBtcUsdtTradeMessage(
  rawMessage: string,
) {
  let payload: BinanceTradePayload;

  try {
    payload = JSON.parse(rawMessage) as BinanceTradePayload;
  } catch {
    throw new Error("INVALID_IDLE_BINANCE_MESSAGE_JSON");
  }

  if (
    payload.e !== "trade"
    || payload.s !== BINANCE_BTCUSDT_SYMBOL
  ) {
    return null;
  }

  if (typeof payload.p !== "string") {
    throw new Error("INVALID_IDLE_BINANCE_TRADE_PRICE");
  }

  return {
    priceMicrodollars:
      parseBtcUsdQuoteToMicrodollars(payload.p),
    eventTimeMs: requireSafePositiveTimestamp(
      payload.E,
      "INVALID_IDLE_BINANCE_EVENT_TIME",
    ),
    tradeTimeMs: requireSafePositiveTimestamp(
      payload.T,
      "INVALID_IDLE_BINANCE_TRADE_TIME",
    ),
  };
}

/**
 * Backend-only Binance BTCUSDT primary market feed.
 *
 * This class owns exactly one raw Spot trade-stream socket. It keeps only the
 * latest valid quote in memory and emits the first quote of every connection
 * with rebaseline=true. Basic reconnect is intentionally small here; stale
 * detection, exponential backoff/provider failover, and planned connection
 * rotation are hardened in Parts 16-17.
 */
export class BinanceBtcUsdtFeed {
  private readonly source =
    MARKET_CONFIG.primaryFeed as Extract<
      TicketMarketSource,
      "binance-btcusdt"
    >;

  private readonly onQuote?: (
    quote: BinanceBtcQuoteUpdate,
  ) => void;

  private readonly onStatusChange?: (
    snapshot: BinanceBtcFeedSnapshot,
  ) => void;

  private readonly reconnectDelayMs: number;
  private readonly now: () => number;
  private readonly createWebSocket: (
    url: string,
  ) => WebSocketLike;
  private readonly setTimeoutFn: BinanceBtcFeedOptions["setTimeoutFn"];
  private readonly clearTimeoutFn: BinanceBtcFeedOptions["clearTimeoutFn"];

  private socket: WebSocketLike | null = null;
  private reconnectTimer:
    | ReturnType<typeof setTimeout>
    | null = null;

  private running = false;
  private connectionEpoch = 0;
  private reconnectAttempt = 0;
  private awaitingRebaseline = true;
  private status: TicketMarketFeedStatus = "FROZEN";
  private latestQuote: BinanceBtcQuoteUpdate | null = null;

  constructor(options: BinanceBtcFeedOptions = {}) {
    this.onQuote = options.onQuote;
    this.onStatusChange = options.onStatusChange;
    this.reconnectDelayMs =
      options.reconnectDelayMs ?? BINANCE_RECONNECT_DELAY_MS;
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
      throw new Error("INVALID_IDLE_BINANCE_RECONNECT_DELAY");
    }
  }

  getSnapshot(): BinanceBtcFeedSnapshot {
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
        BINANCE_BTCUSDT_TRADE_STREAM_URL,
      );
    } catch {
      this.scheduleReconnect(epoch);
      return;
    }

    this.socket = socket;

    socket.addEventListener("open", () => {
      if (!this.running || epoch !== this.connectionEpoch) {
        return;
      }
      this.setStatus("REBASELINING");
    });

    socket.addEventListener("message", (event) => {
      if (!this.running || epoch !== this.connectionEpoch) {
        return;
      }

      if (typeof event.data !== "string") {
        return;
      }

      let parsed: ReturnType<
        typeof parseBinanceBtcUsdtTradeMessage
      >;

      try {
        parsed = parseBinanceBtcUsdtTradeMessage(
          event.data,
        );
      } catch {
        return;
      }

      if (!parsed) return;

      const quote: BinanceBtcQuoteUpdate = {
        source: this.source,
        ...parsed,
        receivedAtMs: this.now(),
        connectionEpoch: epoch,
        rebaseline: this.awaitingRebaseline,
      };

      this.awaitingRebaseline = false;
      this.reconnectAttempt = 0;
      this.latestQuote = quote;
      this.setStatus("LIVE");
      this.onQuote?.({ ...quote });
    });

    socket.addEventListener("error", () => {
      if (!this.running || epoch !== this.connectionEpoch) {
        return;
      }

      // Most WebSocket implementations follow an error with close. Closing
      // explicitly guarantees the reconnect path when they do not.
      try {
        socket.close();
      } finally {
        this.scheduleReconnect(epoch);
      }
    });

    socket.addEventListener("close", () => {
      if (this.socket === socket) {
        this.socket = null;
      }

      if (!this.running || epoch !== this.connectionEpoch) {
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

    const reconnectDelayMs = calculateReconnectBackoffMs(
      this.reconnectAttempt,
      this.reconnectDelayMs,
      Math.max(
        this.reconnectDelayMs,
        MARKET_RECONNECT_MAX_DELAY_MS,
      ),
    );
    this.reconnectAttempt += 1;

    this.reconnectTimer = this.setTimeoutFn?.(() => {
      this.reconnectTimer = null;

      if (
        !this.running
        || epoch !== this.connectionEpoch
      ) {
        return;
      }

      this.openConnection();
    }, reconnectDelayMs) ?? null;
  }
}
