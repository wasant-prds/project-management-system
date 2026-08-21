#!/bin/sh
# Export the running PostgreSQL database into database/seeds/master.
# 1. Zip a backup of the current seed folder into ./backups
# 2. Dump tables listed in config.json from the current APP_ENV postgres container
# 3. Replace seed files (WorkItem stays split by year) and delete leftover JSON
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
DEST="${ROOT}/database/seeds/master"
BACKUP_DIR="${ROOT}/backups"
INNER="${ROOT}/scripts/dump-master-seeds-inner.sh"
WRITE="${ROOT}/scripts/dump-master-seeds-write.js"
CONFIG="${DEST}/config.json"

if [ -z "${APP_ENV:-}" ] && [ -f "${ROOT}/.env" ]; then
  APP_ENV="$(sed -n 's/^APP_ENV=//p' "${ROOT}/.env" | tail -n 1 | tr -d '\r"')"
fi
APP_ENV="${APP_ENV:-dev}"
CONTAINER="${POSTGRES_CONTAINER:-pms-postgres-${APP_ENV}}"

STAGE=""
TABLES=""

cleanup() {
  if [ -n "${STAGE:-}" ]; then
    rm -rf "${STAGE}"
  fi
  if [ -n "${TABLES:-}" ]; then
    rm -f "${TABLES}"
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
  base="${BACKUP_DIR}/master-seeds_${stamp}"
  archive="${base}.zip"
  parent="${ROOT}/database/seeds"

  echo "Creating backup: ${archive}"

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

if [ ! -f "$CONFIG" ]; then
  echo "Seed config not found: ${CONFIG}" >&2
  exit 1
fi

echo "==> 1/3 Backup ${DEST}"
backup_master_seeds

echo "==> 2/3 Dump tables from ${CONTAINER}"
if ! container_running; then
  echo "PostgreSQL container is not running: ${CONTAINER}" >&2
  echo "Start it first, or set POSTGRES_CONTAINER / APP_ENV." >&2
  exit 1
fi

STAGE="$(make_temp_dir)"
TABLES="$(make_temp_file)"
node "$WRITE" --print-tables "$CONFIG" > "$TABLES"

docker_cp "$(host_path "$INNER")" "${CONTAINER}:/tmp/dump-master-seeds-inner.sh"
docker_cp "$(host_path "$TABLES")" "${CONTAINER}:/tmp/seed-tables.tsv"
docker_exec "$CONTAINER" sed -i 's/\r$//' /tmp/dump-master-seeds-inner.sh
docker_exec "$CONTAINER" sed -i 's/\r$//' /tmp/seed-tables.tsv
docker_exec "$CONTAINER" sh /tmp/dump-master-seeds-inner.sh
docker_cp "${CONTAINER}:/tmp/seeds-master/." "$(host_path "$STAGE")/"

echo "==> 3/3 Write seed snapshot to ${DEST}"
node "$WRITE" --write "$DEST" "$STAGE" "$CONFIG"

echo "Wrote JSON seeds to ${DEST}"
echo "Config unchanged: ${CONFIG}"
