import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// PostgreSQL BIGINT values are returned as strings by node-postgres by default.
// Cadı Kazan can legitimately exceed 32-bit cent values at high stakes, while
// the app still stays well inside JavaScript's safe-integer range.
pg.types.setTypeParser(20, (value) => Number(value));

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
export type { PoolClient } from "pg";
