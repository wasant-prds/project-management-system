#!/bin/sh
# Compatibility command: schema.sql and reviewed SQL migrations own the schema.
set -eu

node scripts/db-schema-rollout-gate.mjs

for arg in "$@"; do
  case "$arg" in
    --accept-data-loss|--force-reset)
      echo "Refusing destructive database flag: $arg" >&2
      echo "Existing table data must be preserved. Resolve schema conflicts manually." >&2
      exit 1
      ;;
  esac
done

if [ "$#" -ne 0 ]; then
  echo "SQL schema sync does not accept Prisma CLI flags." >&2
  exit 1
fi
export PMS_SQL_RUNTIME_APPLY=1
export RUN_SEED=false
exec node scripts/sql-runtime.mjs apply
