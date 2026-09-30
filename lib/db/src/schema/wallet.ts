import { bigint, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const sharedWallets = pgTable("shared_wallets", {
  sessionId: text("session_id").primaryKey(),
  balanceCents: bigint("balance_cents", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sharedWalletLegacyImports = pgTable("shared_wallet_legacy_imports", {
  sessionId: text("session_id").primaryKey(),
  legacyBalanceCents: bigint("legacy_balance_cents", { mode: "number" }).notNull(),
  appliedBalanceCents: bigint("applied_balance_cents", { mode: "number" }).notNull(),
  disposition: text("disposition").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
