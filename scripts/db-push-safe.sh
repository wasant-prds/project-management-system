#!/bin/sh
# Non-destructive schema sync: never drop existing data.
# Refuses --accept-data-loss / --force-reset so Docker/CI cannot wipe tables.
set -eu

for arg in "$@"; do
  case "$arg" in
    --accept-data-loss|--force-reset)
      echo "Refusing destructive prisma db push flag: $arg" >&2
      echo "Existing table data must be preserved. Resolve schema conflicts manually." >&2
      exit 1
      ;;
  esac
done

# Without --accept-data-loss, Prisma aborts (non-interactive) if a change would delete data.
exec ./node_modules/.bin/prisma db push "$@"
