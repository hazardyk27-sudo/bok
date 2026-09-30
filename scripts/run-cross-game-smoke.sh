#!/usr/bin/env bash
set -euo pipefail

frontend() {
  PORT=4173 BASE_PATH=/ pnpm --filter @workspace/cascade-8 exec vitest run "$@"
}

backend() {
  pnpm --filter @workspace/api-server exec vitest run "$@"
}

frontend \
  src/hub/mainMenuRegression.test.ts \
  src/slot/slotSmoke.test.ts \
  src/cadi-kazan/cadiKazanSmoke.test.ts \
  src/idle/economySmoke.test.ts \
  src/idle/services/index.test.ts \
  src/blackjack/blackjackSmoke.test.ts \
  src/roulette/finalRegression.test.ts

backend \
  src/backendIsolation.test.ts \
  src/slot/highStakeRegression.test.ts \
  src/cadi-kazan/config.test.ts \
  src/cadi-kazan/officeMatchFlow.test.ts \
  src/idle/policy.test.ts \
  src/roulette/round.test.ts \
  src/blackjack/rules.test.ts \
  src/blackjack/walletLedger.test.ts
