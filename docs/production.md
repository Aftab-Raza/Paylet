# Production deployment

## Hosting

Recommended: Ubuntu 24.04 VPS for Docker, managed PostgreSQL 17 in the same private
network, and S3-compatible storage for independent encrypted backups. DigitalOcean
Droplets + Managed PostgreSQL + Spaces is one option. Start around 2 GiB VPS RAM;
builds may need extra RAM or a separate build runner. Compare current prices before
purchasing. A single-node database has backups but no standby for high availability.

This package does not provision hosting, register a domain, or enable provider
backups. To go live, obtain the domain, VPS SSH access, database credentials/CA,
and backup bucket keys. Prefer backup storage under a separate account/provider.

## Infrastructure

Enable MFA on hosting, DNS, Google Cloud, and backup accounts. Keep recovery codes
outside the VPS. Restrict database access to the VPS and administration machines
using provider firewall/trusted-source rules. Use its private connection hostname.
Allow public TCP 80/443, restrict SSH to your IP/VPN, and use SSH keys. Verify key
access before disabling password/root SSH. Enable OS security updates.

Install Docker Engine/Compose using the official Ubuntu instructions. Put the
project in `/opt/paylet`; point the domain's A record to the VPS. Add an AAAA record
only if IPv6 works. Docker group membership grants root-level machine access.
No app/backup container in this setup receives the Docker socket.

## Configure secrets

Copy `.env.production.example` to `.env.production` and replace every placeholder.
Set `APP_DOMAIN` to the hostname without scheme/port/path. Use `chmod 600` on the
secret file. Generate independent session and Restic secrets with
`openssl rand -hex 48`; store the Restic password outside the server too. Without
that password, encrypted backups cannot be recovered. Never reuse local secrets.

Download the database provider's CA to `deploy/certs/ca.crt`. All database URLs
must use `sslmode=verify-full&sslrootcert=/run/db-certs/ca.crt`, the certificate's
hostname, and URL-encoded credentials. Do not disable certificate verification.
Use PostgreSQL 17; change the backup Docker image major version if using a newer
server, because pg_dump cannot back up a newer server major version.

Create separate non-superuser database roles using the provider's administration:

- `paylet_owner`: migration/schema owner, used only by `MIGRATION_DATABASE_URL`.
- `paylet_app`: application table read/write, used by `DATABASE_URL`.
- `paylet_backup`: table SELECT permission, used by `BACKUP_DATABASE_URL`.

After bootstrap, run `deploy/session-table.sql` as the owner before starting the
app. The restricted app role must not create its own session table. As the owner,
grant permissions (adjust names to your provider):

```sql
GRANT CONNECT ON DATABASE paylet TO paylet_app, paylet_backup;
GRANT USAGE ON SCHEMA public TO paylet_app, paylet_backup;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO paylet_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO paylet_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO paylet_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO paylet_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE paylet_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO paylet_app;
ALTER DEFAULT PRIVILEGES FOR ROLE paylet_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO paylet_app;
ALTER DEFAULT PRIVILEGES FOR ROLE paylet_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO paylet_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE paylet_owner IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO paylet_backup;
```

Revoke schema CREATE from PUBLIC where the provider permits it. Register exactly
`https://YOUR_DOMAIN/api/auth/google/callback` on the production Google Web OAuth
client; use its matching ID/secret. Resolve Google testing audience and verification
requirements before opening the app to public users.

## First deployment

```bash
cd /opt/paylet
bash deploy/production.sh build
# NEW, EMPTY database only:
bash deploy/production.sh bootstrap
```

To retain existing users/data, instead restore a custom-format PostgreSQL dump
from the original database into an EMPTY managed database with `pg_restore
--exit-on-error --no-owner --no-privileges`. Preserve original user IDs and all linked
tables; matching emails do not transfer records. Never bootstrap over restored
data. Verify counts/logins and retain the original database until recovery is tested.

Create the session table and role grants above. Initialize the dedicated encrypted
repository once, then test backup and restoration:

```bash
bash deploy/production.sh backup-init
bash deploy/production.sh backup
bash deploy/production.sh restore-test
bash deploy/production.sh deploy
```

`deploy` builds, requires a successful off-server backup, stops traffic during
migrations, then starts containers. A failed migration leaves the app stopped for
diagnosis. Never reset or mark an unexecuted migration applied. Only the proxy
publishes ports. Caddy obtains/renews HTTPS certificates once DNS/ports are correct.

## Scheduled backup and recovery

Enable and verify the managed database's automated backup/PITR settings and actual
recovery window. Restic dumps are daily snapshots; they do not provide continuous
WAL recovery. Configure `BACKUP_MONITOR_URL` as a daily heartbeat with grace period
and missed-run alerts. Add HTTPS uptime, database storage, and disk/connection
alerts. Integrate restore-test service failures with your log/alert system.

After manual backup/restore succeeds:

```bash
sudo cp deploy/systemd/paylet-* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now paylet-backup.timer paylet-restore-test.timer
systemctl list-timers 'paylet-*'
```

Backups run daily at 02:00 UTC (07:30 India time). Restore tests run on the first
day of each month at 03:00 UTC (08:30 India time). Inspect
`journalctl -u paylet-backup.service` and `journalctl -u paylet-restore-test.service`.
Plaintext dumps and restore-test databases live in container tmpfs and are removed
on exit; increase `BACKUP_TMPFS_SIZE` and server RAM as your data grows.

Use a private bucket and narrowly scoped credentials. Prefer separate backup admin
credentials/account. A compromised VPS with delete-capable storage credentials
can delete backups; provider immutability/versioning must be configured and tested
with Restic's locking behavior. With a dedicated repository and maintenance
credentials, apply retention monthly AFTER a successful restore test:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml --profile tools \
  run --rm --entrypoint restic backup forget --host paylet-production --tag postgres \
  --keep-daily 30 --keep-weekly 12 --keep-monthly 12 --prune
```

Restore incidents into a NEW database, verify records/migrations/grants, then switch
connection URLs and recreate the app. Preserve the affected database for diagnosis.
Use provider point-in-time recovery for writes between daily dumps. Daily snapshots
alone can lose up to a day's writes; define acceptable recovery time/data loss.

Before launch verify HTTPS, Secure/HttpOnly/SameSite cookies, Google login,
cross-user access controls, restore success, and alert delivery. Run dependency
security checks and resolve material findings. Local validation is not proof of
live cloud configuration or a completed security audit.

## Local validation performed

The production images were built and an isolated stack was exercised with a
disposable PostgreSQL database and Caddy's local certificate authority. Tests
verified HTTPS and PostgreSQL certificates, security headers, secure session cookies, password
login/logout, cross-origin rejection, OAuth state, a restricted application role,
and expense isolation between two users. Restic backup and restoration recovered
both test users and their expense. No cloud credentials or production user records
were involved. Real Google consent, provider TLS/PITR, off-server storage,
scheduled-job execution, and alert delivery still require live infrastructure.

Sources: [Docker Ubuntu](https://docs.docker.com/engine/install/ubuntu/),
[Caddy HTTPS](https://caddyserver.com/docs/automatic-https),
[PostgreSQL recovery](https://www.postgresql.org/docs/17/continuous-archiving.html),
[Restic](https://restic.readthedocs.io/en/stable/),
[OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Database_Security_Cheat_Sheet.html).
