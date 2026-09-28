import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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

export const blackjackEventJournal = pgTable(
  "blackjack_event_journal",
  {
    eventId: text("event_id").primaryKey(),
    tableId: text("table_id").notNull(),
    eventSequence: bigint("event_sequence", { mode: "number" }).notNull(),
    stateVersion: bigint("state_version", { mode: "number" }).notNull(),
    actionId: text("action_id"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    checksum: text("checksum").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("blackjack_event_journal_table_sequence_unique").on(
      table.tableId,
      table.eventSequence,
    ),
    index("blackjack_event_journal_table_idx").on(table.tableId),
    index("blackjack_event_journal_state_version_idx").on(
      table.tableId,
      table.stateVersion,
    ),
  ],
);
