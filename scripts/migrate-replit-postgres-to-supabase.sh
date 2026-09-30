#!/usr/bin/env bash
set -euo pipefail

SOURCE_DATABASE_URL="${DATABASE_URL:-}"
TARGET_DATABASE_URL="${SUPABASE_DATABASE_URL:-}"
MODE="${OYUN_MIGRATION_MODE:-preflight}"
WRITES_FROZEN="${OYUN_SOURCE_WRITES_FROZEN:-no}"

for command in node psql pg_dump pg_restore md5sum cmp; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "ABORT: required command '$command' is unavailable."
    exit 2
  fi
done

if [[ "$MODE" != "preflight" && "$MODE" != "copy" ]]; then
  echo "ABORT: OYUN_MIGRATION_MODE must be 'preflight' or 'copy'."
  exit 2
fi

if [[ -z "$SOURCE_DATABASE_URL" ]]; then
  echo "ABORT: DATABASE_URL (source/Replit Postgres) is missing."
  exit 2
fi

if [[ -z "$TARGET_DATABASE_URL" ]]; then
  echo "ABORT: SUPABASE_DATABASE_URL (target/Supabase) is missing."
  exit 2
fi

if [[ "$SOURCE_DATABASE_URL" == "$TARGET_DATABASE_URL" ]]; then
  echo "ABORT: source and target database URLs are identical."
  exit 2
fi

source_host="$(node -e 'try { console.log(new URL(process.argv[1]).hostname) } catch { process.exit(2) }' "$SOURCE_DATABASE_URL")"
target_host="$(node -e 'try { console.log(new URL(process.argv[1]).hostname) } catch { process.exit(2) }' "$TARGET_DATABASE_URL")"

echo "MODE: $MODE"
echo "SOURCE_HOST: $source_host"
echo "TARGET_HOST: $target_host"

if [[ "$target_host" != *"supabase.co" ]]; then
  echo "ABORT: SUPABASE_DATABASE_URL does not point to a supabase.co host."
  exit 2
fi

if [[ "$source_host" == *"supabase.co" ]]; then
  echo "ABORT: DATABASE_URL already points to Supabase; refusing to treat it as the migration source."
  exit 2
fi

psqlq() {
  local url="$1"
  local sql="$2"
  psql "$url" -v ON_ERROR_STOP=1 -qAtX -c "$sql"
}

mapfile -t source_tables < <(
  psqlq "$SOURCE_DATABASE_URL" "
    select tablename
    from pg_tables
    where schemaname = 'public'
    order by tablename;
  "
)

mapfile -t target_tables < <(
  psqlq "$TARGET_DATABASE_URL" "
    select tablename
    from pg_tables
    where schemaname = 'public'
    order by tablename;
  "
)

if [[ "${#source_tables[@]}" -eq 0 ]]; then
  echo "ABORT: source public schema has no tables."
  exit 3
fi

