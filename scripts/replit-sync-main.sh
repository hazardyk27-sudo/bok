#!/usr/bin/env bash
set -euo pipefail

REMOTE="${1:-github}"
BRANCH="main"

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$BRANCH" ]]; then
  echo "ABORT: Replit workspace must stay on '$BRANCH'. Current branch: '${current_branch:-DETACHED}'"
  exit 2
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ABORT: Working tree has local changes. Nothing was changed."
  git status --short --branch
  exit 3
fi

echo "Fetching $REMOTE/$BRANCH..."
git fetch "$REMOTE" "$BRANCH"

remote_ref="$REMOTE/$BRANCH"
if ! git show-ref --verify --quiet "refs/remotes/$remote_ref"; then
  echo "ABORT: Remote tracking ref '$remote_ref' is unavailable."
  exit 4
fi

read -r ahead behind < <(git rev-list --left-right --count "HEAD...$remote_ref")
if [[ "$ahead" != "0" ]]; then
  echo "ABORT: Local main has $ahead commit(s) not on $remote_ref. No reset/rebase/merge was attempted."
  echo "Local:  $(git rev-parse --short HEAD)"
  echo "Remote: $(git rev-parse --short "$remote_ref")"
  exit 5
fi

git merge --ff-only "$remote_ref"

echo "SYNC OK"
echo "HEAD: $(git rev-parse --short HEAD)"
git status --short --branch
