import type {
  TicketMarketFeedStatus,
  TicketMarketSource,
} from "../../../cascade-8/src/idle/types";
import type {
  MarketFeedHealth,
  MarketFeedSnapshotLike,
} from "./marketFeedHealth";
import {
  deriveMarketFeedHealth,
} from "./marketFeedHealth";

export type MarketFeedSelection = {
  source: TicketMarketSource;
  feedStatus: TicketMarketFeedStatus;
  priceMicrodollars: number | null;
  connectionEpoch: number | null;
  shouldRebaselineBtc: boolean;
  primary: MarketFeedHealth;
  backup: MarketFeedHealth;
};

type ProviderEpochState = Partial<Record<
  Exclude<TicketMarketSource, "none">,
  number
>>;

/**
 * Selects exactly one authoritative BTC feed.
 *
 * Priority is always Binance while healthy. Coinbase becomes authoritative
 * only when Binance is stale/unhealthy. Recovery back to Binance is immediate
 * once Binance has a fresh quote again.
 *
 * Every provider switch and every connection-epoch change forces one BTC
 * rebaseline before ticket-price math resumes. If neither feed is healthy, the
 * coordinator returns FROZEN with no quote, so the ticket price must remain
 * unchanged.
 */
export class MarketFeedCoordinator {
  private activeSource: TicketMarketSource = "none";
  private readonly acceptedEpochBySource: ProviderEpochState = {};

  select(input: {
    binance: MarketFeedSnapshotLike;
    coinbase: MarketFeedSnapshotLike;
    nowMs: number;
  }): MarketFeedSelection {
    const primary = deriveMarketFeedHealth(
      input.binance,
      input.nowMs,
    );
    const backup = deriveMarketFeedHealth(
      input.coinbase,
      input.nowMs,
    );

    const selectedHealth = primary.healthy
      ? primary
      : backup.healthy
        ? backup
        : null;

    if (!selectedHealth || !selectedHealth.latestQuote) {
      this.activeSource = "none";

      return {
        source: "none",
        feedStatus: "FROZEN",
        priceMicrodollars: null,
        connectionEpoch: null,
        shouldRebaselineBtc: false,
        primary,
        backup,
      };
    }

    const quote = selectedHealth.latestQuote;
    const sourceChanged =
      this.activeSource !== selectedHealth.source;
    const acceptedEpoch =
      this.acceptedEpochBySource[selectedHealth.source];
    const epochChanged =
      acceptedEpoch !== quote.connectionEpoch;

    const shouldRebaselineBtc =
      sourceChanged
      || epochChanged
      || quote.rebaseline;

    this.activeSource = selectedHealth.source;
    this.acceptedEpochBySource[selectedHealth.source] =
      quote.connectionEpoch;

    return {
      source: selectedHealth.source,
      feedStatus: shouldRebaselineBtc
        ? "REBASELINING"
        : "LIVE",
      priceMicrodollars: quote.priceMicrodollars,
      connectionEpoch: quote.connectionEpoch,
      shouldRebaselineBtc,
      primary,
      backup,
    };
  }

  getActiveSource() {
    return this.activeSource;
  }

  reset() {
    this.activeSource = "none";
    delete this.acceptedEpochBySource["binance-btcusdt"];
    delete this.acceptedEpochBySource["coinbase-btc-usd"];
  }
}
