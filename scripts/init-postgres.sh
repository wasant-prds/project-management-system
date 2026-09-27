#!/bin/sh
set -eu
# PostgreSQL credentials are injected from the root .env by Compose.
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
export TZ=Asia/Bangkok
export PGTZ=Asia/Bangkok
exec /usr/local/bin/docker-entrypoint.sh "$@"
