# Restaurant Ledger · Restaurant Expense Tracker

An English-language, mobile-friendly browser app for one restaurant. Staff enter
their purchases in a dedicated staff workspace; managers review all restaurant
purchases in a separate management workspace. Amounts are in Malaysian
ringgit, with calendar dates based on Asia/Kuching.

## Implemented

- Email/password login using Supabase Auth; approved staff and manager roles.
- Manager staff-account creation, activation/deactivation and password resets via
  a server-side Edge Function, plus server-recorded login history. Enable with
  [the staff-account setup guide](docs/staff-accounts.md).
- Supplier, date, optional invoice number and notes, and up to 100 item lines.
- Optional receipt photo: phone camera or photo library, preview/removal before saving,
  private shared storage and a View receipt action in purchase history.
- Each line has item name, quantity, unit, line total and calculated unit price.
- Atomic invoice saving and idempotent retries after an uncertain response.
- Purchase history, month/all-date filtering, item search, supplier filtering.
- Manager monthly item totals grouped by unit, plus supplier spending summaries.
- Real `.xlsx` export with detail, item summary and supplier summary worksheets.
- Database row-level security. No public signup UI or browser-side role editing.
- Automatic record refresh every minute and when the browser window regains focus.
- Phone layouts use fixed bottom navigation, readable purchase/report cards and
  a persistent total/save bar. Inputs use 16px text on phones to avoid iOS focus
  zoom. Adding an item focuses its name; saved invoices offer an Add another action.

## Staff and management workspaces

- Staff accounts open **Add a purchase** by default. Navigation contains only
  **Add purchase** and **My purchases**; the staff record request is scoped to the
  current account, including when a manager uses this workspace.
- Manager accounts open **Dashboard** by default, with monthly spending, invoice,
  supplier and item counts, recent invoices and ranked supplier/item spending.
  Management navigation has **Dashboard**, **Purchases**, **Monthly reports** and
  **Suppliers**, **Staff accounts** and **Login history**. Supplier/item drill-down opens filtered purchase records.
- Managers can use **Staff workspace** to enter an invoice. The staff interface
  has no link back to Management, even when a manager uses it. Managers return
  through their separate management bookmark. Changing the address with unsaved
  changes requires a discard confirmation; staff roles cannot enter Management.
- **View purchase** opens every item from the complete invoice, even when the
  visible list is filtered to one item. Receipt photos are available from the
  list and the invoice details. Computer layouts use tables; phones use cards.
- Bookmark `#/staff/add` or `#/management/dashboard` after the site URL. Staff
  accounts cannot open management screens via bookmarks. Database RLS remains
  the authority for record access; account administration additionally requires `staff-accounts.sql` and the
  `staff-admin` Edge Function; see the setup guide.

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
`supabase/save-purchase.sql`, then `supabase/receipt-photos.sql` to enable private
receipt storage. Configure the first manager and staff as described
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

GitHub Pages deploys changes pushed to `main`. Receipt photos require the new
`receipt-photos.sql` migration in the hosted Supabase project; adding files to
the repository does not apply that migration. Local database tests run PostgreSQL
and browser tests mock Supabase; neither establishes real-device synchronization
or hosted Storage readiness.

Tax accounting, multiple outlets, offline entry, invoice editing
in the app and unit conversion are outside this first version. A carton and a
tin are reported separately; no pack-size assumptions are made.

## Receipt photo setup

For an existing installation, run the **whole**
[`supabase/receipt-photos.sql`](supabase/receipt-photos.sql) file in the project's
Supabase SQL Editor. It adds a private `restaurant-receipts` bucket, scoped storage
policies, a nullable receipt path on invoices and an atomic photo-aware save RPC.
It does not delete purchases or change account membership. No new browser key is
required. Without this migration, purchases without a photo still work; attaching
a photo gives a setup/upload error rather than pretending the image was saved.

One photo is attached per invoice. The browser decodes JPG, PNG, WebP or HEIC/HEIF
(where supported by the device), re-encodes to JPEG with a longest edge of 2400px
and strips metadata. The source limit is 20 MB; uploaded JPEGs must be at most
5 MB. Unsupported images show an error without removing the existing selection.
There is no OCR or automatic item extraction. Physical camera behavior and HEIC
decoding need real-device testing; Chromium file-picker tests do not verify them.

Photos upload before the atomic invoice save. Upload failures leave the form
intact and do not submit the invoice. Stable invoice IDs and immutable random
photo paths allow safe retry after a lost response. A failed/abandoned draft may
leave an **unlinked private object**; it is unreadable through the app's policies.
Do not automatically delete objects after an uncertain save: the transaction may
already have committed. Administrators can remove confirmed old unlinked objects
through Storage after checking `purchases.receipt_path`. Never make the bucket
public. Managers can view linked photos for all purchases; staff can view only
their own. Signed viewing links expire after five minutes.
