import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (error) => {
  console.error("[db] idle PostgreSQL client error; the pool will reconnect on the next query", {
    message: error instanceof Error ? error.message : String(error),
    code: (error as { code?: string }).code,
  });
});
export const db = drizzle(pool, { schema });

export * from "./schema";
export type { PoolClient } from "pg";
