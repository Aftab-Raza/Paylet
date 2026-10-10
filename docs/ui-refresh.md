# Paylet UI refresh

The frontend now uses an orange-led light theme with purple AI/invitation actions,
green save/confirmation actions, blue navigation/edit actions, and red void actions.

## Updated flows

- Add and edit an expense in a compact dialog. The amount field receives focus.
  Tab stays within the dialog; Escape closes it when no save is pending.
  Save errors remain in the dialog alongside the entered values.
- Expense history and void confirmation use dialogs.
- Search the displayed month's activity, filter by category, and show voided entries.
  Monthly totals remain totals for the full month, independent of these display filters.
- Add/edit contacts and create groups in dialogs.
- Dashboard quick actions and navigation use labeled Lucide icons.
- Invite to Paylet is available on the dashboard and People screen. Copy the link
  or use native sharing on supported browsers. The link opens account registration.
  It contains no user identifiers or financial information and grants no group access.
- The theme also covers groups, reports, lending, profile, authentication, and AI screens.

## Local testing

Start Docker Desktop, then use the existing local stack:

```powershell
cd E:\FinanceTracker
docker compose up -d --build --wait
```

Open http://localhost:8080. Existing local Docker data stays in its named volume.
The browser tests below use intercepted API responses and never write real records.

```powershell
cd E:\FinanceTracker\frontend
npm ci
npm run build
npm run lint
npx playwright install chromium
npm run test:ui
```

On Windows with Microsoft Edge installed, skip the Chromium download and use:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:ui
Remove-Item Env:\PLAYWRIGHT_CHANNEL
```

Screenshots and failure details go into the ignored `frontend/test-results` directory.
Tests cover expense create/edit payloads, failed-save recovery, modal keyboard behavior,
history, void confirmation, invitation copy/signup, and 320/360/390/768/1440px layouts.

## Publishing

Review and commit the frontend changes and this guide, then push the production branch.
Vercel builds from the frontend directory. No backend environment changes or database
migrations are needed for this update. The existing API proxy and Google callback stay
the same. New invite links generated on production use the production frontend domain.

After deployment, verify one real expense save and the invitation link on the live site.
