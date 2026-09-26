#!/usr/bin/env bash
set -euo pipefail

REMOTE="${1:-github}"
BRANCH="integration/replit-preview"

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
git fetch "$REMOTE" "$BRANCH:refs/remotes/$REMOTE/$BRANCH"

remote_ref="$REMOTE/$BRANCH"
if ! git show-ref --verify --quiet "refs/remotes/$remote_ref"; then
  echo "ABORT: Remote tracking ref '$remote_ref' is unavailable."
  exit 4
fi

read -r ahead before_behind < <(git rev-list --left-right --count "HEAD...$remote_ref")
if [[ "$ahead" != "0" ]]; then
  echo "ABORT: Local preview has $ahead commit(s) not on $remote_ref. No reset/rebase/merge was attempted."
  echo "Local:  $(git rev-parse --short HEAD)"
  echo "Remote: $(git rev-parse --short "$remote_ref")"
  exit 5
fi

git merge --ff-only "$remote_ref"

read -r final_ahead final_behind < <(git rev-list --left-right --count "HEAD...$remote_ref")
final_branch="$(git branch --show-current)"

echo "SYNC OK"
echo "BRANCH: $final_branch"
echo "AHEAD_BEHIND: $final_ahead $final_behind"
echo "HEAD: $(git rev-parse --short HEAD)"
echo "STATUS_BEGIN"
git status --porcelain
echo "STATUS_END"

if [[ "$final_branch" != "$BRANCH" || "$final_ahead" != "0" || "$final_behind" != "0" || -n "$(git status --porcelain)" ]]; then
  echo "ABORT: Final sync verification failed."
  exit 6
fi
