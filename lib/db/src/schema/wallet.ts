// Shared wallet table. The SQL table keeps its legacy roulette_wallets name for backward compatibility.
import { bigint, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const rouletteWallets = pgTable("roulette_wallets", {
  sessionId: text("session_id").primaryKey(),
  balanceCents: bigint("balance_cents", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
