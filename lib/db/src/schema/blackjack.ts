import {
  bigint,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const blackjackTableSnapshots = pgTable("blackjack_table_snapshots", {
  tableId: text("table_id").primaryKey(),
  schemaVersion: integer("schema_version").notNull(),
  stateVersion: bigint("state_version", { mode: "number" }).notNull(),
  eventSequence: bigint("event_sequence", { mode: "number" }).notNull(),
  phase: text("phase").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  checksum: text("checksum").notNull(),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
