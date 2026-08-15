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
fi

export SEED_PATH="${SEED_PATH:-seeds/master}"
export SEEDS_ROOT="${SEEDS_ROOT:-/app/database}"

pnpm prisma generate
sh scripts/db-push-safe.sh

if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "🌱 RUN_SEED=true — loading seeds from ${SEEDS_ROOT}/${SEED_PATH}"
  pnpm prisma db seed
else
  echo "⏭️  RUN_SEED=${RUN_SEED:-false} — skipping seed"
fi
