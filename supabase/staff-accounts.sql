-- Run this whole file after setup.sql in Supabase SQL Editor. Preserves records.
begin;
alter table public.restaurant_members add column if not exists display_name text not null default '';
alter table public.restaurant_members drop constraint if exists restaurant_members_display_name_check;
alter table public.restaurant_members add constraint restaurant_members_display_name_check check (length(display_name) <= 100);
create table if not exists public.restaurant_login_history (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  email text not null, display_name text not null,
  role_at_login text not null check (role_at_login in ('staff', 'manager')),
  access_granted boolean not null, signed_in_at timestamptz not null
);
create index if not exists restaurant_login_history_time_idx on public.restaurant_login_history(signed_in_at desc, id desc);
create index if not exists restaurant_login_history_user_idx on public.restaurant_login_history(user_id, signed_in_at desc);
alter table public.restaurant_login_history enable row level security;
revoke all on public.restaurant_login_history from public, anon, authenticated;
grant select on public.restaurant_login_history to authenticated;
drop policy if exists restaurant_login_history_managers on public.restaurant_login_history;
create policy restaurant_login_history_managers on public.restaurant_login_history for select to authenticated using (public.restaurant_is_manager());
-- Supabase Auth supplies the sign-in time. Browsers cannot insert audit events.
-- Session restoration/page refresh and unchanged timestamps create no new event.
create or replace function public.restaurant_capture_sign_in()
returns trigger language plpgsql security definer set search_path = ''
as $capture_sign_in$
declare v_member public.restaurant_members%rowtype;
begin
  if new.last_sign_in_at is null then return new; end if;
  if tg_op = 'UPDATE' and new.last_sign_in_at is not distinct from old.last_sign_in_at then return new; end if;
  select * into v_member from public.restaurant_members where user_id = new.id;
  insert into public.restaurant_login_history(user_id,email,display_name,role_at_login,access_granted,signed_in_at)
  values (new.id, coalesce(new.email,''), coalesce(nullif(trim(v_member.display_name),''),new.email,''), coalesce(v_member.role,'staff'), coalesce(v_member.active,false),new.last_sign_in_at);
  return new;
end;
$capture_sign_in$;
revoke all on function public.restaurant_capture_sign_in() from public, anon, authenticated;
drop trigger if exists restaurant_sign_in_recorded on auth.users;
create trigger restaurant_sign_in_recorded after insert or update of last_sign_in_at on auth.users for each row execute function public.restaurant_capture_sign_in();
create or replace function public.restaurant_staff_directory()
returns table(user_id uuid,email text,display_name text,role text,active boolean,created_at timestamptz,last_sign_in_at timestamptz)
language plpgsql security definer set search_path = ''
as $staff_directory$
begin
  if not public.restaurant_is_manager() then raise exception 'Manager access required' using errcode='42501'; end if;
  return query select m.user_id,coalesce(u.email,'')::text,m.display_name,m.role,m.active,coalesce(u.created_at,m.created_at),u.last_sign_in_at
    from public.restaurant_members m join auth.users u on u.id=m.user_id order by m.created_at desc,m.user_id;
end;
$staff_directory$;
revoke all on function public.restaurant_staff_directory() from public,anon;
grant execute on function public.restaurant_staff_directory() to authenticated;
-- Managers can change staff only, never themselves or another manager.
-- Inactive membership blocks DB/storage access even with an existing Auth token.
create or replace function public.restaurant_set_staff_active(p_user_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path = ''
as $set_staff_active$
declare v_role text;
begin
  if not public.restaurant_is_manager() then raise exception 'Manager access required' using errcode='42501'; end if;
  if p_active is null or p_user_id is null or p_user_id=auth.uid() then raise exception 'Only staff accounts can be changed' using errcode='22023'; end if;
  select role into v_role from public.restaurant_members where user_id=p_user_id for update;
  if not found or v_role is distinct from 'staff' then raise exception 'Only staff accounts can be changed' using errcode='22023'; end if;
  update public.restaurant_members set active=p_active where user_id=p_user_id;
end;
$set_staff_active$;
revoke all on function public.restaurant_set_staff_active(uuid,boolean) from public,anon;
grant execute on function public.restaurant_set_staff_active(uuid,boolean) to authenticated;
grant select,update on public.restaurant_members to service_role;
notify pgrst,'reload schema';
commit;
