#!/bin/sh
set -eu

# Build DATABASE_URL from Docker secrets when present.
# Must quote the URL — unquoted `&` is treated as a shell background operator.
if [ -f /run/secrets/postgres_user ] \
  && [ -f /run/secrets/postgres_password ] \
  && [ -f /run/secrets/postgres_db ]; then
  POSTGRES_USER=$(tr -d '\n\r' < /run/secrets/postgres_user | xargs)
  POSTGRES_PASSWORD=$(tr -d '\n\r' < /run/secrets/postgres_password | xargs)
  POSTGRES_DB=$(tr -d '\n\r' < /run/secrets/postgres_db | xargs)
  POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
  POSTGRES_PORT="${POSTGRES_PORT:-5432}"

  export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public&connection_limit=5&pool_timeout=20"
fi

exec "$@"
