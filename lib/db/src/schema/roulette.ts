import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const rouletteRounds = pgTable(
  "roulette_rounds",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    seed: text("seed").notNull(),
    stakeCents: integer("stake_cents").notNull(),
    payoutCents: integer("payout_cents").notNull(),
    winningNumber: integer("winning_number").notNull(),
    pocketIndex: integer("pocket_index").notNull(),
    bets: jsonb("bets").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("roulette_rounds_idempotency_unique").on(
      table.idempotencyKey,
    ),
    index("roulette_rounds_session_idx").on(table.sessionId),
  ],
);

export const rouletteLedger = pgTable(
  "roulette_ledger",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    roundId: text("round_id").notNull(),
    kind: text("kind").notNull(),
    amountCents: integer("amount_cents").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("roulette_ledger_idempotency_unique").on(
      table.idempotencyKey,
    ),
    index("roulette_ledger_session_idx").on(table.sessionId),
    index("roulette_ledger_round_idx").on(table.roundId),
  ],
);
