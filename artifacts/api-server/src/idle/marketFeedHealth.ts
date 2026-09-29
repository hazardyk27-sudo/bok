import {
  MARKET_CONFIG,
} from "../../../cascade-8/src/idle/config";
import type {
  TicketMarketFeedStatus,
  TicketMarketSource,
} from "../../../cascade-8/src/idle/types";

export const MARKET_FEED_STALE_AFTER_MS =
  MARKET_CONFIG.tickMs * 3;

export const MARKET_RECONNECT_BASE_DELAY_MS = 1_500;
export const MARKET_RECONNECT_MAX_DELAY_MS = 30_000;

export type MarketFeedQuoteLike = {
  source: Exclude<TicketMarketSource, "none">;
  priceMicrodollars: number;
  receivedAtMs: number;
  connectionEpoch: number;
  rebaseline: boolean;
};

export type MarketFeedSnapshotLike = {
  source: Exclude<TicketMarketSource, "none">;
  status: TicketMarketFeedStatus;
  connectionEpoch: number;
  latestQuote: MarketFeedQuoteLike | null;
};

export type MarketFeedHealth = {
  source: Exclude<TicketMarketSource, "none">;
  healthy: boolean;
  derivedStatus: TicketMarketFeedStatus;
  quoteAgeMs: number | null;
  latestQuote: MarketFeedQuoteLike | null;
};

export function calculateReconnectBackoffMs(
  reconnectAttempt: number,
  baseDelayMs = MARKET_RECONNECT_BASE_DELAY_MS,
  maxDelayMs = MARKET_RECONNECT_MAX_DELAY_MS,
) {
  if (
    !Number.isSafeInteger(reconnectAttempt)
    || reconnectAttempt < 0
    || !Number.isSafeInteger(baseDelayMs)
    || baseDelayMs < 0
    || !Number.isSafeInteger(maxDelayMs)
    || maxDelayMs < baseDelayMs
  ) {
    throw new Error("INVALID_IDLE_MARKET_RECONNECT_BACKOFF");
  }

  const exponent = Math.min(reconnectAttempt, 20);
  const scaled = BigInt(baseDelayMs) * (2n ** BigInt(exponent));
  return Number(
    scaled > BigInt(maxDelayMs)
      ? BigInt(maxDelayMs)
      : scaled,
  );
}

/**
 * A market feed becomes stale after three missed canonical 5-second market
 * ticks. Transport status alone is not enough: a socket can remain "open"
 * while useful BTC quotes have stopped arriving.
 */
export function deriveMarketFeedHealth(
  snapshot: MarketFeedSnapshotLike,
  nowMs: number,
  staleAfterMs = MARKET_FEED_STALE_AFTER_MS,
): MarketFeedHealth {
  if (
    !Number.isSafeInteger(nowMs)
    || nowMs < 0
    || !Number.isSafeInteger(staleAfterMs)
    || staleAfterMs <= 0
  ) {
    throw new Error("INVALID_IDLE_MARKET_HEALTH_CLOCK");
  }

  const quote = snapshot.latestQuote;
  if (!quote) {
    return {
      source: snapshot.source,
      healthy: false,
      derivedStatus: snapshot.status === "FROZEN"
        ? "FROZEN"
        : snapshot.status === "REBASELINING"
          ? "REBASELINING"
          : "CONNECTING",
      quoteAgeMs: null,
      latestQuote: null,
    };
  }

  const quoteAgeMs = Math.max(
    0,
    nowMs - quote.receivedAtMs,
  );

  const quoteBelongsToCurrentConnection =
    quote.connectionEpoch === snapshot.connectionEpoch;
  const transportCanBeLive =
    snapshot.status === "LIVE"
    || snapshot.status === "REBASELINING";

  if (
    transportCanBeLive
    && quoteBelongsToCurrentConnection
    && quoteAgeMs <= staleAfterMs
  ) {
    return {
      source: snapshot.source,
      healthy: true,
      derivedStatus: snapshot.status,
      quoteAgeMs,
      latestQuote: quote,
    };
  }

  return {
    source: snapshot.source,
    healthy: false,
    derivedStatus: snapshot.status === "FROZEN"
      ? "FROZEN"
      : "STALE",
    quoteAgeMs,
    latestQuote: quote,
  };
}
