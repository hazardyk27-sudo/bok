import { bigint, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const idleBusinessStates = pgTable(
  "idle_business_states",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    businessId: text("business_id").notNull(),
    businessLevel: integer("business_level"),
    vaultLevel: integer("vault_level").notNull().default(1),
    accruedMicrocents: bigint("accrued_microcents", { mode: "number" }).notNull().default(0),
    checkpointAt: timestamp("checkpoint_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idle_business_states_session_business_unique").on(table.sessionId, table.businessId),
    index("idle_business_states_session_idx").on(table.sessionId),
  ],
);

export const idleActionReceipts = pgTable(
  "idle_action_receipts",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    businessId: text("business_id").notNull(),
    actionType: text("action_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    collectedCents: bigint("collected_cents", { mode: "number" }).notNull().default(0),
    remainderMicrocents: bigint("remainder_microcents", { mode: "number" }).notNull().default(0),
    costCents: bigint("cost_cents", { mode: "number" }).notNull().default(0),
    targetBusinessLevel: integer("target_business_level"),
    targetVaultLevel: integer("target_vault_level"),
    balanceCents: bigint("balance_cents", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idle_action_receipts_idempotency_unique").on(table.idempotencyKey),
    index("idle_action_receipts_session_idx").on(table.sessionId),
    index("idle_action_receipts_business_idx").on(table.businessId),
  ],
);

export const idleLedger = pgTable(
  "idle_ledger",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    businessId: text("business_id").notNull(),
    kind: text("kind").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idle_ledger_idempotency_unique").on(table.idempotencyKey),
    index("idle_ledger_session_idx").on(table.sessionId),
    index("idle_ledger_business_idx").on(table.businessId),
  ],
);

export const idleStadiumStates = pgTable(
  "idle_stadium_states",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    stadiumLevel: integer("stadium_level").notNull().default(1),
    ownedSeats: integer("owned_seats").notNull().default(0),
    speedLevel: integer("speed_level").notNull().default(1),
    storageLevel: integer("storage_level").notNull().default(1),
    storedMicroTickets: bigint("stored_microtickets", { mode: "number" }).notNull().default(0),
    saleRemainderMicrodollars: bigint("sale_remainder_microdollars", { mode: "number" }).notNull().default(0),
    productionCheckpointAt: timestamp("production_checkpoint_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idle_stadium_states_session_unique").on(table.sessionId),
    index("idle_stadium_states_checkpoint_idx").on(table.productionCheckpointAt),
  ],
);

export const idleTicketMarketState = pgTable(
  "idle_ticket_market_state",
  {
    id: text("id").primaryKey(),
    priceMicrodollars: bigint("price_microdollars", { mode: "number" }).notNull(),
    source: text("source").notNull(),
    feedStatus: text("feed_status").notNull(),
    tickAt: timestamp("tick_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idle_ticket_market_state_tick_idx").on(table.tickAt),
  ],
);

export const idleTicketMarketPriceEpochs = pgTable(
  "idle_ticket_market_price_epochs",
  {
    epoch: integer("epoch").primaryKey(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const idleTicketMarketTicks = pgTable(
  "idle_ticket_market_ticks",
  {
    id: text("id").primaryKey(),
    priceMicrodollars: bigint("price_microdollars", { mode: "number" }).notNull(),
    source: text("source").notNull(),
    tickAt: timestamp("tick_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idle_ticket_market_ticks_tick_unique").on(table.tickAt),
    index("idle_ticket_market_ticks_retention_idx").on(table.tickAt),
  ],
);

export const idleStadiumActionReceipts = pgTable(
  "idle_stadium_action_receipts",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    actionType: text("action_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestedQuantity: integer("requested_quantity"),
    targetLevel: integer("target_level"),
    purchasedSeats: integer("purchased_seats").notNull().default(0),
    costCents: bigint("cost_cents", { mode: "number" }).notNull().default(0),
    resultingOwnedSeats: integer("resulting_owned_seats"),
    balanceCents: bigint("balance_cents", { mode: "number" }).notNull().default(0),
    soldTickets: integer("sold_tickets").notNull().default(0),
    executionPriceMicrodollars: bigint("execution_price_microdollars", { mode: "number" }).notNull().default(0),
    grossSaleMicrodollars: bigint("gross_sale_microdollars", { mode: "number" }).notNull().default(0),
    walletCreditCents: bigint("wallet_credit_cents", { mode: "number" }).notNull().default(0),
    saleRemainderMicrodollars: bigint("sale_remainder_microdollars", { mode: "number" }).notNull().default(0),
    marketSource: text("market_source"),
    marketFeedStatus: text("market_feed_status"),
    marketTickAt: timestamp("market_tick_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idle_stadium_action_receipts_idempotency_unique").on(table.idempotencyKey),
    index("idle_stadium_action_receipts_session_idx").on(table.sessionId),
    index("idle_stadium_action_receipts_action_idx").on(table.actionType),
    index("idle_stadium_action_receipts_retention_idx").on(table.createdAt),
  ],
);

/**
 * Permanent business-capital history used by the wealth leaderboard.
 * Unlike action receipts, these rows are never part of the 3-day retention
 * cleanup. Baseline rows migrate pre-ledger progression once; later rows store
 * the exact amount paid by the player for each investment action.
 */
export const idleInvestmentLedger = pgTable(
  "idle_investment_ledger",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    businessId: text("business_id").notNull(),
    actionType: text("action_type").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idle_investment_ledger_idempotency_unique").on(table.idempotencyKey),
    index("idle_investment_ledger_session_idx").on(table.sessionId),
  ],
);
