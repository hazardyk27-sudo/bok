#!/bin/bash
set -euo pipefail
bash scripts/install-replit-readonly-guard.sh github
pnpm install --frozen-lockfile
pnpm --filter @workspace/db push
