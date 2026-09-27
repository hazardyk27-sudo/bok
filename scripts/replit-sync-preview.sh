#!/usr/bin/env bash
set -euo pipefail

REMOTE="${1:-github}"
EXPECTED_PREVIEW_SHA="${2:-}"
BRANCH="integration/replit-preview"
MAX_ATTEMPTS=3

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

if [[ -n "$EXPECTED_PREVIEW_SHA" && ! "$EXPECTED_PREVIEW_SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "ABORT: Expected preview SHA must be an exact 40-character commit SHA."
  exit 4
fi

remote_ref="$REMOTE/$BRANCH"
stable="false"

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  echo "SYNC ATTEMPT $attempt/$MAX_ATTEMPTS"
  echo "Fetching $REMOTE/$BRANCH..."
  git fetch "$REMOTE" "$BRANCH:refs/remotes/$REMOTE/$BRANCH"

  if ! git show-ref --verify --quiet "refs/remotes/$remote_ref"; then
    echo "ABORT: Remote tracking ref '$remote_ref' is unavailable."
    exit 5
  fi

  read -r ahead behind < <(git rev-list --left-right --count "HEAD...$remote_ref")
  if [[ "$ahead" != "0" ]]; then
    echo "ABORT: Local preview has $ahead commit(s) not on $remote_ref. No reset/rebase/merge was attempted."
    echo "Local:  $(git rev-parse --short HEAD)"
    echo "Remote: $(git rev-parse --short "$remote_ref")"
    exit 6
  fi

  if [[ "$behind" != "0" ]]; then
    git merge --ff-only "$remote_ref"
  fi

  # Re-fetch after the merge. If GitHub moved while we were syncing, do not
  # claim success against a stale remote snapshot.
  git fetch "$REMOTE" "$BRANCH:refs/remotes/$REMOTE/$BRANCH"
  read -r final_ahead final_behind < <(git rev-list --left-right --count "HEAD...$remote_ref")

  if [[ "$final_ahead" != "0" ]]; then
    echo "ABORT: Local preview unexpectedly became ahead of $remote_ref."
    exit 7
  fi

  if [[ "$final_behind" == "0" ]]; then
    stable="true"
    break
  fi

  echo "NOTICE: GitHub preview moved again during sync; retrying safely."
done

if [[ "$stable" != "true" ]]; then
  echo "ABORT: Preview kept moving during $MAX_ATTEMPTS attempts. Re-run the same sync command later."
  exit 8
fi

final_branch="$(git branch --show-current)"
read -r final_ahead final_behind < <(git rev-list --left-right --count "HEAD...$remote_ref")

expected_present="not-requested"
if [[ -n "$EXPECTED_PREVIEW_SHA" ]]; then
  if git cat-file -e "$EXPECTED_PREVIEW_SHA^{commit}" 2>/dev/null && git merge-base --is-ancestor "$EXPECTED_PREVIEW_SHA" HEAD; then
    expected_present="yes"
  else
    echo "ABORT: Expected promoted preview commit $EXPECTED_PREVIEW_SHA is not contained in Replit HEAD $(git rev-parse HEAD)."
    exit 9
  fi
fi

echo "SYNC OK"
echo "BRANCH: $final_branch"
echo "AHEAD_BEHIND: $final_ahead $final_behind"
echo "HEAD: $(git rev-parse HEAD)"
echo "EXPECTED_PREVIEW_SHA: ${EXPECTED_PREVIEW_SHA:-not-requested}"
echo "EXPECTED_PRESENT: $expected_present"
echo "STATUS_BEGIN"
git status --porcelain
echo "STATUS_END"

if [[ "$final_branch" != "$BRANCH" || "$final_ahead" != "0" || "$final_behind" != "0" || -n "$(git status --porcelain)" ]]; then
  echo "ABORT: Final sync verification failed."
  exit 10
fi
