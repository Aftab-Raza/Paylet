#!/bin/bash
set -euo pipefail
umask 077
mkdir -p "${RESTIC_CACHE_DIR:-/tmp/restic-cache}"
restore_dir=$(mktemp -d /tmp/paylet-restore.XXXXXX)
cleanup() {
    pg_ctl -D "$restore_dir/data" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$restore_dir"
}
trap cleanup EXIT
# Restore only inside this disposable container; never use PGDATABASE's target.
restic check
restic dump --host paylet-production --tag postgres latest /tmp/paylet-backup/paylet.dump > "$restore_dir/paylet.dump"
initdb -D "$restore_dir/data" --auth-local=trust --auth-host=reject >/dev/null
pg_ctl -D "$restore_dir/data" -l "$restore_dir/postgres.log" \
    -o "-c listen_addresses='' -k $restore_dir" -w start >/dev/null
createdb --host="$restore_dir" --username=postgres paylet_restore_test
pg_restore --host="$restore_dir" --username=postgres --dbname=paylet_restore_test \
    --exit-on-error --no-owner --no-privileges "$restore_dir/paylet.dump"
psql -X --host="$restore_dir" --username=postgres --dbname=paylet_restore_test \
    -v ON_ERROR_STOP=1 -c 'SELECT count(*) AS users FROM users; SELECT count(*) AS expenses FROM expenses;'
echo "Backup restored and queried successfully in a disposable database."
