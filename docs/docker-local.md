# Local Docker Testing

Use Docker Desktop with Linux containers. These instructions preserve the app's existing signup, login, account-linking and finance features. The production Compose file is separate.

## Start

In PowerShell:

```powershell
Set-Location E:\FinanceTracker
docker compose up -d --build --wait
docker compose ps -a
```

Use the existing root `.env`; do not overwrite it from an example. On a new checkout only, copy `.env.example` to `.env`, generate independent random hexadecimal database/session secrets, and fill in your Google credentials. Hexadecimal database passwords avoid special-character escaping in the composed database URL. Docker reads the root `.env`, not `backend/.env`.

The `migrate` container prepares a new database or applies pending migrations to an existing managed schema, then exits successfully. Its `Exited (0)` status is expected. An existing database with no migration history is rejected for manual inspection, never reset or silently baselined.

Open http://localhost:8080. Requests using `127.0.0.1` redirect to this hostname so Google returns to the same browser cookie. Local HTTP uses HttpOnly/SameSite=Lax cookies without Secure; production HTTPS retains Secure cookies.

## Google Sign-In And Sign-Up

In Google Cloud / Google Auth Platform, select the **Web application** OAuth client matching `GOOGLE_CLIENT_ID` in the root `.env`.

- Authorized JavaScript origin: `http://localhost:8080`
- Authorized redirect URI: `http://localhost:8080/api/auth/google/callback`

The redirect URI must match exactly, including the port, path and absence of a trailing slash. Do not register the internal backend hostname or port 5000 for Docker browser login. Keep any `localhost:5173` entries needed for non-Docker development as separate entries.

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` together in root `.env`. If the consent audience is in Testing, add your Google account as a test user. Values of `local-disabled` support password-only local testing but are not real Google credentials.

After editing `.env`, recreate the containers to load the new values:

```powershell
docker compose up -d --build --wait
```

A simple `docker compose restart` does not load changed environment values. Start Google login from the app's button; opening the callback URL directly is correctly rejected as expired because it has no pending session/state.

If you previously created a password account for the same email, the existing app intentionally requires signing in with the password and explicitly linking Google. This behavior is unchanged.

`redirect_uri_mismatch` is a Google Cloud client-setting issue and cannot be repaired by Docker alone. The app now rejects a callback that differs from its configured public origin before serving requests.

## Automated Checks

```powershell
docker compose run --rm --no-deps --entrypoint node migrate --import tsx --test tests/runtimeConfig.test.ts tests/googleConfig.test.ts
docker compose exec -T backend node scripts/test-docker-auth.mjs --allow-test-account
```

The second command creates and removes one temporary account and its sessions. It checks the real frontend proxy, password signup/login/logout, cookie flags, origin protection, Google authorization URL, PKCE, persisted state, cancellation, and replay rejection. It does not sign in to a real Google account or exchange a real Google token; complete that final check in your browser.

## Existing Data And Troubleshooting

The database stays in the named `paylet_db` Docker volume. Ordinary image rebuilds and container restarts do not delete it. A host database or another Docker context has separate data: matching email addresses do not copy records between databases.

Do not run `docker compose down -v` or prune volumes if you want to retain data. Do not change `POSTGRES_USER`, `POSTGRES_DB`, or `POSTGRES_PASSWORD` just because an example uses another value; the existing database keeps its original credentials.

For failures:

```powershell
docker compose logs --tail=80 migrate backend
docker compose run --rm --no-deps backend node scripts/check-db.mjs
```

Never paste `.env`, cookies, Google codes, or secrets into logs/reports. Example files previously contained credentials; revoke/rotate those Google and Groq credentials in their provider consoles and update your private `.env`. Actual `.env` values are not modified by these Docker fixes.

Sources: [Google OAuth web-server setup](https://developers.google.com/identity/protocols/oauth2/web-server), [Docker startup dependencies](https://docs.docker.com/compose/how-tos/startup-order/).
