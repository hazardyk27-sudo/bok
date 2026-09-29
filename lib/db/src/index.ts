import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// PostgreSQL BIGINT values are returned as strings by node-postgres by default.
// Cadı Kazan can legitimately exceed 32-bit cent values at high stakes, while
// the app still stays well inside JavaScript's safe-integer range.
pg.types.setTypeParser(20, (value) => Number(value));

// SUPABASE_DATABASE_URL may be provisioned before the data migration is
// complete. Keep the existing DATABASE_URL authoritative until cutover is
// explicitly requested so merely adding the Supabase secret cannot take the
// live games off their populated database.
const useSupabaseDatabase = process.env.USE_SUPABASE_DATABASE === "true";
const databaseUrl = useSupabaseDatabase
  ? process.env.SUPABASE_DATABASE_URL
  : process.env.DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL or SUPABASE_DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

if (useSupabaseDatabase && !process.env.SUPABASE_DATABASE_URL) {
  throw new Error(
    "USE_SUPABASE_DATABASE=true requires SUPABASE_DATABASE_URL to be set.",
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });

export * from "./schema";
export type { PoolClient } from "pg";
