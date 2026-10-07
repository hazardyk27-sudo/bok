#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-dev}"
FRONTEND_PORT="${PORT:-20003}"
API_PORT="${API_PORT:-8080}"
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
frontend_pid=""

stop_child() {
  local pid="${1:-}"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
}

cleanup() {
  stop_child "$frontend_pid"
  stop_child "$api_pid"
}

handle_signal() {
  cleanup
  exit 143
}

trap handle_signal INT TERM
trap cleanup EXIT

start_api() {
  echo "Starting API server on internal port $API_PORT..."
  (
    export PORT="$API_PORT"
    exec "${API_COMMAND[@]}"
  ) &
  api_pid="$!"
}

start_api

ready="false"
for attempt in $(seq 1 120); do
  if ! kill -0 "$api_pid" 2>/dev/null; then
    echo "ABORT: API server exited before becoming ready."
    set +e
    wait "$api_pid"
    api_status="$?"
    set -e
    echo "API_EXIT_STATUS: $api_status"
    exit 3
  fi

  if node -e "fetch('http://127.0.0.1:${API_PORT}/api/readyz',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
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
(
  export PORT="$FRONTEND_PORT"
  export BASE_PATH="$BASE_PATH"
  export API_PROXY_TARGET="$API_PROXY_TARGET"
  exec "${FRONTEND_COMMAND[@]}"
) &
frontend_pid="$!"

# Keep the web and API lifecycle coupled. Previously the frontend stayed alive
# after the API process died, leaving Vite connected while /api was permanently
# offline. If either child exits unexpectedly, end the whole service so Replit
# restarts the canonical full stack together.
while true; do
  if ! kill -0 "$api_pid" 2>/dev/null; then
    set +e
    wait "$api_pid"
    api_status="$?"
    set -e
    echo "ABORT: API server exited after startup (status $api_status); stopping frontend so the full stack can restart."
    exit 5
  fi

  if ! kill -0 "$frontend_pid" 2>/dev/null; then
    set +e
    wait "$frontend_pid"
    frontend_status="$?"
    set -e
    echo "ABORT: Frontend exited after startup (status $frontend_status); stopping API so the full stack can restart."
    if [[ "$frontend_status" -eq 0 ]]; then
      exit 6
    fi
    exit "$frontend_status"
  fi

  sleep 0.5
done
