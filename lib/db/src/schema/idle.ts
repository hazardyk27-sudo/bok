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
