# Test Report — Issue #2 "Login check"

**Repo:** https://github.com/mizanurdreamer/MCalendar
**Story (GitHub issue #2):** *Login check*
- Check login success
- Check dashboard page load

## What was built

`tests/e2e/login-dashboard.spec.ts` — a Playwright E2E suite that drives the
real login page and dashboard pages in a live `next dev` server + Chromium:

1. **login succeeds and redirects to the super-admin dashboard, which loads**
   Fills the login form, submits, asserts the URL becomes `/admin/dashboard`,
   asserts the dashboard heading and stat cards render, then reloads the page
   to prove the session cookie set at login actually persists.
2. **login succeeds and redirects a client user to their calendar dashboard**
   Same flow for the `CLIENT` role → `/client/calendar`, asserting the nav
   shows the signed-in user and the calendar grid mounts.
3. **invalid credentials fail login and stay on the login page**
   Confirms a bad login shows an error and does *not* redirect (negative
   control for "login success").

## Result

```
✓ login succeeds and redirects to the super-admin dashboard, which loads
✓ login succeeds and redirects a client user to their calendar dashboard
✓ invalid credentials fail login and stay on the login page
3 passed
```

Run it yourself with `npx playwright test` (HTML report in
`playwright-report/index.html`).

## Sandbox limitation — how the backend was handled

This session's network is allow‑listed and `binaries.prisma.sh` (where
Prisma downloads its query engine) is blocked, so `prisma generate` /
`prisma migrate` cannot run here and the real Postgres-backed API routes
(`/api/auth/login`, `/api/auth/me`, `/api/stats`, `/api/client/calendar-data`)
can't execute. Everything *except* those four endpoints runs for real:
the actual login form, the actual `middleware.ts` role/redirect logic, the
actual server-rendered dashboard layouts, and the actual client-side data
hooks. The four endpoints are intercepted at the network layer
(`page.route`) and fulfilled with realistic payloads, including a
genuinely-signed JWT (same secret/algorithm as `util/jwt.ts`) so the
unmocked middleware really validates it.

One additional local change was needed only to make the dev server boot in
this sandbox: `instrumentation.ts` normally imports the cron jobs at startup,
which import the Prisma client and crash immediately since Prisma couldn't
generate. It's temporarily stubbed to a no-op for this test run so unrelated
cron bootstrapping doesn't block the "Login check" story under test — this
change is not part of the deliverable and should be reverted (or just re-run
`prisma generate` normally in an environment with network access to
binaries.prisma.sh, which removes the need for the stub entirely).

Locally (or in CI with normal network access), this same repo would need no
workaround at all — `prisma generate`, `prisma migrate deploy`, and
`npm run db:seed` would just work, and these same Playwright tests could
additionally be pointed at the real endpoints instead of mocks for full
end-to-end coverage.
