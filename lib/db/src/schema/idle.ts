import { bigint, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const idleBusinessStates = pgTable(
  "idle_business_states",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    businessId: text("business_id").notNull(),
    // null means the entry level has not been purchased yet.
    businessLevel: integer("business_level"),
    vaultLevel: integer("vault_level").notNull().default(1),
    // 1 cent = 1,000,000 microcents. Keeps sub-cent passive accrual persistent.
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


/**
 * Canonical Stadium ticket-economy state.
 *
 * This is additive during the migration away from idle_business_states.
 * New code should target this table; legacy rows remain untouched until the
 * later cutover/removal parts.
 */
export const idleStadiumStates = pgTable(
  "idle_stadium_states",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    stadiumLevel: integer("stadium_level").notNull().default(1),
    ownedSeats: integer("owned_seats").notNull().default(0),
    speedLevel: integer("speed_level").notNull().default(1),
    storageLevel: integer("storage_level").notNull().default(1),
    // 1 ticket = 1,000,000 microtickets. Fractional production is never lost.
    storedMicroTickets: bigint("stored_microtickets", { mode: "number" }).notNull().default(0),
    // Carries sub-cent sale value forward so repeated small sales do not lose value.
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

/**
 * One persisted global ticket-market snapshot shared by every player.
 *
 * The runtime uses a fixed singleton id (for example "global") and restores
 * this row after restart instead of resetting the ticket price to the $4
 * bootstrap value.
 */
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

/**
 * Raw global ticket-price history.
 *
 * At the accepted 5-second cadence the rolling 24-hour window contains at
 * most 17,280 rows. The market runtime is responsible for continuously
 * deleting rows older than 24 hours.
 */
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


/**
 * Canonical idempotency receipts for Stadium economy actions.
 *
 * Part 9 initially uses this for SEAT_PURCHASE. Later Stadium/Speed/Storage
 * upgrades and ticket sales may reuse the same table with their own actionType.
 * The request parameters required to distinguish an idempotent replay are
 * persisted alongside the result.
 */
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
  ],
);
