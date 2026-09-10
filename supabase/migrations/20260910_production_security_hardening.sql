-- Aquarium Cafe & Restaurant — production security hardening
-- 2026-09-10
--
-- Moves operator writes from anonymous access to authenticated staff RBAC,
-- restricts order/customer data, and locks privileged RPC execution.
-- This migration is intended for an existing v5.1.x database after
-- 20260909_staff_rbac_foundation.sql.

-- -----------------------------------------------------------------------------
-- 1. Operator CRUD: authenticated admins only
-- -----------------------------------------------------------------------------
do $$
declare r record;
        t text;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and cmd in ('INSERT','UPDATE','DELETE')
      and 'anon' = any(roles)
      and tablename <> 'reviews'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;

  foreach t in array array[
    'settings','website_content','website_sections','website_theme','media_library',
    'categories','products','drivers','delivery_zones','delivery_subzones','discounts',
    'loyalty_settings','notification_settings','gallery','banners','social_links'
  ] loop
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', t||': admin insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t||': admin update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))', t||': admin delete', t);
  end loop;
end $$;

-- Reviews remain customer-submittable, but moderation is admin-only.
drop policy if exists "reviews: anon delete" on public.reviews;
drop policy if exists "reviews: anon update" on public.reviews;
create policy "reviews: admin update" on public.reviews for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "reviews: admin delete" on public.reviews for delete to authenticated
  using ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- 2. Orders and status history: staff or the authenticated order owner only
-- -----------------------------------------------------------------------------
drop policy if exists "delivery: anon read" on public.delivery_orders;
create policy "delivery: staff or owner read" on public.delivery_orders
  for select to authenticated
  using ((select public.is_staff()) or user_id = (select auth.uid()));

