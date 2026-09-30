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
 * The persistence transaction runs on the exact PostgreSQL session that owns
 * the Part 18 advisory lock, so leadership cannot disappear independently of
 * an in-flight authoritative write.
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
