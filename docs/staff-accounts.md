# Enable staff accounts and login history

This upgrade adds **Staff accounts** and **Login history** to Management. The
frontend alone cannot create Auth users. Enable the SQL and Edge Function below
in the existing Supabase project. Existing purchases and manager roles remain.

## 1. Run the SQL

Open Supabase > SQL Editor > New query. Paste the entire
[`supabase/staff-accounts.sql`](../supabase/staff-accounts.sql) file and click Run.
The script is transactional and safe to rerun. It adds a display name, manager-only
account directory/status RPCs, an append-only login table and an Auth user trigger.
It does not send emails, create accounts, reset passwords or change existing roles.

## 2. Deploy staff-admin

Open Supabase > Edge Functions and create a new function **via the editor**.
Name it exactly **staff-admin**. Replace the sample code with the entire
[`index.ts`](../supabase/functions/staff-admin/index.ts) file and deploy.
No imported files or external packages are required.

Turn **Verify JWT / Enforce JWT verification** off for this function if that
setting is shown. This is intentional: the function itself calls Auth's user
verification endpoint with the caller's bearer token, then checks their current
active manager membership before any admin operation. It supports projects using
new signing keys without depending on legacy gateway verification. The equivalent
CLI configuration is in `supabase/config.toml` (`verify_jwt = false`).

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` inside hosted
Edge Functions. Leave these server-side. Never copy a service key into a browser
variable, GitHub Pages secret starting with VITE_, chat, screenshot or source file.
The browser uses its signed-in user's token and the existing publishable key only.
No additional public browser variables are required.

CLI alternative, **only when already authenticated for this project**:

```sh
supabase functions deploy staff-admin --project-ref lqjkyezuqzqerkyccmzo --no-verify-jwt
```

The handler permits stocklog.online, www.stocklog.online and the prior GitHub
Pages origin. CORS is supplementary; Auth verification and fresh manager checks
are mandatory for every request, including requests without an Origin header.

## 3. Verify using your own accounts

1. Sign out and sign back in as an active manager. Open Login history and check
   your name/email and the Malaysia time (UTC+8).
2. Open Staff accounts > Add staff. Enter a staff name, email and initial password
   of 12–128 characters meeting the project's Auth password policy.
3. Share the details privately. The password is never shown in account lists;
   no automatic email is sent. This version does not force a first-login reset.
4. On a second device, sign in with the staff account. Confirm it opens the staff
   workspace and cannot access Management. Check the new sign-in in Management.
5. Deactivate that staff account and verify data access is blocked. Existing
   tokens may remain valid for authentication, but database/storage RLS denies
   access immediately; the UI rechecks membership on focus and every minute.
6. Reset a staff password if required. Manager/self accounts cannot be reset or
   deactivated through these staff controls. Manager administration remains in
   the Supabase dashboard.

Account creation is intentionally server-only and staff-only. If an operation
cannot be confirmed, refresh the account list before retrying. Email uniqueness
prevents duplicate Auth users. A created account whose activation was not
confirmed remains available for manager review: check its status and activate it
if appropriate. The handler never deletes an account to compensate for an
ambiguous network response and never silently adopts an existing email.

## What login history means

The trigger records changes to Supabase Auth's `auth.users.last_sign_in_at`.
New successful authentication is recorded on the server, including sign-ins by
inactive accounts (marked **Blocked** for restaurant access). The name, email,
role and access status are snapshots at sign-in, not editable browser fields.
Regular session restoration and page refresh do not create fake sign-in events.
Incorrect-password attempts, page visits, online presence, IP addresses and device
information are not recorded here. There is no reconstructed historical timeline;
recording begins when this migration is applied. Account lists can still show the
most recent earlier sign-in supplied by Auth. Audit rows persist if an Auth user
is later deleted; no deletion action is provided in the app.

Managers can filter by month/account and page through 50 events at a time. The
history refreshes every minute while visible. Anonymous visitors, staff and
inactive managers cannot read login events or the account directory, and browser
clients cannot insert, edit or delete audit events. The trigger and its insert
run inside the Auth transaction: investigate migration/permission errors if an
Auth sign-in fails after changing server configuration; never disable RLS.

## Verification limits

`npm test` executes the handler with mocked Auth/admin HTTP responses and runs
SQL access/trigger tests in real PostgreSQL through PGlite. `npm run test:e2e`
checks the UI using mocked Supabase responses. `npm run build` type-checks the
handler through its test import as well as the app. These checks do not deploy
or validate hosted Supabase Auth/Edge Functions. Real hosted creation, sign-in
logging, deactivation and password reset require the verification steps above.
