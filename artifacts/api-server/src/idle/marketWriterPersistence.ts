import type {
  AuthoritativeMarketTickInput,
} from "./marketPersistencePolicy";
import {
  ticketMarketPersistence,
} from "./marketPersistence";
import {
  globalMarketWriterLeadership,
} from "./marketLeadershipDb";

/**
 * The only runtime write entry point for authoritative market ticks.
 *
 * Followers return executed=false and never touch market state/history.
 * The elected instance keeps the Part 18 advisory lock while the persistence
 * transaction runs on the shared DB pool.
 */
export async function persistAuthoritativeMarketTickIfLeader(
  tick: AuthoritativeMarketTickInput,
) {
  return globalMarketWriterLeadership.runIfLeader(
    (client) =>
      ticketMarketPersistence.persistAuthoritativeTickOnClient(
        client,
        tick,
      ),
  );
}
