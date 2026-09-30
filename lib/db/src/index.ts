import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import {
  isSupabaseDatabaseHost,
  resolveSupabaseDatabaseUrl,
} from "./runtime-config";

const { Pool } = pg;

pg.types.setTypeParser(20, (value) => Number(value));

export type DatabaseRuntimeTarget = "source" | "supabase";

export type DatabaseRuntimeConfig = {
  target: DatabaseRuntimeTarget;
  hostname: string;
  connectionString: string;
};

export function resolveDatabaseRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseRuntimeConfig {
  const useSupabaseDatabase = env.USE_SUPABASE_DATABASE === "true";
  const configuredConnectionString = useSupabaseDatabase
    ? env.SUPABASE_DATABASE_URL
    : env.DATABASE_URL;

  if (!configuredConnectionString) {
    throw new Error(
      useSupabaseDatabase
        ? "USE_SUPABASE_DATABASE=true requires SUPABASE_DATABASE_URL."
        : "DATABASE_URL is required until an explicit Supabase cutover.",
    );
  }

  let connectionString = configuredConnectionString;
  let hostname: string;

  try {
    if (useSupabaseDatabase) {
      const resolved = resolveSupabaseDatabaseUrl(configuredConnectionString);
      connectionString = resolved.connectionString;
      hostname = resolved.hostname;
    } else {
      hostname = new URL(configuredConnectionString).hostname.toLowerCase();
    }
  } catch {
    throw new Error("Configured database URL is invalid.");
  }

  const isSupabaseHost = isSupabaseDatabaseHost(hostname);

  if (useSupabaseDatabase && !isSupabaseHost) {
    throw new Error(
      "USE_SUPABASE_DATABASE=true requires SUPABASE_DATABASE_URL to point to a supabase.co host.",
    );
  }

  if (!useSupabaseDatabase && isSupabaseHost) {
    throw new Error(
      "DATABASE_URL points to Supabase while USE_SUPABASE_DATABASE is not true. Refusing an implicit cutover.",
    );
  }

  return {
    target: useSupabaseDatabase ? "supabase" : "source",
    hostname,
    connectionString,
  };
}

export const databaseRuntimeConfig = resolveDatabaseRuntimeConfig();

export const pool = new Pool({
  connectionString: databaseRuntimeConfig.connectionString,
});
export const db = drizzle(pool, { schema });

export type VerifiedSupabaseMigrationReceipt = {
  migrationKind: string;
  sourceHost: string;
  sourceManifestSha256: string;
  sourceTableCount: number;
  sourceTotalRows: number;
  verifiedAt: string;
};

export async function assertDatabaseCutoverReady(): Promise<{
  target: DatabaseRuntimeTarget;
  hostname: string;
  receipt: VerifiedSupabaseMigrationReceipt | null;
}> {
  if (databaseRuntimeConfig.target !== "supabase") {
    return {
      target: databaseRuntimeConfig.target,
      hostname: databaseRuntimeConfig.hostname,
      receipt: null,
    };
  }

  const relation = await pool.query<{ receipt_table: string | null }>(
    "select to_regclass('public.oyun_migration_receipts')::text as receipt_table",
  );

  if (!relation.rows[0]?.receipt_table) {
    throw new Error(
      "SUPABASE_CUTOVER_BLOCKED: oyun_migration_receipts table is missing.",
    );
  }

  const result = await pool.query<{
    migration_kind: string;
    source_host: string;
    source_manifest_sha256: string;
    source_table_count: number;
    source_total_rows: number;
    verified_at: Date | string;
  }>(`
    select
      migration_kind,
      source_host,
      source_manifest_sha256,
      source_table_count,
      source_total_rows,
      verified_at
    from public.oyun_migration_receipts
    where migration_kind = 'helium_to_supabase_v1'
      and verification_status = 'VERIFIED'
    order by verified_at desc
    limit 1
  `);

  const row = result.rows[0];
  const tableCount = Number(row?.source_table_count ?? 0);
  const totalRows = Number(row?.source_total_rows ?? 0);

  if (
    !row
    || !/^[a-f0-9]{64}$/.test(row.source_manifest_sha256)
    || tableCount < 24
    || totalRows <= 0
    || row.source_host.toLowerCase().includes("supabase")
  ) {
    throw new Error(
      "SUPABASE_CUTOVER_BLOCKED: no valid verified Helium migration receipt exists.",
    );
  }

  return {
    target: "supabase",
    hostname: databaseRuntimeConfig.hostname,
    receipt: {
      migrationKind: row.migration_kind,
      sourceHost: row.source_host,
      sourceManifestSha256: row.source_manifest_sha256,
      sourceTableCount: tableCount,
      sourceTotalRows: totalRows,
      verifiedAt:
        row.verified_at instanceof Date
          ? row.verified_at.toISOString()
          : String(row.verified_at),
    },
  };
}

export * from "./schema";
export type { PoolClient } from "pg";
