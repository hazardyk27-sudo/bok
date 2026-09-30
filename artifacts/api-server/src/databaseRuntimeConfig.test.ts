import { describe, expect, it } from "vitest";
import {
  resolveSupabaseDatabaseUrl,
  SUPABASE_DIRECT_HOST,
  SUPABASE_PROJECT_REF,
  SUPABASE_SESSION_POOLER_HOST,
} from "../../../lib/db/src/runtime-config";

describe("Supabase runtime connection resolution", () => {
  it("rewrites this project's stale direct URL to the verified IPv4 session pooler", () => {
    const source =
      `postgresql://postgres:example-password@${SUPABASE_DIRECT_HOST}:5432/postgres?sslmode=require`;

    const resolved = resolveSupabaseDatabaseUrl(source);
    const url = new URL(resolved.connectionString);

    expect(resolved.usedSessionPoolerFallback).toBe(true);
    expect(resolved.hostname).toBe(SUPABASE_SESSION_POOLER_HOST);
    expect(url.hostname).toBe(SUPABASE_SESSION_POOLER_HOST);
    expect(url.port).toBe("5432");
    expect(url.username).toBe(`postgres.${SUPABASE_PROJECT_REF}`);
    expect(url.password).toBe("example-password");
    expect(url.pathname).toBe("/postgres");
    expect(url.searchParams.get("sslmode")).toBe("require");
  });

  it("leaves an already-pooled Supabase URL unchanged", () => {
    const source =
      `postgresql://postgres.${SUPABASE_PROJECT_REF}:example-password@${SUPABASE_SESSION_POOLER_HOST}:5432/postgres`;

    const resolved = resolveSupabaseDatabaseUrl(source);

    expect(resolved.usedSessionPoolerFallback).toBe(false);
    expect(resolved.hostname).toBe(SUPABASE_SESSION_POOLER_HOST);
    expect(resolved.connectionString).toBe(source);
  });

  it("does not rewrite a different Supabase project", () => {
    const source =
      "postgresql://postgres:example-password@db.otherproject.supabase.co:5432/postgres";

    const resolved = resolveSupabaseDatabaseUrl(source);

    expect(resolved.usedSessionPoolerFallback).toBe(false);
    expect(resolved.hostname).toBe("db.otherproject.supabase.co");
    expect(resolved.connectionString).toBe(source);
  });
});
