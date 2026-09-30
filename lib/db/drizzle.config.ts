import { defineConfig } from "drizzle-kit";
import path from "path";

const useSupabaseDatabase = process.env.USE_SUPABASE_DATABASE === "true";
const databaseUrl = useSupabaseDatabase
  ? process.env.SUPABASE_DATABASE_URL
  : process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    useSupabaseDatabase
      ? "USE_SUPABASE_DATABASE=true requires SUPABASE_DATABASE_URL."
      : "DATABASE_URL is required until an explicit Supabase cutover.",
  );
}

let hostname: string;
try {
  hostname = new URL(databaseUrl).hostname.toLowerCase();
} catch {
  throw new Error("Configured database URL is invalid.");
}

const isSupabaseHost =
  hostname === "supabase.co" || hostname.endsWith(".supabase.co");

if (useSupabaseDatabase && !isSupabaseHost) {
  throw new Error(
    "USE_SUPABASE_DATABASE=true requires SUPABASE_DATABASE_URL to point to a supabase.co host.",
  );
}

if (!useSupabaseDatabase && isSupabaseHost) {
  throw new Error(
    "DATABASE_URL points to Supabase while USE_SUPABASE_DATABASE is not true. Refusing an implicit schema-tooling cutover.",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