drop policy if exists "delivery_hist: anon read" on public.delivery_status_history;
create policy "delivery_hist: staff or owner read" on public.delivery_status_history
  for select to authenticated
  using (
    (select public.is_staff())
    or exists (
      select 1 from public.delivery_orders o
      where o.id = delivery_status_history.order_id
        and o.user_id = (select auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Privileged RPC boundaries
-- -----------------------------------------------------------------------------

-- Internal pricing helper: never expose directly through PostgREST.
revoke execute on function public._price_cart(jsonb) from public, anon, authenticated;

-- Preserve the existing implementation under a non-client name and put the
-- staff authorization check at the public API boundary.
alter function public.advance_delivery(uuid,text,bigint,integer,text,text,text) rename to advance_delivery_legacy;
alter function public.get_overview() rename to get_overview_legacy;
alter function public.reorder_rows(text,bigint[]) rename to reorder_rows_legacy;

create or replace function public.advance_delivery(
  p_id uuid, p_next text, p_driver_id bigint default null, p_eta integer default null,
  p_note text default '', p_temp_name text default '', p_temp_phone text default ''
) returns json language plpgsql security definer set search_path=''
as $$
begin
  if not exists (
    select 1 from public.staff_profiles
    where user_id=(select auth.uid()) and active=true
      and role in ('admin'::public.staff_role,'waiter'::public.staff_role)
  ) then raise exception 'not authorized' using errcode='42501'; end if;
  return public.advance_delivery_legacy(p_id,p_next,p_driver_id,p_eta,p_note,p_temp_name,p_temp_phone);
end;
$$;

create or replace function public.get_overview()
returns json language plpgsql stable security definer set search_path=''
as $$
begin
  if not exists (
    select 1 from public.staff_profiles
    where user_id=(select auth.uid()) and active=true and role='admin'::public.staff_role
  ) then raise exception 'not authorized' using errcode='42501'; end if;
  return public.get_overview_legacy();
end;
$$;

create or replace function public.reorder_rows(p_table text,p_ids bigint[])
returns integer language plpgsql security definer set search_path=''
as $$
begin
  if not exists (
    select 1 from public.staff_profiles
    where user_id=(select auth.uid()) and active=true and role='admin'::public.staff_role
  ) then raise exception 'not authorized' using errcode='42501'; end if;
  return public.reorder_rows_legacy(p_table,p_ids);
end;
$$;

revoke execute on function public.advance_delivery_legacy(uuid,text,bigint,integer,text,text,text) from public,anon,authenticated;
revoke execute on function public.get_overview_legacy() from public,anon,authenticated;
revoke execute on function public.reorder_rows_legacy(text,bigint[]) from public,anon,authenticated;
revoke execute on function public.advance_delivery(uuid,text,bigint,integer,text,text,text) from public,anon;
grant execute on function public.advance_delivery(uuid,text,bigint,integer,text,text,text) to authenticated;
revoke execute on function public.get_overview() from public,anon;
grant execute on function public.get_overview() to authenticated;
revoke execute on function public.reorder_rows(text,bigint[]) from public,anon;
grant execute on function public.reorder_rows(text,bigint[]) to authenticated;

-- Customer order mutation: preserve business logic but require ownership.
alter function public.cancel_delivery_order(uuid) rename to cancel_delivery_order_legacy;
alter function public.edit_delivery_order(uuid,jsonb) rename to edit_delivery_order_legacy;

create or replace function public.cancel_delivery_order(p_order_id uuid)
returns json language plpgsql security definer set search_path=''
as $$
declare v_user uuid := (select auth.uid()); v_owner uuid;
begin
  if v_user is null then raise exception 'Sign in to manage this order.' using errcode='42501'; end if;
  select user_id into v_owner from public.delivery_orders where id=p_order_id;
  if not found then raise exception 'Delivery order not found.'; end if;
  if v_owner is null or v_owner<>v_user then raise exception 'You are not authorized to cancel this order.' using errcode='42501'; end if;
  return public.cancel_delivery_order_legacy(p_order_id);
end;
$$;

create or replace function public.edit_delivery_order(p_order_id uuid,p_items jsonb)
returns json language plpgsql security definer set search_path=''
as $$
declare v_user uuid := (select auth.uid()); v_owner uuid;
begin
  if v_user is null then raise exception 'Sign in to manage this order.' using errcode='42501'; end if;
  select user_id into v_owner from public.delivery_orders where id=p_order_id;
  if not found then raise exception 'Delivery order not found.'; end if;
  if v_owner is null or v_owner<>v_user then raise exception 'You are not authorized to edit this order.' using errcode='42501'; end if;
  return public.edit_delivery_order_legacy(p_order_id,p_items);
end;
$$;

revoke execute on function public.cancel_delivery_order_legacy(uuid) from public,anon,authenticated;
revoke execute on function public.edit_delivery_order_legacy(uuid,jsonb) from public,anon,authenticated;
revoke execute on function public.cancel_delivery_order(uuid) from public,anon;
grant execute on function public.cancel_delivery_order(uuid) to authenticated;
revoke execute on function public.edit_delivery_order(uuid,jsonb) from public,anon;
grant execute on function public.edit_delivery_order(uuid,jsonb) to authenticated;

-- Commission statement: admin-only, server-side calculation.
create or replace function public.calculate_commission_statement(
  p_period_start timestamptz, p_period_end timestamptz
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_sales numeric(12,2); v_commission numeric(12,2); v_orders integer;
begin
  if not exists (
    select 1 from public.staff_profiles
    where user_id=(select auth.uid()) and role='admin'::public.staff_role and active=true
  ) then raise exception 'not authorized' using errcode='42501'; end if;
  if p_period_end <= p_period_start then raise exception 'period_end must be after period_start'; end if;
  if p_period_end > p_period_start + interval '32 days' then raise exception 'commission period cannot exceed 32 days'; end if;
  select coalesce(sum(greatest(subtotal-coalesce(discount_amount,0),0)),0),count(*)::integer
    into v_sales,v_orders
    from public.delivery_orders
   where created_at>=p_period_start and created_at<p_period_end and status<>'Cancelled';
  v_commission:=round(v_sales*0.05,2);
  return jsonb_build_object('period_start',p_period_start,'period_end',p_period_end,
    'order_count',v_orders,'sales_amount',v_sales,'commission_rate',0.05,
    'commission_amount',v_commission);
end;
$$;
revoke execute on function public.calculate_commission_statement(timestamptz,timestamptz) from public,anon;
grant execute on function public.calculate_commission_statement(timestamptz,timestamptz) to authenticated;

-- Policy/trigger helpers are not public API functions.
revoke execute on function public.current_staff_role() from public,anon;
grant execute on function public.current_staff_role() to authenticated;
revoke execute on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated;
revoke execute on function public.is_staff() from public,anon;
grant execute on function public.is_staff() to authenticated;
revoke execute on function public.handle_new_user() from public,anon,authenticated;
revoke execute on function public.send_order_push_webhook() from public,anon,authenticated;

-- New functions should not accidentally become public APIs.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
