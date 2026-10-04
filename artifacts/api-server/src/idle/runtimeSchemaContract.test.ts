import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const schemaSource = readFileSync(
  fileURLToPath(new URL("./runtimeSchema.ts", import.meta.url)),
  "utf8",
);

const routesSource = readFileSync(
  fileURLToPath(new URL("./routes.ts", import.meta.url)),
  "utf8",
);

const indexSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);

describe("Idle runtime Stadium schema bootstrap", () => {
  it("creates only canonical Idle-owned Stadium tables and indexes idempotently", () => {
    for (const table of [
      "idle_stadium_states",
      "idle_ticket_market_state",
      "idle_ticket_market_price_epochs",
      "idle_ticket_market_ticks",
      "idle_stadium_action_receipts",
    ]) {
      expect(schemaSource).toContain(
        `CREATE TABLE IF NOT EXISTS ${table}`,
      );
    }

    expect(schemaSource).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS",
    );
    expect(schemaSource).toContain(
      "idle_stadium_action_receipts_retention_idx",
    );
    expect(schemaSource).not.toContain(
      "CREATE TABLE IF NOT EXISTS shared_wallets",
    );
    expect(schemaSource).not.toContain(
      "CREATE TABLE IF NOT EXISTS roulette_",
    );
  });

  it("applies each ticket-price epoch once and preserves later restarts", () => {
    expect(schemaSource).toContain(
      "WITH newly_applied_epoch AS",
    );
    expect(schemaSource).toContain(
      "INSERT INTO idle_ticket_market_price_epochs (epoch)",
    );
    expect(schemaSource).toContain(
      "ON CONFLICT (epoch) DO NOTHING",
    );
    expect(schemaSource).toContain(
      "MARKET_CONFIG.priceEpoch",
    );
    expect(schemaSource).toContain(
      "MARKET_CONFIG.initialTicketPriceMicrodollars",
    );
    expect(schemaSource).toContain(
      "UPDATE idle_ticket_market_state",
    );
    expect(schemaSource).toContain(
      "AND EXISTS (SELECT 1 FROM newly_applied_epoch)",
    );
  });

  it("lazy-loads the database so db-free promotion tests can import source safely", () => {
    expect(schemaSource).not.toContain(
      'from "@workspace/db"',
    );
    expect(schemaSource).toContain(
      'await import("@workspace/db")',
    );
  });

  it("guards every Idle route and initializes runtimes only after schema readiness", () => {
    expect(routesSource).toContain(
      "router.use(async (_req, res, next) =>",
    );
    expect(routesSource).toContain(
      "await ensureIdleRuntimeSchema()",
    );
    expect(routesSource).toContain(
      "IDLE_RUNTIME_SCHEMA_UNAVAILABLE",
    );

    expect(indexSource).toContain(
      "void ensureIdleRuntimeSchema()",
    );
    expect(indexSource).toContain(
      "stadiumActionReceiptCleanupRuntime.start()",
    );
    expect(indexSource).toContain(
      "ticketMarketRuntime.start()",
    );
  });
});
