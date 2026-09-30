export const SUPABASE_PROJECT_REF = "pkzdqttbevjktgctxbcm";
export const SUPABASE_DIRECT_HOST =
  `db.${SUPABASE_PROJECT_REF}.supabase.co`;
export const SUPABASE_SESSION_POOLER_HOST =
  "aws-1-eu-west-1.pooler.supabase.com";

export type ResolvedSupabaseDatabaseUrl = {
  connectionString: string;
  hostname: string;
  usedSessionPoolerFallback: boolean;
};

export function resolveSupabaseDatabaseUrl(
  connectionString: string,
): ResolvedSupabaseDatabaseUrl {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Configured database URL is invalid.");
  }

  const originalHostname = url.hostname.toLowerCase();
  if (originalHostname !== SUPABASE_DIRECT_HOST) {
    return {
      connectionString,
      hostname: originalHostname,
      usedSessionPoolerFallback: false,
    };
  }

  // Replit can retain a stale direct Supabase URI in an already-created
  // workflow environment. The direct endpoint is IPv6-only on this project,
  // while the Replit runtime needs the IPv4 Session Pooler. Preserve the
  // existing database/password and deterministically convert only this
  // project's known direct endpoint to its verified Session Pooler endpoint.
  url.hostname = SUPABASE_SESSION_POOLER_HOST;
  url.port = "5432";
  url.username = `postgres.${SUPABASE_PROJECT_REF}`;

  return {
    connectionString: url.toString(),
    hostname: SUPABASE_SESSION_POOLER_HOST,
    usedSessionPoolerFallback: true,
  };
}
