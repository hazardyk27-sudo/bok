#!/usr/bin/env bash
set -euo pipefail

pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/cascade-8 run build
pnpm --filter @workspace/api-server exec vitest run src/backendIsolation.test.ts src/platform/sharedWalletContract.test.ts

bash -n scripts/install-replit-readonly-guard.sh
bash -n scripts/replit-sync-preview.sh
bash -n scripts/post-merge.sh
bash -n .githooks/pre-commit
bash -n .githooks/pre-push
bash -n .githooks/pre-merge-commit
bash -n .githooks/pre-rebase
bash -n .githooks/reference-transaction
bash scripts/test-replit-readonly-guard.sh
