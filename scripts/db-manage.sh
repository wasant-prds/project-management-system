#!/usr/bin/env bash

# Database management commands for the APP_ENV selected in the root .env.
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
DB_ROOT="$ROOT"
. "$ROOT/scripts/db-env.sh"

DB_SITE="$(db_resolve_env)"
APP_ENV="$DB_SITE"
export APP_ENV
COMPOSE_FILE="$(db_compose_file "$DB_SITE")"
case "$DB_SITE" in
  local|dev) START_SCRIPT="scripts/docker-dev.sh" ;;
  uat) START_SCRIPT="scripts/docker-uat.sh" ;;
  prod) START_SCRIPT="scripts/docker-prod.sh" ;;
esac
CONTAINER_NAME="pms-postgres-${DB_SITE}"
VOLUME_NAME="pms-postgres-data-${DB_SITE}"
DATA_DIR="$(db_data_dir)"
BACKUP_DIR="$ROOT/database/backups"

cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
  echo -e "${BLUE}================================================${NC}"
  echo -e "${BLUE}  Database Management - PMS${NC}"
  echo -e "${BLUE}  APP_ENV: ${DB_SITE}${NC}"
  echo -e "${BLUE}================================================${NC}"
}

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }

check_data_dir() {
  [ -d "$DATA_DIR" ] && [ -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]
}

check_container() {
  db_docker ps --format '{{.Names}}' 2>/dev/null | grep -Fqx "$CONTAINER_NAME"
}

read_database_setting() {
  local value
  value=$(db_read_env_value "$ROOT/.env" "$1")
  if [ -z "$value" ]; then
    print_error "Missing database setting in root .env: $1" >&2
    return 1
  fi
  printf '%s' "$value"
}

compose() {
  local env_args=()
  if [ -f "$ROOT/.env" ]; then
    env_args=(--env-file "$ROOT/.env")
  fi
  APP_ENV="$DB_SITE" db_compose "${env_args[@]}" -f "$COMPOSE_FILE" "$@"
}

run_seed_mode() {
  local mode="$1"
  compose run --rm --no-deps \
    --name "pms-db-${mode}-${DB_SITE}-$$" \
    -e "DB_MANAGE_MODE=$mode" \
    --entrypoint sh migrations -c 'sh scripts/docker-entrypoint-migrate.sh'
}

require_container() {
  if ! check_container; then
    print_error "Container '$CONTAINER_NAME' is not running (APP_ENV=$DB_SITE)."
    print_info "Start the selected site with: bash $START_SCRIPT start"
    return 1
  fi
}

wait_for_postgres() {
  local attempts=0
  while ! db_docker exec "$CONTAINER_NAME" pg_isready >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 30 ]; then
      print_error "PostgreSQL container '$CONTAINER_NAME' did not become ready in 60 seconds."
      return 1
    fi
    sleep 2
  done
}

stop_backup_postgres() {
  if [ "${1:-false}" = true ]; then
    print_info "Stopping the PostgreSQL container started for this backup..."
    if ! compose stop postgres; then
      print_warning "Could not stop '$CONTAINER_NAME'; it may still be running."
    fi
  fi
}

status() {
  print_header
  echo

  if check_container; then
    print_success "PostgreSQL container '$CONTAINER_NAME' is running"
    echo
    print_info "Container Details:"
    db_docker ps --filter "name=^/${CONTAINER_NAME}$" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    echo
    print_info "Connection Test:"
    if db_docker exec "$CONTAINER_NAME" pg_isready >/dev/null 2>&1; then
      print_success "Database is accepting connections"
    else
      print_error "Database is not accepting connections"
    fi
  else
    print_warning "PostgreSQL container '$CONTAINER_NAME' is not running"
  fi

  echo
  print_info "Data Directory: $DATA_DIR"
  if check_data_dir; then
    local data_size
    data_size=$(du -sh "$DATA_DIR" 2>/dev/null | cut -f1)
    print_success "Data exists (Size: $data_size)"
  else
    print_warning "No data found (Database is empty)"
  fi

  echo
  print_info "Volume Status:"
  if db_docker volume inspect "$VOLUME_NAME" >/dev/null 2>&1; then
    print_success "Volume '$VOLUME_NAME' exists"
  else
    print_warning "Volume '$VOLUME_NAME' does not exist"
  fi
  echo
}

