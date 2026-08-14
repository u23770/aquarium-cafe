-- ═══════════════════════════════════════════════════════════════════
--  AQUARIUM CAFE & RESTURANT — platform v4
--  MIGRATION: v3 (menta) → v4 (aquarium)
--  Date: 2026-08-02
--
--  WHAT THIS DOES (all IDEMPOTENT — safe to run more than once):
--    1. creates the 11 new v4 tables (drivers, delivery_orders, …)
--    2. widens the status sets (orders gain Accepted + Cancelled,
--       reservations gain the Seated step, settings allow 2000 chars)
--    3. adds all new indexes and updated_at triggers
--    4. replaces the flow RPCs (advance_order / reservation triggers)
--       and installs the delivery RPCs + the richer get_overview()
--    5. enables RLS on the new tables and (re)installs their policies
--    6. registers realtime + the "media" storage bucket
--    7. seeds reference data ONLY where the row/table is missing
--       (your existing identity, menu, orders and theme are untouched)
--    8. OPTIONAL: if the menu is EMPTY it seeds the real Aquarium menu
--       (70 products with the photographed paper-menu prices)
--
--  Run in: Supabase Dashboard → SQL Editor → New query → paste → Run.
--  A full fresh install can simply run supabase/schema.sql instead.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────── 1 · NEW TABLES ─────────────────────────────

