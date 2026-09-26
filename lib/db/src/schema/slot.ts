import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const slotRounds = pgTable(
  "slot_rounds",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    stakeCents: integer("stake_cents").notNull(),
    payoutCents: integer("payout_cents").notNull(),
    result: jsonb("result").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("slot_rounds_idempotency_unique").on(table.idempotencyKey),
    index("slot_rounds_session_idx").on(table.sessionId),
  ],
);

export const slotLedger = pgTable(
  "slot_ledger",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    roundId: text("round_id").notNull(),
    kind: text("kind").notNull(),
    amountCents: integer("amount_cents").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("slot_ledger_idempotency_unique").on(table.idempotencyKey),
    index("slot_ledger_session_idx").on(table.sessionId),
    index("slot_ledger_round_idx").on(table.roundId),
  ],
);

export const slotWalletMigrations = pgTable(
  "slot_wallet_migrations",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    legacyBalanceCents: integer("legacy_balance_cents").notNull(),
    disposition: text("disposition").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("slot_wallet_migrations_session_unique").on(table.sessionId),
  ],
);