reset() {
  print_header
  echo
  print_warning "WARNING: This will delete all database data for APP_ENV=$DB_SITE."
  echo
  read -r -p "Are you sure you want to reset this database? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then
    print_info "Reset cancelled"
    return 0
  fi

  if [ "$DATA_DIR" = "/" ] || [ "$DATA_DIR" = "$ROOT" ]; then
    print_error "Refusing to clear unsafe data directory: $DATA_DIR"
    return 1
  fi

  print_info "Stopping the $DB_SITE Compose stack..."
  compose down
  print_info "Removing database files from: $DATA_DIR"
  mkdir -p "$DATA_DIR"
  shopt -s dotglob nullglob
  local data_items=("$DATA_DIR"/*)
  if [ "${#data_items[@]}" -gt 0 ]; then
    rm -rf -- "${data_items[@]}"
  fi
  print_success "Database reset complete for APP_ENV=$DB_SITE"
  print_info "Start the selected site with: bash $START_SCRIPT start"
}

connect() {
  print_header
  echo
  require_container
  local db_user db_name
  db_user=$(read_database_setting POSTGRES_USER)
  db_name=$(read_database_setting POSTGRES_DB)
  print_info "Connecting to the $DB_SITE database as '$db_user'..."
  db_docker exec -it "$CONTAINER_NAME" psql -U "$db_user" "$db_name"
}

logs() {
  print_header
  echo
  print_info "Showing PostgreSQL logs for $CONTAINER_NAME (Ctrl+C to exit)..."
  db_docker logs -f "$CONTAINER_NAME"
}

seed() {
  print_header
  echo

  if ! check_container; then
    if check_data_dir; then
      print_warning "Database files already exist for APP_ENV=$DB_SITE; skipping seed to protect existing data."
      print_info "The container is stopped, so the script cannot inspect database records. Start it with: bash $START_SCRIPT start"
      return 0
    fi
    require_container
    return 1
  fi

  print_info "Running Prisma seed for APP_ENV=$DB_SITE..."
  run_seed_mode seed
}

force_seed() {
  print_header
  echo
  require_container
  print_warning "WARNING: This will delete all data in the $DB_SITE database and reseed it."
  read -r -p "Are you sure you want to force reseed? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then
    print_info "Force seed cancelled"
    return 0
  fi

  local db_user db_name
  db_user=$(read_database_setting POSTGRES_USER)
  db_name=$(read_database_setting POSTGRES_DB)
  print_info "Resetting and reseeding the $DB_SITE database..."
  db_docker exec -i "$CONTAINER_NAME" psql -U "$db_user" "$db_name" <<EOF
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO $db_user;
GRANT ALL ON SCHEMA public TO public;
EOF
  run_seed_mode force-seed
  print_success "Database reseeded for APP_ENV=$DB_SITE"
}

usage() {
  print_header
  echo
  echo "Usage: bash scripts/db-manage.sh <command> [file]"
  echo "The target site comes from APP_ENV in the root .env file."
  echo "Supported values: local, dev, uat, prod"
  echo
  echo "Commands:"
  echo "  status       Show selected site's database status"
  echo "  reset        Reset selected site's database (deletes all data)"
  echo "  backup       Back up selected site's database"
  echo "  restore      Rehearse custom archive in an isolated disposable database"
  echo "  verify-rollout <archive> <stage>  Check staged rollout and exact history"
  echo "  health       Check app, PostgreSQL, migration completion and /api/health"
  echo "  prune-backups Remove expired verified backups, preserving newest/pinned"
  echo "  connect      Connect to selected site's database (psql)"
  echo "  logs         Show selected site's PostgreSQL logs"
  echo "  seed         Run Prisma seed against the configured DATABASE_URL"
  echo "  force-seed   Delete selected site's data and reseed"
  echo
}

case "${1:-}" in
  status) status ;;
  reset) reset ;;
  backup) node scripts/db-rollout.mjs backup ;;
  restore) node scripts/db-rollout.mjs rehearse "${2:-}" ;;
  verify-rollout) node scripts/db-rollout.mjs verify "${2:-}" "${3:-}" ;;
  health) node scripts/db-rollout.mjs health ;;
  prune-backups) node scripts/db-rollout.mjs prune ;;
  connect) connect ;;
  logs) logs ;;
  seed) seed ;;
  force-seed) force_seed ;;
  *) usage; exit 1 ;;
esac
