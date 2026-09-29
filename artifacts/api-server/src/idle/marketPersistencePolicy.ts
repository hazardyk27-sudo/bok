import {
  MARKET_CONFIG,
} from "../../../cascade-8/src/idle/config";
import type {
  TicketMarketFeedStatus,
  TicketMarketSource,
} from "../../../cascade-8/src/idle/types";

export const MAX_MARKET_HISTORY_ROWS =
  MARKET_CONFIG.historyRetentionMs / MARKET_CONFIG.tickMs;

if (!Number.isSafeInteger(MAX_MARKET_HISTORY_ROWS)) {
  throw new Error("INVALID_IDLE_MARKET_HISTORY_WINDOW");
}

const MARKET_SOURCES = new Set<TicketMarketSource>([
  "binance-btcusdt",
  "coinbase-btc-usd",
  "none",
]);

const MARKET_FEED_STATUSES =
  new Set<TicketMarketFeedStatus>([
    "CONNECTING",
    "REBASELINING",
    "LIVE",
    "STALE",
    "FROZEN",
  ]);

export type AuthoritativeMarketTickInput = {
  priceMicrodollars: number;
  source: TicketMarketSource;
  feedStatus: TicketMarketFeedStatus;
  tickAt: Date;
};

function requireValidDate(
  value: Date,
  errorCode: string,
) {
  if (
    !(value instanceof Date)
    || !Number.isFinite(value.getTime())
  ) {
    throw new Error(errorCode);
  }
  return value;
}

/**
 * Validates one server-authoritative persisted ticket-market point.
 *
 * Market prices must always remain inside the accepted hard $0.20-$10 range,
 * regardless of whether the feed is LIVE, REBASELINING, or FROZEN.
 */
export function validateAuthoritativeMarketTick(
  input: AuthoritativeMarketTickInput,
): AuthoritativeMarketTickInput {
  if (
    !Number.isSafeInteger(input.priceMicrodollars)
    || input.priceMicrodollars
      < MARKET_CONFIG.minTicketPriceMicrodollars
    || input.priceMicrodollars
      > MARKET_CONFIG.maxTicketPriceMicrodollars
  ) {
    throw new Error("INVALID_IDLE_MARKET_PRICE");
  }

  if (!MARKET_SOURCES.has(input.source)) {
    throw new Error("INVALID_IDLE_MARKET_SOURCE");
  }

  if (!MARKET_FEED_STATUSES.has(input.feedStatus)) {
    throw new Error("INVALID_IDLE_MARKET_FEED_STATUS");
  }

  requireValidDate(
    input.tickAt,
    "INVALID_IDLE_MARKET_TICK_TIME",
  );

  return {
    ...input,
    tickAt: new Date(input.tickAt.getTime()),
  };
}

/**
 * History is the strict trailing 24-hour window. A point exactly 24 hours old
 * is expired, which keeps a perfect 5-second cadence at at most 17,280 rows.
 */
export function getMarketHistoryRetentionCutoff(
  asOf: Date,
) {
  requireValidDate(
    asOf,
    "INVALID_IDLE_MARKET_RETENTION_TIME",
  );

  return new Date(
    asOf.getTime() - MARKET_CONFIG.historyRetentionMs,
  );
}

export function isSameAuthoritativeMarketTick(
  left: AuthoritativeMarketTickInput,
  right: AuthoritativeMarketTickInput,
) {
  return (
    left.priceMicrodollars === right.priceMicrodollars
    && left.source === right.source
    && left.feedStatus === right.feedStatus
    && left.tickAt.getTime() === right.tickAt.getTime()
  );
}
