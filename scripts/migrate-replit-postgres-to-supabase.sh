#!/usr/bin/env bash
set -euo pipefail

SOURCE_DATABASE_URL="${DATABASE_URL:-}"
TARGET_DATABASE_URL="${SUPABASE_DATABASE_URL:-}"
MODE="${OYUN_MIGRATION_MODE:-preflight}"
WRITES_FROZEN="${OYUN_SOURCE_WRITES_FROZEN:-no}"

for command in node psql pg_dump pg_restore sha256sum cmp diff; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "ABORT: required command '$command' is unavailable."
    exit 2
  fi
done

if [[ "$MODE" != "preflight" && "$MODE" != "freeze" && "$MODE" != "copy" && "$MODE" != "status" && "$MODE" != "unfreeze" ]]; then
  echo "ABORT: OYUN_MIGRATION_MODE must be one of: preflight, freeze, copy, status, unfreeze."
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

source_db_ident() {
  PGOPTIONS="-c default_transaction_read_only=off" psqlq "$SOURCE_DATABASE_URL"     "select quote_ident(current_database());"
}

source_default_read_only() {
  psqlq "$SOURCE_DATABASE_URL" "show default_transaction_read_only;"
}

freeze_source() {
  local db_ident
  db_ident="$(source_db_ident)"
  echo "FREEZE_DATABASE: $db_ident"
  PGOPTIONS="-c default_transaction_read_only=off"     psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -qX <<SQL
alter database $db_ident set default_transaction_read_only = on;
select pg_terminate_backend(pid)
from pg_stat_activity
where datname = current_database()
  and pid <> pg_backend_pid();
SQL

  local state
  state="$(source_default_read_only)"
  if [[ "$state" != "on" ]]; then
    echo "ABORT: source write freeze could not be verified."
    exit 12
  fi
  echo "SOURCE_WRITES_FROZEN: yes"
}

unfreeze_source() {
  local db_ident
  db_ident="$(source_db_ident)"
  PGOPTIONS="-c default_transaction_read_only=off"     psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -qX     -c "alter database $db_ident reset default_transaction_read_only;"

  local state
  state="$(source_default_read_only)"
  if [[ "$state" != "off" ]]; then
    echo "ABORT: source write unfreeze could not be verified."
    exit 13
  fi
  echo "SOURCE_WRITES_FROZEN: no"
  echo "SOURCE_WRITE_MODE: restored"
}

if [[ "$MODE" == "status" ]]; then
  echo "SOURCE_DEFAULT_TRANSACTION_READ_ONLY: $(source_default_read_only)"
  exit 0
fi

if [[ "$MODE" == "freeze" ]]; then
  freeze_source
  exit 0
fi

if [[ "$MODE" == "unfreeze" ]]; then
  unfreeze_source
  exit 0
fi

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

required_target_tables=(
  shared_wallets
  shared_wallet_legacy_imports
  slot_rounds
  slot_ledger
  slot_wallet_migrations
  cadi_kazan_rounds
  cadi_kazan_ledger
  idle_business_states
  idle_action_receipts
  idle_ledger
  idle_stadium_states
  idle_ticket_market_state
  idle_ticket_market_ticks
  idle_stadium_action_receipts
  roulette_rounds
  roulette_ledger
  roulette_global_rounds
  roulette_global_bets
  roulette_global_bet_requests
  blackjack_table_snapshots
  blackjack_event_journal
  users
  auth_sessions
  email_verification_tokens
)

required_target_only_tables=(
  oyun_migration_receipts
)

missing_target_only=()
for table in "${required_target_only_tables[@]}"; do
  if [[ -z "${target_set[$table]:-}" ]]; then
    missing_target_only+=("$table")
  fi
done

if [[ "${#missing_target_only[@]}" -gt 0 ]]; then
  echo "ABORT: Supabase target is missing platform cutover table(s): ${missing_target_only[*]}"
  exit 4
fi

declare -A source_set=()
for table in "${source_tables[@]}"; do
  source_set["$table"]=1
done

missing_required_source=()
missing_required_target=()
for table in "${required_target_tables[@]}"; do
  if [[ -z "${source_set[$table]:-}" ]]; then
    missing_required_source+=("$table")
  fi
  if [[ -z "${target_set[$table]:-}" ]]; then
    missing_required_target+=("$table")
  fi
done

if [[ "${#missing_required_source[@]}" -gt 0 ]]; then
  echo "ABORT: source Helium DB is missing required OYUN table(s): ${missing_required_source[*]}"
  echo "Do not migrate yet; first bring the live source schema up to the current repository contract."
  exit 4
fi

if [[ "${#missing_required_target[@]}" -gt 0 ]]; then
  echo "ABORT: Supabase target is missing required OYUN table(s): ${missing_required_target[*]}"
  exit 4
fi

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

source_ro="$(source_default_read_only)"
if [[ "$source_ro" != "on" ]]; then
  echo "ABORT: copy mode requires the source database itself to be read-only."
  echo "Run OYUN_MIGRATION_MODE=freeze first. An environment flag alone is not accepted."
  exit 6
fi

if [[ "$WRITES_FROZEN" != "yes" ]]; then
  echo "ABORT: copy mode additionally requires OYUN_SOURCE_WRITES_FROZEN=yes as an operator acknowledgement."
  exit 6
fi

echo "SOURCE_DATABASE_READ_ONLY: verified"

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

source_manifest_sha256="$(sha256sum "$source_before" | awk '{print $1}')"
source_total_rows="$(awk -F'|' '{ total += $2 } END { print total + 0 }' "$source_before")"
source_table_count="${#source_tables[@]}"

echo
echo "=== WRITE VERIFIED CUTOVER RECEIPT ==="
psql "$TARGET_DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -qX \
  -v source_host="$source_host" \
  -v manifest_sha="$source_manifest_sha256" \
  -v source_table_count="$source_table_count" \
  -v source_total_rows="$source_total_rows" <<'SQL'
insert into public.oyun_migration_receipts (
  migration_kind,
  source_host,
  source_manifest_sha256,
  source_table_count,
  source_total_rows,
  verification_status
) values (
  'helium_to_supabase_v1',
  :'source_host',
  :'manifest_sha',
  :source_table_count,
  :source_total_rows,
  'VERIFIED'
);
SQL

receipt_count="$(psqlq "$TARGET_DATABASE_URL" "
  select count(*)
  from public.oyun_migration_receipts
  where migration_kind = 'helium_to_supabase_v1'
    and verification_status = 'VERIFIED'
    and source_manifest_sha256 = '$source_manifest_sha256';
")"

if [[ "$receipt_count" != "1" ]]; then
  echo "ABORT: verified migration receipt could not be confirmed. DO NOT CUT OVER."
  exit 14
fi

echo "VERIFIED_MIGRATION_RECEIPT: yes"
echo "SOURCE_MANIFEST_SHA256: $source_manifest_sha256"
echo "SOURCE_TOTAL_ROWS: $source_total_rows"

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
echo "ROLLBACK_ONLY_IF_NEEDED: OYUN_MIGRATION_MODE=unfreeze bash scripts/migrate-replit-postgres-to-supabase.sh"
