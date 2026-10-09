#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
compose=(docker compose --env-file .env.production -f docker-compose.production.yml --profile tools)
case "${1:-}" in
  build)
    "${compose[@]}" config --quiet
    "${compose[@]}" build backend frontend migrate backup
    ;;
  backup-init)
    "${compose[@]}" run --rm --entrypoint restic backup init
    ;;
  backup)
    "${compose[@]}" run --rm backup
    ;;
  restore-test)
    "${compose[@]}" run --rm --entrypoint /scripts/restore-test.sh backup
    ;;
  bootstrap)
    # Dedicated EMPTY production database only; never rerun on existing data.
    "${compose[@]}" run --rm --entrypoint node migrate scripts/bootstrap-empty-db.mjs --empty-database
    ;;
  deploy)
    "${compose[@]}" config --quiet
    "${compose[@]}" build backend frontend migrate backup
    "${compose[@]}" run --rm --no-deps --entrypoint node backend scripts/validate-production.mjs
    # Abort an update if the off-server backup fails.
    "${compose[@]}" run --rm backup
    "${compose[@]}" stop proxy backend
    "${compose[@]}" run --rm migrate
    "${compose[@]}" up -d --wait
    "${compose[@]}" ps
    ;;
  *)
    echo 'Usage: bash deploy/production.sh {build|backup-init|backup|restore-test|bootstrap|deploy}' >&2
    exit 2
    ;;
esac
