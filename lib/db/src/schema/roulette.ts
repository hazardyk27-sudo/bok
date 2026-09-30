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


export const rouletteGlobalRounds = pgTable(
  "roulette_global_rounds",
  {
    id: text("id").primaryKey(),
    simulationVersion: text("simulation_version").notNull(),
    seed: text("seed").notNull(),
    bettingOpenAt: timestamp("betting_open_at", { withTimezone: true })
      .notNull(),
    bettingCloseAt: timestamp("betting_close_at", { withTimezone: true })
      .notNull(),
    spinStartedAt: timestamp("spin_started_at", { withTimezone: true })
      .notNull(),
    resultAt: timestamp("result_at", { withTimezone: true })
      .notNull(),
    nextRoundAt: timestamp("next_round_at", { withTimezone: true })
      .notNull(),
    winningNumber: integer("winning_number").notNull(),
    pocketIndex: integer("pocket_index").notNull(),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("roulette_global_rounds_betting_open_unique").on(
      table.bettingOpenAt,
    ),
    index("roulette_global_rounds_next_round_idx").on(
      table.nextRoundAt,
    ),
    index("roulette_global_rounds_result_at_idx").on(
      table.resultAt,
    ),
  ],
);


export const rouletteGlobalBets = pgTable(
  "roulette_global_bets",
  {
    id: text("id").primaryKey(),
    roundId: text("round_id").notNull(),
    sessionId: text("session_id").notNull(),
    bets: jsonb("bets").notNull(),
    stakeCents: bigint("stake_cents", { mode: "number" }).notNull(),
    payoutCents: bigint("payout_cents", { mode: "number" })
      .notNull()
      .default(0),
    settlement: jsonb("settlement"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("roulette_global_bets_round_session_unique").on(
      table.roundId,
      table.sessionId,
    ),
    index("roulette_global_bets_unsettled_idx").on(
      table.settledAt,
      table.roundId,
    ),
  ],
);

export const rouletteGlobalBetRequests = pgTable(
  "roulette_global_bet_requests",
  {
    idempotencyKey: text("idempotency_key").primaryKey(),
    roundId: text("round_id").notNull(),
    sessionId: text("session_id").notNull(),
    bets: jsonb("bets").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("roulette_global_bet_requests_round_idx").on(
      table.roundId,
    ),
    index("roulette_global_bet_requests_session_idx").on(
      table.sessionId,
    ),
  ],
);
