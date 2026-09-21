import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const rouletteRounds = pgTable(
  "roulette_rounds",
  {
    id: text("id").primaryKey(),
    sequence: integer("sequence").notNull(),
    phase: text("phase").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    openUntil: timestamp("open_until", { withTimezone: true }).notNull(),
    lastCallUntil: timestamp("last_call_until", { withTimezone: true }).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }).notNull(),
    spinningUntil: timestamp("spinning_until", { withTimezone: true }).notNull(),
    resultUntil: timestamp("result_until", { withTimezone: true }).notNull(),
    revealUntil: timestamp("reveal_until", { withTimezone: true }).notNull(),
    settlingUntil: timestamp("settling_until", { withTimezone: true }).notNull(),
    intermissionUntil: timestamp("intermission_until", { withTimezone: true }).notNull(),
    winningNumber: integer("winning_number"),
    luckyNumbers: jsonb("lucky_numbers").notNull(),
    multipliers: jsonb("multipliers").notNull(),
    commitmentHash: text("commitment_hash").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("roulette_rounds_sequence_unique").on(table.sequence),
    index("roulette_rounds_intermission_idx").on(table.intermissionUntil),
  ],
);

export const rouletteBets = pgTable(
  "roulette_bets",
  {
    id: text("id").primaryKey(),
    roundId: text("round_id").notNull(),
    sessionId: text("session_id").notNull(),
    number: integer("number").notNull(),
    betType: text("bet_type").notNull().default("STRAIGHT"),
    numbers: jsonb("numbers").notNull().default([]),
    batchId: text("batch_id").notNull().default(""),
    stakeCents: integer("stake_cents").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("ACCEPTED"),
    payoutCents: integer("payout_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("roulette_bets_idempotency_unique").on(table.idempotencyKey),
    index("roulette_bets_round_idx").on(table.roundId),
    index("roulette_bets_session_idx").on(table.sessionId),
  ],
);

export const rouletteWallets = pgTable("roulette_wallets", {
  sessionId: text("session_id").primaryKey(),
  balanceCents: integer("balance_cents").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rouletteLedger = pgTable(
  "roulette_ledger",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    roundId: text("round_id").notNull(),
    betId: text("bet_id").notNull(),
    kind: text("kind").notNull(),
    amountCents: integer("amount_cents").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("roulette_ledger_idempotency_unique").on(table.idempotencyKey),
    index("roulette_ledger_round_idx").on(table.roundId),
  ],
);

export const rouletteEvents = pgTable(
  "roulette_events",
  {
    id: text("id").primaryKey(),
    roundId: text("round_id").notNull(),
    eventType: text("event_type").notNull(),
    version: integer("version").notNull(),
    payload: jsonb("payload").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("roulette_events_round_version_unique").on(table.roundId, table.version),
    index("roulette_events_round_idx").on(table.roundId),
  ],
);

export const physicsLabRounds = pgTable(
  "physics_lab_rounds",
  {
    id: text("id").primaryKey(),
    sequence: integer("sequence").notNull(),
    status: text("status").notNull(),
    seed: text("seed").notNull(),
    startConditions: jsonb("start_conditions").notNull(),
    finalPocketIndex: integer("final_pocket_index"),
    finalPocketNumber: integer("final_pocket_number"),
    stableSettleStep: integer("stable_settle_step"),
    simulationDurationMs: integer("simulation_duration_ms").notNull(),
    trajectory: jsonb("trajectory").notNull(),
    events: jsonb("events").notNull(),
    trajectoryHash: text("trajectory_hash").notNull(),
    errorCode: text("error_code"),
    simulationStartedAt: timestamp("simulation_started_at", { withTimezone: true }).notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("physics_lab_rounds_sequence_unique").on(table.sequence),
    index("physics_lab_rounds_status_idx").on(table.status),
  ],
);

export const cadiKazanRounds = pgTable(
  "cadi_kazan_rounds",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    mode: text("mode").notNull(),
    alarmCount: integer("alarm_count").notNull(),
    cellCount: integer("cell_count").notNull(),
    stakeCents: integer("stake_cents").notNull(),
    bombIndices: jsonb("bomb_indices").notNull(),
    revealedCells: jsonb("revealed_cells").notNull().default([]),
    revealedSafeCount: integer("revealed_safe_count").notNull().default(0),
    currentMultiplierBps: integer("current_multiplier_bps").notNull().default(0),
    status: text("status").notNull().default("ACTIVE"),
    payoutCents: integer("payout_cents").notNull().default(0),
    startIdempotencyKey: text("start_idempotency_key").notNull(),
    cashoutIdempotencyKey: text("cashout_idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("cadi_kazan_rounds_start_idempotency_unique").on(table.startIdempotencyKey),
    index("cadi_kazan_rounds_session_idx").on(table.sessionId),
    index("cadi_kazan_rounds_session_status_idx").on(table.sessionId, table.status),
  ],
);

export const cadiKazanLedger = pgTable(
  "cadi_kazan_ledger",
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
    uniqueIndex("cadi_kazan_ledger_idempotency_unique").on(table.idempotencyKey),
    index("cadi_kazan_ledger_session_idx").on(table.sessionId),
    index("cadi_kazan_ledger_round_idx").on(table.roundId),
  ],
);