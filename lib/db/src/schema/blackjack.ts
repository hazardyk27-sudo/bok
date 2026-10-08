import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const blackjackTableStates = pgTable(
  "blackjack_table_states",
  {
    sessionId: text("session_id").primaryKey(),
    revision: bigint("revision", { mode: "number" }).notNull().default(0),
    roundId: text("round_id"),
    roundState: jsonb("round_state"),
    shoeState: jsonb("shoe_state").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const blackjackRounds = pgTable(
  "blackjack_rounds",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    initialStakeCents: bigint("initial_stake_cents", { mode: "number" }).notNull(),
    totalStakeCents: bigint("total_stake_cents", { mode: "number" }).notNull(),
    payoutCents: bigint("payout_cents", { mode: "number" }).notNull().default(0),
    status: text("status").notNull(),
    result: jsonb("result"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("blackjack_rounds_session_idx").on(table.sessionId, table.createdAt),
  ],
);

export const blackjackActionReceipts = pgTable(
  "blackjack_action_receipts",
  {
    idempotencyKey: text("idempotency_key").primaryKey(),
    sessionId: text("session_id").notNull(),
    roundId: text("round_id"),
    action: text("action").notNull(),
    expectedRevision: bigint("expected_revision", { mode: "number" }).notNull(),
    requestHash: text("request_hash").notNull(),
    requestJson: jsonb("request_json").notNull(),
    responseJson: jsonb("response_json").notNull(),
    walletDeltaCents: bigint("wallet_delta_cents", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("blackjack_action_receipts_session_idx").on(table.sessionId, table.createdAt),
  ],
);

export const blackjackLedger = pgTable(
  "blackjack_ledger",
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
    uniqueIndex("blackjack_ledger_idempotency_unique").on(table.idempotencyKey),
    index("blackjack_ledger_session_idx").on(table.sessionId, table.createdAt),
    index("blackjack_ledger_round_idx").on(table.roundId, table.createdAt),
  ],
);
