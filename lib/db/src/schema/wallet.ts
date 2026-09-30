import { bigint, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

export const oyunMigrationReceipts = pgTable(
  "oyun_migration_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    migrationKind: text("migration_kind").notNull(),
    sourceHost: text("source_host").notNull(),
    sourceManifestSha256: text("source_manifest_sha256").notNull(),
    sourceTableCount: integer("source_table_count").notNull(),
    sourceTotalRows: bigint("source_total_rows", { mode: "number" }).notNull(),
    verificationStatus: text("verification_status").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("oyun_migration_receipts_kind_verified_idx").on(
      table.migrationKind,
      table.verifiedAt,
    ),
  ],
);
