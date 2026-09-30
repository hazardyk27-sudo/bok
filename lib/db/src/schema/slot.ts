import { bigint, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const slotRounds = pgTable(
  "slot_rounds",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    stakeCents: bigint("stake_cents", { mode: "number" }).notNull(),
    payoutCents: bigint("payout_cents", { mode: "number" }).notNull(),
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
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
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
    legacyBalanceCents: bigint("legacy_balance_cents", { mode: "number" }).notNull(),
    disposition: text("disposition").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("slot_wallet_migrations_session_unique").on(table.sessionId),
  ],
);
