import { defineConfig } from "drizzle-kit";
import path from "path";

const useSupabaseDatabase = process.env.USE_SUPABASE_DATABASE === "true";
const databaseUrl = useSupabaseDatabase
  ? process.env.SUPABASE_DATABASE_URL
  : process.env.DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL or SUPABASE_DATABASE_URL must be set, ensure the database is provisioned",
  );
}

if (useSupabaseDatabase && !process.env.SUPABASE_DATABASE_URL) {
  throw new Error(
    "USE_SUPABASE_DATABASE=true requires SUPABASE_DATABASE_URL to be set.",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
