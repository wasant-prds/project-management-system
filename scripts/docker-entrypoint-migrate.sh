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

export SEED_PATH="${SEED_PATH:-database/seeds/master}"
export SEEDS_ROOT="${SEEDS_ROOT:-/app}"

case "${DB_MANAGE_MODE:-}" in
  seed)
    echo "🌱 Running database seed only (${SEEDS_ROOT}/${SEED_PATH})"
    pnpm prisma generate
    pnpm prisma db seed
    exit 0
    ;;
  force-seed)
    echo "🌱 Pushing schema and reseeding database (${SEEDS_ROOT}/${SEED_PATH})"
    pnpm prisma generate
    sh scripts/db-push-safe.sh
    pnpm prisma db seed
    exit 0
    ;;
esac

pnpm prisma generate
sh scripts/db-push-safe.sh

if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "🌱 RUN_SEED=true — loading seeds from ${SEEDS_ROOT}/${SEED_PATH}"
  pnpm prisma db seed
else
  echo "⏭️  RUN_SEED=${RUN_SEED:-false} — skipping seed"
fi
