import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const schemaSource = readFileSync(
  fileURLToPath(new URL("../../../../lib/db/src/schema/idle.ts", import.meta.url)),
  "utf8",
);

describe("Stadium SQL schema contract", () => {
  it("adds one canonical Stadium state row per session", () => {
    expect(schemaSource).toContain('export const idleStadiumStates = pgTable(');
    expect(schemaSource).toContain('"idle_stadium_states"');
    expect(schemaSource).toContain('stadiumLevel: integer("stadium_level").notNull().default(1)');
    expect(schemaSource).toContain('ownedSeats: integer("owned_seats").notNull().default(0)');
    expect(schemaSource).toContain('speedLevel: integer("speed_level").notNull().default(1)');
    expect(schemaSource).toContain('storageLevel: integer("storage_level").notNull().default(1)');
    expect(schemaSource).toContain('storedMicroTickets: bigint("stored_microtickets"');
    expect(schemaSource).toContain('saleRemainderMicrodollars: bigint("sale_remainder_microdollars"');
    expect(schemaSource).toContain('"idle_stadium_states_session_unique"');
  });

  it("persists the global current ticket-market snapshot", () => {
    expect(schemaSource).toContain('export const idleTicketMarketState = pgTable(');
    expect(schemaSource).toContain('"idle_ticket_market_state"');
    expect(schemaSource).toContain('priceMicrodollars: bigint("price_microdollars"');
    expect(schemaSource).toContain('source: text("source").notNull()');
    expect(schemaSource).toContain('feedStatus: text("feed_status").notNull()');
    expect(schemaSource).toContain('tickAt: timestamp("tick_at"');
  });

  it("adds a raw market-tick table indexed for rolling 24-hour retention", () => {
    expect(schemaSource).toContain('export const idleTicketMarketTicks = pgTable(');
    expect(schemaSource).toContain('"idle_ticket_market_ticks"');
    expect(schemaSource).toContain('"idle_ticket_market_ticks_tick_unique"');
    expect(schemaSource).toContain('"idle_ticket_market_ticks_retention_idx"');
    expect(schemaSource).toContain("at most 17,280 rows");
    expect(schemaSource).toContain("deleting rows older than 24 hours");
  });

  it("keeps the legacy tables additive during migration", () => {
    expect(schemaSource).toContain('export const idleBusinessStates = pgTable(');
    expect(schemaSource).toContain('export const idleActionReceipts = pgTable(');
    expect(schemaSource).toContain('export const idleLedger = pgTable(');
  });
});
