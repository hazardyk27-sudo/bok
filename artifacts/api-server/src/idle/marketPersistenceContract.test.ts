import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const persistenceSource = readFileSync(
  fileURLToPath(new URL("./marketPersistence.ts", import.meta.url)),
  "utf8",
);

const writerSource = readFileSync(
  fileURLToPath(new URL("./marketWriterPersistence.ts", import.meta.url)),
  "utf8",
);

const leadershipSource = readFileSync(
  fileURLToPath(new URL("./marketLeadership.ts", import.meta.url)),
  "utf8",
);

describe("authoritative market persistence contract", () => {
  it("restores persisted singleton state without resetting an existing market price", () => {
    expect(persistenceSource).toContain(
      'export const GLOBAL_TICKET_MARKET_STATE_ID = "global";',
    );
    expect(persistenceSource).toContain(
      "ON CONFLICT (id) DO NOTHING",
    );
    expect(persistenceSource).toContain(
      "MARKET_CONFIG.initialTicketPriceMicrodollars",
    );
    expect(persistenceSource).toContain(
      "const state = await loadStateForUpdate(client);",
    );
  });

  it("serializes current-state update, raw history insert, and retention cleanup in one transaction", () => {
    const beginIndex = persistenceSource.indexOf(
      'await client.query("BEGIN")',
      persistenceSource.indexOf("persistAuthoritativeTickOnClient"),
    );
    const lockIndex = persistenceSource.indexOf(
      "const current = await loadStateForUpdate(client);",
      beginIndex,
    );
    const historyIndex = persistenceSource.indexOf(
      "INSERT INTO idle_ticket_market_ticks",
      lockIndex,
    );
    const stateIndex = persistenceSource.indexOf(
      "INSERT INTO idle_ticket_market_state",
      historyIndex,
    );
    const cleanupIndex = persistenceSource.indexOf(
      "DELETE FROM idle_ticket_market_ticks",
      stateIndex,
    );
    const commitIndex = persistenceSource.indexOf(
      'await client.query("COMMIT")',
      cleanupIndex,
    );

    expect(beginIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeGreaterThan(beginIndex);
    expect(historyIndex).toBeGreaterThan(lockIndex);
    expect(stateIndex).toBeGreaterThan(historyIndex);
    expect(cleanupIndex).toBeGreaterThan(stateIndex);
    expect(commitIndex).toBeGreaterThan(cleanupIndex);
  });

  it("makes exact tick retries idempotent but rejects conflicting/out-of-order ticks", () => {
    expect(persistenceSource).toContain(
      "ON CONFLICT (tick_at) DO NOTHING",
    );
    expect(persistenceSource).toContain(
      'throw new Error("IDLE_MARKET_OUT_OF_ORDER_TICK")',
    );
    expect(persistenceSource).toContain(
      'throw new Error("IDLE_MARKET_TICK_CONFLICT")',
    );
    expect(persistenceSource).toContain(
      "replayedHistoryTick",
    );
  });

  it("deletes points at or before the strict 24-hour cutoff and reads at most 17,280 raw points", () => {
    expect(persistenceSource).toContain(
      "WHERE tick_at <= $1",
    );
    expect(persistenceSource).toContain(
      "WHERE tick_at > $1",
    );
    expect(persistenceSource).toContain(
      "MAX_MARKET_HISTORY_ROWS",
    );
    expect(persistenceSource).toContain(
      "ORDER BY tick_at ASC",
    );
  });

  it("uses the same advisory-lock DB session for the authoritative write transaction", () => {
    expect(leadershipSource).toContain(
      "write: (client: MarketLeadershipClient) => Promise<T>",
    );
    expect(leadershipSource).toContain(
      "value: await write(client)",
    );
    expect(writerSource).toContain(
      "globalMarketWriterLeadership.runIfLeader(",
    );
    expect(writerSource).toContain(
      "persistAuthoritativeTickOnClient(",
    );
    expect(writerSource).toContain(
      "client,",
    );
  });

  it("rolls back the authoritative transaction on any persistence error", () => {
    expect(persistenceSource).toContain(
      'await client.query("ROLLBACK")',
    );
  });
});
