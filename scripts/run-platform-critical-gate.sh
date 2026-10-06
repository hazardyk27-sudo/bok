#!/usr/bin/env bash
set -euo pipefail

pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/cascade-8 run build
pnpm --filter @workspace/api-server exec vitest run src/backendIsolation.test.ts src/platform/sharedWalletContract.test.ts

bash -n scripts/install-replit-readonly-guard.sh
bash -n scripts/replit-sync-preview.sh
bash -n scripts/run-local-stack.sh
bash -n scripts/post-merge.sh
bash -n .githooks/pre-commit
bash -n .githooks/pre-push
bash -n .githooks/pre-merge-commit
bash -n .githooks/pre-rebase
bash -n .githooks/reference-transaction
bash scripts/test-replit-readonly-guard.sh
bash -n scripts/migrate-replit-postgres-to-supabase.sh

if ! grep -Fq 'run = "pnpm -w run dev"' artifacts/cascade-8/.replit-artifact/artifact.toml; then
  echo "ERROR: Replit web preview must start the workspace-root supervised full stack." >&2
  exit 1
fi

if grep -Eq 'start_replit_api_runtime_fallback|nohup .*api-server.*run dev' scripts/replit-sync-preview.sh; then
  echo "ERROR: Detached Replit API fallback is forbidden; it can create duplicate runtime authorities." >&2
  exit 1
fi
