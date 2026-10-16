-- Run this entire file in Supabase > SQL Editor > New query > Run.
-- Run after setup.sql and save-purchase.sql. Safe to re-run; preserves purchases.
begin;

alter table public.purchases add column if not exists receipt_path text;
alter table public.purchases drop constraint if exists purchases_receipt_path_check;
alter table public.purchases add constraint purchases_receipt_path_check check (
  receipt_path is null or receipt_path ~ (
    '^' || created_by::text || '/' || id::text || '/[0-9a-f-]{36}[.]jpg$'
  )
);

-- Keep the bucket private. Only re-encoded JPEGs up to 5 MB are uploaded.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('restaurant-receipts', 'restaurant-receipts', false, 5242880, array['image/jpeg'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- New drafts may upload into their own UUID path before invoice saving.
-- No UPDATE or DELETE policy is granted: receipt files cannot be overwritten.
drop policy if exists restaurant_receipts_upload on storage.objects;
create policy restaurant_receipts_upload on storage.objects for insert to authenticated
with check (
  bucket_id = 'restaurant-receipts'
  and public.restaurant_is_active()
  and name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}[.]jpg$')
);

-- Reading/signing is limited to photos actually linked to a visible invoice.
-- The purchases RLS rules give managers all records and staff their own only.
drop policy if exists restaurant_receipts_read on storage.objects;
create policy restaurant_receipts_read on storage.objects for select to authenticated
using (
  bucket_id = 'restaurant-receipts'
  and public.restaurant_is_active()
  and exists (select 1 from public.purchases p where p.receipt_path = name)
);

-- Add a photo-aware RPC without changing or breaking the original save RPC.
-- Linking and saving the purchase happen in one transaction. Failed uploads
-- never submit an invoice, and failed links roll back all invoice changes.
create or replace function public.restaurant_save_purchase_with_receipt(
  p_id uuid, p_date date, p_supplier text, p_invoice text, p_notes text,
  p_lines jsonb, p_receipt_path text
)
returns uuid language plpgsql security invoker set search_path = ''
as $receipt_save$
declare
  v_purchase uuid;
  v_previous text;
begin
  if not public.restaurant_is_active() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;
  if p_receipt_path is null or p_id is null or p_receipt_path !~ (
    '^' || auth.uid()::text || '/' || p_id::text || '/[0-9a-f-]{36}[.]jpg$'
  ) then
    raise exception 'Invalid receipt path' using errcode = '22023';
  end if;
  v_purchase := public.restaurant_save_purchase(p_id, p_date, p_supplier, p_invoice, p_notes, p_lines);
  select receipt_path into v_previous from public.purchases
    where id = v_purchase and created_by = auth.uid() for update;
  if v_previous is not null and v_previous is distinct from p_receipt_path then
    raise exception 'Invoice already saved with a different receipt' using errcode = '22023';
  end if;
  update public.purchases set receipt_path = p_receipt_path
    where id = v_purchase and created_by = auth.uid();
  if not exists (select 1 from storage.objects
    where bucket_id = 'restaurant-receipts' and name = p_receipt_path
      and metadata->>'mimetype' = 'image/jpeg') then
    raise exception 'Receipt upload not found' using errcode = '22023';
  end if;
  return v_purchase;
end;
$receipt_save$;
revoke all on function public.restaurant_save_purchase_with_receipt(uuid,date,text,text,text,jsonb,text)
  from public, anon;
grant execute on function public.restaurant_save_purchase_with_receipt(uuid,date,text,text,text,jsonb,text)
  to authenticated;

create or replace view public.purchase_history with (security_invoker = true) as
select l.id, p.id as purchase_id, p.purchase_date, p.invoice_number,
  p.created_by, s.id as supplier_id, s.name as supplier_name,
  i.id as item_id, i.name as item_name, l.quantity, l.unit,
  l.total_amount, round(l.total_amount / l.quantity, 4) as unit_price,
  p.receipt_path
from public.purchase_items l
join public.purchases p on p.id = l.purchase_id
join public.suppliers s on s.id = p.supplier_id
join public.items i on i.id = l.item_id;

notify pgrst, 'reload schema';
commit;
