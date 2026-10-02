import { bigint, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const cadiKazanRounds = pgTable(
  "cadi_kazan_rounds",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    mode: text("mode").notNull(),
    alarmCount: integer("alarm_count").notNull(),
    cellCount: integer("cell_count").notNull(),
    stakeCents: bigint("stake_cents", { mode: "number" }).notNull(),
    bombIndices: jsonb("bomb_indices").notNull(),
    officeCells: jsonb("office_cells"),
    officePoolId: text("office_pool_id"),
    officeTicketId: text("office_ticket_id"),
    officeTicketPublicId: text("office_ticket_public_id"),
    officePoolRemaining: integer("office_pool_remaining"),
    revealedCells: jsonb("revealed_cells").notNull().default([]),
    revealedSafeCount: integer("revealed_safe_count").notNull().default(0),
    currentMultiplierBps: integer("current_multiplier_bps").notNull().default(0),
    status: text("status").notNull().default("ACTIVE"),
    payoutCents: bigint("payout_cents", { mode: "number" }).notNull().default(0),
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
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cadi_kazan_ledger_idempotency_unique").on(table.idempotencyKey),
    index("cadi_kazan_ledger_session_idx").on(table.sessionId),
    index("cadi_kazan_ledger_round_idx").on(table.roundId),
  ],
);


export const cadiKazanOfficePools = pgTable(
  "cadi_kazan_office_pools",
  {
    id: text("id").primaryKey(),
    poolNumber: integer("pool_number").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    exhaustedAt: timestamp("exhausted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("cadi_kazan_office_pools_number_unique").on(table.poolNumber),
    index("cadi_kazan_office_pools_status_idx").on(table.status, table.poolNumber),
  ],
);

export const cadiKazanOfficeTickets = pgTable(
  "cadi_kazan_office_tickets",
  {
    id: text("id").primaryKey(),
    publicId: text("public_id").notNull(),
    poolId: text("pool_id").notNull(),
    drawOrder: integer("draw_order").notNull(),
    outcomeSymbol: text("outcome_symbol"),
    multiplierBps: integer("multiplier_bps").notNull(),
    officeCells: jsonb("office_cells").notNull(),
    claimedRoundId: text("claimed_round_id"),
    claimedSessionId: text("claimed_session_id"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cadi_kazan_office_tickets_public_id_unique").on(table.publicId),
    uniqueIndex("cadi_kazan_office_tickets_pool_draw_unique").on(table.poolId, table.drawOrder),
    index("cadi_kazan_office_tickets_pool_claim_idx").on(table.poolId, table.claimedRoundId, table.drawOrder),
  ],
);
