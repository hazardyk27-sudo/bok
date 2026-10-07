#!/usr/bin/env bash
set -euo pipefail

REMOTE="${1:-github}"
EXPECTED_PREVIEW_SHA="${2:-}"
BRANCH="integration/replit-preview"
MAX_ATTEMPTS=3
ALLOW_NONCANONICAL_RECOVERY="${OYUN_ALLOW_BACKUP_NONCANONICAL_LOCAL_COMMITS:-0}"

# Replit is a read-only consumer. Install local-only Git guardrails before
# every sync; they do not alter tracked files.
if [[ -f "scripts/install-replit-readonly-guard.sh" ]]; then
  bash scripts/install-replit-readonly-guard.sh "$REMOTE"
fi

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

if [[ "$ALLOW_NONCANONICAL_RECOVERY" != "0" && "$ALLOW_NONCANONICAL_RECOVERY" != "1" ]]; then
  echo "ABORT: OYUN_ALLOW_BACKUP_NONCANONICAL_LOCAL_COMMITS must be 0 or 1."
  exit 12
fi

remote_ref="$REMOTE/$BRANCH"
stable="false"
updated="false"
recovery_backup="none"

is_safe_replit_publish_commit() {
  local commit="$1"
  local subject parent_count parent tree parent_tree

  subject="$(git show -s --format=%s "$commit")"
  [[ "$subject" == "Published your App" ]] || return 1

  read -r _commit parent _extra < <(git rev-list --parents -n 1 "$commit")
  [[ -n "${parent:-}" && -z "${_extra:-}" ]] || return 1

  tree="$(git show -s --format=%T "$commit")"
  parent_tree="$(git show -s --format=%T "$parent")"
  [[ "$tree" == "$parent_tree" ]]
}

all_local_commits_are_patch_equivalent() {
  local expected_count="$1"
  local line
  local -a cherry_lines=()

  mapfile -t cherry_lines < <(git cherry "$remote_ref" HEAD)
  [[ "${#cherry_lines[@]}" -eq "$expected_count" ]] || return 1

  for line in "${cherry_lines[@]}"; do
    [[ "${line:0:1}" == "-" ]] || return 1
  done
}

recover_safe_local_commits() {
  local commit short_stamp recovery_reason
  local all_empty_publish="true"
  local -a local_only=()

  mapfile -t local_only < <(git rev-list --reverse "$remote_ref..HEAD")
  [[ "${#local_only[@]}" -gt 0 ]] || return 1

  for commit in "${local_only[@]}"; do
    if ! is_safe_replit_publish_commit "$commit"; then
      all_empty_publish="false"
      break
    fi
  done

  if [[ "$all_empty_publish" == "true" ]]; then
    recovery_reason="empty Replit publish commit(s)"
  elif all_local_commits_are_patch_equivalent "${#local_only[@]}"; then
    recovery_reason="local commit(s) already represented by patch-equivalent upstream commit(s)"
  elif [[ "$ALLOW_NONCANONICAL_RECOVERY" == "1" ]]; then
    recovery_reason="explicitly approved noncanonical local commit(s)"
    echo "RECOVERY: explicit backup-and-realign approval is active."
    echo "RECOVERY_LOCAL_COMMITS_BEGIN"
    git log --oneline "$remote_ref..HEAD"
    echo "RECOVERY_LOCAL_COMMITS_END"
  else
    return 1
  fi

  short_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  recovery_backup="backup/replit-recovery-${short_stamp}-$(git rev-parse --short HEAD)"

  echo "RECOVERY: verified ${#local_only[@]} $recovery_reason."
  echo "RECOVERY: preserving local HEAD at $recovery_backup"
  git branch "$recovery_backup" HEAD

  echo "RECOVERY: realigning protected preview branch to $remote_ref"
  OYUN_ALLOW_PREVIEW_REF_UPDATE=1 git reset --hard "$remote_ref"
  updated="true"
}

api_runtime_ready() {
  node -e "fetch('http://127.0.0.1:8080/api/readyz',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
}

wait_for_api_runtime() {
  local checks="$1"
  local delay="$2"
  local check
  for check in $(seq 1 "$checks"); do
    if api_runtime_ready; then
      return 0
    fi
    sleep "$delay"
  done
  return 1
}

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
    if recover_safe_local_commits; then
      read -r ahead behind < <(git rev-list --left-right --count "HEAD...$remote_ref")
    else
      echo "ABORT: Local preview has $ahead commit(s) not on $remote_ref and they are neither verified empty publish commits nor patch-equivalent to upstream."
      echo "Local:  $(git rev-parse --short HEAD)"
      echo "Remote: $(git rev-parse --short "$remote_ref")"
      echo "To preserve the local HEAD in a backup branch and realign explicitly, rerun the canonical helper with OYUN_ALLOW_BACKUP_NONCANONICAL_LOCAL_COMMITS=1."
      exit 6
    fi
  fi

  if [[ "$behind" != "0" ]]; then
    # reference-transaction blocks direct preview ref updates. This verified
    # fast-forward is the sole sanctioned exception.
    OYUN_ALLOW_PREVIEW_REF_UPDATE=1 git merge --ff-only "$remote_ref"
    updated="true"
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

if [[ "$updated" == "true" && -f "scripts/post-merge.sh" ]]; then
  echo "Running Replit post-merge setup..."
  bash scripts/post-merge.sh
fi

# Git sync alone does not guarantee already-running Replit artifact processes
# reload changed backend/config files. Touch the watched runtime and artifact
# descriptors, then require the canonical supervised web+API stack to recover.
# Do not launch a detached API fallback here: an unmanaged second runtime can
# become a competing runtime authority and can also survive past the sync.
if [[ -n "${REPL_ID:-}" ]]; then
  touch artifacts/api-server/src/index.ts
  touch artifacts/cascade-8/vite.config.ts
  touch artifacts/api-server/.replit-artifact/artifact.toml
  touch artifacts/cascade-8/.replit-artifact/artifact.toml

  echo "Waiting for supervised API runtime readiness on 127.0.0.1:8080..."
  api_ready="false"

  if wait_for_api_runtime 120 0.25; then
    api_ready="true"
  fi

  if [[ "$api_ready" != "true" ]]; then
    echo "ABORT: Supervised API runtime did not become ready on 127.0.0.1:8080 after sync."
    echo "Detached API fallback is intentionally disabled to prevent duplicate runtime authorities."
    echo "Ensure the Replit web preview workflow is running; it now owns the supervised web+API stack."
    exit 11
  fi

  echo "API_RUNTIME_HEALTH: ok"
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
echo "RECOVERY_BACKUP: $recovery_backup"
echo "STATUS_BEGIN"
git status --porcelain
echo "STATUS_END"

if [[ "$final_branch" != "$BRANCH" || "$final_ahead" != "0" || "$final_behind" != "0" || -n "$(git status --porcelain)" ]]; then
  echo "ABORT: Final sync verification failed."
  exit 10
fi
