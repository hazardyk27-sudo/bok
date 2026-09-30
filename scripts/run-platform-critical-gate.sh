#!/usr/bin/env bash
set -euo pipefail

pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/cascade-8 run build
pnpm --filter @workspace/api-server exec vitest run src/backendIsolation.test.ts src/platform/sharedWalletContract.test.ts
