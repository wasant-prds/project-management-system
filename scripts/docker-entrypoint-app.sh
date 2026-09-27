#!/bin/sh
set -eu

export TZ=Asia/Bangkok
export PGTZ=Asia/Bangkok
export PGOPTIONS="-c timezone=Asia/Bangkok"

# Build an encoded container URL from environment injected from root .env.
DATABASE_URL="$(node /app/scripts/database-url.mjs)"
export DATABASE_URL

exec node /app/scripts/runtime-launch.mjs "$@"
