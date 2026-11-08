#!/bin/sh
set -eu
export TZ=Asia/Bangkok PGTZ=Asia/Bangkok
export PGOPTIONS='-c timezone=Asia/Bangkok'
DATABASE_URL="$(node scripts/database-url.mjs)"
export DATABASE_URL
case "${DB_MANAGE_MODE:-initialize}" in
  initialize)
    node scripts/database/initialize.mjs
    case "${RUN_SEED:-false}" in
      true) node scripts/database/seed.mjs ;;
      false) ;;
      *) echo 'RUN_SEED must be true or false' >&2; exit 1 ;;
    esac
    ;;
  seed) node scripts/database/seed.mjs ;;
  *) echo 'Unsupported database mode' >&2; exit 1 ;;
esac
