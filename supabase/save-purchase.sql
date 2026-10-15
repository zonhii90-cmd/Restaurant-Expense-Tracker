-- Run once in the same project's SQL Editor after setup.sql.
-- Adds atomic invoice saving. Existing records and access rules are preserved.
begin;

alter table public.purchases add column if not exists request_payload jsonb;

create or replace function public.restaurant_save_purchase(
  p_id uuid,
  p_date date,
  p_supplier text,
  p_invoice text,
  p_notes text,
  p_lines jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $save_purchase$
declare
  v_payload jsonb;
  v_existing jsonb;
  v_supplier uuid;
  v_item uuid;
  v_purchase uuid;
  v_line jsonb;
  v_name text;
begin
  if not public.restaurant_is_active() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;
  if p_id is null or p_date is null or p_supplier is null
     or length(trim(p_supplier)) not between 1 and 200 then
    raise exception 'Invalid invoice header' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'Expected an array of purchase lines' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'Expected 1 to 100 purchase lines' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'date', p_date, 'supplier', trim(p_supplier),
    'invoice', p_invoice, 'notes', p_notes, 'lines', p_lines
  );

  -- Stable browser-generated ID makes a retry safe after a lost response.
  -- Never return another user's invoice, even to a manager using this RPC.
  select request_payload into v_existing from public.purchases
    where id = p_id and created_by = auth.uid();
  if found then
    if v_existing is distinct from v_payload then
      raise exception 'Invoice already saved with different details' using errcode = '22023';
    end if;
    return p_id;
  end if;

  select id into v_supplier from public.suppliers
    where lower(trim(name)) = lower(trim(p_supplier));
  if v_supplier is null then
    insert into public.suppliers(name) values (trim(p_supplier))
      on conflict do nothing returning id into v_supplier;
    if v_supplier is null then
      select id into v_supplier from public.suppliers
        where lower(trim(name)) = lower(trim(p_supplier));
    end if;
  end if;

  insert into public.purchases(id, purchase_date, supplier_id, invoice_number,
    notes, created_by, request_payload)
    values (p_id, p_date, v_supplier, p_invoice, p_notes, auth.uid(), v_payload)
    on conflict (id) do nothing returning id into v_purchase;
  if v_purchase is null then
    select request_payload into v_existing from public.purchases
      where id = p_id and created_by = auth.uid();
    if not found or v_existing is distinct from v_payload then
      raise exception 'Invoice already saved or ID unavailable' using errcode = '22023';
    end if;
    return p_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_name := trim(v_line->>'name');
    if v_name is null or length(v_name) not between 1 and 200
      or coalesce(v_line->>'quantity', '') !~ '^[0-9]+([.][0-9]{1,3})?$'
      or coalesce(v_line->>'amount', '') !~ '^[0-9]+([.][0-9]{1,2})?$'
      or coalesce(v_line->>'unit', '') not in
        ('kg','g','litre','ml','tin','carton','bag','bottle','pack','piece','tray','box') then
      raise exception 'Invalid purchase line' using errcode = '22023';
    end if;

    select id into v_item from public.items
      where lower(trim(name)) = lower(v_name);
    if v_item is null then
      insert into public.items(name) values (v_name)
        on conflict do nothing returning id into v_item;
      if v_item is null then
        select id into v_item from public.items
          where lower(trim(name)) = lower(v_name);
      end if;
    end if;
    insert into public.purchase_items(purchase_id, item_id, quantity, unit, total_amount)
      values (v_purchase, v_item, (v_line->>'quantity')::numeric,
        v_line->>'unit', (v_line->>'amount')::numeric);
  end loop;
  return v_purchase;
end;
$save_purchase$;

revoke all on function public.restaurant_save_purchase(uuid,date,text,text,text,jsonb)
  from public, anon;
grant execute on function public.restaurant_save_purchase(uuid,date,text,text,text,jsonb)
  to authenticated;

commit;
