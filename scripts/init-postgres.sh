#!/bin/sh
set -e

# Read secrets and export as environment variables (trimming whitespace)
export POSTGRES_USER=$(cat /run/secrets/postgres_user | tr -d '\n\r' | xargs)
export POSTGRES_PASSWORD=$(cat /run/secrets/postgres_password | tr -d '\n\r' | xargs)
export POSTGRES_DB=$(cat /run/secrets/postgres_db | tr -d '\n\r' | xargs)

# Call the original entrypoint
exec /usr/local/bin/docker-entrypoint.sh "$@"

