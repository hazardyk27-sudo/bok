#!/usr/bin/env bash
set -euo pipefail

SOURCE_DATABASE_URL="${DATABASE_URL:-}"
TARGET_DATABASE_URL="${SUPABASE_DATABASE_URL:-}"

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

echo "SOURCE_HOST: $source_host"
echo "TARGET_HOST: $target_host"

if [[ "$target_host" != *"supabase.co" ]]; then
  echo "ABORT: SUPABASE_DATABASE_URL does not point to a supabase.co host."
  exit 2
fi

mapfile -t source_tables < <(
  psql "$SOURCE_DATABASE_URL" -Atc "
    select tablename
    from pg_tables
    where schemaname = 'public'
    order by tablename;
  "
)

mapfile -t target_tables < <(
  psql "$TARGET_DATABASE_URL" -Atc "
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

echo "SOURCE_TABLES: ${#source_tables[@]}"
echo "TARGET_TABLES: ${#target_tables[@]}"

declare -A target_set=()
for table in "${target_tables[@]}"; do
  target_set["$table"]=1
done

missing=()
for table in "${source_tables[@]}"; do
  if [[ -z "${target_set[$table]:-}" ]]; then
    missing+=("$table")
  fi
done

if [[ "${#missing[@]}" -gt 0 ]]; then
  echo "ABORT: target is missing source table(s): ${missing[*]}"
  exit 4
fi

target_nonempty=0
for table in "${source_tables[@]}"; do
  count="$(psql "$TARGET_DATABASE_URL" -Atc "select count(*) from public.\"$table\";")"
  if [[ "$count" != "0" ]]; then
    echo "TARGET_NONEMPTY: $table=$count"
    target_nonempty=1
  fi
done

if [[ "$target_nonempty" -ne 0 ]]; then
  echo "ABORT: target contains data. Refusing to merge automatically."
  exit 5
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_path="/tmp/oyun-helium-to-supabase-$timestamp.dump"

dump_args=()
for table in "${source_tables[@]}"; do
  dump_args+=(--table="public.$table")
done

echo "Creating source snapshot..."
pg_dump "$SOURCE_DATABASE_URL" \
  --data-only \
  --format=custom \
  --no-owner \
  --no-privileges \
  "${dump_args[@]}" \
  --file="$dump_path"

echo "Restoring snapshot into Supabase..."
pg_restore \
  --data-only \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  --dbname="$TARGET_DATABASE_URL" \
  "$dump_path"

echo "Verifying row counts..."
mismatch=0
for table in "${source_tables[@]}"; do
  source_count="$(psql "$SOURCE_DATABASE_URL" -Atc "select count(*) from public.\"$table\";")"
  target_count="$(psql "$TARGET_DATABASE_URL" -Atc "select count(*) from public.\"$table\";")"
  printf '%s source=%s target=%s\n' "$table" "$source_count" "$target_count"
  if [[ "$source_count" != "$target_count" ]]; then
    mismatch=1
  fi
done

if [[ "$mismatch" -ne 0 ]]; then
  echo "ABORT: row-count verification failed. Do not cut over runtime."
  exit 6
fi

echo "MIGRATION_OK"
echo "SOURCE_UNCHANGED: yes"
echo "DUMP_PATH: $dump_path"
