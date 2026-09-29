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

export const rouletteRounds = pgTable(
  "roulette_rounds",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    seed: text("seed").notNull(),
    stakeCents: bigint("stake_cents", { mode: "number" }).notNull(),
    payoutCents: bigint("payout_cents", { mode: "number" }).notNull(),
    winningNumber: integer("winning_number").notNull(),
    pocketIndex: integer("pocket_index").notNull(),
    bets: jsonb("bets").notNull(),
    result: jsonb("result").notNull(),
    settlement: jsonb("settlement").notNull(),
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
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
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
