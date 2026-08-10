#!/bin/sh
set -eu

# Dev startup: set DATABASE_URL, sync schema, seed, then hot-reload Next.js.
# Source-equivalent of entrypoint env setup (same secrets contract as uat/prod).
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

if [ "${SKIP_DB_INIT:-false}" != "true" ]; then
  pnpm db:generate
  pnpm db:push
  pnpm db:seed
fi

exec pnpm dev