for table in "${source_tables[@]}" "${target_tables[@]}"; do
  if [[ ! "$table" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "ABORT: unsupported table name '$table'."
    exit 3
  fi
done

declare -A target_set=()
for table in "${target_tables[@]}"; do
  target_set["$table"]=1
done

missing_tables=()
for table in "${source_tables[@]}"; do
  if [[ -z "${target_set[$table]:-}" ]]; then
    missing_tables+=("$table")
  fi
done

echo "SOURCE_TABLES: ${#source_tables[@]}"
echo "TARGET_TABLES: ${#target_tables[@]}"

if [[ "${#missing_tables[@]}" -gt 0 ]]; then
  echo "ABORT: target is missing source table(s): ${missing_tables[*]}"
  exit 4
fi

table_manifest_line() {
  local url="$1"
  local table="$2"
  local value
  value="$(psqlq "$url" "
    set timezone to 'UTC';
    select count(*)::text || '|' ||
      coalesce(
        md5(string_agg(row_hash, '' order by row_hash)),
        md5('')
      )
    from (
      select md5(to_jsonb(t)::text) as row_hash
      from public.\"$table\" as t
    ) rows;
  ")"
  printf '%s|%s\n' "$table" "$value"
}

write_table_manifest() {
  local url="$1"
  local output="$2"
  : > "$output"
  for table in "${source_tables[@]}"; do
    table_manifest_line "$url" "$table" >> "$output"
  done
}

mapfile -t source_sequences < <(
  psqlq "$SOURCE_DATABASE_URL" "
    select sequencename
    from pg_sequences
    where schemaname = 'public'
    order by sequencename;
  "
)

mapfile -t target_sequences < <(
  psqlq "$TARGET_DATABASE_URL" "
    select sequencename
    from pg_sequences
    where schemaname = 'public'
    order by sequencename;
  "
)

for sequence in "${source_sequences[@]}" "${target_sequences[@]}"; do
  if [[ ! "$sequence" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "ABORT: unsupported sequence name '$sequence'."
    exit 4
  fi
done

declare -A target_sequence_set=()
for sequence in "${target_sequences[@]}"; do
  target_sequence_set["$sequence"]=1
done

missing_sequences=()
for sequence in "${source_sequences[@]}"; do
  if [[ -z "${target_sequence_set[$sequence]:-}" ]]; then
    missing_sequences+=("$sequence")
  fi
done

if [[ "${#missing_sequences[@]}" -gt 0 ]]; then
  echo "ABORT: target is missing source sequence(s): ${missing_sequences[*]}"
  exit 4
fi

sequence_manifest_line() {
  local url="$1"
  local sequence="$2"
  local value
  value="$(psqlq "$url" "select last_value::text || '|' || is_called::text from public.\"$sequence\";")"
  printf '%s|%s\n' "$sequence" "$value"
}

write_sequence_manifest() {
  local url="$1"
  local output="$2"
  : > "$output"
  for sequence in "${source_sequences[@]}"; do
    sequence_manifest_line "$url" "$sequence" >> "$output"
  done
}

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
manifest_dir="/tmp/oyun-supabase-migration-$timestamp"
mkdir -p "$manifest_dir"

source_before="$manifest_dir/source-before.tables"
source_after_dump="$manifest_dir/source-after-dump.tables"
source_after_restore="$manifest_dir/source-after-restore.tables"
target_after="$manifest_dir/target-after.tables"
source_sequences_before="$manifest_dir/source-before.sequences"
source_sequences_after="$manifest_dir/source-after.sequences"
target_sequences_after="$manifest_dir/target-after.sequences"
dump_path="$manifest_dir/source.dump"

write_table_manifest "$SOURCE_DATABASE_URL" "$source_before"
write_sequence_manifest "$SOURCE_DATABASE_URL" "$source_sequences_before"

echo
echo "=== SOURCE MANIFEST ==="
cat "$source_before"
if [[ -s "$source_sequences_before" ]]; then
  echo "=== SOURCE SEQUENCES ==="
  cat "$source_sequences_before"
fi

target_nonempty=0
for table in "${source_tables[@]}"; do
  target_count="$(psqlq "$TARGET_DATABASE_URL" "select count(*) from public.\"$table\";")"
  if [[ "$target_count" != "0" ]]; then
    echo "TARGET_NONEMPTY: $table=$target_count"
    target_nonempty=1
  fi
done

if [[ "$MODE" == "preflight" ]]; then
  if [[ "$target_nonempty" -ne 0 ]]; then
    echo "PREFLIGHT_BLOCKED: target contains source-table data."
    exit 5
  fi
  echo
  echo "PREFLIGHT_OK"
  echo "TARGET_EMPTY: yes"
  echo "MANIFEST_DIR: $manifest_dir"
  exit 0
fi

if [[ "$WRITES_FROZEN" != "yes" ]]; then
  echo "ABORT: copy mode requires OYUN_SOURCE_WRITES_FROZEN=yes."
  echo "Stop/freeze API and background writers first; then run the exact copy command."
  exit 6
fi

if [[ "$target_nonempty" -ne 0 ]]; then
  echo "ABORT: target contains data. Refusing to merge or overwrite automatically."
  exit 6
fi

echo
echo "=== CREATE CONSISTENT SOURCE DUMP ==="
pg_dump "$SOURCE_DATABASE_URL" \
  --data-only \
  --schema=public \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$dump_path"

write_table_manifest "$SOURCE_DATABASE_URL" "$source_after_dump"
write_sequence_manifest "$SOURCE_DATABASE_URL" "$source_sequences_after"

if ! cmp -s "$source_before" "$source_after_dump"; then
  echo "ABORT: source table data changed while the dump was being created."
  echo "No data was restored to Supabase."
  diff -u "$source_before" "$source_after_dump" || true
  exit 7
fi

if ! cmp -s "$source_sequences_before" "$source_sequences_after"; then
  echo "ABORT: source sequence state changed while the dump was being created."
  echo "No data was restored to Supabase."
  diff -u "$source_sequences_before" "$source_sequences_after" || true
  exit 7
fi

echo "SOURCE_STABLE_DURING_DUMP: yes"
echo "DUMP_SHA256: $(sha256sum "$dump_path" | awk '{print $1}')"

echo
echo "=== ATOMIC RESTORE TO SUPABASE ==="
pg_restore \
  --data-only \
  --no-owner \
  --no-privileges \
  --single-transaction \
  --exit-on-error \
  --dbname="$TARGET_DATABASE_URL" \
  "$dump_path"

write_table_manifest "$SOURCE_DATABASE_URL" "$source_after_restore"
if ! cmp -s "$source_before" "$source_after_restore"; then
  echo "ABORT: source changed before restore verification completed."
  echo "Supabase now contains a stale snapshot. DO NOT CUT OVER."
  echo "Keep the source authoritative and clear/retry the target under a real write freeze."
  diff -u "$source_before" "$source_after_restore" || true
  exit 8
fi

write_table_manifest "$TARGET_DATABASE_URL" "$target_after"

echo
echo "=== TABLE COUNT + CONTENT CHECKSUM VERIFY ==="
cat "$target_after"

if ! cmp -s "$source_before" "$target_after"; then
  echo "ABORT: target table count/content checksum does not match the frozen source."
  diff -u "$source_before" "$target_after" || true
  exit 9
fi

write_sequence_manifest "$TARGET_DATABASE_URL" "$target_sequences_after"
if ! cmp -s "$source_sequences_before" "$target_sequences_after"; then
  echo "ABORT: target sequence state does not match the frozen source."
  diff -u "$source_sequences_before" "$target_sequences_after" || true
  exit 10
fi

relation_issues=0
check_zero() {
  local label="$1"
  local sql="$2"
  local count
  count="$(psqlq "$TARGET_DATABASE_URL" "$sql")"
  echo "$label=$count"
  if [[ "$count" != "0" ]]; then
    relation_issues=1
  fi
}

echo
echo "=== CRITICAL RELATION VERIFY ==="
check_zero "NEGATIVE_SHARED_WALLETS" "
  select count(*) from public.shared_wallets where balance_cents < 0;
"
check_zero "USERS_WITHOUT_WALLET" "
  select count(*)
  from public.users u
  left join public.shared_wallets w on w.session_id = u.wallet_session_id
  where w.session_id is null;
"
check_zero "AUTH_SESSIONS_WITHOUT_USER" "
  select count(*)
  from public.auth_sessions s
  left join public.users u on u.id = s.user_id
  where u.id is null;
"
check_zero "EMAIL_TOKENS_WITHOUT_USER" "
  select count(*)
  from public.email_verification_tokens e
  left join public.users u on u.id = e.user_id
  where u.id is null;
"
check_zero "SLOT_LEDGER_WITHOUT_ROUND" "
  select count(*)
  from public.slot_ledger l
  left join public.slot_rounds r on r.id = l.round_id
  where r.id is null;
"
check_zero "CADI_LEDGER_WITHOUT_ROUND" "
  select count(*)
  from public.cadi_kazan_ledger l
  left join public.cadi_kazan_rounds r on r.id = l.round_id
  where r.id is null;
"
check_zero "ROULETTE_LEDGER_WITHOUT_ROUND" "
  select count(*)
  from public.roulette_ledger l
  left join public.roulette_rounds r on r.id = l.round_id
  where r.id is null;
"
check_zero "IDLE_STATE_WITHOUT_WALLET" "
  select count(*)
  from public.idle_business_states s
  left join public.shared_wallets w on w.session_id = s.session_id
  where w.session_id is null;
"
check_zero "IDLE_STADIUM_WITHOUT_WALLET" "
  select count(*)
  from public.idle_stadium_states s
  left join public.shared_wallets w on w.session_id = s.session_id
  where w.session_id is null;
"
check_zero "ROULETTE_GLOBAL_BET_WITHOUT_WALLET" "
  select count(*)
  from public.roulette_global_bets b
  left join public.shared_wallets w on w.session_id = b.session_id
  where w.session_id is null;
"

if [[ "$relation_issues" -ne 0 ]]; then
  echo "ABORT: critical relationship verification failed. DO NOT CUT OVER."
  exit 11
fi

echo
echo "MIGRATION_OK"
echo "SOURCE_STABLE: yes"
echo "TABLE_COUNTS_MATCH: yes"
echo "TABLE_CHECKSUMS_MATCH: yes"
echo "SEQUENCES_MATCH: yes"
echo "CRITICAL_RELATIONS_OK: yes"
echo "SOURCE_UNCHANGED_BY_SCRIPT: yes"
echo "MANIFEST_DIR: $manifest_dir"
echo "DUMP_PATH: $dump_path"
echo "NEXT: keep source frozen; only central cutover may enable USE_SUPABASE_DATABASE=true."
