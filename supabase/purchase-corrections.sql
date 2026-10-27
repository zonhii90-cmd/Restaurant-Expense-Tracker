-- Run the WHOLE file after setup.sql, save-purchase.sql, receipt-photos.sql
-- and staff-accounts.sql. Transactional, rerunnable, preserves existing records.
begin;
alter table public.purchases add column if not exists revision integer not null default 1;
alter table public.purchases add column if not exists status text not null default 'active' check (status in ('active','voided'));
create table if not exists public.restaurant_correction_requests (
 id uuid primary key, purchase_id uuid not null references public.purchases(id),
 created_by uuid not null, actor_name text not null, purchase_revision integer not null,
 reason text not null, status text not null default 'pending' check (status in ('pending','corrected','voided','declined')),
 created_at timestamptz not null default now(), resolved_at timestamptz, resolution text
);
create unique index if not exists restaurant_one_pending_request on public.restaurant_correction_requests(purchase_id) where status='pending';
create index if not exists restaurant_requests_date on public.restaurant_correction_requests(created_at desc,id);
create table if not exists public.restaurant_purchase_changes (
 id uuid primary key, purchase_id uuid not null references public.purchases(id),
 actor_id uuid not null, actor_name text not null, action text not null,
 reason text not null, request_id uuid references public.restaurant_correction_requests(id),
 before_data jsonb not null, after_data jsonb not null, command jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists restaurant_changes_purchase on public.restaurant_purchase_changes(purchase_id,created_at,id);
alter table public.restaurant_correction_requests enable row level security;
alter table public.restaurant_purchase_changes enable row level security;
revoke all on public.restaurant_correction_requests,public.restaurant_purchase_changes from public,anon,authenticated;
grant select on public.restaurant_correction_requests,public.restaurant_purchase_changes to authenticated;
drop policy if exists correction_requests_read on public.restaurant_correction_requests;
create policy correction_requests_read on public.restaurant_correction_requests for select to authenticated using
 (public.restaurant_is_active() and exists(select 1 from public.purchases p where p.id=purchase_id));
drop policy if exists purchase_changes_read on public.restaurant_purchase_changes;
create policy purchase_changes_read on public.restaurant_purchase_changes for select to authenticated using
 (public.restaurant_is_active() and exists(select 1 from public.purchases p where p.id=purchase_id));
-- All saved-purchase mutations must go through guarded transactional functions.
revoke insert,update,delete on public.purchases,public.purchase_items from authenticated;
revoke update,delete on public.suppliers,public.items from authenticated;
-- Existing functions already validate the caller, own creator, original payload,
-- immutable photo path and stored object. Run with owner privileges after revoke.
alter function public.restaurant_save_purchase(uuid,date,text,text,text,jsonb) security definer;
create or replace function public.restaurant_save_purchase_with_receipt(
  p_id uuid, p_date date, p_supplier text, p_invoice text, p_notes text,
  p_lines jsonb, p_receipt_path text
)
returns uuid language plpgsql security definer set search_path = ''
as $receipt_save$
declare
  v_purchase uuid;
  v_previous text;
begin
  if not public.restaurant_is_active() then raise exception 'Account is not active' using errcode='42501'; end if;
  -- A photo can be linked only during first creation, never attached later to
  -- an already saved invoice. Retrying an existing identical link is safe.
  if exists(select 1 from public.purchases where id=p_id and created_by=auth.uid() and receipt_path is null) then
    raise exception 'Receipt cannot be attached to an already saved purchase' using errcode='22023';
  end if;
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

-- Block even the original photo RPC from attaching a new photo after a correction.
create or replace function public.restaurant_preserve_purchase_origin()
returns trigger language plpgsql set search_path='' as $origin$
begin
 if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
 or new.request_payload is distinct from old.request_payload then
  raise exception 'Original purchase identity cannot be changed' using errcode='22023';
 end if;
 if old.revision>1 and new.receipt_path is distinct from old.receipt_path then
  raise exception 'Receipt cannot be changed after correction' using errcode='22023';
 end if;
 return new;
end;
$origin$;
revoke all on function public.restaurant_preserve_purchase_origin() from public,anon,authenticated;
drop trigger if exists restaurant_preserve_purchase_origin on public.purchases;
create trigger restaurant_preserve_purchase_origin before update on public.purchases for each row execute function public.restaurant_preserve_purchase_origin();

create or replace function public.restaurant_purchase_snapshot(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $snapshot$
 select jsonb_build_object('id',p.id,'date',p.purchase_date,'supplier',s.name,'invoice',p.invoice_number,
 'notes',p.notes,'receipt_path',p.receipt_path,'created_by',p.created_by,'created_at',p.created_at,
 'entered_by',coalesce(nullif(m.display_name,''),'Restaurant member'),'revision',p.revision,'status',p.status,
 'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'item_id',l.item_id,'name',i.name,
 'quantity',l.quantity::text,'unit',l.unit,'amount',l.total_amount::text) order by l.id)
 from public.purchase_items l join public.items i on i.id=l.item_id where l.purchase_id=p.id),'[]'::jsonb))
 from public.purchases p join public.suppliers s on s.id=p.supplier_id
 left join public.restaurant_members m on m.user_id=p.created_by where p.id=p_id;
