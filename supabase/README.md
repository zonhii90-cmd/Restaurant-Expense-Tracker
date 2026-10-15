# Restaurant database setup

This is the database foundation for the browser app. Creating these files does
not modify your Supabase project. Run the scripts there through SQL Editor.

## Run in your new Supabase project

1. Open `setup.sql` and copy all its contents.
2. In your Restaurant Expense Tracker Supabase project, open **SQL Editor** and
   choose **New query**.
3. Paste the script and click **Run**. The expected result is a success message.
   Supabase may ask you to confirm a destructive operation: this script replaces
   its own trigger and access policies but does not delete purchase data or tables.
4. Open **Table Editor**. You should see `restaurant_members`, `suppliers`, `items`,
   `purchases`, and `purchase_items`.
5. Open another query, paste all of `save-purchase.sql`, and click **Run**. This
   adds the atomic invoice-saving function used by the app. Both scripts are
   required for a new project. If the tables are already installed, only the
   second script is needed to add this feature.

Only run this in the new project intended for this app. It uses tables in the
`public` schema. Re-running it on the same schema preserves saved records.

## Account setup comes next

New accounts start **inactive**. An unapproved signup cannot access restaurant
records. The project owner must approve staff and designate the first manager
using the Supabase dashboard. In Authentication, create your own login; its user
ID will appear in Table Editor > restaurant_members. Edit **your own row** to set
`role` to `manager` and `active` to `true`. This is an app login, not the password
you used to create the database. Do not share any passwords or secret keys.

Staff accounts should have `role = staff` and `active = true` after you approve
them. Keep public signup disabled if you want to create accounts yourself.
Membership cannot be changed through the browser client. Account administration
is through the Supabase dashboard for this initial version.

## What the database supports

- One restaurant with shared supplier and item lists; amounts are in RM.
- One purchase header for an invoice, with multiple purchased item lines.
- Positive decimal quantities and nonnegative amounts with two decimal places.
- Consistent item names regardless of capitalization or surrounding spaces.
- Purchase history, monthly item totals, and monthly supplier totals as views.
- Separate totals for each unit: tins, cartons, and kg are not added together.
- Active staff can create suppliers/items and read or edit their own purchases.
- Active managers can read or edit all purchases and maintain supplier/item lists.
- Anonymous visitors and inactive accounts cannot read restaurant records.

Supplier and item names should be reused rather than creating alternative
spellings. `save-purchase.sql` saves each invoice and all its lines in a single
transaction, with a stable client-generated ID to protect retries from duplicates.
Excel generation is implemented in the browser app, not the database.
