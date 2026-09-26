#!/bin/sh
# Export the selected PostgreSQL database into database/seeds/master as JSON,
# then archive the resulting seed snapshot in ./backups.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
DB_ROOT="$ROOT"
. "$ROOT/scripts/db-env.sh"

DEST="${ROOT}/database/seeds/master"
BACKUP_DIR="${ROOT}/backups"
INNER="${ROOT}/scripts/dump-master-seeds-inner.sh"
WRITE="${ROOT}/scripts/dump-master-seeds-write.js"
CONFIG="${DEST}/config.json"

DB_SITE="$(db_resolve_env)"
APP_ENV="$DB_SITE"
export APP_ENV
CONTAINER="pms-postgres-${DB_SITE}"
case "$DB_SITE" in
  local) APP_CONTAINER="pms-app-dev" ;;
  dev|uat|prod) APP_CONTAINER="pms-app-${DB_SITE}" ;;
esac

STAGE=""
TABLES=""
WRITTEN_STAGE=""
APP_TMP=""

cleanup() {
  if [ -n "${STAGE:-}" ]; then
    rm -rf "${STAGE}"
  fi
  if [ -n "${TABLES:-}" ]; then
    rm -f "${TABLES}"
  fi
  if [ -n "${WRITTEN_STAGE:-}" ]; then
    rm -rf "${WRITTEN_STAGE}"
  fi
  if [ -n "${APP_TMP:-}" ] && app_container_running; then
    docker_exec -u 0 "$APP_CONTAINER" rm -rf "$APP_TMP" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

make_temp_dir() {
  if command -v mktemp >/dev/null 2>&1; then
    mktemp -d
  else
    dir="${ROOT}/database/seeds/.dump-stage"
    rm -rf "$dir"
    mkdir -p "$dir"
    printf '%s' "$dir"
  fi
}

make_temp_file() {
  if command -v mktemp >/dev/null 2>&1; then
    mktemp
  else
    file="${ROOT}/database/seeds/.dump-tables.tsv"
    : > "$file"
    printf '%s' "$file"
  fi
}

backup_master_seeds() {
  if [ ! -d "$DEST" ]; then
    echo "Seed directory not found: ${DEST}" >&2
    exit 1
  fi

  mkdir -p "$BACKUP_DIR"
  stamp="$(date +%Y%m%d_%H%M%S)"
  base="${BACKUP_DIR}/master-seeds_${DB_SITE}_${stamp}"
  archive="${base}.zip"
  parent="${ROOT}/database/seeds"

  echo "Creating ${DB_SITE} seed backup: ${archive}"

  if command -v python >/dev/null 2>&1; then
    python -c "import shutil,sys; shutil.make_archive(sys.argv[1], 'zip', sys.argv[2], sys.argv[3])" \
      "$base" "$parent" "master"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import shutil,sys; shutil.make_archive(sys.argv[1], 'zip', sys.argv[2], sys.argv[3])" \
      "$base" "$parent" "master"
  elif command -v py >/dev/null 2>&1; then
    py -3 -c "import shutil,sys; shutil.make_archive(sys.argv[1], 'zip', sys.argv[2], sys.argv[3])" \
      "$base" "$parent" "master"
  elif command -v zip >/dev/null 2>&1; then
    (cd "$parent" && zip -r "$archive" master)
  elif command -v tar >/dev/null 2>&1 && tar -a -c -f "$archive" -C "$parent" master 2>/dev/null; then
    :
  else
    echo "Cannot create zip backup (need python, zip, or tar)." >&2
    exit 1
  fi

  if [ ! -f "$archive" ]; then
    echo "Backup zip was not created: ${archive}" >&2
    exit 1
  fi

  echo "Backup written: ${archive}"
}

host_path() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$1"
  else
    printf '%s' "$1"
  fi
}

docker_cp() {
  MSYS_NO_PATHCONV=1 docker cp "$@"
}

docker_exec() {
  MSYS_NO_PATHCONV=1 docker exec "$@"
}

container_running() {
  docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true
}

app_container_running() {
  docker inspect -f '{{.State.Running}}' "$APP_CONTAINER" 2>/dev/null | grep -q true
}

