#!/bin/sh
# Runs inside the postgres container. Writes one JSON array per table.
set -eu

OUT="${OUT_DIR:-/tmp/seeds-master}"
USER="${POSTGRES_USER:-pms-root}"
DB="${POSTGRES_DB:-pms_db}"

mkdir -p "$OUT"

tables="Company User Department Project ProjectMember Milestone Task TaskDependency Issue Comment Document TimeEntry ActivityLog Notification"

for t in $tables; do
  echo "Dumping ${t}..."
  dest="${OUT}/${t}.json"
  psql -U "$USER" -d "$DB" -Atq -c "SELECT COALESCE(json_agg(to_jsonb(t) ORDER BY t.\"id\"), '[]'::json) FROM \"${t}\" t;" > "$dest"
  rows=$(psql -U "$USER" -d "$DB" -Atq -c "SELECT COUNT(*)::int FROM \"${t}\";")
  echo "  ${t}: ${rows} rows"
done

echo "Wrote JSON seeds to ${OUT}"
