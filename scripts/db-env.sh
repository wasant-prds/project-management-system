#!/bin/sh
# Shared APP_ENV selection for database-management scripts.
# Callers set DB_ROOT before sourcing this file.

db_normalize_env() {
  case "${1:-}" in
    local|dev) printf '%s' "$1" ;;
    uat|prod) printf '%s' "$1" ;;
    *) return 1 ;;
  esac
}

db_read_env_value() {
  env_file=$1
  env_key=$2
  [ -f "$env_file" ] || return 0

  env_value=$(sed -n "s/^[[:space:]]*${env_key}[[:space:]]*=[[:space:]]*//p" "$env_file" | tail -n 1 | tr -d '\r')
  env_value=$(printf '%s' "$env_value" | sed 's/[[:space:]]#.*$//;s/[[:space:]]*$//')
  case "$env_value" in
    \"*\") env_value=${env_value#\"}; env_value=${env_value%\"} ;;
    \'*\') env_value=${env_value#\'}; env_value=${env_value%\'} ;;
  esac
  printf '%s' "$env_value"
}

db_resolve_env() {
  requested=${1:-}
  if [ -z "$requested" ]; then
    requested=$(db_read_env_value "$DB_ROOT/.env" APP_ENV)
  fi
  if [ -z "$requested" ]; then
    requested=${APP_ENV:-}
  fi

  if [ -z "$requested" ]; then
    echo "APP_ENV is not set. Set it in the single root .env file to local, dev, uat, or prod." >&2
    return 1
  fi

  if normalized=$(db_normalize_env "$requested"); then
    printf '%s' "$normalized"
    return 0
  fi

  echo "APP_ENV='$requested' is not supported. Use local, dev, uat, or prod." >&2
  return 1
}

db_compose_file() {
  case "$1" in
    local|dev) printf '%s' "$DB_ROOT/docker-compose.yml" ;;
    uat) printf '%s' "$DB_ROOT/docker-compose.uat.yml" ;;
    prod) printf '%s' "$DB_ROOT/docker-compose.prod.yml" ;;
    *) return 1 ;;
  esac
}

db_running_in_wsl() {
  [ -n "${WSL_INTEROP:-}" ] || {
    [ -r /proc/sys/kernel/osrelease ] && grep -qiE 'microsoft|wsl' /proc/sys/kernel/osrelease
  }
}

db_running_on_windows() {
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
  esac
  db_running_in_wsl
}

db_windows_docker_cli() {
  local candidate
  if [ -n "${DOCKER_WINDOWS_CLI:-}" ] && [ -x "$DOCKER_WINDOWS_CLI" ]; then
    printf '%s' "$DOCKER_WINDOWS_CLI"
    return 0
  fi

  for candidate in \
    '/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe' \
    '/mnt/c/Program Files (x86)/Docker/Docker/resources/bin/docker.exe'; do
    if [ -x "$candidate" ]; then
      printf '%s' "$candidate"
      return 0
    fi
  done

  if command -v docker.exe >/dev/null 2>&1; then
    command -v docker.exe
    return 0
  fi
  return 1
}

db_docker() {
  local windows_docker
  if db_running_in_wsl; then
    if command -v docker >/dev/null 2>&1 && command docker info >/dev/null 2>&1; then
      command docker "$@"
      return $?
    fi

    windows_docker=$(db_windows_docker_cli) || windows_docker=''
    if [ -n "$windows_docker" ]; then
      "$windows_docker" "$@"
      return $?
    fi
  fi

  command docker "$@"
}

db_compose() {
  local windows_docker
  if db_running_in_wsl && ! { command -v docker >/dev/null 2>&1 && command docker info >/dev/null 2>&1; }; then
    windows_docker=$(db_windows_docker_cli) || windows_docker=''
    if [ -n "$windows_docker" ]; then
      local -a compose_args=("$@")
      local i
      for ((i = 0; i < ${#compose_args[@]}; i++)); do
        case "${compose_args[$i]}" in
          --env-file|-f)
            if [ $((i + 1)) -lt ${#compose_args[@]} ]; then
              compose_args[$((i + 1))]=$(wslpath -w "${compose_args[$((i + 1))]}") || return 1
              i=$((i + 1))
            fi
            ;;
        esac
      done
      "$windows_docker" compose "${compose_args[@]}"
      return $?
    fi
  fi

  if db_docker compose version >/dev/null 2>&1; then
    db_docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "Docker Compose is not installed (expected 'docker compose' or 'docker-compose')." >&2
    return 127
  fi
}

db_data_dir() {
  data_dir=$(db_read_env_value "$DB_ROOT/.env" POSTGRES_DATA_DIR)
  data_dir=${data_dir:-./database/postgres/data}
  case "$data_dir" in
    /*) printf '%s' "$data_dir" ;;
    *) printf '%s/%s' "$DB_ROOT" "${data_dir#./}" ;;
  esac
}
