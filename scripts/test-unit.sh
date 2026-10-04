#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

# `local` is an explicit alias for the complete local unit suite.
if [[ "${1:-}" == "local" ]]; then
  shift
fi

# The full suite uses Node 22+ syntax/APIs. PowerShell's `bash` may start WSL,
# where `node` can be older than the Windows Node installation.
NODE_RUNNER="node"
TEST_RUNNER_PATH="tests/run.mjs"
NODE_VERSION="$("${NODE_RUNNER}" --version 2>/dev/null || true)"
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"

if ! [[ "${NODE_MAJOR}" =~ ^[0-9]+$ ]] || (( NODE_MAJOR < 22 )); then
  WINDOWS_NODE="$(command -v node.exe || true)"
  if [[ -n "${WINDOWS_NODE}" ]]; then
    NODE_VERSION="$("${WINDOWS_NODE}" --version 2>/dev/null || true)"
    NODE_MAJOR="${NODE_VERSION#v}"
    NODE_MAJOR="${NODE_MAJOR%%.*}"
    if [[ "${NODE_MAJOR}" =~ ^[0-9]+$ ]] && (( NODE_MAJOR >= 22 )); then
      if [[ "${ROOT}" =~ ^/mnt/([[:alpha:]])/(.*)$ ]]; then
        NODE_RUNNER="${WINDOWS_NODE}"
        WINDOWS_DRIVE="${BASH_REMATCH[1]^^}"
        WINDOWS_ROOT="${BASH_REMATCH[2]//\//\\}"
        TEST_RUNNER_PATH="${WINDOWS_DRIVE}:\\${WINDOWS_ROOT}\\tests\\run.mjs"
      fi
    fi
  fi
fi

NODE_VERSION="$("${NODE_RUNNER}" --version 2>/dev/null || true)"
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
if ! [[ "${NODE_MAJOR}" =~ ^[0-9]+$ ]] || (( NODE_MAJOR < 22 )); then
  echo "This unit suite requires Node.js 22 or newer; found ${NODE_VERSION:-no Node.js}." >&2
  echo "In WSL, install Node.js 22+ or make a Windows Node.js 22+ executable available as node.exe." >&2
  exit 2
fi

# Keep opt-in Docker/PostgreSQL suites out of the unit report.
case "${1:-}" in
  database-rollout-docker|runtime-container|runtime-docker|seed-docker|sql-migrations-docker)
    echo "This reporter runs unit suites only; use the matching existing pnpm test:* suite command." >&2
    exit 2
    ;;
esac

# Keep test discovery and suite selection in the existing root runner.
"${NODE_RUNNER}" --test-reporter=tap "${TEST_RUNNER_PATH}" "$@" | node scripts/format-unit-tests.mjs --stdin
