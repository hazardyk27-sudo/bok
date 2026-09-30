#!/bin/bash
set -euo pipefail

bash scripts/install-replit-readonly-guard.sh github
pnpm install --frozen-lockfile

# Routine Replit code sync must never trigger an interactive/destructive schema
# push. Database schema changes are a separate controlled platform operation.
# Opt in only during deliberate DB maintenance after data-safety preflight.
if [[ "${OYUN_RUN_DB_PUSH:-}" == "1" ]]; then
  echo "POST_MERGE_DB_PUSH: explicitly enabled"
  pnpm --filter @workspace/db push
else
  echo "POST_MERGE_DB_PUSH: skipped (routine code sync)"
fi
