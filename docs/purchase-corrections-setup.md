# Enable purchase correction requests and change history

The code adds staff correction requests, manager correction/void/decline actions,
full before/after history, status filtering, author/notes in details and Excel,
and active-only reports. Existing purchases start as Active, revision 1.

## Existing installation: one database upgrade

1. Confirm the existing `setup.sql`, `save-purchase.sql`, `receipt-photos.sql` and
   `staff-accounts.sql` upgrades have been applied. Use the same Supabase project
   as the website. Keep a current database backup using your project's available
   backup/export process before applying a schema upgrade.
2. Open Supabase → SQL Editor → New query. Paste and run the **entire**
   [purchase-corrections.sql](../supabase/purchase-corrections.sql) file.
3. The migration is one transaction, rerunnable and preserves existing purchases,
   receipt links and member roles. It adds status/revision, request and history
   tables and guarded RPCs, changes writes to use the guarded functions, and
   updates report views. It does not create users or send messages.
4. Refresh the website. No new browser keys or Edge Function deployment is needed.

Apply this migration **last**. After it is installed, do not rerun the older setup,
save or photo scripts independently: their old view definitions do not include
new columns and their old grants/functions predate the protected-write workflow.
Use the latest migration when reapplying this upgrade. For a new project, run all
four prerequisites in the order above and then this migration last.

Without the upgrade, existing purchase entry and history continue to use the old
backend. Correction controls show an explicit setup error and remain unavailable;
no manager-only saved-purchase write guarantee exists until the upgrade is applied.

## Use

- Staff: My purchases → View purchase → Request correction. Explain what is wrong
  and submit. A pending request does not change purchase amounts. One pending
  request is allowed per purchase; further requests can be made after resolution.
- Manager: Dashboard or Purchases → Correction requests → Review requests.
  The list includes all dates, 25 per page. Review purchase opens the full invoice
  even if its month differs from the currently selected report month.
- Correct purchase: edit the header/complete set of items, add a reason, Review
  changes, then Save correction. Original author, creation time and photo remain.
- Void purchase: enter a reason and confirm. Original amounts remain visible in
  history but no longer count in totals. This version has no restore or delete.
- Decline request: enter a response. The purchase and reports do not change.
- Change history: expand each event in the purchase details. Corrections show full
  before/after content. Requests and outcomes are visible to the purchase owner
  and managers. Sign-in history is separate.
- Purchases has Active / Voided / All filters. Totals use Active purchases even
  when historical voided rows are visible. Excel details include status, author
  and notes; item and supplier summary worksheets exclude Voided rows.

The manager can correct or void an active purchase without waiting for a staff
request. If there is a pending request, the action resolves it in the same
transaction. No first-entry approval queue or external notification is introduced.

## Verify with real accounts after upgrade

1. On a staff device, save a small test purchase with two item lines and a photo.
   Confirm normal entry still succeeds. Request a correction on that purchase.
2. On a manager device, open pending requests and the complete purchase. Correct
   an amount and a purchase date across months, review the difference, and save.
   Confirm old/new monthly totals, author, notes, original photo and change history.
3. On staff, refresh My purchases and confirm the result. Another staff account
   must not see the purchase, request, change history or private photo.
4. Submit another request, decline it with a reason, and confirm totals stay equal.
5. Void the test purchase. Check Active totals and Excel summaries exclude it;
   select All or Voided to find its historical values and still view its photo.
6. Repeated save clicks/retries must not duplicate events; an outdated purchase
   version must require refresh. Check deactivated accounts remain denied.

Local tests use actual PostgreSQL via PGlite and mocked browser HTTP responses.
They do not apply this migration or validate the hosted Supabase project. Failed
or unconfirmed operations show an error and require a refresh before further
changes. Do not disable RLS or grant raw write access to solve a permission error.
