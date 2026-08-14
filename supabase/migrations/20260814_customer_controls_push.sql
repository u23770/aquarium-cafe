-- Aquarium Cafe & Resturant
-- Customer order controls + Web Push subscription queue.
-- Safe to run after the existing v5.1/VAT migrations.

begin;

-- ============================================================
-- 1) Web Push subscription storage
-- ============================================================
create table if not exists public.push_subscriptions (
  id           bigint generated always as identity primary key,
  endpoint     text primary key,
  p256dh       text not null default '',
  auth         text not null default '',
  app_role     text not null default 'customer'
               check (app_role in ('customer', 'waiter')),
  user_id      uuid references auth.users(id) on delete cascade,
  order_id     uuid references public.delivery_orders(id) on delete cascade,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_role
  on public.push_subscriptions (app_role, active);
create index if not exists idx_push_subscriptions_user
  on public.push_subscriptions (user_id, active)
  where user_id is not null;
create index if not exists idx_push_subscriptions_order
  on public.push_subscriptions (order_id, active)
  where order_id is not null;

alter table public.push_subscriptions enable row level security;

-- Browser clients only need to register/update their own endpoint.
drop policy if exists "push: public insert" on public.push_subscriptions;
create policy "push: public insert"
  on public.push_subscriptions for insert
  to anon, authenticated
  with check (
    app_role in ('customer', 'waiter')
    and (user_id is null or auth.uid() = user_id)
  );

drop policy if exists "push: public update" on public.push_subscriptions;
create policy "push: public update"
  on public.push_subscriptions for update
  to anon, authenticated
  using (true)
  with check (
    app_role in ('customer', 'waiter')
    and (user_id is null or auth.uid() = user_id)
  );

-- No public SELECT/DELETE: the Edge Function uses service_role.

-- ============================================================
-- 2) Push event queue
-- ============================================================
create table if not exists public.push_events (
  id          bigint generated always as identity primary key,
  event_type  text not null check (event_type in ('new_order', 'status_change')),
  order_id    uuid not null references public.delivery_orders(id) on delete cascade,
  status      text not null,
  user_id     uuid references auth.users(id) on delete set null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

alter table public.push_events enable row level security;

create or replace function public.queue_delivery_push_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.push_events (event_type, order_id, status, user_id, payload)
    values (
      'new_order',
      new.id,
      new.status,
      new.user_id,
      jsonb_build_object('id', new.id, 'status', new.status, 'customerName', new.customer_name, 'total', new.total)
    );
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.push_events (event_type, order_id, status, user_id, payload)
    values (
      'status_change',
      new.id,
      new.status,
      new.user_id,
      jsonb_build_object('id', new.id, 'status', new.status, 'customerName', new.customer_name, 'total', new.total)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_delivery_push_event on public.delivery_orders;
create trigger trg_delivery_push_event
after insert or update of status on public.delivery_orders
for each row execute function public.queue_delivery_push_event();

-- ============================================================
-- 3) Customer cancellation RPC
--    Allowed only while Received / Accepted.
-- ============================================================
create or replace function public.cancel_delivery_order(
  p_id uuid,
  p_phone text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order delivery_orders%rowtype;
  v_phone text := trim(coalesce(p_phone, ''));
begin
  select * into v_order
    from delivery_orders
   where id = p_id
   for update;

  if not found then
    raise exception 'Delivery order not found.';
  end if;

  if v_order.status not in ('Received', 'Accepted') then
    raise exception 'This order can no longer be cancelled.';
  end if;

  if v_order.user_id is not null then
    if auth.uid() is distinct from v_order.user_id then
      raise exception 'You can only cancel your own order.';
    end if;
  elsif v_phone = '' or regexp_replace(v_phone, '\D', '', 'g') <> regexp_replace(v_order.customer_phone, '\D', '', 'g') then
    raise exception 'Please use the same phone number used for this order.';
  end if;

  -- Return loyalty points exactly once.
  if v_order.loyalty_redeemed > 0 and v_order.user_id is not null then
    insert into loyalty_accounts (user_id, points)
    values (v_order.user_id, 0)
    on conflict (user_id) do nothing;

    update loyalty_accounts
       set points = points + v_order.loyalty_redeemed
     where user_id = v_order.user_id;

    insert into loyalty_transactions (user_id, order_id, delta, balance_after, reason, note)
    select v_order.user_id, v_order.id, v_order.loyalty_redeemed,
           (select points from loyalty_accounts where user_id = v_order.user_id),
           'refund', 'Order cancelled by customer — points returned';
  end if;

  update delivery_orders
     set status = 'Cancelled',
         loyalty_redeemed = 0,
         updated_at = now()
   where id = v_order.id
     and status in ('Received', 'Accepted')
  returning * into v_order;

  if not found then
    raise exception 'This order just changed — refresh and try again.';
  end if;

  insert into delivery_status_history (order_id, status, note, changed_by)
  values (v_order.id, 'Cancelled', 'Order cancelled by customer.', 'customer');

  return jsonb_build_object('id', v_order.id, 'status', v_order.status, 'updatedAt', v_order.updated_at);
end;
$$;

-- ============================================================
-- 4) Customer edit RPC
--    Allowed only while Received / Accepted.
--    Orders with discounts/coupons/loyalty are intentionally blocked
--    so the existing pricing/discount accounting cannot be bypassed.
-- ============================================================
create or replace function public.update_delivery_order(p jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_phone text := trim(coalesce(p ->> 'phone', ''));
  v_name text := trim(coalesce(p ->> 'name', ''));
  v_detail text := trim(coalesce(p ->> 'addressDetail', ''));
  v_maps text := trim(coalesce(p ->> 'mapsLink', ''));
  v_notes text := trim(coalesce(p ->> 'notes', ''));
  v_payment text := coalesce(p ->> 'payment', 'cash');
  v_zone_id bigint := nullif(p ->> 'zoneId', '')::bigint;
  v_subzone_id bigint := nullif(p ->> 'subZoneId', '')::bigint;
  v_order delivery_orders%rowtype;
  v_priced jsonb;
  v_lines jsonb;
  v_subtotal numeric(10,2);
  v_fee numeric(10,2);
  v_vat numeric(10,2);
  v_total numeric(10,2);
  v_cfg jsonb;
  v_min numeric(10,2) := 0;
  v_free numeric(10,2) := 0;
  v_zone record;
  v_subzone record;
  v_subname text := '';
  v_eta integer;
begin
  if v_id is null then raise exception 'Order id is required.'; end if;

  select * into v_order from delivery_orders where id = v_id for update;
  if not found then raise exception 'Delivery order not found.'; end if;

  if v_order.status not in ('Received', 'Accepted') then
    raise exception 'This order can no longer be edited.';
  end if;

  if v_order.discount_amount > 0 or v_order.loyalty_redeemed > 0 or v_order.coupon_code <> '' then
    raise exception 'Orders using discounts or loyalty points cannot be edited yet.';
  end if;

  if v_order.user_id is not null then
    if auth.uid() is distinct from v_order.user_id then
      raise exception 'You can only edit your own order.';
    end if;
  elsif regexp_replace(v_phone, '\D', '', 'g') <> regexp_replace(v_order.customer_phone, '\D', '', 'g') then
    raise exception 'Please use the same phone number used for this order.';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'Please enter your full name.'; end if;
  if char_length(v_phone) < 8 or char_length(v_phone) > 20 then raise exception 'Please enter a valid phone number.'; end if;
  if char_length(v_detail) < 4 or char_length(v_detail) > 500 then raise exception 'Please write your full address.'; end if;
  if char_length(v_maps) > 500 or char_length(v_notes) > 500 then raise exception 'Some fields are too long.'; end if;
  if v_payment not in ('cash', 'card_on_delivery') then raise exception 'Please choose an available payment method.'; end if;

  select value into v_cfg from delivery_settings where key = 'config';
  if v_cfg is not null then
    v_min := coalesce((v_cfg ->> 'min_order')::numeric, 0);
    v_free := coalesce((v_cfg ->> 'free_above')::numeric, 0);
    v_eta := coalesce((v_cfg ->> 'estimated_minutes')::int, v_order.estimated_minutes, 45);
  else
    v_eta := coalesce(v_order.estimated_minutes, 45);
  end if;

  select * into v_zone from delivery_zones where id = v_zone_id and active = true;
  if not found then raise exception 'That delivery zone is unavailable.'; end if;
  v_fee := v_zone.fee;
  if v_zone.free_above > 0 then v_free := v_zone.free_above; end if;

  if v_subzone_id is not null then
    select * into v_subzone from delivery_subzones where id = v_subzone_id and active = true;
    if not found or v_subzone.zone_id <> v_zone_id then raise exception 'Please choose a valid sub zone.'; end if;
    v_fee := v_subzone.delivery_fee;
    v_subname := v_subzone.name_en;
  end if;

  v_priced := public._price_cart(p -> 'items');
  v_lines := v_priced -> 'lines';
  v_subtotal := (v_priced ->> 'subtotal')::numeric;

  if v_min > 0 and v_subtotal < v_min then
    raise exception 'Minimum order for delivery is % EGP — your subtotal is % EGP.', v_min, v_subtotal;
  end if;
  if v_free > 0 and v_subtotal >= v_free then v_fee := 0; end if;

  v_vat := round(greatest(v_subtotal, 0) * 0.14, 2);
  v_total := round(v_subtotal + v_fee + v_vat, 2);

  update delivery_orders
     set customer_name = v_name,
         customer_phone = v_phone,
         address = left(v_zone.name_en || case when v_subname <> '' then ' — ' || v_subname else '' end || ' — ' || v_detail, 700),
         address_detail = v_detail,
         maps_link = v_maps,
         notes = v_notes,
         payment_method = v_payment,
         items = v_lines,
         subtotal = v_subtotal,
         delivery_fee = v_fee,
         vat_amount = v_vat,
         total = v_total,
         zone_id = v_zone_id,
         subzone_id = v_subzone_id,
         estimated_minutes = v_eta,
         updated_at = now()
   where id = v_id
     and status in ('Received', 'Accepted')
  returning * into v_order;

  if not found then raise exception 'This order just changed — refresh and try again.'; end if;

  insert into delivery_status_history (order_id, status, note, changed_by)
  values (v_id, v_order.status, 'Order details updated by customer.', 'customer');

  return jsonb_build_object(
    'id', v_order.id,
    'status', v_order.status,
    'items', v_order.items,
    'subtotal', v_order.subtotal,
    'deliveryFee', v_order.delivery_fee,
    'vatAmount', v_order.vat_amount,
    'total', v_order.total,
    'paymentMethod', v_order.payment_method,
    'updatedAt', v_order.updated_at
  );
end;
$$;

grant execute on function public.cancel_delivery_order(uuid, text) to anon, authenticated;
grant execute on function public.update_delivery_order(jsonb) to anon, authenticated;

-- Realtime already covers delivery_orders; push_events itself stays private.

commit;
