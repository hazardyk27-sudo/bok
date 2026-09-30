#!/usr/bin/env bash
set -euo pipefail

REMOTE_HINT="${1:-github}"
PROTECTED_BRANCH="integration/replit-preview"
BLOCKED_PUSH_PREFIX="replit-readonly://blocked"

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$repo_root" ]]; then
  echo "ABORT: not inside a Git repository." >&2
  exit 2
fi
cd "$repo_root"

current_branch="$(git branch --show-current)"
looks_like_replit="false"
if [[ "${OYUN_FORCE_REPLIT_GUARD:-}" == "1" || -n "${REPL_ID:-}" || -n "${REPL_SLUG:-}" || -n "${REPL_OWNER:-}" ]]; then
  looks_like_replit="true"
elif [[ "$current_branch" == "$PROTECTED_BRANCH" ]] && git remote get-url "$REMOTE_HINT" >/dev/null 2>&1; then
  looks_like_replit="true"
fi

if [[ "$looks_like_replit" != "true" ]]; then
  echo "READONLY_GUARD: non-Replit workspace detected; no local Git policy changed."
  exit 0
fi

for hook in pre-commit pre-push pre-merge-commit pre-rebase reference-transaction; do
  if [[ ! -x ".githooks/$hook" ]]; then
    echo "ABORT: tracked Replit guard hook .githooks/$hook is missing or not executable." >&2
    exit 3
  fi
done

git config --local core.hooksPath .githooks
git config --local oyun.replitReadonly true
git config --local oyun.previewProtectedBranch "$PROTECTED_BRANCH"

while IFS= read -r remote; do
  [[ -n "$remote" ]] || continue
  git remote set-url --push "$remote" "$BLOCKED_PUSH_PREFIX/$remote"
done < <(git remote)

echo "READONLY_GUARD: active"
echo "PROTECTED_BRANCH: $PROTECTED_BRANCH"
echo "HOOKS_PATH: $(git config --local --get core.hooksPath)"
echo "PUSH_MODE: blocked"
