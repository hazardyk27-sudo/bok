import { logger } from "../lib/logger";
import { BinanceBtcUsdtFeed } from "./binanceBtcFeed";
import { CoinbaseBtcUsdFeed } from "./coinbaseBtcFeed";
import { MarketFeedCoordinator } from "./marketFeedCoordinator";
import { globalMarketWriterLeadership } from "./marketLeadershipDb";
import { ticketMarketPersistence } from "./marketPersistence";
import { TicketMarketRuntime } from "./marketRuntime";

const binanceFeed = new BinanceBtcUsdtFeed();
const coinbaseFeed = new CoinbaseBtcUsdFeed();

export const ticketMarketRuntime =
  new TicketMarketRuntime({
    binance: binanceFeed,
    coinbase: coinbaseFeed,
    coordinator: new MarketFeedCoordinator(),
    persistence: ticketMarketPersistence,
    leadership: globalMarketWriterLeadership,
    onError: (error) => {
      logger.error(
        { err: error },
        "Idle ticket market runtime tick failed",
      );
    },
  });
