# Connect Paylet On Vercel And Render

Frontend: https://paylet-iota.vercel.app
Backend: https://paylet-backend.onrender.com

The local files now forward `/api/*` through Vercel, preserve the `/api` prefix, and keep SPA pages/assets working. Render's authenticated proxy mode supports HTTPS session cookies while rejecting direct non-health API requests. Existing local Docker settings do not enable this mode.

## 1. Generate One Shared Private Key

Run in PowerShell:

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
Set-Clipboard -Value ([BitConverter]::ToString($bytes).Replace('-', '').ToLower())
$rng.Dispose()
$bytes = $null
```

This copies a new 64-character key to the clipboard without displaying it. Keep that same clipboard value for the next two settings. Do not send it in chat, commit it, or prefix the environment variable with VITE_. Store it privately if you need to recover it later.

## 2. Save Hosting Settings Before Pushing

Vercel -> Paylet project -> Settings -> Environment Variables:

- Key: `ORIGIN_SECRET`
- Value: paste the generated clipboard key
- Environment: Production

Render -> backend service -> Environment:

- `ORIGIN_SECRET`: paste the EXACT SAME clipboard key.
- `TRUST_PROXY`: `render-vercel`.
- Confirm `NODE_ENV=production`.
- Confirm `APP_ORIGIN=https://paylet-iota.vercel.app` (no trailing slash).
- Confirm `GOOGLE_REDIRECT_URI=https://paylet-iota.vercel.app/api/auth/google/callback`.
- Keep the existing private DATABASE_URL, Google credentials and SESSION_SECRET.

Choose **Save only** on Render until the updated code is pushed. The old backend code does not understand the new proxy mode. Render automatically supplies RENDER=true; do not add or change that variable.

The Vercel variable is consumed by a routing header transform, not the browser bundle. The backend checks it before session middleware and trusts forwarding headers only in this explicitly enabled mode. Health checks remain publicly available and do not create login sessions.

## 3. Push The Changes

```powershell
cd E:\FinanceTracker
git status
git add frontend/vercel.json backend/src/lib/cloudProxy.ts backend/src/lib/runtimeConfig.ts backend/src/server.ts backend/tests/cloudProxy.test.ts backend/tests/runtimeConfig.test.ts docs/vercel-render.md
git commit -m "Connect Vercel frontend to Render with secure login sessions"
git push origin main
```

Wait for both provider deployments to finish. If auto-deploy is disabled, deploy the latest Git commit manually on both services. If you changed a hosting variable after deploying, redeploy that provider so it loads the saved value.

## 4. Verify Through The Frontend

Open https://paylet-iota.vercel.app/api/health/db . It must return JSON with `status: ok`, not the app's HTML.

Then test password signup/login, logout, and Google login from https://paylet-iota.vercel.app . Use the stable production address; previews require separate origin/callback configuration and should not share the production database automatically.

In Google Cloud, the same Web OAuth client configured on Render must register exactly:

```text
https://paylet-iota.vercel.app/api/auth/google/callback
```

If the consent audience is in Testing, add your Google account as a test user. An existing password account still requires explicit Google linking, as before.

After proxy mode is enabled, direct requests such as https://paylet-backend.onrender.com/api/auth/google return 403 intentionally. Use the Vercel address for login. Direct backend health checks remain available to Render.

For a 403 through Vercel, check the two ORIGIN_SECRET values are identical and both services deployed the latest commit. For HTML at the API health URL, check Vercel's root directory is `frontend` and the latest frontend/vercel.json was deployed. For startup failure, inspect Render's logs without posting credentials.

## Validation Performed

Both Docker app images built. Ten regression tests passed, including Secure/HttpOnly/SameSite=Lax cookie issuance, rejection of missing/incorrect proxy keys, HTTPS enforcement, health-check bypass, trusted visitor IP handling, Google callback validation, and unchanged local proxy defaults. The currently deployed backend returned database health status ok before these changes were published.

Live proxy/login verification remains pending until you save the hosting keys and push/redeploy. No production user account was created or database schema changed by this work.

Sources: [Vercel external routing and private origin headers](https://vercel.com/docs/routing/rewrites), [Render environment marker](https://render.com/docs/environment-variables).

