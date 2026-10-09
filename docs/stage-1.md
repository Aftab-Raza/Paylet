# Stage 1: server configuration and fresh-database setup

Existing local database: no migrations, resets, or bootstrap required for these code changes.
Preserve your current backend/.env values. Add HOST=127.0.0.1 and TRUST_PROXY= if missing.
.env.example documents the settings; do not replace your real .env with placeholder credentials.

From E:\FinanceTracker\backend in PowerShell:

```powershell
npm.cmd run build
node --import tsx --test tests/runtimeConfig.test.ts
npm.cmd run dev
```

Check http://localhost:5000/api/health/db, then login and load the dashboard.
Stop the server with Ctrl+C; it should close database pools and exit.

## Production configuration (used in the later Docker stage)

Use NODE_ENV=production, HOST=0.0.0.0, APP_ORIGIN=https://your-real-domain,
and GOOGLE_REDIRECT_URI=https://your-real-domain/api/auth/google/callback.
Register that exact redirect URI with Google. Use separate production credentials
and a random SESSION_SECRET (node -e "console.log(require('crypto').randomBytes(48).toString('hex'))").
Set TRUST_PROXY to the actual reverse proxy IP address or narrowly scoped CIDR.
Leave it empty locally. Do not expose the backend port publicly. The proxy must
set/overwrite X-Forwarded-For and X-Forwarded-Proto. Configure HTTPS and frontend
security headers in the reverse proxy during the Docker stage.

## NEW database only: migration ordering workaround

The expenses migration sorts before the users migration but references users.
Do not rename or edit old migrations already applied to your local database.
The helper runs the exact original users migration first, marks it applied through
Prisma's baseline command, then runs migrate deploy for the remaining migrations.
It refuses any database with existing user tables/views/sequences.

In the later staging/deployment setup, with DATABASE_URL targeting a dedicated
EMPTY PostgreSQL database and no other migration jobs/server running:

```powershell
node scripts/bootstrap-empty-db.mjs --empty-database
npx.cmd prisma generate
npx.cmd prisma migrate status
```

DO NOT run the bootstrap on your current paylet database. Subsequent deployments
use only `npx.cmd prisma migrate deploy`.

If users SQL commits but marking the migration fails, the helper intentionally
refuses a retry. Inspect the target database and `npx.cmd prisma migrate status`.
Only if this helper created users successfully and that migration is not recorded,
run `npx.cmd prisma migrate resolve --applied 20260926080728_create_users`, then
`npx.cmd prisma migrate deploy`. If deploy failed on another migration, diagnose
that migration instead; do not mark unexecuted migrations as applied.

## Validation and remaining deployment gates

Runtime configuration tests and backend build were checked in the working copy.
The original migration SQL was replayed users-first with an isolated PostgreSQL-compatible
engine during the audit. The bootstrap CLI still needs a real, disposable PostgreSQL
smoke test before production use. No existing database was modified here.

Dependency audit remediation, wider authentication/ownership/money tests, Docker,
CI, real HTTPS cookie/Google checks, and backup/restore validation remain separate
work. These files do not constitute a completed production deployment.
