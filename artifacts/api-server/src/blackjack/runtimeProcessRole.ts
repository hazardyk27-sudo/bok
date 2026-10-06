import { readlinkSync } from "node:fs";

export const BLACKJACK_RUNTIME_DISABLE_ENV =
  "OYUN_DISABLE_BLACKJACK_RUNTIME" as const;
export const BLACKJACK_CANONICAL_TABLE_ID = "blackjack-main-table" as const;
export const BLACKJACK_PREVIEW_TABLE_PREFIX =
  "blackjack-preview-table" as const;
const REPLIT_SYNC_FALLBACK_LOG = "oyun-replit-api-server.log" as const;

type RuntimeProcessRoleInput = Readonly<{
  env?: Readonly<Record<string, string | undefined>>;
  readStdoutTarget?: () => string | null;
}>;

function readProcessStdoutTarget(): string | null {
  try {
    return readlinkSync("/proc/self/fd/1");
  } catch {
    return null;
  }
}

function normalizeRuntimeNamespace(value: string | undefined): string {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "local";
}

export function resolveBlackjackRuntimeTableId(
  requestedTableId: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  if (requestedTableId !== BLACKJACK_CANONICAL_TABLE_ID) {
    return requestedTableId;
  }

  if (env.NODE_ENV === "production") {
    return BLACKJACK_CANONICAL_TABLE_ID;
  }

  const namespace = normalizeRuntimeNamespace(env.REPL_ID);
  return `${BLACKJACK_PREVIEW_TABLE_PREFIX}-${namespace}`;
}

export function isBlackjackRuntimeAuthoritySuppressed(
  input: RuntimeProcessRoleInput = {},
): boolean {
  const env=input.env ?? process.env;
  const explicit=env[BLACKJACK_RUNTIME_DISABLE_ENV];
  if(explicit==="1") return true;
  if(explicit==="0") return false;

  // Keep recognizing historical detached sync fallback processes so an old
  // process left behind by a previous preview revision can never become table
  // authority while the supervised runtime replacement is rolling out.
  if(!env.REPL_ID) return false;
  const stdoutTarget=(input.readStdoutTarget ?? readProcessStdoutTarget)();
  return stdoutTarget?.includes(REPLIT_SYNC_FALLBACK_LOG) ?? false;
}
