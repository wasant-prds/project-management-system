#!/bin/sh
set -eu

# Shared by dev / UAT / prod migrations service:
# secrets → DATABASE_URL, safe schema push, optional seed from SEED_PATH.
if [ -f /run/secrets/postgres_user ] \
  && [ -f /run/secrets/postgres_password ] \
  && [ -f /run/secrets/postgres_db ]; then
  POSTGRES_USER=$(tr -d '\n\r' < /run/secrets/postgres_user | xargs)
  POSTGRES_PASSWORD=$(tr -d '\n\r' < /run/secrets/postgres_password | xargs)
  POSTGRES_DB=$(tr -d '\n\r' < /run/secrets/postgres_db | xargs)
  POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
  POSTGRES_PORT="${POSTGRES_PORT:-5432}"

  export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public"
elif [ "${MIGRATION_REQUIRE_SECRETS:-false}" = "true" ]; then
  echo "❌ Required PostgreSQL secrets are missing from /run/secrets." >&2
  exit 1
fi

if [ "${MIGRATION_REQUIRE_SECRETS:-false}" = "true" ] \
  && { [ -z "${POSTGRES_USER:-}" ] || [ -z "${POSTGRES_PASSWORD:-}" ] || [ -z "${POSTGRES_DB:-}" ]; }; then
  echo "❌ Required PostgreSQL secrets must not be empty." >&2
  exit 1
fi

export SEED_PATH="${SEED_PATH:-database/seeds/master}"
export SEEDS_ROOT="${SEEDS_ROOT:-/app}"
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
      cat "$attempt_log"
      rm -f "$attempt_log"
      if [ "$attempt" -gt 1 ]; then
        echo "✅ $step succeeded on attempt $attempt/$MIGRATION_MAX_ATTEMPTS."
      fi
      return 0
    else
      result=$?
    fi

    cat "$attempt_log" >&2
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
  seed)
    echo "🌱 Running database seed only (${SEEDS_ROOT}/${SEED_PATH})"
    pnpm prisma generate
    run_db_step "seed" pnpm prisma db seed
    exit 0
    ;;
  force-seed)
    echo "🌱 Pushing schema and reseeding database (${SEEDS_ROOT}/${SEED_PATH})"
    pnpm prisma generate
    run_db_step "schema sync" sh scripts/db-push-safe.sh
    run_db_step "seed" pnpm prisma db seed
    exit 0
    ;;
esac

pnpm prisma generate
run_db_step "schema sync" sh scripts/db-push-safe.sh

if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "🌱 RUN_SEED=true — loading seeds from ${SEEDS_ROOT}/${SEED_PATH}"
  run_db_step "seed" pnpm prisma db seed
else
  echo "⏭️  RUN_SEED=${RUN_SEED:-false} — skipping seed"
fi
