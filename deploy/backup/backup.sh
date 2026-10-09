#!/bin/bash
set -euo pipefail
umask 077
export PGCONNECT_TIMEOUT=15
: "${PGDATABASE:?Database URL is required}"
: "${RESTIC_REPOSITORY:?Backup repository is required}"
: "${RESTIC_PASSWORD:?Backup encryption password is required}"

notify() {
    if [ -n "${BACKUP_MONITOR_URL:-}" ]; then
        curl --fail --silent --max-time 15 --retry 2 "${BACKUP_MONITOR_URL}$1" >/dev/null 2>&1 || return 1
    fi
}
trap 'notify /fail || true; echo "Backup failed; inspect the job and repository." >&2' ERR
notify /start || true
mkdir -p /tmp/paylet-backup
trap 'rm -f /tmp/paylet-backup/paylet.dump' EXIT
pg_dump --dbname="$PGDATABASE" --format=custom --no-owner --no-privileges --file=/tmp/paylet-backup/paylet.dump
pg_restore --list /tmp/paylet-backup/paylet.dump >/dev/null
restic backup --host paylet-production --tag postgres /tmp/paylet-backup/paylet.dump
restic snapshots --host paylet-production --tag postgres --latest 1
notify ''
echo "Encrypted database backup completed."
