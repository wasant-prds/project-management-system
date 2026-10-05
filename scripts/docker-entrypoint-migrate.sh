#!/bin/sh
set -eu

export TZ=Asia/Bangkok
export PGTZ=Asia/Bangkok
export PGOPTIONS="-c timezone=Asia/Bangkok"

# Build an encoded container URL from environment injected from root .env.
DATABASE_URL="$(node /app/scripts/database-url.mjs)"
export DATABASE_URL

export SEED_PATH="${SEED_PATH:-database/seeds/sql-master}"
export SEEDS_ROOT="${SEEDS_ROOT:-/app}"
export PMS_SQL_RUNTIME_APPLY=1
MIGRATION_MAX_ATTEMPTS="${MIGRATION_MAX_ATTEMPTS:-3}"

case "$MIGRATION_MAX_ATTEMPTS" in
  ''|*[!0-9]*)
    echo "❌ MIGRATION_MAX_ATTEMPTS must be a positive integer." >&2
    exit 1
    ;;
esac
if [ "$MIGRATION_MAX_ATTEMPTS" -lt 1 ]; then
  echo "❌ MIGRATION_MAX_ATTEMPTS must be a positive integer." >&2
  exit 1
fi

run_db_step() {
  step="$1"
  shift
  attempt=1
  delay=1

  while [ "$attempt" -le "$MIGRATION_MAX_ATTEMPTS" ]; do
    attempt_log=$(mktemp)
    if "$@" >"$attempt_log" 2>&1; then
      echo "Database step completed."
      if [ "$step" = "seed" ]; then
        grep -E '^Seed (Company|User|Project|ProjectMember|Milestone|WorkItem|Comment|Document|TimeEntry|ActivityLog|Notification): (inserted|skipped-existing|empty-seed) \([0-9]+ rows\)$|^Seeding completed successfully\.$' "$attempt_log" || true
      fi
      rm -f "$attempt_log"
      if [ "$attempt" -gt 1 ]; then
        echo "✅ $step succeeded on attempt $attempt/$MIGRATION_MAX_ATTEMPTS."
      fi
      return 0
    else
      result=$?
    fi

    echo "Database step failed; raw diagnostics withheld to protect credentials." >&2
    if [ "$step" = "seed" ]; then
      grep -E '^Seed (Company|User|Project|ProjectMember|Milestone|WorkItem|Comment|Document|TimeEntry|ActivityLog|Notification) failed( \(P[0-9]{4}\))?; transaction rolled back\. Check dataset constraints and files\.$|^Seed failed \(P[0-9]{4}\); transaction rolled back\. Check dataset constraints and references\.$|^Seed failed; check config\.json and seed files at SEED_PATH\. Transaction rolled back\.$' "$attempt_log" >&2 || true
    fi
    if [ "$step" = "seed" ] && [ ! -f "${SEEDS_ROOT}/${SEED_PATH}/config.json" ]; then
      echo "Seed config is missing. Set RUN_SEED=false in root .env to start without seed, or supply the approved dataset at SEED_PATH." >&2
    fi
    if [ "$attempt" -ge "$MIGRATION_MAX_ATTEMPTS" ] \
      || ! grep -Eiq 'P1001|P1002|P1017|P2024|ECONNRESET|ECONNREFUSED|ETIMEDOUT|timed out|server closed the connection|connection.*closed|too many connections' "$attempt_log"; then
      rm -f "$attempt_log"
      echo "❌ $step failed with exit code $result; stopping without retry." >&2
      return "$result"
    fi

    rm -f "$attempt_log"
    echo "⚠️  Temporary database connection failure during $step (attempt $attempt/$MIGRATION_MAX_ATTEMPTS); retrying in ${delay}s." >&2
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}

case "${DB_MANAGE_MODE:-}" in
  force-seed|reset)
    echo "Destructive database mode is refused." >&2
    exit 1
    ;;
  seed)
    echo "Running SQL seed only (${SEEDS_ROOT}/${SEED_PATH})"
    node scripts/db-schema-rollout-gate.mjs
    pnpm prisma generate
    run_db_step "seed" node scripts/sql-runtime.mjs seed
    exit 0
    ;;
esac

node scripts/db-schema-rollout-gate.mjs
pnpm prisma generate
run_db_step "schema sync" node scripts/sql-runtime.mjs apply
