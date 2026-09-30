#!/usr/bin/env bash
set -euo pipefail

game="${1:-${GAME:-}}"

if [[ -z "$game" ]]; then
  echo "GAME is required (slot|cadi-kazan|idle|hub|account|blackjack|roulette)." >&2
  exit 2
fi

frontend() {
  PORT=4173 BASE_PATH=/ pnpm --filter @workspace/cascade-8 exec vitest run "$@"
}

backend() {
  pnpm --filter @workspace/api-server exec vitest run "$@"
}

case "$game" in
  slot)
    frontend src/config src/engine src/game src/slot src/simulation
    backend src/slot
    ;;
  cadi-kazan)
    frontend src/cadi-kazan
    backend src/cadi-kazan
    ;;
  idle)
    frontend src/idle
    backend src/idle
    ;;
  hub)
    frontend src/hub --passWithNoTests
    ;;
  account)
    frontend src/account --passWithNoTests
    backend src/auth --passWithNoTests
    ;;
  blackjack)
    frontend src/blackjack
    backend src/blackjack
    ;;
  roulette)
    frontend src/roulette
    backend src/roulette
    ;;
  *)
    echo "Unknown GAME: $game" >&2
    exit 2
    ;;
esac