$snapshot$;
revoke all on function public.restaurant_purchase_snapshot(uuid) from public,anon,authenticated;

create or replace function public.restaurant_purchase_detail(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $detail$
begin
 if not public.restaurant_is_active() or not exists(select 1 from public.purchases where id=p_id and
 (created_by=auth.uid() or public.restaurant_is_manager())) then
 raise exception 'Purchase access denied' using errcode='42501'; end if;
 return jsonb_build_object('purchase',public.restaurant_purchase_snapshot(p_id),
 'requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from public.restaurant_correction_requests r where purchase_id=p_id),'[]'::jsonb),
 'changes',coalesce((select jsonb_agg(to_jsonb(c)-'command' order by c.created_at desc,c.id) from public.restaurant_purchase_changes c where purchase_id=p_id),'[]'::jsonb));
end;
$detail$;
revoke all on function public.restaurant_purchase_detail(uuid) from public,anon;
grant execute on function public.restaurant_purchase_detail(uuid) to authenticated;

create or replace function public.restaurant_request_correction(p_operation uuid,p_purchase uuid,p_revision integer,p_reason text)
returns void language plpgsql security definer set search_path='' as $request$
declare v_purchase public.purchases%rowtype; v_old public.restaurant_correction_requests%rowtype; v_name text; v_snapshot jsonb;
begin
 if not public.restaurant_is_active() or auth.uid() is null then raise exception 'Account is not active' using errcode='42501'; end if;
 select * into v_purchase from public.purchases where id=p_purchase for update;
 if not found or v_purchase.created_by<>auth.uid() then raise exception 'Only your own purchase can be requested' using errcode='42501'; end if;
 if p_operation is null or p_reason is null or length(trim(p_reason)) not between 1 and 2000 then raise exception 'Enter an explanation (up to 2000 characters)' using errcode='22023'; end if;
 select * into v_old from public.restaurant_correction_requests where id=p_operation;
 if found then
  if v_old.purchase_id=p_purchase and v_old.created_by=auth.uid() and v_old.reason=trim(p_reason) and v_old.purchase_revision=p_revision then return; end if;
  raise exception 'Operation already used' using errcode='22023';
 end if;
 if v_purchase.status<>'active' or v_purchase.revision is distinct from p_revision then raise exception 'Purchase changed. Refresh before requesting a correction.' using errcode='40001'; end if;
 if exists(select 1 from public.restaurant_correction_requests where purchase_id=p_purchase and status='pending') then raise exception 'A correction request is already pending' using errcode='22023'; end if;
 select coalesce(nullif(display_name,''),'Restaurant member') into v_name from public.restaurant_members where user_id=auth.uid();
 v_snapshot:=public.restaurant_purchase_snapshot(p_purchase);
 insert into public.restaurant_correction_requests(id,purchase_id,created_by,actor_name,purchase_revision,reason)
 values(p_operation,p_purchase,auth.uid(),v_name,p_revision,trim(p_reason));
 insert into public.restaurant_purchase_changes(id,purchase_id,actor_id,actor_name,action,reason,request_id,before_data,after_data,command)
 values(p_operation,p_purchase,auth.uid(),v_name,'requested',trim(p_reason),p_operation,v_snapshot,v_snapshot,'{}');
end;
$request$;
revoke all on function public.restaurant_request_correction(uuid,uuid,integer,text) from public,anon;
grant execute on function public.restaurant_request_correction(uuid,uuid,integer,text) to authenticated;

create or replace function public.restaurant_resolve_purchase(p_operation uuid,p_purchase uuid,p_revision integer,p_action text,p_reason text,p_data jsonb default null,p_request uuid default null)
returns void language plpgsql security definer set search_path='' as $resolve$
declare v_purchase public.purchases%rowtype; v_request public.restaurant_correction_requests%rowtype;
 v_old public.restaurant_purchase_changes%rowtype; v_command jsonb; v_before jsonb; v_after jsonb; v_name text;
 v_supplier uuid; v_item uuid; v_line jsonb; v_date date; v_data jsonb;
begin
 if not public.restaurant_is_manager() or auth.uid() is null then raise exception 'Manager access required' using errcode='42501'; end if;
 if p_operation is null or p_action not in ('corrected','voided','declined') or p_action is null
 or p_reason is null or length(trim(p_reason)) not between 1 and 2000 then raise exception 'Enter a valid action and reason' using errcode='22023'; end if;
 select * into v_purchase from public.purchases where id=p_purchase for update;
 if not found then raise exception 'Purchase not found' using errcode='22023'; end if;
 v_command:=jsonb_build_object('purchase',p_purchase,'revision',p_revision,'action',p_action,'reason',trim(p_reason),'data',p_data,'request',p_request);
 select * into v_old from public.restaurant_purchase_changes where id=p_operation;
 if found then
  if v_old.actor_id=auth.uid() and v_old.command=v_command then return; end if;
  raise exception 'Operation already used' using errcode='22023';
 end if;
 if v_purchase.status<>'active' or v_purchase.revision is distinct from p_revision then raise exception 'Purchase changed. Refresh before saving.' using errcode='40001'; end if;
 select * into v_request from public.restaurant_correction_requests where purchase_id=p_purchase and status='pending' for update;
 if p_request is not null and (v_request.id is distinct from p_request or v_request.purchase_revision<>p_revision) then
 raise exception 'Request changed. Refresh before saving.' using errcode='40001'; end if;
 if p_action='declined' and (p_request is null or v_request.id is null) then raise exception 'Select a pending request' using errcode='22023'; end if;
 v_before:=public.restaurant_purchase_snapshot(p_purchase);
 if p_action='corrected' then
  if jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(p_data->'lines') is distinct from 'array' then raise exception 'Invalid correction' using errcode='22023'; end if;
  if jsonb_array_length(p_data->'lines') not between 1 and 100 or coalesce(length(trim(p_data->>'supplier')),0) not between 1 and 200 then raise exception 'Invalid supplier or lines' using errcode='22023'; end if;
  v_date:=(p_data->>'date')::date;
  if v_date is null then raise exception 'Enter a purchase date' using errcode='22023'; end if;
  v_data:=jsonb_build_object('date',v_date,'supplier',trim(p_data->>'supplier'),'invoice',nullif(p_data->>'invoice',''),'notes',nullif(p_data->>'notes',''),'lines',p_data->'lines');
  if v_data=jsonb_build_object('date',v_before->'date','supplier',v_before->'supplier','invoice',v_before->'invoice','notes',v_before->'notes',
   'lines',(select jsonb_agg(value-'id'-'item_id') from jsonb_array_elements(v_before->'lines'))) then raise exception 'No changes to save' using errcode='22023'; end if;
  insert into public.suppliers(name) values(trim(p_data->>'supplier')) on conflict do nothing;
  select id into v_supplier from public.suppliers where lower(trim(name))=lower(trim(p_data->>'supplier'));
  update public.purchases set purchase_date=v_date,supplier_id=v_supplier,invoice_number=nullif(p_data->>'invoice',''),notes=nullif(p_data->>'notes',''),revision=revision+1 where id=p_purchase;
  delete from public.purchase_items where purchase_id=p_purchase;
  for v_line in select value from jsonb_array_elements(p_data->'lines') loop
   if coalesce(length(trim(v_line->>'name')),0) not between 1 and 200
   or coalesce(v_line->>'quantity','') !~ '^[0-9]+([.][0-9]{1,3})?$'
   or coalesce(v_line->>'amount','') !~ '^[0-9]+([.][0-9]{1,2})?$'
   or coalesce(v_line->>'unit','') not in ('kg','g','litre','ml','tin','carton','bag','bottle','pack','piece','tray','box') then raise exception 'Invalid purchase line' using errcode='22023'; end if;
   insert into public.items(name) values(trim(v_line->>'name')) on conflict do nothing;
   select id into v_item from public.items where lower(trim(name))=lower(trim(v_line->>'name'));
   insert into public.purchase_items(purchase_id,item_id,quantity,unit,total_amount)
    values(p_purchase,v_item,(v_line->>'quantity')::numeric,v_line->>'unit',(v_line->>'amount')::numeric);
  end loop;
 elsif p_action='voided' then
  update public.purchases set status='voided',revision=revision+1 where id=p_purchase;
 end if;
 v_after:=public.restaurant_purchase_snapshot(p_purchase);
 -- Numeric spellings and item-line order must not manufacture an amendment.
 if p_action='corrected' and (v_before-'revision'-'lines')=(v_after-'revision'-'lines')
 and (select jsonb_agg(value-'id' order by value->>'item_id',value->>'unit',value->>'quantity',value->>'amount') from jsonb_array_elements(v_before->'lines'))
 = (select jsonb_agg(value-'id' order by value->>'item_id',value->>'unit',value->>'quantity',value->>'amount') from jsonb_array_elements(v_after->'lines')) then
 raise exception 'No changes to save' using errcode='22023'; end if;
 select coalesce(nullif(display_name,''),'Restaurant member') into v_name from public.restaurant_members where user_id=auth.uid();
 if v_request.id is not null and (p_action<>'declined' or p_request=v_request.id) then
  update public.restaurant_correction_requests set status=p_action,resolved_at=now(),resolution=trim(p_reason) where id=v_request.id;
 end if;
 insert into public.restaurant_purchase_changes(id,purchase_id,actor_id,actor_name,action,reason,request_id,before_data,after_data,command)
 values(p_operation,p_purchase,auth.uid(),v_name,p_action,trim(p_reason),v_request.id,v_before,v_after,v_command);
end;
$resolve$;
revoke all on function public.restaurant_resolve_purchase(uuid,uuid,integer,text,text,jsonb,uuid) from public,anon;
grant execute on function public.restaurant_resolve_purchase(uuid,uuid,integer,text,text,jsonb,uuid) to authenticated;

-- Append columns to keep existing clients and dependent views compatible.
create or replace view public.purchase_history with (security_invoker=true) as
select l.id,p.id as purchase_id,p.purchase_date,p.invoice_number,p.created_by,s.id as supplier_id,s.name as supplier_name,
 i.id as item_id,i.name as item_name,l.quantity,l.unit,l.total_amount,round(l.total_amount/l.quantity,4) as unit_price,p.receipt_path,
 p.status,p.revision,p.notes,coalesce(nullif(m.display_name,''),'Restaurant member') as entered_by
from public.purchase_items l join public.purchases p on p.id=l.purchase_id join public.suppliers s on s.id=p.supplier_id
join public.items i on i.id=l.item_id left join public.restaurant_members m on m.user_id=p.created_by;
create or replace view public.monthly_item_summary with (security_invoker=true) as
select date_trunc('month',purchase_date::timestamp)::date as month,item_id,item_name,unit,sum(quantity) as total_quantity,
 sum(total_amount) as total_amount,count(*) as purchase_line_count from public.purchase_history where status='active' group by 1,item_id,item_name,unit;
create or replace view public.monthly_supplier_summary with (security_invoker=true) as
select date_trunc('month',purchase_date::timestamp)::date as month,supplier_id,supplier_name,sum(total_amount) as total_amount,
 count(distinct purchase_id) as invoice_count from public.purchase_history where status='active' group by 1,supplier_id,supplier_name;
notify pgrst,'reload schema';
commit;