prepare_app_writer() {
  if [ -z "$APP_TMP" ]; then
    if ! app_container_running; then
      echo "Node.js is not installed on the host, and app container is not running: ${APP_CONTAINER}" >&2
      echo "Start the selected site or install Node.js on the host, then retry." >&2
      return 1
    fi
    APP_TMP="/tmp/pms-seed-export-$$"
    docker_exec -u 0 "$APP_CONTAINER" mkdir -p "$APP_TMP"
    docker_cp "$(host_path "$WRITE")" "${APP_CONTAINER}:${APP_TMP}/dump-master-seeds-write.js"
    docker_cp "$(host_path "$CONFIG")" "${APP_CONTAINER}:${APP_TMP}/config.json"
  fi
}

run_print_tables() {
  if command -v node >/dev/null 2>&1; then
    node "$WRITE" --print-tables "$CONFIG"
  else
    prepare_app_writer
    docker_exec -u 0 "$APP_CONTAINER" node "$APP_TMP/dump-master-seeds-write.js" --print-tables "$APP_TMP/config.json"
  fi
}

make_written_temp_dir() {
  if command -v mktemp >/dev/null 2>&1; then
    mktemp -d "${ROOT}/database/seeds/.dump-written.XXXXXX"
  else
    dir="${ROOT}/database/seeds/.dump-written-$$"
    rm -rf "$dir"
    mkdir -p "$dir"
    printf '%s' "$dir"
  fi
}

replace_seed_directory() {
  replacement=$1
  old="${ROOT}/database/seeds/.master-old-$$"
  mv "$DEST" "$old"
  if mv "$replacement" "$DEST"; then
    WRITTEN_STAGE=""
    rm -rf "$old"
  else
    mv "$old" "$DEST"
    return 1
  fi
}

write_seed_snapshot() {
  if command -v node >/dev/null 2>&1; then
    node "$WRITE" --write "$DEST" "$STAGE" "$CONFIG"
    return
  fi

  prepare_app_writer
  docker_exec -u 0 "$APP_CONTAINER" mkdir -p "$APP_TMP/dest" "$APP_TMP/stage"
  docker_cp "$(host_path "$DEST")/." "${APP_CONTAINER}:${APP_TMP}/dest/"
  docker_cp "$(host_path "$STAGE")/." "${APP_CONTAINER}:${APP_TMP}/stage/"
  docker_exec -u 0 "$APP_CONTAINER" node "$APP_TMP/dump-master-seeds-write.js" \
    --write "$APP_TMP/dest" "$APP_TMP/stage" "$APP_TMP/config.json"

  WRITTEN_STAGE="$(make_written_temp_dir)"
  docker_cp "${APP_CONTAINER}:${APP_TMP}/dest/." "$(host_path "$WRITTEN_STAGE")/"
  replace_seed_directory "$WRITTEN_STAGE"
}

if [ ! -f "$CONFIG" ]; then
  echo "Seed config not found: ${CONFIG}" >&2
  exit 1
fi

echo "APP_ENV=${DB_SITE}"
echo "==> 1/2 Dump tables from ${CONTAINER}"
if ! container_running; then
  echo "PostgreSQL container is not running: ${CONTAINER}" >&2
  echo "Start the selected site first; APP_ENV comes from the root .env file." >&2
  exit 1
fi

STAGE="$(make_temp_dir)"
TABLES="$(make_temp_file)"
run_print_tables > "$TABLES"

docker_cp "$(host_path "$INNER")" "${CONTAINER}:/tmp/dump-master-seeds-inner.sh"
docker_cp "$(host_path "$TABLES")" "${CONTAINER}:/tmp/seed-tables.tsv"
docker_exec "$CONTAINER" sed -i 's/\r$//' /tmp/dump-master-seeds-inner.sh
docker_exec "$CONTAINER" sed -i 's/\r$//' /tmp/seed-tables.tsv
docker_exec "$CONTAINER" sh /tmp/dump-master-seeds-inner.sh
docker_cp "${CONTAINER}:/tmp/seeds-master/." "$(host_path "$STAGE")/"

echo "==> 2/2 Write seed snapshot to ${DEST}"
write_seed_snapshot

echo "Wrote JSON seeds to ${DEST}"
echo "Config unchanged: ${CONFIG}"
backup_master_seeds
