# 餐账 · Restaurant Expense Tracker

A Chinese-language, mobile-friendly browser app for one restaurant. Staff enter
their purchases; managers see all restaurant purchases. Amounts are in Malaysian
ringgit, with calendar dates based on Asia/Kuching.

## Implemented

- Email/password login using Supabase Auth; approved staff and manager roles.
- Supplier, date, optional invoice number and notes, and up to 100 item lines.
- Each line has item name, quantity, unit, line total and calculated unit price.
- Atomic invoice saving and idempotent retries after an uncertain response.
- Purchase history, month/all-date filtering, item search, supplier filtering.
- Manager monthly item totals grouped by unit, plus supplier spending summaries.
- Real `.xlsx` export with detail, item summary and supplier summary worksheets.
- Database row-level security. No public signup UI or browser-side role editing.
- Automatic record refresh every minute and when the browser window regains focus.

## Development

Use the existing checkout; cloud tasks are already isolated. No Git worktree is
needed. Node 22+ is required; this workspace was tested with Node 24.

```sh
cd /workspace/Restaurant-Expense-Tracker
npm ci --cache /tmp/restaurant-npm-cache
```

Set these **public browser configuration** variables in environment settings or
an ignored `.env.local` file, based on `.env.example`:

```text
VITE_SUPABASE_URL=https://lqjkyezuqzqerkyccmzo.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your project's sb_publishable_... key>
```

The legacy anon JWT key is supported through `VITE_SUPABASE_ANON_KEY` instead.
Never use a secret key, service-role key, database password or access token in a
`VITE_` variable. These variables are compiled into the public website. The app
rejects service-role JWTs and `sb_secret_` keys as configuration. A publishable
key identifies the project; authentication and database policies protect records.

In Supabase SQL Editor, run `supabase/setup.sql` and then
`supabase/save-purchase.sql`. Configure the first manager and staff as described
in [the database guide](supabase/README.md).

```sh
npm run dev -- --port 5173 --strictPort
```

The production build is generated with `npm run build`. Excel code is loaded
only when exporting; its separate bundle is relatively large.

## Validation

```sh
npm test
npm run build
npm run test:e2e
```

The unit/database suite runs actual PostgreSQL through PGlite. It checks reports,
access rules, account approval, atomic rollback and idempotency. The browser
suite uses Chromium and explicitly mocked Supabase responses, exercising login,
mobile layout, entry, search, reports and Excel download. It does not prove the
hosted Supabase project is connected or correctly configured.

Browser tests use `/usr/bin/chromium`. If installed elsewhere, set
`CHROMIUM_PATH` to your browser binary. No production credentials are used in
tests. Supabase's default 1,000-row API page size is handled through pagination;
keep its API max rows at 1,000 or higher to avoid partial reports.

## Put the app online

For the selected GitHub Pages workflow, follow
[the step-by-step GitHub Pages guide](docs/github-pages.md). The workflow in
`.github/workflows/pages.yml` deploys pushes to `main` after tests and the build
pass. Configure the repository's Actions secret and enable Pages before expecting
a successful deployment. The Vite build uses relative assets for the project URL.

The website is a static Vite app and can be deployed to Vercel, Netlify or another
HTTPS static host. Use `npm ci` to install, `npm run build` to build and `dist`
as the output directory. Set the two public configuration variables in that
host's environment settings **before building**. Changing them requires a new
build/deployment.

The app does not depend on client-side URL routing. Configure Supabase's Auth
Site URL to your production HTTPS address. Create approved users in the dashboard;
password resets and membership management are handled there in this version.
Do not disable RLS to troubleshoot a login or saving error.

## Current handoff

The app and SQL scripts are prepared in this checkout. Hosted Supabase operations,
real-device synchronization and production deployment require the project's
public connection settings and the hosted saving-function migration. Local
browser tests use mocks. Files have not been pushed to GitHub or deployed merely
by creating this checkout.

Receipts/photos, tax accounting, multiple outlets, offline entry, invoice editing
in the app and unit conversion are outside this first version. A carton and a
tin are reported separately; no pack-size assumptions are made.
