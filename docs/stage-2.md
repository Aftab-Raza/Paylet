# Stage 2: run Paylet in Docker locally

This Compose setup runs PostgreSQL, the API, and the built React app. Only the
web container publishes a host port; the database and API stay on the private
Compose network. The database uses a named volume so ordinary container rebuilds
retain its data.

## Windows PowerShell

### Build both images only

With Docker Desktop running, from `E:\FinanceTracker`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build-docker.ps1
```

This builds `paylet-backend:latest` and `paylet-frontend:latest` without requiring
database credentials or starting containers. Use the setup below to run the app.

### Repair an existing Docker database password mismatch

If `scripts/check-db.mjs` reports `28P01`, the password stored in the database
does not match the root `.env`. Changing `.env` alone does not update an existing
PostgreSQL volume. From the project root, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\repair-docker-db.ps1
```

This updates the existing Docker database role's password to the value in `.env`
through the container's local socket, checks the connection, and restarts the app.
It preserves tables and data and does not rerun migrations. It tests the configured
role, `paylet_app`, and `postgres` using local socket authentication. If a different
existing role works, it updates `POSTGRES_USER` in the root `.env` to match.
For another original username, pass `-DatabaseUser ORIGINAL_USERNAME` to the script.
It stops if no candidate can log in. Local socket authentication must be enabled.

Install and start Docker Desktop first. From `E:\FinanceTracker`:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `.env`: set a long random hexadecimal `POSTGRES_PASSWORD` (for example `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), a random `SESSION_SECRET`
(at least 32 characters), and the Google OAuth client values. Never commit `.env`.
For a local app without Google sign-in, Google values must still be non-empty
because the current Google router checks them during backend startup. The supplied
`local-disabled` placeholders allow startup but cannot perform Google sign-in. Set the
Google OAuth redirect URI in Google Cloud to exactly:

`http://localhost:8080/api/auth/google/callback`

Compose reads the root `.env`, not `backend/.env`. Your existing host database
is not used. Optional AI credentials (`GROQ_API_KEY`, `GROQ_MODEL`, and
`GROQ_VISION_MODEL`) also go in the root `.env`. Use hexadecimal database passwords
because they are inserted into the connection URL. Keep database credentials
unchanged after the Docker volume is initialized.

Build the images and start PostgreSQL:

```powershell
docker compose build
docker compose up -d --wait db
```

For the initial database only, apply the migrations:

```powershell
docker compose --profile tools run --rm --build migrate
docker compose up -d --wait
docker compose ps
```

Stop if any command fails and inspect its output. Run bootstrap only on a new,
empty Docker database. For partial-bootstrap recovery, see `stage-1.md`.

If sign-in reports Prisma `P2021` and the database contains only `user_sessions`,
the app was started before its tables were initialized. Preserve the session table
and run the guarded bootstrap:

```powershell
docker compose --profile tools run --rm --build migrate --empty-database --allow-session-table
```

This refuses databases containing any other application tables; it is not a
replacement for `prisma migrate deploy` on an already initialized database.

Then open `http://localhost:8080` (use `localhost` for the configured app origin).
Verify the API and database:

```powershell
Invoke-RestMethod http://localhost:8080/api/health
Invoke-RestMethod http://localhost:8080/api/health/db
```

Both should return `status: ok`. Register a test account, log in, add an expense,
refresh, and confirm it remains. Log out and back in to check sessions. Run
`docker compose restart` and confirm the expense persists.

To inspect logs: `docker compose logs -f backend`.
To stop the containers while preserving database data: `docker compose down`.
Do not use `docker compose down -v` unless you intentionally want to erase the
local Docker database volume.

After changing application code on an initialized volume:

```powershell
docker compose build
docker compose stop frontend backend
docker compose --profile tools run --rm --build --entrypoint npx migrate prisma migrate deploy
docker compose up -d --wait
```

Do not rerun the empty-database bootstrap on an initialized volume.

This is local HTTP only. Stage 3 adds automated checks; the later VPS stage will
replace local HTTP with public HTTPS, production OAuth callback, secrets, firewall,
backups, and a deployment workflow. Before using OAuth locally, add the redirect
URI above in the Google console.
