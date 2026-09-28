#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-dev}"
FRONTEND_PORT="${PORT:-20003}"
API_PORT="${API_PORT:-20004}"
BASE_PATH="${BASE_PATH:-/}"
API_PROXY_TARGET="${API_PROXY_TARGET:-http://127.0.0.1:${API_PORT}}"

case "$MODE" in
  dev)
    API_COMMAND=(pnpm --filter @workspace/api-server run dev)
    FRONTEND_COMMAND=(pnpm --filter @workspace/cascade-8 run dev)
    ;;
  preview)
    API_COMMAND=(pnpm --filter @workspace/api-server run start)
    FRONTEND_COMMAND=(pnpm --filter @workspace/cascade-8 run serve)
    ;;
  *)
    echo "ABORT: mode must be 'dev' or 'preview'."
    exit 2
    ;;
esac

api_pid=""
cleanup() {
  if [[ -n "$api_pid" ]] && kill -0 "$api_pid" 2>/dev/null; then
    kill "$api_pid" 2>/dev/null || true
    wait "$api_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting API server on internal port $API_PORT..."
(
  export PORT="$API_PORT"
  "${API_COMMAND[@]}"
) &
api_pid="$!"

ready="false"
for attempt in $(seq 1 120); do
  if ! kill -0 "$api_pid" 2>/dev/null; then
    echo "ABORT: API server exited before becoming ready."
    wait "$api_pid" || true
    exit 3
  fi

  if node -e "fetch('http://127.0.0.1:${API_PORT}/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    ready="true"
    break
  fi

  sleep 0.25
done

if [[ "$ready" != "true" ]]; then
  echo "ABORT: API server did not become ready on port $API_PORT."
  exit 4
fi

echo "API ready. Starting frontend on port $FRONTEND_PORT with /api proxy -> $API_PROXY_TARGET"

set +e
PORT="$FRONTEND_PORT" \
BASE_PATH="$BASE_PATH" \
API_PROXY_TARGET="$API_PROXY_TARGET" \
"${FRONTEND_COMMAND[@]}"
status="$?"
set -e

exit "$status"
