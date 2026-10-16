-- Restaurant Expense Tracker: run this whole file in the Supabase SQL Editor.
-- Intended for this app's new Supabase project. Contains no passwords or keys.
-- Re-running preserves existing records. PostgreSQL 15+ is required.
begin;

create table if not exists public.restaurant_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('staff', 'manager')),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  created_at timestamptz not null default now()
);
create unique index if not exists suppliers_name_unique
  on public.suppliers (lower(trim(name)));

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  created_at timestamptz not null default now()
);
create unique index if not exists items_name_unique
  on public.items (lower(trim(name)));

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_date date not null,
  supplier_id uuid not null references public.suppliers(id),
  invoice_number text check (length(invoice_number) <= 200),
  receipt_path text,
  notes text check (length(notes) <= 2000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.purchases add column if not exists receipt_path text;
create index if not exists purchases_date_idx on public.purchases(purchase_date);
create index if not exists purchases_creator_idx on public.purchases(created_by);
create index if not exists purchases_supplier_idx on public.purchases(supplier_id);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  item_id uuid not null references public.items(id),
  quantity numeric(12,3) not null check (quantity > 0),
  unit text not null check (unit in ('kg', 'g', 'litre', 'ml', 'tin', 'carton', 'bag', 'bottle', 'pack', 'piece', 'tray', 'box')),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  created_at timestamptz not null default now()
);
create index if not exists purchase_items_purchase_idx on public.purchase_items(purchase_id);
create index if not exists purchase_items_item_idx on public.purchase_items(item_id);

-- These helpers read only the current user's membership. SECURITY DEFINER avoids
-- recursive membership policies. No client can change its own membership.
create or replace function public.restaurant_is_active()
returns boolean language sql stable security definer set search_path = ''
return exists (select 1 from public.restaurant_members
  where user_id = auth.uid() and active);
create or replace function public.restaurant_is_manager()
returns boolean language sql stable security definer set search_path = ''
return exists (select 1 from public.restaurant_members
  where user_id = auth.uid() and active and role = 'manager');
revoke all on function public.restaurant_is_active() from public, anon;
revoke all on function public.restaurant_is_manager() from public, anon;
grant execute on function public.restaurant_is_active() to authenticated;
grant execute on function public.restaurant_is_manager() to authenticated;

-- New accounts remain inactive until approved. Creating an account alone
-- must never give a stranger access to restaurant records.
create or replace function public.restaurant_register_user()
returns trigger language plpgsql security definer set search_path = ''
as 'begin insert into public.restaurant_members(user_id) values (new.id) on conflict (user_id) do nothing; return new; end;';
revoke all on function public.restaurant_register_user() from public, anon, authenticated;
drop trigger if exists restaurant_user_created on auth.users;
create trigger restaurant_user_created after insert on auth.users
  for each row execute function public.restaurant_register_user();
-- Include accounts created before this script, without granting access.
insert into public.restaurant_members(user_id)
  select id from auth.users on conflict (user_id) do nothing;

alter table public.restaurant_members enable row level security;
alter table public.suppliers enable row level security;
alter table public.items enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

revoke all on public.restaurant_members, public.suppliers, public.items,
  public.purchases, public.purchase_items from anon, authenticated;
grant select on public.restaurant_members to authenticated;
grant select, insert, update, delete on public.suppliers, public.items,
  public.purchases, public.purchase_items to authenticated;

drop policy if exists members_read on public.restaurant_members;
create policy members_read on public.restaurant_members for select to authenticated
  using (user_id = auth.uid() or public.restaurant_is_manager());

drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers for select to authenticated
  using (public.restaurant_is_active());
drop policy if exists suppliers_add on public.suppliers;
create policy suppliers_add on public.suppliers for insert to authenticated
  with check (public.restaurant_is_active());
drop policy if exists suppliers_manage on public.suppliers;
create policy suppliers_manage on public.suppliers for all to authenticated
  using (public.restaurant_is_manager()) with check (public.restaurant_is_manager());

drop policy if exists items_read on public.items;
create policy items_read on public.items for select to authenticated
  using (public.restaurant_is_active());
drop policy if exists items_add on public.items;
create policy items_add on public.items for insert to authenticated
  with check (public.restaurant_is_active());
drop policy if exists items_manage on public.items;
create policy items_manage on public.items for all to authenticated
  using (public.restaurant_is_manager()) with check (public.restaurant_is_manager());

drop policy if exists purchases_access on public.purchases;
create policy purchases_access on public.purchases for all to authenticated
  using (public.restaurant_is_active() and
    (created_by = auth.uid() or public.restaurant_is_manager()))
  with check (public.restaurant_is_active() and
    (created_by = auth.uid() or public.restaurant_is_manager()));

drop policy if exists purchase_items_access on public.purchase_items;
create policy purchase_items_access on public.purchase_items for all to authenticated
  using (public.restaurant_is_active() and exists (
    select 1 from public.purchases p where p.id = purchase_id
      and (p.created_by = auth.uid() or public.restaurant_is_manager())))
  with check (public.restaurant_is_active() and exists (
    select 1 from public.purchases p where p.id = purchase_id
      and (p.created_by = auth.uid() or public.restaurant_is_manager())));

-- Views preserve the caller's access rules. Managers see all purchases;
-- active staff see only their own. Unlike quantities are never combined.
create or replace view public.purchase_history
with (security_invoker = true) as
select l.id, p.id as purchase_id, p.purchase_date, p.invoice_number,
  p.created_by, s.id as supplier_id, s.name as supplier_name,
  i.id as item_id, i.name as item_name, l.quantity, l.unit,
  l.total_amount, round(l.total_amount / l.quantity, 4) as unit_price,
  p.receipt_path
from public.purchase_items l
join public.purchases p on p.id = l.purchase_id
join public.suppliers s on s.id = p.supplier_id
join public.items i on i.id = l.item_id;

create or replace view public.monthly_item_summary
with (security_invoker = true) as
select date_trunc('month', purchase_date::timestamp)::date as month,
  item_id, item_name, unit, sum(quantity) as total_quantity,
  sum(total_amount) as total_amount, count(*) as purchase_line_count
from public.purchase_history
group by 1, item_id, item_name, unit;

create or replace view public.monthly_supplier_summary
with (security_invoker = true) as
select date_trunc('month', purchase_date::timestamp)::date as month,
  supplier_id, supplier_name, sum(total_amount) as total_amount,
  count(distinct purchase_id) as invoice_count
from public.purchase_history
group by 1, supplier_id, supplier_name;

revoke all on public.purchase_history, public.monthly_item_summary,
  public.monthly_supplier_summary from anon, authenticated;
grant select on public.purchase_history, public.monthly_item_summary,
  public.monthly_supplier_summary to authenticated;

commit;
