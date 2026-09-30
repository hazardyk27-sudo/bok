#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git init -q "$TMP"
cd "$TMP"
git config user.name "OYUN Guard Test"
git config user.email "guard-test@example.invalid"
git checkout -q -b integration/replit-preview
printf 'base\n' > state.txt
git add state.txt
git commit -q -m base

mkdir -p .githooks
for hook in pre-commit pre-push pre-merge-commit pre-rebase reference-transaction; do
  cp "$ROOT/.githooks/$hook" ".githooks/$hook"
done
chmod +x .githooks/*
git remote add github https://example.invalid/oyun/bok.git

OYUN_FORCE_REPLIT_GUARD=1 bash "$ROOT/scripts/install-replit-readonly-guard.sh" github >/dev/null

[[ "$(git config --local --get core.hooksPath)" == ".githooks" ]]
[[ "$(git config --bool --local --get oyun.replitReadonly)" == "true" ]]
[[ "$(git remote get-url --push github)" == "replit-readonly://blocked/github" ]]

printf 'local-change\n' >> state.txt
git add state.txt
if git commit -q -m should-be-blocked >/dev/null 2>&1; then
  echo "FAIL: local commit was not blocked" >&2
  exit 1
fi
git restore --staged state.txt
git restore state.txt

old="$(git rev-parse HEAD)"
tree="$(git rev-parse HEAD^{tree})"
new="$(printf 'guard-ref-test\n' | git commit-tree "$tree" -p "$old")"

if git update-ref refs/heads/integration/replit-preview "$new" "$old" >/dev/null 2>&1; then
  echo "FAIL: protected preview ref update was not blocked" >&2
  exit 1
fi

OYUN_ALLOW_PREVIEW_REF_UPDATE=1 git update-ref refs/heads/integration/replit-preview "$new" "$old"
[[ "$(git rev-parse HEAD)" == "$new" ]]

echo "REPLIT_READONLY_GUARD_OK"
