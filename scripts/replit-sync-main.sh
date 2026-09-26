#!/usr/bin/env bash
set -euo pipefail

echo "NOTICE: scripts/replit-sync-main.sh is deprecated. Isolation v2 uses integration/replit-preview."
echo "Delegating to scripts/replit-sync-preview.sh..."
exec "$(dirname "$0")/replit-sync-preview.sh" "$@"
