# Password reset deployment

Password recovery requires the new database migration and a configured email sender. No real emails or production database changes are made by the regression tests.

## Before deploying the backend

1. Back up or branch your existing Neon database.
2. From `E:\FinanceTracker\backend`, set `DATABASE_URL` in your terminal to the direct URL for the same Neon branch/database used by Render, then run `npx.cmd --no-install prisma migrate deploy`. Confirm `20261025000100_password_reset` is applied. Do not run migrate reset.
3. Configure these backend environment variables on Render (or in the appropriate local Docker `.env`):

```dotenv
RESEND_API_KEY=your_server_only_resend_key
PASSWORD_RESET_FROM=Paylet <no-reply@your-verified-domain.com>
APP_ORIGIN=https://paylet-iota.vercel.app
```

Keep the existing `APP_ORIGIN` for localhost/Docker testing instead of the production example. Links must use the frontend origin, not the backend URL. Never commit real keys or connection URLs.

4. Verify a sending domain in Resend and use a sender from that domain. A restricted test sender cannot send to arbitrary users. See the official [Resend email documentation](https://resend.com/docs/api-reference/emails/send-email).

Render's free tier blocks the usual SMTP ports, so this implementation uses HTTPS delivery instead of Gmail SMTP. See [Render's free-service limits](https://render.com/docs/free). A domain verified for email sending is separate from the Vercel application URL; you cannot verify a domain you do not control.
5. Deploy the backend, then the frontend. Send a real reset request to your own account and check delivery, including spam. Without sender configuration the app reports that password-reset emails are unavailable.

If production uses separate migration and application database roles, grant the application role access to the new `password_reset_tokens` table using the existing deployment role policy.

## Behavior

- Requests return the same message for registered and unknown addresses. IP limits and a per-account cooldown limit email floods.
- Links last 30 minutes, work once, and contain a random token. Only its SHA-256 hash is stored. The token uses a URL fragment, so it is not included in hosting access logs.
- Resetting a password invalidates all outstanding reset links and existing login sessions. Users sign in normally with the new password.
- Database transactions serialize token creation and consumption. Email bodies, reset tokens, passwords, and keys are never logged.
- Email delivery uses the existing Node runtime and the Resend HTTPS API. No frontend email keys are required. Delivery failures log only a generic message.

Security reference: [OWASP forgot-password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## UI and navigation

The theme toggle remembers the light/dark preference on this device, falling back to the operating-system preference on first visit. Purple is the primary accent, blue identifies secondary actions, and green/red retain their semantic uses.

Dashboard screens use `view=dashboard&screen=people|groups|reports|profile|ai`, with `person` or `group` for details. Browser/phone Back and Forward restore the previous screen. Back closes an open dialog before leaving the underlying screen; a busy dialog waits for its request to finish. Back at the app's entry page retains the browser's normal exit behavior. AI Quick Add asks before discarding an unsaved draft and blocks leaving an unresolved save until its existing retry is confirmed.
