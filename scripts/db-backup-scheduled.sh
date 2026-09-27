#!/bin/sh
# Daily archive is a candidate only; certify with an isolated restore before rollout.
set -eu
umask 077
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
BACKUP_DIR="${BACKUP_DIR:-./database/backups/postgres_data}"
: "${APP_ENV:?Set backup environment}"
case "$BACKUP_KEEP_DAYS" in ''|*[!0-9]*) echo 'Invalid retention' >&2; exit 1;; esac
[ "$BACKUP_KEEP_DAYS" -ge 1 ] && [ "$BACKUP_KEEP_DAYS" -le 3650 ] || exit 1
case "$APP_ENV" in dev|local|uat|prod) ;; *) exit 1;; esac
export PGPASSWORD="$POSTGRES_PASSWORD" PGTZ=Asia/Bangkok PGOPTIONS='-c timezone=Asia/Bangkok'
mkdir -p /backups
while true; do
  partial="$(mktemp /backups/.pms-backup-XXXXXX)"
  if pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges > "$partial" 2>/dev/null; then
    mv "$partial" "/backups/pms_${APP_ENV}_daily_$(date +%Y%m%d_%H%M%S).dump"
    echo 'Daily backup candidate created; isolated restore required before rollout'
  else
    rm -f "$partial"
    echo 'Daily backup failed; diagnostics withheld' >&2
    exit 1
  fi
  # Daily candidates have their own namespace; never remove manual/pinned rollout evidence.
  find /backups -maxdepth 1 -type f -name "pms_${APP_ENV}_daily_*.dump" -mtime +"$BACKUP_KEEP_DAYS" -delete
  sleep 86400
done
