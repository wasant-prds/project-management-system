#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

# Keep opt-in Docker/PostgreSQL suites out of the unit report.
case "${1:-}" in
  database-rollout-docker|runtime-container|runtime-docker|seed-docker)
    echo "This reporter runs unit suites only; use the matching existing pnpm test:* suite command." >&2
    exit 2
    ;;
esac

# Keep test discovery and suite selection in the existing root runner.
node --test-reporter=tap tests/run.mjs "$@" | node scripts/format-unit-tests.mjs --stdin
