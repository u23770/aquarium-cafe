-- ============================================================
--  Staff RBAC foundation (Stage 1 of security remediation)
--  ------------------------------------------------------------
--  Purely additive — does NOT touch any existing table, policy,
--  or grant. Nothing that currently works changes as a result
--  of this migration. This lays the groundwork so that a later,
--  separately-reviewed migration can convert the admin/waiter
--  apps from anonymous access to real authenticated + role-
--  checked access, table by table.
--
--  - public.staff_role: enum ('admin','waiter')
--  - public.staff_profiles: one row per staff Supabase Auth
--    user, mapping them to a role. No client (anon or
--    authenticated) can INSERT/UPDATE/DELETE this table —
--    only SELECT of your own row. Role assignment is done
--    directly against the database by a project admin, so a
--    user can never grant themselves a role.
--  - public.current_staff_role() / is_admin() / is_staff():
--    SECURITY DEFINER helpers, callable by anon/authenticated,
--    that resolve the CALLING user's role from staff_profiles
--    (never from client input). For anon, or any authenticated
--    user with no active staff_profiles row, these safely
--    return false/null.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'staff_role') then
    create type public.staff_role as enum ('admin', 'waiter');
  end if;
end $$;

create table if not exists public.staff_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       public.staff_role not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_profiles enable row level security;

drop policy if exists "staff_profiles: self read" on public.staff_profiles;
create policy "staff_profiles: self read"
  on public.staff_profiles for select
  to authenticated
  using (user_id = (select auth.uid()));
-- Intentionally no INSERT/UPDATE/DELETE policy for anon or
-- authenticated: role assignment is DB-admin-only for now.

create or replace function public.current_staff_role()
returns public.staff_role
language sql stable security definer set search_path to 'public'
as $f$
  select role from public.staff_profiles
  where user_id = (select auth.uid()) and active = true
  limit 1;
$f$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path to 'public'
as $f$
  select coalesce(public.current_staff_role() = 'admin', false);
$f$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path to 'public'
as $f$
  select public.current_staff_role() is not null;
$f$;

grant select on public.staff_profiles to authenticated;
grant execute on function public.current_staff_role() to authenticated, anon;
grant execute on function public.is_admin() to authenticated, anon;
grant execute on function public.is_staff() to authenticated, anon;
