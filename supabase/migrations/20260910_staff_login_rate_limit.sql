-- Aquarium Cafe & Restaurant — distributed staff login throttling
-- 2026-09-10
-- Keeps the staff access-code endpoint from relying on per-instance memory.
-- Limit: 8 requests per source IP per 10-minute window; stale rows are cleaned up.

create table if not exists public.staff_login_rate_limits (
  ip text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint staff_login_rate_limits_attempt_count_chk check (attempt_count >= 0)
);

alter table public.staff_login_rate_limits enable row level security;
revoke all on table public.staff_login_rate_limits from public, anon, authenticated;
grant all on table public.staff_login_rate_limits to service_role;

create or replace function public.consume_staff_login_attempt(p_ip text)
returns boolean
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_now timestamptz := now();
  v_allowed boolean;
begin
  if p_ip is null or length(trim(p_ip)) = 0 or length(p_ip) > 128 then
    return false;
  end if;

  insert into public.staff_login_rate_limits(ip, window_started_at, attempt_count, updated_at)
  values (trim(p_ip), v_now, 1, v_now)
  on conflict (ip) do update
    set window_started_at = case
      when public.staff_login_rate_limits.window_started_at <= v_now - interval '10 minutes'
        then v_now
      else public.staff_login_rate_limits.window_started_at
    end,
    attempt_count = case
      when public.staff_login_rate_limits.window_started_at <= v_now - interval '10 minutes'
        then 1
      else public.staff_login_rate_limits.attempt_count + 1
    end,
    updated_at = v_now;

  select attempt_count <= 8
    into v_allowed
    from public.staff_login_rate_limits
   where ip = trim(p_ip);

  delete from public.staff_login_rate_limits
   where updated_at < v_now - interval '30 minutes';

  return coalesce(v_allowed, false);
end;
$$;

revoke execute on function public.consume_staff_login_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_staff_login_attempt(text) to service_role;