create table if not exists public.social_links (
  id         bigint generated always as identity primary key,
  platform   text not null check (platform ~ '^[a-z][a-z0-9_]{0,19}$') unique,
  url        text not null default '' check (char_length(url) <= 500),
  visible    boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 2 and 60),
  phone      text not null check (char_length(phone) between 8 and 20),
  active     boolean not null default true,
  notes      text not null default '' check (char_length(notes) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_settings (
  key   text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null default '{}'::jsonb
);

create table if not exists public.reservation_settings (
  key   text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null default '{}'::jsonb
);

create table if not exists public.notification_settings (
  key   text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null default '{}'::jsonb
);

create table if not exists public.delivery_orders (
  id                uuid primary key default gen_random_uuid(),
  customer_name     text not null check (char_length(customer_name) between 2 and 80),
  customer_phone    text not null check (char_length(customer_phone) between 8 and 20),
  address           text not null check (char_length(address) between 4 and 300),
  maps_link         text not null default '' check (char_length(maps_link) <= 500),
  notes             text not null default '' check (char_length(notes) <= 500),
  payment_method    text not null default 'cash'
    check (payment_method in ('cash', 'card_on_delivery')),
  items             jsonb not null default '[]'::jsonb,
  subtotal          numeric(10,2) not null default 0,
  delivery_fee      numeric(10,2) not null default 0,
  total             numeric(10,2) not null default 0,
  status            text not null default 'Received'
    check (status in ('Received', 'Accepted', 'Preparing', 'Ready',
                      'Out for Delivery', 'Delivered', 'Cancelled')),
  driver_id         bigint references public.drivers(id) on delete set null,
  estimated_minutes integer check (estimated_minutes between 5 and 240),
  delivery_note     text not null default '' check (char_length(delivery_note) <= 300),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.delivery_status_history (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.delivery_orders(id) on delete cascade,
  status     text not null,
  note       text not null default '',
  changed_by text not null default 'staff',
  created_at timestamptz not null default now()
);

create table if not exists public.driver_locations (
  id         bigint generated always as identity primary key,
  driver_id  bigint not null references public.drivers(id) on delete cascade,
  lat        numeric(9,6) not null,
  lng        numeric(9,6) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.gallery (
  id         bigint generated always as identity primary key,
  image      text not null check (char_length(image) <= 500),
  title      text not null default '' check (char_length(title) <= 120),
  visible    boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id            bigint generated always as identity primary key,
  customer_name text not null check (char_length(customer_name) between 2 and 60),
  rating        integer not null check (rating between 1 and 5),
  text          text not null check (char_length(text) between 4 and 600),
  source        text not null default 'website' check (char_length(source) <= 20),
  approved      boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.banners (
  id         bigint generated always as identity primary key,
  title      text not null check (char_length(title) <= 120),
  subtitle   text not null default '' check (char_length(subtitle) <= 200),
  image      text not null default '' check (char_length(image) <= 500),
  cta_text   text not null default '' check (char_length(cta_text) <= 40),
  cta_link   text not null default '' check (char_length(cta_link) <= 300),
  visible    boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);


-- ───────────────────── 2 · WIDEN STATUS SETS & LIMITS ─────────────
-- orders gain 'Accepted' + 'Cancelled'
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('New', 'Accepted', 'Preparing', 'Ready', 'Delivered', 'Cancelled'));

-- reservations gain the 'Seated' step
alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations add constraint reservations_status_check
  check (status in ('Pending', 'Confirmed', 'Seated', 'Completed', 'Cancelled'));

-- settings values up to 2000 chars (features json, business_todo checklist)
alter table public.settings drop constraint if exists settings_value_check;
alter table public.settings add constraint settings_value_check
  check (char_length(value) <= 2000);


-- ───────────────────── 3 · INDEXES ────────────────────────────────
create index if not exists idx_orders_active        on public.orders (created_at)
  where status not in ('Delivered', 'Cancelled');
create index if not exists idx_reservations_open    on public.reservations (reservation_date, reservation_time)
  where status in ('Pending', 'Confirmed', 'Seated');
create index if not exists idx_socials_order        on public.social_links (sort_order, id);
create index if not exists idx_drivers_active       on public.drivers (id) where active = true;
create index if not exists idx_delivery_status      on public.delivery_orders (status, created_at desc);
create index if not exists idx_delivery_active      on public.delivery_orders (created_at)
  where status not in ('Delivered', 'Cancelled');
create index if not exists idx_delivery_driver      on public.delivery_orders (driver_id);
create index if not exists idx_delivery_phone       on public.delivery_orders (customer_phone);
create index if not exists idx_delivery_hist_order  on public.delivery_status_history (order_id, created_at);
create index if not exists idx_driver_loc_driver    on public.driver_locations (driver_id, created_at desc);
create index if not exists idx_gallery_order        on public.gallery (sort_order, id);
create index if not exists idx_reviews_approved     on public.reviews (created_at desc) where approved = true;
create index if not exists idx_banners_order        on public.banners (sort_order, id);


-- ───────────────────── 4 · TRIGGERS ───────────────────────────────
drop trigger if exists trg_drivers_touch  on public.drivers;
create trigger trg_drivers_touch  before update on public.drivers
  for each row execute function public.set_updated_at();

drop trigger if exists trg_delivery_touch on public.delivery_orders;
create trigger trg_delivery_touch before update on public.delivery_orders
  for each row execute function public.set_updated_at();

drop trigger if exists trg_reservations_validate on public.reservations;
create trigger trg_reservations_validate
  before insert or update on public.reservations
  for each row execute function public.reservation_validate();

drop trigger if exists trg_reservations_status on public.reservations;
create trigger trg_reservations_status
  before update on public.reservations
  for each row execute function public.reservation_guard_status();


-- ───────────────────── 5 · FUNCTIONS (strict flow + delivery) ─────
create or replace function public.reservation_validate()
returns trigger
language plpgsql
as $$
declare
  v_today   date := (now() at time zone 'Africa/Cairo')::date;
  v_now     time := (now() at time zone 'Africa/Cairo')::time;
  v_cfg     jsonb;
  v_enabled boolean := true;
  v_min_h   integer := 1;
  v_max_d   integer := 30;
  v_max_g   integer := 12;
begin
  -- live configuration, managed from Admin → Settings
  select value into v_cfg from reservation_settings where key = 'config';
  if v_cfg is not null then
    v_enabled := coalesce((v_cfg ->> 'enabled')::boolean, true);
    v_min_h   := coalesce((v_cfg ->> 'min_hours_ahead')::int, 1);
    v_max_d   := coalesce((v_cfg ->> 'max_days_ahead')::int, 30);
    v_max_g   := coalesce((v_cfg ->> 'max_guests')::int, 12);
  end if;

  if tg_op = 'INSERT' then
    if not v_enabled then
      raise exception 'Online reservations are temporarily unavailable — please call us to book.';
    end if;
    if new.guests > v_max_g then
      raise exception 'Online bookings accept up to % guests — for larger groups please call us.', v_max_g;
    end if;
    if v_max_d > 0 and new.reservation_date > v_today + v_max_d then
      raise exception 'Please choose a date within the next % days.', v_max_d;
    end if;
    if v_min_h > 0
       and (new.reservation_date + new.reservation_time)
           < (now() at time zone 'Africa/Cairo') + make_interval(hours => v_min_h) then
      raise exception 'Please book at least % hour(s) ahead.', v_min_h;
    end if;
  end if;

  if tg_op = 'INSERT' or (tg_op = 'UPDATE'
        and (new.reservation_date is distinct from old.reservation_date
          or new.reservation_time is distinct from old.reservation_time)) then
    if new.reservation_date < v_today then
      raise exception 'Please choose a date that is today or later.';
    end if;
    if new.reservation_date = v_today and new.reservation_time < v_now then
      raise exception 'That time has already passed today — pick a later time.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.reservation_guard_status()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if (old.status = 'Pending'   and new.status in ('Confirmed', 'Cancelled'))
  or (old.status = 'Confirmed' and new.status in ('Seated', 'Cancelled'))
  or (old.status = 'Seated'    and new.status in ('Completed', 'Cancelled')) then
    return new;
  end if;

  raise exception 'Cannot move a reservation from "%" to "%".', old.status, new.status;
end;
$$;

create or replace function public.advance_order(p_id bigint, p_next text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order  orders%rowtype;
  v_flow   text[] := array['New', 'Accepted', 'Preparing', 'Ready', 'Delivered'];
  v_cur    integer;
  v_target integer;
  v_items  jsonb;
begin
  select * into v_order from orders where id = p_id;
  if not found then
    raise exception 'Order #% not found — it may have been cleared.', p_id;
  end if;

  if p_next = 'Cancelled' then
    if v_order.status not in ('New', 'Accepted', 'Preparing') then
      raise exception 'Order #% is "%" — it can no longer be cancelled.', p_id, v_order.status;
    end if;
    update orders set status = 'Cancelled' where id = p_id
    returning * into v_order;
  else
    v_cur    := array_position(v_flow, v_order.status);
    v_target := array_position(v_flow, p_next);

    if v_target is null then
      raise exception 'Unknown status "%".', p_next;
    end if;
    if v_cur is null then
      raise exception 'Order #% is "%" — the flow is complete.', p_id, v_order.status;
    end if;
    if v_target <> v_cur + 1 then
      raise exception 'Order #% is "%" — it can only move to "%".', p_id, v_order.status, v_flow[v_cur + 1];
    end if;

    update orders set status = p_next where id = p_id
    returning * into v_order;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name',      p.name,
           'image',     coalesce(p.image, ''),
           'quantity',  oi.quantity,
           'price',     oi.price,
           'lineTotal', round(oi.price * oi.quantity, 2)
         ) order by oi.id), '[]'::jsonb)
    into v_items
    from order_items oi
    join products p on p.id = oi.product_id
   where oi.order_id = p_id;

  return jsonb_build_object(
    'id',          v_order.id,
    'tableNumber', v_order.table_number,
    'total',       v_order.total,
    'status',      v_order.status,
    'createdAt',   v_order.created_at,
    'items',       v_items
  );
end;
$$;

create or replace function public.place_delivery_order(p jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text := trim(coalesce(p ->> 'name', ''));
  v_phone   text := trim(coalesce(p ->> 'phone', ''));
  v_address text := trim(coalesce(p ->> 'address', ''));
  v_maps    text := trim(coalesce(p ->> 'mapsLink', ''));
  v_notes   text := trim(coalesce(p ->> 'notes', ''));
  v_payment text := coalesce(p ->> 'payment', 'cash');
  v_items   jsonb := p -> 'items';
  v_cfg     jsonb;
  v_enabled boolean := true;
  v_methods jsonb := '["cash", "card_on_delivery"]'::jsonb;
  v_fee     numeric(10,2) := 0;
  v_free    numeric(10,2) := 0;
  v_min     numeric(10,2) := 0;
  v_eta     integer := 45;
  v_subtotal numeric(10,2) := 0;
  v_item    jsonb;
  v_pid     bigint;
  v_qty     integer;
  v_product record;
  v_lines   jsonb := '[]'::jsonb;
  v_id      uuid;
  v_created timestamptz;
begin
  -- live configuration
  select value into v_cfg from delivery_settings where key = 'config';
  if v_cfg is not null then
    v_enabled := coalesce((v_cfg ->> 'enabled')::boolean, true);
    v_methods := coalesce(v_cfg -> 'payment_methods', v_methods);
    v_fee     := coalesce((v_cfg ->> 'fee')::numeric, 0);
    v_free    := coalesce((v_cfg ->> 'free_above')::numeric, 0);
    v_min     := coalesce((v_cfg ->> 'min_order')::numeric, 0);
    v_eta     := coalesce((v_cfg ->> 'estimated_minutes')::int, 45);
  end if;

  if not v_enabled then
    raise exception 'Delivery is temporarily unavailable — please call us to order.';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Please enter your full name.';
  end if;
  if char_length(v_phone) < 8 or char_length(v_phone) > 20 then
    raise exception 'Please enter a valid phone number.';
  end if;
  if char_length(v_address) < 4 or char_length(v_address) > 300 then
    raise exception 'Please enter a delivery address.';
  end if;
  if char_length(v_maps) > 500 or char_length(v_notes) > 500 then
    raise exception 'Some fields are too long.';
  end if;
  if not (v_methods ? v_payment) then
    raise exception 'Please choose an available payment method.';
  end if;

  if v_items is null or jsonb_typeof(v_items) <> 'array'
     or jsonb_array_length(v_items) = 0 or jsonb_array_length(v_items) > 50 then
    raise exception 'Your cart is empty.';
  end if;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_pid := (v_item ->> 'productId')::bigint;
    v_qty := floor((v_item ->> 'quantity')::numeric)::integer;
    if v_qty < 1  then v_qty := 1;  end if;
    if v_qty > 20 then v_qty := 20; end if;

    select id, name, price into v_product
      from products where id = v_pid and available = true;
    if not found then
      raise exception 'Product #% is no longer available.', v_pid;
    end if;

    v_subtotal := v_subtotal + (v_product.price * v_qty);
    v_lines := v_lines || jsonb_build_object(
      'productId', v_product.id,
      'name',      v_product.name,
      'price',     v_product.price,
      'quantity',  v_qty,
      'lineTotal', round(v_product.price * v_qty, 2)
    );
  end loop;

  v_subtotal := round(v_subtotal, 2);

  if v_min > 0 and v_subtotal < v_min then
    raise exception 'Minimum order for delivery is % EGP — your subtotal is % EGP.', v_min, v_subtotal;
  end if;

  if v_free > 0 and v_subtotal >= v_free then
    v_fee := 0;
  end if;

  insert into delivery_orders
    (customer_name, customer_phone, address, maps_link, notes,
     payment_method, items, subtotal, delivery_fee, total, estimated_minutes)
  values
    (v_name, v_phone, v_address, v_maps, v_notes,
     v_payment, v_lines, v_subtotal, v_fee, round(v_subtotal + v_fee, 2), v_eta)
  returning id, created_at into v_id, v_created;

  insert into delivery_status_history (order_id, status, note, changed_by)
  values (v_id, 'Received', 'Order placed online.', 'customer');

  return jsonb_build_object(
    'id', v_id,
    'status', 'Received',
    'items', v_lines,
    'subtotal', v_subtotal,
    'deliveryFee', v_fee,
    'total', round(v_subtotal + v_fee, 2),
    'paymentMethod', v_payment,
    'estimatedMinutes', v_eta,
    'createdAt', v_created
  );
end;
$$;

create or replace function public.advance_delivery(
  p_id uuid, p_next text,
  p_driver_id bigint default null,
  p_eta integer default null,
  p_note text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order  delivery_orders%rowtype;
  v_flow   text[] := array['Received', 'Accepted', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered'];
  v_cur    integer;
  v_target integer;
  v_driver record;
begin
  select * into v_order from delivery_orders where id = p_id;
  if not found then
    raise exception 'Delivery order not found.';
  end if;

  if p_next = 'Cancelled' then
    if v_order.status in ('Delivered', 'Cancelled') then
      raise exception 'Order is already "%".', v_order.status;
    end if;
    update delivery_orders set status = 'Cancelled' where id = p_id
    returning * into v_order;
  else
    v_cur    := array_position(v_flow, v_order.status);
    v_target := array_position(v_flow, p_next);

    if v_target is null then
      raise exception 'Unknown status "%".', p_next;
    end if;
    if v_cur is null then
      raise exception 'Order is already "%".', v_order.status;
    end if;
    if v_target <> v_cur + 1 then
      raise exception 'Order is "%" — it can only move to "%".', v_order.status, v_flow[v_cur + 1];
    end if;

    -- courier is mandatory once the order leaves the restaurant
    if p_next = 'Out for Delivery' then
      if p_driver_id is not null then
        select * into v_driver from drivers where id = p_driver_id and active = true;
        if not found then
          raise exception 'That driver is no longer active — pick another one.';
        end if;
      elsif v_order.driver_id is null then
        raise exception 'Assign a driver before dispatching the order.';
      end if;
    end if;

    update delivery_orders
       set status = p_next,
           driver_id = coalesce(p_driver_id, driver_id),
           estimated_minutes = coalesce(
             case when p_eta between 5 and 240 then p_eta end,
             estimated_minutes),
           delivery_note = coalesce(nullif(left(coalesce(p_note, ''), 300), ''), delivery_note)
     where id = p_id
    returning * into v_order;
  end if;

  insert into delivery_status_history (order_id, status, note, changed_by)
  values (p_id, p_next, left(coalesce(p_note, ''), 300), 'staff');

  return (select jsonb_build_object(
    'id', v_order.id,
    'status', v_order.status,
    'driverId', v_order.driver_id,
    'estimatedMinutes', v_order.estimated_minutes,
    'deliveryNote', v_order.delivery_note,
    'updatedAt', v_order.updated_at
  ));
end;
$$;

create or replace function public.get_reservation_stats()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pending   integer;
  v_confirmed integer;
  v_seated    integer;
  v_completed integer;
  v_cancelled integer;
  v_today     integer;
  v_upcoming  integer;
  v_today_date date := (now() at time zone 'Africa/Cairo')::date;
begin
  select count(*)::integer into v_pending   from reservations where status = 'Pending';
  select count(*)::integer into v_confirmed from reservations where status = 'Confirmed';
  select count(*)::integer into v_seated    from reservations where status = 'Seated';
  select count(*)::integer into v_completed from reservations where status = 'Completed';
  select count(*)::integer into v_cancelled from reservations where status = 'Cancelled';

  select count(*)::integer into v_today
    from reservations
   where reservation_date = v_today_date and status <> 'Cancelled';

  select count(*)::integer into v_upcoming
    from reservations
   where reservation_date >= v_today_date and status in ('Pending', 'Confirmed', 'Seated');

  return jsonb_build_object(
    'pending',   v_pending,
    'confirmed', v_confirmed,
    'seated',    v_seated,
    'completed', v_completed,
    'cancelled', v_cancelled,
    'today',     v_today,
    'upcoming',  v_upcoming
  );
end;
$$;

create or replace function public.get_overview()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_products    integer;
  v_available   integer;
  v_categories  integer;
  v_media       integer;
  v_today       integer;
  v_revenue     numeric(12,2);
  v_del_today   integer;
  v_del_revenue numeric(12,2);
  v_del_active  integer;
  v_drivers     integer;
  v_gallery     integer;
  v_rev_pending integer;
  v_banners     integer;
  v_recent      jsonb;
  v_day_start   timestamptz :=
    ((now() at time zone 'Africa/Cairo')::date)::timestamp at time zone 'Africa/Cairo';
begin
  select count(*)::integer into v_products   from products;
  select count(*)::integer into v_available  from products where available = true;
  select count(*)::integer into v_categories from categories;
  select count(*)::integer into v_media      from media_library;

  select count(*)::integer, coalesce(sum(total), 0)::numeric(12,2)
    into v_today, v_revenue
    from orders
   where created_at >= v_day_start and status <> 'Cancelled';

  select count(*)::integer, coalesce(sum(total), 0)::numeric(12,2)
    into v_del_today, v_del_revenue
    from delivery_orders
   where created_at >= v_day_start and status <> 'Cancelled';

  select count(*)::integer into v_del_active
    from delivery_orders where status not in ('Delivered', 'Cancelled');

  select count(*)::integer into v_drivers     from drivers where active = true;
  select count(*)::integer into v_gallery     from gallery;
  select count(*)::integer into v_rev_pending from reviews where approved = false;
  select count(*)::integer into v_banners     from banners where visible = true;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.id desc), '[]'::jsonb)
    into v_recent
    from (
      select o.id,
             o.table_number as "tableNumber",
             o.total,
             o.status,
             o.created_at  as "createdAt",
             (select count(*)::integer from order_items oi where oi.order_id = o.id) as "itemsCount"
        from orders o
       order by o.id desc
       limit 6
    ) t;

  return jsonb_build_object(
    'products',          v_products,
    'available',         v_available,
    'categories',        v_categories,
    'media',             v_media,
    'orders_today',      v_today,
    'revenue_today',     v_revenue,
    'delivery_today',    v_del_today,
    'delivery_revenue',  v_del_revenue,
    'delivery_active',   v_del_active,
    'drivers_active',    v_drivers,
    'gallery',           v_gallery,
    'reviews_pending',   v_rev_pending,
    'banners',           v_banners,
    'recent',            v_recent
  );
end;
$$;

grant execute on function public.submit_order(integer, jsonb)    to anon, authenticated;
grant execute on function public.advance_order(bigint, text)     to anon, authenticated;
grant execute on function public.place_delivery_order(jsonb)     to anon, authenticated;
grant execute on function public.advance_delivery(uuid, text, bigint, integer, text) to anon, authenticated;
grant execute on function public.get_reservation_stats()         to anon, authenticated;
grant execute on function public.get_overview()                  to anon, authenticated;


-- ───────────────────── 6 · ROW LEVEL SECURITY ─────────────────────
alter table public.social_links           enable row level security;
alter table public.drivers                enable row level security;
alter table public.delivery_settings      enable row level security;
alter table public.reservation_settings   enable row level security;
alter table public.notification_settings  enable row level security;
alter table public.delivery_orders        enable row level security;
alter table public.delivery_status_history enable row level security;
alter table public.driver_locations       enable row level security;
alter table public.gallery                enable row level security;
alter table public.reviews                enable row level security;
alter table public.banners                enable row level security;

-- (drop-then-create keeps this script safely re-runnable)
drop policy if exists "socials: anon read"   on public.social_links;
drop policy if exists "socials: anon insert" on public.social_links;
drop policy if exists "socials: anon update" on public.social_links;
drop policy if exists "socials: anon delete" on public.social_links;
create policy "socials: anon read"    on public.social_links for select to anon using (true);
create policy "socials: anon insert"  on public.social_links for insert to anon with check (true);
create policy "socials: anon update"  on public.social_links for update to anon using (true) with check (true);
create policy "socials: anon delete"  on public.social_links for delete to anon using (true);

drop policy if exists "drivers: anon read"   on public.drivers;
drop policy if exists "drivers: anon insert" on public.drivers;
drop policy if exists "drivers: anon update" on public.drivers;
drop policy if exists "drivers: anon delete" on public.drivers;
create policy "drivers: anon read"    on public.drivers for select to anon using (true);
create policy "drivers: anon insert"  on public.drivers for insert to anon with check (true);
create policy "drivers: anon update"  on public.drivers for update to anon using (true) with check (true);
create policy "drivers: anon delete"  on public.drivers for delete to anon using (true);

drop policy if exists "delset: anon read"   on public.delivery_settings;
drop policy if exists "delset: anon insert" on public.delivery_settings;
drop policy if exists "delset: anon update" on public.delivery_settings;
create policy "delset: anon read"    on public.delivery_settings for select to anon using (true);
create policy "delset: anon insert"  on public.delivery_settings for insert to anon with check (true);
create policy "delset: anon update"  on public.delivery_settings for update to anon using (true) with check (true);

drop policy if exists "resvset: anon read"   on public.reservation_settings;
drop policy if exists "resvset: anon insert" on public.reservation_settings;
drop policy if exists "resvset: anon update" on public.reservation_settings;
create policy "resvset: anon read"   on public.reservation_settings for select to anon using (true);
create policy "resvset: anon insert" on public.reservation_settings for insert to anon with check (true);
create policy "resvset: anon update" on public.reservation_settings for update to anon using (true) with check (true);

drop policy if exists "notset: anon read"   on public.notification_settings;
drop policy if exists "notset: anon insert" on public.notification_settings;
drop policy if exists "notset: anon update" on public.notification_settings;
create policy "notset: anon read"    on public.notification_settings for select to anon using (true);
create policy "notset: anon insert"  on public.notification_settings for insert to anon with check (true);
create policy "notset: anon update"  on public.notification_settings for update to anon using (true) with check (true);

drop policy if exists "delivery: anon read" on public.delivery_orders;
create policy "delivery: anon read" on public.delivery_orders for select to anon using (true);

drop policy if exists "delivery_hist: anon read" on public.delivery_status_history;
create policy "delivery_hist: anon read" on public.delivery_status_history for select to anon using (true);

-- driver_locations: intentionally NO anon policies (service-role only).

drop policy if exists "gallery: anon read"   on public.gallery;
drop policy if exists "gallery: anon insert" on public.gallery;
drop policy if exists "gallery: anon update" on public.gallery;
drop policy if exists "gallery: anon delete" on public.gallery;
create policy "gallery: anon read"   on public.gallery for select to anon using (true);
create policy "gallery: anon insert" on public.gallery for insert to anon with check (true);
create policy "gallery: anon update" on public.gallery for update to anon using (true) with check (true);
create policy "gallery: anon delete" on public.gallery for delete to anon using (true);

drop policy if exists "banners: anon read"   on public.banners;
drop policy if exists "banners: anon insert" on public.banners;
drop policy if exists "banners: anon update" on public.banners;
drop policy if exists "banners: anon delete" on public.banners;
create policy "banners: anon read"   on public.banners for select to anon using (true);
create policy "banners: anon insert" on public.banners for insert to anon with check (true);
create policy "banners: anon update" on public.banners for update to anon using (true) with check (true);
create policy "banners: anon delete" on public.banners for delete to anon using (true);

drop policy if exists "reviews: anon read"   on public.reviews;
drop policy if exists "reviews: anon submit" on public.reviews;
drop policy if exists "reviews: anon update" on public.reviews;
drop policy if exists "reviews: anon delete" on public.reviews;
create policy "reviews: anon read"   on public.reviews for select to anon using (true);
create policy "reviews: anon submit" on public.reviews for insert to anon with check (approved = false);
create policy "reviews: anon update" on public.reviews for update to anon using (true) with check (true);
create policy "reviews: anon delete" on public.reviews for delete to anon using (true);


-- ───────────────────── 7 · REALTIME + STORAGE ─────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'orders', 'delivery_orders', 'reservations',
    'settings', 'website_theme', 'website_content', 'website_sections',
    'drivers'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

alter table public.orders          replica identity full;
alter table public.delivery_orders replica identity full;
alter table public.reservations    replica identity full;

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "media: public read"   on storage.objects;
drop policy if exists "media: public insert" on storage.objects;
drop policy if exists "media: public update" on storage.objects;
drop policy if exists "media: public delete" on storage.objects;
create policy "media: public read"   on storage.objects for select to public
  using (bucket_id = 'media');
create policy "media: public insert" on storage.objects for insert to public
  with check (bucket_id = 'media');
create policy "media: public update" on storage.objects for update to public
  using (bucket_id = 'media') with check (bucket_id = 'media');
create policy "media: public delete" on storage.objects for delete to public
  using (bucket_id = 'media');


-- ───────────────────── 8 · REFERENCE DATA (missing rows only) ─────

-- 8.1 · features flag gains "delivery"; checklist seeded only if absent
insert into public.settings (key, value) values
  ('features', '{"ordering":true,"reservations":true,"delivery":true}')
on conflict (key) do update
  set value = (coalesce(settings.value::jsonb, '{}'::jsonb) || '{"delivery":true}'::jsonb)::text
  where settings.key = 'features';

insert into public.settings (key, value)
select 'business_todo', '[
  {"text":"Upload the official logo (from our Facebook page) via Media Library → set it in Customizer → General","done":false},
  {"text":"Add menu pages whose prices were not verified yet: Seafood mains, Pizza, Shawerma Fatteh, Matcha drinks, Fresh juices, Cold drinks & Desserts","done":false},
  {"text":"Confirm delivery fee (public reviews mention EGP 30) and set a minimum order amount in Settings → Delivery","done":false},
  {"text":"Add the real delivery captains with their numbers in Drivers (remove the demo driver)","done":false},
  {"text":"Replace the demo reviews with real Google reviews in Reviews","done":false},
  {"text":"Add interior photos to the Gallery (aquarium tank, kids corner, terrace at sunset) via Media Library","done":false},
  {"text":"Confirm opening hours per weekday (currently Daily 8:00 AM – 2:00 AM)","done":false},
  {"text":"Decide whether shisha stays orderable digitally (dine-in only is recommended)","done":false}
]'
where not exists (select 1 from public.settings where key = 'business_todo');

-- 8.2 · operation configs (never overwrite an existing config)
insert into public.delivery_settings (key, value) values
  ('config', '{
    "enabled": true,
    "fee": 30,
    "free_above": 0,
    "min_order": 0,
    "estimated_minutes": 45,
    "payment_methods": ["cash", "card_on_delivery"],
    "note": "Delivery is available inside Hurghada — the exact fee is confirmed on WhatsApp when we accept your order."
  }'::jsonb)
on conflict (key) do nothing;

insert into public.reservation_settings (key, value) values
  ('config', '{
    "enabled": true,
    "min_hours_ahead": 1,
    "max_days_ahead": 30,
    "max_guests": 12,
    "note": "For groups larger than 12, please call us — we will arrange the terrace."
  }'::jsonb)
on conflict (key) do nothing;

insert into public.notification_settings (key, value) values
  ('config', '{"sound": true, "browser": false}'::jsonb)
on conflict (key) do nothing;

-- 8.3 · official social links (researched: Facebook page, bio links)
insert into public.social_links (platform, url, visible, sort_order) values
  ('facebook',  'https://www.facebook.com/Aquariumcafeandrestaurant', true, 10),
  ('instagram', 'https://www.instagram.com/aquarium.hurghada',        true, 20),
  ('tiktok',    'https://www.tiktok.com/@aquarium.restaurant',        true, 30),
  ('whatsapp',  'https://wa.me/201013913636',                         true, 40)
on conflict (platform) do nothing;

-- 8.4 · homepage sections: bring existing rows to the v4 layout, then
--        add the three new sections (banner / gallery / reviews)
update public.website_sections set position = 0  where id = 'hero';
update public.website_sections set position = 10 where id = 'highlights';
update public.website_sections set position = 20 where id = 'menu';
update public.website_sections set position = 30 where id = 'about';
update public.website_sections set position = 40 where id = 'contact';
update public.website_sections set position = 50 where id = 'footer';
insert into public.website_sections (id, label, position, visible) values
  ('banner',  'Promo banner', 15, true),
  ('gallery', 'Gallery',      25, true),
  ('reviews', 'Reviews',      35, true)
on conflict (id) do nothing;

-- 8.5 · demo driver — only while the drivers table is empty
insert into public.drivers (name, phone, active, notes)
select 'Captain (Demo)', '+20 100 000 0001', true, 'Demo courier — replace with the real delivery captains.'
where not exists (select 1 from public.drivers);

-- 8.6 · starter marketing content — only while tables are empty
insert into public.banners (title, subtitle, image, cta_text, cta_link, visible, sort_order)
select 'Fresh seafood, Red Sea view', 'Right on the Hurghada corniche — behind the General Hospital.', 'images/seafood.jpg', 'See the menu', '#menu', true, 10
where not exists (select 1 from public.banners);

insert into public.gallery (image, title, visible, sort_order)
select * from (values
  ('images/hero-sea.jpg',       'The terrace over the Red Sea', true, 10),
  ('images/seafood.jpg',        'Fresh catch of the day',       true, 20),
  ('images/shisha.jpg',         'Signature shisha by the water', true, 30),
  ('images/turkish-coffee.jpg', 'Turkish coffee, the classic',  true, 40),
  ('images/kids-meal.jpg',      'The Dodo kids meal',           true, 50),
  ('images/smoothie-mango.jpg', 'Fresh mango smoothie',         true, 60)
) as x(image, title, visible, sort_order)
where not exists (select 1 from public.gallery);

insert into public.reviews (customer_name, rating, text, source, approved)
select x.name, x.rating, x.text, 'demo', true
  from (values
    ('Demo Guest', 5, 'Beautiful sea view and the kindest staff — the aquarium inside is a lovely touch. (sample review)'),
    ('Demo Family', 5, 'Perfect for families: kids corner, quick service and generous portions. (sample review)'),
    ('Demo Visitor', 4, 'Shisha on the water at sunset — hard to beat in Hurghada. (sample review)')
  ) as x(name, rating, text)
where not exists (select 1 from public.reviews);


-- ───────────────────── 9 · OPTIONAL · REAL AQUARIUM MENU ──────────
-- Fills categories+products ONLY when the menu is completely empty
-- (fresh install through the migration path). Existing menus are
-- never touched — manage items afterwards in Admin → Products.
-- Prices are the REAL ones from the photographed paper menu (EGP).
do $$
begin
  if not exists (select 1 from public.products) and not exists (select 1 from public.categories) then

insert into public.categories (id, name, slug, sort_order, visible) values
  (1, 'Hot Drinks', 'hot-drinks', 10, true),
  (2, 'Smoothies',  'smoothies',  20, true),
  (3, 'Shisha',     'shisha',     30, true),
  (4, 'Additions',  'additions',  40, true),
  (5, 'Kids',       'kids',       50, true);

insert into public.products
  (id, category_id, name, description, price, image, badge, available, featured, sort_order) values
  -- ── hot drinks (real menu prices) ──
  ( 1, 1, 'Espresso · اسبريسو',            'A tight, syrupy shot of our house espresso blend — thick golden crema, cocoa finish.', 47, 'images/espresso.webp', '', true, false, 10),
  ( 2, 1, 'Double Espresso · اسبريسو دوبل','Two shots, zero compromise. For the serious caffeine crowd.', 57, 'images/espresso.webp', '', true, false, 20),
  ( 3, 1, 'Espresso Macchiato · اسبريسو ميكاتو','Espresso “stained” with a spoon of silky milk foam.', 57, 'images/espresso.webp', '', true, false, 30),
  ( 4, 1, 'Cappuccino · كابتشينو',          'Double espresso under a cloud of velvet micro-foam, cocoa dusting on top.', 62, 'images/cappuccino.webp', '', true, true, 5),
  ( 5, 1, 'American Coffee · امريكان كوفي',  'Long and smooth — espresso opened with hot water, all flavor, no weight.', 62, 'images/espresso.webp', '', true, false, 40),
  ( 6, 1, 'Flat White · فلات وايت',          'Double ristretto folded into glossy steamed milk — short, creamy, strong.', 62, 'images/cappuccino.webp', '', true, false, 50),
  ( 7, 1, 'Coffee Latte · لاتيه',            'Gentle and milky with soft foam — the long seaside favorite.', 65, 'images/spanish-latte.webp', '', true, false, 60),
  ( 8, 1, 'Mocha · موكا',                    'Espresso meets Belgian hot chocolate, crowned with foam.', 70, 'images/hot-chocolate.jpg', '', true, false, 70),
  ( 9, 1, 'Cortado · كورتادو',               'Half espresso, half warm milk — balanced and short.', 60, 'images/cappuccino.webp', '', true, false, 80),
  (10, 1, 'Spanish Latte · سبانش لاتيه',     'Espresso layered over silky milk and a whisper of condensed milk. The house bestseller.', 62, 'images/spanish-latte.webp', 'Bestseller', true, true, 1),
  (11, 1, 'Honey Coffee · كوفى ه عسل',       'Espresso and steamed milk sweetened with real honey — mellow and golden.', 65, 'images/spanish-latte.webp', '', true, false, 90),
  (12, 1, 'Nescafe with Milk · نسكافيه بالحليب','The classic comfort cup, made creamy with hot milk.', 55, 'images/cappuccino.webp', '', true, false, 100),
  (13, 1, 'Nescafe · نسكافيه',               'Straight-up, strong and quick — the Egyptian morning standard.', 50, 'images/turkish-coffee.jpg', '', true, false, 110),
  (14, 1, 'Hot Chocolate · هوت شوكلت',       'Thick drinking chocolate, luxuriously slow.', 60, 'images/hot-chocolate.jpg', '', true, false, 120),
  (15, 1, 'Nutella with Milk · نوتيلا بالحليب','Hot milk blended with a generous swirl of Nutella. The kids fight over it.', 65, 'images/hot-chocolate.jpg', '', true, false, 130),
  (16, 1, 'Turkish Coffee · قهوه تركي',      'Brewed the slow way on low heat — order it sada, mazboot or sweet.', 43, 'images/turkish-coffee.jpg', 'Classic', true, false, 140),
  (17, 1, 'Double Turkish Coffee · قهوه تركي دوبل','A double pot of the good stuff.', 55, 'images/turkish-coffee.jpg', '', true, false, 150),
  (18, 1, 'French Coffee · قهوه فرنساوي',    'Silky French-style coffee with cream and vanilla notes.', 50, 'images/iced-macchiato.webp', '', true, false, 160),
  (19, 1, 'Double French Coffee · قهوه فرنساوي دوبل','Twice the French indulgence.', 60, 'images/iced-macchiato.webp', '', true, false, 170),
  (20, 1, 'Turkish Coffee with Flavors · قهوه تركي نكهات','Chocolate, vanilla, hazelnut or caramel — pick your flavor.', 55, 'images/turkish-coffee.jpg', '', true, false, 180),
  (21, 1, 'Tea · شاي',                        'Proper Egyptian black tea, strong and fragrant.', 35, 'images/tea.jpg', '', true, false, 190),
  (22, 1, 'Green Tea · شاي اخضر',             'Light, grassy and calming.', 37, 'images/tea.jpg', '', true, false, 200),
  (23, 1, 'Tea Pot · براد شاي',               'A full pot for the table — mint on request.', 47, 'images/tea.jpg', '', true, false, 210),
  (24, 1, 'Tea with Milk · شاي بالحليب',      'Tea the cozy way, with hot milk.', 50, 'images/tea.jpg', '', true, false, 220),
  (25, 1, 'Tea with Flavors · شاي نكهات',     'Peach, mango, jasmine or berry infusions.', 37, 'images/tea.jpg', '', true, false, 230),
  -- ── smoothies (real menu prices) ──
  (26, 2, 'Mango Smoothie · سموزى مانجو',        'Thick Alphonso-style mango, nothing else needed.', 75, 'images/smoothie-mango.jpg', '', true, true, 5),
  (27, 2, 'Strawberry Smoothie · سموزى فراولة',  'Fresh strawberries blended thick and cold.', 75, 'images/smoothie-berry.jpg', '', true, false, 10),
  (28, 2, 'Lemon Mint Smoothie · سموزى ليمون نعناع','Our most-ordered refresher — sharp lemon crushed with garden mint and ice.', 70, 'images/iced-mint-coffee.webp', 'Refreshing', true, true, 1),
  (29, 2, 'Kiwi Smoothie · سموزى كيوى',          'Tart green kiwi, blended smooth.', 90, 'images/matcha-frappe.webp', '', true, false, 20),
  (30, 2, 'Peach Smoothie · سموزى خوخ',          'Sweet summer peach all year round.', 75, 'images/smoothie-mango.jpg', '', true, false, 30),
  (31, 2, 'Watermelon Smoothie · سموزى بطيخ',    'Ice-cold watermelon — pure Red Sea in a glass.', 75, 'images/smoothie-berry.jpg', '', true, false, 40),
  (32, 2, 'Berry Smoothie · سموزى توت',          'Mixed berries, deep pink, properly thick.', 75, 'images/smoothie-berry.jpg', '', true, false, 50),
  (33, 2, 'Green Apple Smoothie · سموزى تفاح اخضر','Crisp and tangy.', 75, 'images/matcha-frappe.webp', '', true, false, 60),
  (34, 2, 'Mango Coconut Smoothie · سموزى مانجو جوزهند','Tropical mango with creamy coconut.', 78, 'images/smoothie-mango.jpg', '', true, false, 70),
  (35, 2, 'Strawberry Coconut Smoothie · سموزى فراولة جوزهند','Strawberry gone tropical.', 78, 'images/smoothie-berry.jpg', '', true, false, 80),
  (36, 2, 'Mango Mint Smoothie · سموزى مانجو نعناع','Mango with a cool mint kick.', 78, 'images/smoothie-mango.jpg', '', true, false, 90),
  (37, 2, 'Mango Berry Smoothie · سموزى مانجو بيرى','The best of both fruits.', 80, 'images/smoothie-berry.jpg', '', true, false, 100),
  (38, 2, 'Banana Berry Smoothie · سموزى بنانا بيرى','Creamy banana meets bright berries.', 80, 'images/smoothie-berry.jpg', '', true, false, 110),
  (39, 2, 'Banana Strawberry Smoothie · سموزى بنانا فراولة','A guaranteed kids'' favorite.', 80, 'images/smoothie-berry.jpg', '', true, false, 120),
  (40, 2, 'Mango Vanilla Smoothie · سموزى مانجو فانيليا','Dessert in a glass.', 85, 'images/smoothie-mango.jpg', '', true, false, 130),
  (41, 2, 'Cantaloupe Vanilla Smoothie · سموزى كنتالوب فانيليا','Mellow melon with a vanilla finish.', 85, 'images/smoothie-mango.jpg', '', true, false, 140),
  (42, 2, 'Lemon Mint Kiwi Smoothie · سموزى ليمون نعناع كيوي','The triple-citrus wake-up call.', 90, 'images/matcha-frappe.webp', '', true, false, 150),
  (43, 2, 'Peach Orange Smoothie · سموزى برتقال خوخ','Sunny and pulpy.', 80, 'images/smoothie-mango.jpg', '', true, false, 160),
  (44, 2, 'Punch Smoothie · سموزى بانش',       'Watermelon + strawberry + peach — the house punch.', 85, 'images/smoothie-berry.jpg', '', true, false, 170),
  -- ── shisha (real menu prices · dine-in only is recommended) ──
  (45, 3, 'Special Shisha · شيشة سبيشيال',          'The house special mix — smooth, dense clouds.', 130, 'images/shisha.jpg', 'Signature', true, true, 1),
  (46, 3, 'Mix Special Shisha · شيشة مكس اسبيشيال', 'Two flavors blended the Aquarium way.', 150, 'images/shisha.jpg', '', true, false, 10),
  (47, 3, 'Luxury Fruit Shisha · شيشة فواكه',       'Premium fruit heads.', 95, 'images/shisha.jpg', '', true, false, 20),
  (48, 3, 'Luxury Mix Fruits Shisha · شيشة مكس فواكه','Luxury mix of seasonal fruits.', 100, 'images/shisha.jpg', '', true, false, 30),
  (49, 3, 'Salloum Qass Shisha · شيشة سلوم-قص',     'The classic Salloum, packed tight.', 30, 'images/shisha.jpg', '', true, false, 40),
  (50, 3, 'Medical Hose · خرطوم طبى',               'Fresh personal hose.', 15, '', '', true, false, 50),
  -- ── additions / extras (real menu prices) ──
  (51, 4, 'Add: Chicken · فراخ',            'Add grilled chicken to any dish.', 55, '', 'Extra', true, false, 10),
  (52, 4, 'Add: Minced Meat · لحمة مفرومة', 'Add seasoned minced meat.', 50, '', 'Extra', true, false, 20),
  (53, 4, 'Add: Sausage · سجق',             'Add Egyptian sausage.', 55, '', 'Extra', true, false, 30),
  (54, 4, 'Add: Pastrami · بسطرمة',         'Add pastrami slices.', 60, '', 'Extra', true, false, 40),
  (55, 4, 'Add: Salami · سلامى',            'Add salami.', 55, '', 'Extra', true, false, 50),
  (56, 4, 'Add: Hotdog · هوت دوج',          'Add a hotdog sausage.', 50, '', 'Extra', true, false, 60),
  (57, 4, 'Add: Tuna · تونة',               'Add tuna.', 70, '', 'Extra', true, false, 70),
  (58, 4, 'Add: Shrimps · جمبرى',           'Add jumbo shrimps.', 75, '', 'Extra', true, false, 80),
  (59, 4, 'Add: Calamari · كاليماري',       'Add calamari rings.', 70, '', 'Extra', true, false, 90),
  (60, 4, 'Add: Fish Fillet · سمك فيليه',   'Add a fish fillet.', 60, '', 'Extra', true, false, 100),
  (61, 4, 'Add: Crab Stick · كابوريا اصابع','Add crab sticks.', 50, '', 'Extra', true, false, 110),
  (62, 4, 'Add: Caviar · كافيار',           'Add caviar.', 55, '', 'Extra', true, false, 120),
  (63, 4, 'Add: Olives · زيتون',            'Add olives.', 30, '', 'Extra', true, false, 130),
  (64, 4, 'Add: Vegetables · خضروات',       'Add grilled vegetables.', 30, '', 'Extra', true, false, 140),
  (65, 4, 'Add: Mushroom · مشروم',          'Add sautéed mushrooms.', 40, '', 'Extra', true, false, 150),
  (66, 4, 'Add: Jalapeño · هالبينو',        'Bring the heat.', 20, '', 'Extra', true, false, 160),
  (67, 4, 'Add: Mozzarella · موزاريلا',     'Extra mozzarella.', 55, '', 'Extra', true, false, 170),
  (68, 4, 'Add: Roumi Cheese · رومى',       'Extra aged Roumi.', 45, '', 'Extra', true, false, 180),
  (69, 4, 'Add: Cheddar · شيدر',            'Extra cheddar.', 50, '', 'Extra', true, false, 190),
  (70, 4, 'Add: Blue Cheese · بلو تشيز',    'Extra blue cheese.', 60, '', 'Extra', true, false, 200),
  -- ── kids (real menu price) ──
  (71, 5, 'Dodo Meal · وجبة دودو', 'Onion rings, chicken strips, fried mozzarella and Friskas fries — the full kids'' feast.', 130, 'images/kids-meal.jpg', 'Kids favorite', true, true, 1);

perform setval(pg_get_serial_sequence('public.categories', 'id'),
              greatest((select max(id) from public.categories), 1), true);
perform setval(pg_get_serial_sequence('public.products', 'id'),
              greatest((select max(id) from public.products), 1), true);

  end if;
end $$;

-- ───────────────────── DONE ───────────────────────────────────────
-- Verify with:  select count(*) from delivery_orders;
--               select get_overview();
-- Then open the customer site, the waiter board and the admin console.
