import { readlinkSync } from "node:fs";

export const BLACKJACK_RUNTIME_DISABLE_ENV =
  "OYUN_DISABLE_BLACKJACK_RUNTIME" as const;
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

export function isBlackjackRuntimeAuthoritySuppressed(
  input: RuntimeProcessRoleInput = {},
): boolean {
  const env=input.env ?? process.env;
  const explicit=env[BLACKJACK_RUNTIME_DISABLE_ENV];
  if(explicit==="1") return true;
  if(explicit==="0") return false;

  // The canonical Replit sync helper can start a detached API process solely
  // to make the local /api/readyz probe available after a sync. That process
  // redirects stdout to this dedicated log and must never become owner of the
  // global Blackjack table. Without this guard it can outlive the sync, renew
  // the runtime lease forever, and fence the actual API runtime.
  if(!env.REPL_ID) return false;
  const stdoutTarget=(input.readStdoutTarget ?? readProcessStdoutTarget)();
  return stdoutTarget?.includes(REPLIT_SYNC_FALLBACK_LOG) ?? false;
}
