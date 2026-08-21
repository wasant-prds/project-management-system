#!/bin/sh
# Runs inside the postgres container. Writes one JSON array per Prisma model.
set -eu

OUT="${OUT_DIR:-/tmp/seeds-master}"
TABLES="${TABLES_FILE:-/tmp/seed-tables.tsv}"

DB_USER=""
DB_NAME=""
if [ -f /run/secrets/postgres_user ]; then
  DB_USER="$(tr -d '\n\r' < /run/secrets/postgres_user | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
fi
if [ -f /run/secrets/postgres_db ]; then
  DB_NAME="$(tr -d '\n\r' < /run/secrets/postgres_db | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
fi

DB_USER="${DB_USER:-${POSTGRES_USER:-}}"
DB_NAME="${DB_NAME:-${POSTGRES_DB:-}}"

if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
  echo "POSTGRES_USER / POSTGRES_DB could not be resolved" >&2
  exit 1
fi

if [ ! -f "$TABLES" ]; then
  echo "Table map not found: ${TABLES}" >&2
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT"

while IFS="$(printf '\t')" read -r model pgtable || [ -n "${model:-}" ]; do
  model="$(printf '%s' "$model" | tr -d '\r')"
  pgtable="$(printf '%s' "$pgtable" | tr -d '\r')"

  if [ -z "$model" ] || [ -z "$pgtable" ]; then
    continue
  fi
  case "$model" in
    \#*) continue ;;
  esac

  echo "Dumping ${model} (\"${pgtable}\")..."
  dest="${OUT}/${model}.json"
  psql -U "$DB_USER" -d "$DB_NAME" -Atq -c "SELECT COALESCE(json_agg(to_jsonb(t) ORDER BY t.\"id\"), '[]'::json) FROM \"${pgtable}\" t;" > "$dest"
  rows="$(psql -U "$DB_USER" -d "$DB_NAME" -Atq -c "SELECT COUNT(*)::int FROM \"${pgtable}\";")"
  echo "  ${model}: ${rows} rows"
done < "$TABLES"

echo "Wrote JSON dumps to ${OUT}"
