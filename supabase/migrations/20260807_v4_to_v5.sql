-- ═══════════════════════════════════════════════════════════════════
--  AQUARIUM CAFE & RESTURANT — platform v5
--  MIGRATION: v4 → v5  (delivery-only commercial platform)
--  Date: 2026-08-07
--
--  WHAT THIS DOES (all IDEMPOTENT — safe to run more than once):
--    1. Delivery zones + unlimited sub-zones (multilingual EN/AR)
--    2. Customer accounts (Supabase Auth email+password) — profiles,
--       loyalty accounts & points ledger, signup trigger
--    3. Discount engine: signup / coupon / product / category / global
--    4. delivery_orders gains: zone link, structured address,
--       temporary driver, customer auth link, discount & loyalty fields
--    5. place_delivery_order v5 (zone fee, coupon, points)+
--       validate_coupon() preview RPC · advance_delivery v5
--       (temporary driver, points earn on deliver, points refund on cancel)
--    6. get_overview v5 (delivery-only KPIs)
--    7. New seeds: 13 Hurghada zones + sub-zones, loyalty config,
--       Delivery-only feature flags, updated business TODO
--
--  PRESERVED (explicitly NOT touched, your data stays):
--    · existing delivery_orders, drivers, menu, theme, content…
--    · legacy tables  orders / order_items / reservations  (archived:
--      the apps no longer use them — the system is delivery-only)
--    · submit_order / advance_order / get_reservation_stats stay in
--      place so old dashboards can still read history; they are no
--      longer called by any v5 screen.
--
--  Run in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────── 1 · DELIVERY ZONES ─────────────────────────
create table if not exists public.delivery_zones (
  id         bigint generated always as identity primary key,
  name_en    text not null check (char_length(name_en) between 2 and 60),
  name_ar    text not null default '' check (char_length(name_ar) <= 60),
  fee        numeric(10,2) not null default 0 check (fee >= 0 and fee <= 10000),
  free_above numeric(10,2) not null default 0 check (free_above >= 0),  -- 0 = use global
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_subzones (
  id           bigint generated always as identity primary key,
  zone_id      bigint not null references public.delivery_zones(id) on delete cascade,
  name_en      text not null check (char_length(name_en) between 2 and 80),
  name_ar      text not null default '' check (char_length(name_ar) <= 80),
  -- v5.1 · every sub zone carries its OWN delivery fee, which wins
  -- over the parent zone fee the moment the customer picks it.
  delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0 and delivery_fee <= 10000),
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- idempotent guards in case the table already exists from an earlier run
alter table public.delivery_subzones
  add column if not exists delivery_fee numeric(10,2) not null default 0;
alter table public.delivery_subzones
  add column if not exists updated_at timestamptz not null default now();
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'delivery_subzones_delivery_fee_check'
       and conrelid = 'public.delivery_subzones'::regclass
  ) then
    alter table public.delivery_subzones
      add constraint delivery_subzones_delivery_fee_check
      check (delivery_fee >= 0 and delivery_fee <= 10000);
  end if;
end $$;

create index if not exists idx_zones_order    on public.delivery_zones (sort_order, id) where active = true;
create index if not exists idx_subzones_zone  on public.delivery_subzones (zone_id, sort_order, id);
create index if not exists idx_delivery_zone  on public.delivery_orders (zone_id);


-- ───────────────────── 2 · CUSTOMER ACCOUNTS + LOYALTY ────────────
create table if not exists public.customer_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '' check (char_length(full_name) <= 80),
  phone      text not null default '' check (char_length(phone) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_settings (
  key   text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null default '{}'::jsonb
);

create table if not exists public.loyalty_accounts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  points     integer not null default 0 check (points >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_transactions (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  order_id      uuid references public.delivery_orders(id) on delete set null,
  delta         integer not null,
  balance_after integer not null,
  reason        text not null check (reason in ('earn', 'signup_bonus', 'redeem', 'refund', 'admin')),
  note          text not null default '' check (char_length(note) <= 200),
  created_at    timestamptz not null default now()
);

create index if not exists idx_loyalty_tx_user  on public.loyalty_transactions (user_id, created_at desc);
create index if not exists idx_loyalty_tx_order on public.loyalty_transactions (order_id);


-- ───────────────────── 3 · DISCOUNT ENGINE ────────────────────────
create table if not exists public.discounts (
  id           bigint generated always as identity primary key,
  name         text not null check (char_length(name) between 2 and 80),
  type         text not null check (type in ('signup', 'coupon', 'product', 'category', 'global')),
  code         text unique check (code is null or code ~ '^[A-Za-z0-9_-]{3,24}$'),
  value_type   text not null default 'percent' check (value_type in ('percent', 'fixed')),
  value        numeric(10,2) not null check (value >= 0),
  min_order    numeric(10,2) not null default 0 check (min_order >= 0),
  max_discount numeric(10,2) check (max_discount is null or max_discount >= 0),
  max_uses     integer check (max_uses is null or max_uses > 0),   -- null = unlimited
  used_count   integer not null default 0 check (used_count >= 0),
  active       boolean not null default true,
  starts_at    timestamptz not null default now(),
  expires_at   timestamptz,
  target_id    bigint,           -- product_id (type=product) · category_id (type=category)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (type not in ('product', 'category') or target_id is not null),
  check (type <> 'coupon' or code is not null),
  check (value_type <> 'percent' or value <= 100)
);

create index if not exists idx_discounts_active on public.discounts (active, starts_at, expires_at);
create unique index if not exists idx_discounts_code_u on public.discounts (upper(code)) where code is not null;


-- ───────────────────── 4 · delivery_orders EXTENSIONS ─────────────
alter table public.delivery_orders add column if not exists zone_id         bigint references public.delivery_zones(id)    on delete set null;
alter table public.delivery_orders add column if not exists subzone_id      bigint references public.delivery_subzones(id) on delete set null;
alter table public.delivery_orders add column if not exists address_detail  text not null default '' check (char_length(address_detail) <= 500);
alter table public.delivery_orders add column if not exists temp_driver_name  text not null default '' check (char_length(temp_driver_name) <= 60);
alter table public.delivery_orders add column if not exists temp_driver_phone text not null default '' check (char_length(temp_driver_phone) <= 20);
alter table public.delivery_orders add column if not exists user_id         uuid references auth.users(id) on delete set null;
alter table public.delivery_orders add column if not exists discount_id     bigint references public.discounts(id) on delete set null;
alter table public.delivery_orders add column if not exists discount_amount numeric(10,2) not null default 0;
alter table public.delivery_orders add column if not exists discount_label  text not null default '' check (char_length(discount_label) <= 120);
alter table public.delivery_orders add column if not exists coupon_code     text not null default '' check (char_length(coupon_code) <= 24);
alter table public.delivery_orders add column if not exists loyalty_redeemed integer not null default 0;
alter table public.delivery_orders add column if not exists loyalty_earned   integer not null default 0;

create index if not exists idx_delivery_user   on public.delivery_orders (user_id, created_at desc) where user_id is not null;


-- ───────────────────── 5 · RLS FOR NEW TABLES ─────────────────────
alter table public.delivery_zones        enable row level security;
alter table public.delivery_subzones     enable row level security;
alter table public.customer_profiles     enable row level security;
alter table public.loyalty_settings      enable row level security;
alter table public.loyalty_accounts      enable row level security;
alter table public.loyalty_transactions  enable row level security;
alter table public.discounts             enable row level security;

-- zones / subzones — public read, operator write (single-operator model)
drop policy if exists "zones: anon read"    on public.delivery_zones;
drop policy if exists "zones: anon insert"  on public.delivery_zones;
drop policy if exists "zones: anon update"  on public.delivery_zones;
drop policy if exists "zones: anon delete"  on public.delivery_zones;
create policy "zones: anon read"    on public.delivery_zones for select to anon, authenticated using (true);
create policy "zones: anon insert"  on public.delivery_zones for insert to anon with check (true);
create policy "zones: anon update"  on public.delivery_zones for update to anon using (true) with check (true);
create policy "zones: anon delete"  on public.delivery_zones for delete to anon using (true);

drop policy if exists "subzones: anon read"    on public.delivery_subzones;
drop policy if exists "subzones: anon insert"  on public.delivery_subzones;
drop policy if exists "subzones: anon update"  on public.delivery_subzones;
drop policy if exists "subzones: anon delete"  on public.delivery_subzones;
create policy "subzones: anon read"    on public.delivery_subzones for select to anon, authenticated using (true);
create policy "subzones: anon insert"  on public.delivery_subzones for insert to anon with check (true);
create policy "subzones: anon update"  on public.delivery_subzones for update to anon using (true) with check (true);
create policy "subzones: anon delete"  on public.delivery_subzones for delete to anon using (true);

-- discounts — readable/writable by the operator (same trust model as menu);
-- coupon validity is enforced server-side in the RPCs.
drop policy if exists "discounts: anon read"    on public.discounts;
drop policy if exists "discounts: anon insert"  on public.discounts;
drop policy if exists "discounts: anon update"  on public.discounts;
drop policy if exists "discounts: anon delete"  on public.discounts;
create policy "discounts: anon read"    on public.discounts for select to anon, authenticated using (true);
create policy "discounts: anon insert"  on public.discounts for insert to anon with check (true);
create policy "discounts: anon update"  on public.discounts for update to anon using (true) with check (true);
create policy "discounts: anon delete"  on public.discounts for delete to anon using (true);

-- loyalty config — operator-managed like the other KV settings
drop policy if exists "loyaltyset: anon read"   on public.loyalty_settings;
drop policy if exists "loyaltyset: anon insert" on public.loyalty_settings;
drop policy if exists "loyaltyset: anon update" on public.loyalty_settings;
create policy "loyaltyset: anon read"   on public.loyalty_settings for select to anon, authenticated using (true);
create policy "loyaltyset: anon insert" on public.loyalty_settings for insert to anon with check (true);
create policy "loyaltyset: anon update" on public.loyalty_settings for update to anon using (true) with check (true);

-- profiles — the signed-in customer owns exactly one row
drop policy if exists "profiles: owner read"   on public.customer_profiles;
drop policy if exists "profiles: owner insert" on public.customer_profiles;
drop policy if exists "profiles: owner update" on public.customer_profiles;
create policy "profiles: owner read"   on public.customer_profiles for select to authenticated using (auth.uid() = id);
create policy "profiles: owner insert" on public.customer_profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles: owner update" on public.customer_profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- loyalty points — the customer READS their own; writes happen ONLY inside
-- the security-definer RPCs (place_delivery_order / advance_delivery /
-- handle_new_user) so nobody can print points for themselves.
drop policy if exists "loyalty: owner read" on public.loyalty_accounts;
create policy "loyalty: owner read" on public.loyalty_accounts for select to authenticated using (auth.uid() = user_id);

drop policy if exists "loyalty_tx: owner read" on public.loyalty_transactions;
create policy "loyalty_tx: owner read" on public.loyalty_transactions for select to authenticated using (auth.uid() = user_id);


-- ───────────────────── 6 · TRIGGERS ───────────────────────────────
drop trigger if exists trg_zones_touch on public.delivery_zones;
create trigger trg_zones_touch before update on public.delivery_zones
  for each row execute function public.set_updated_at();

drop trigger if exists trg_subzones_touch on public.delivery_subzones;
create trigger trg_subzones_touch before update on public.delivery_subzones
  for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_touch on public.customer_profiles;
create trigger trg_profiles_touch before update on public.customer_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_discounts_touch on public.discounts;
create trigger trg_discounts_touch before update on public.discounts
  for each row execute function public.set_updated_at();

-- welcome profile + loyalty account + signup bonus for every new signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bonus integer := 0;
begin
  insert into public.customer_profiles (id, full_name, phone)
  values (new.id,
          left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80),
          left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 20))
  on conflict (id) do nothing;

  insert into public.loyalty_accounts (user_id, points)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  select coalesce((value ->> 'signup_bonus')::int, 0)
    into v_bonus
    from public.loyalty_settings
   where key = 'config';

  if coalesce((select (value ->> 'enabled')::boolean
                 from public.loyalty_settings where key = 'config'), true)
     and v_bonus > 0 then
    update public.loyalty_accounts
       set points = points + v_bonus
     where user_id = new.id;
    insert into public.loyalty_transactions (user_id, delta, balance_after, reason, note)
    select new.id, v_bonus,
           (select points from public.loyalty_accounts where user_id = new.id),
           'signup_bonus', 'Welcome to Aquarium 🌊';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ───────────────────── 7 · CART PRICING HELPER (shared) ───────────
-- Single source of truth for server-side pricing — used by
-- place_delivery_order() and validate_coupon(). Lines carry
-- productId + categoryId so scoped discounts can do their math.
create or replace function public._price_cart(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item    jsonb;
  v_pid     bigint;
  v_qty     integer;
  v_product record;
  v_lines   jsonb := '[]'::jsonb;
  v_sub     numeric(10,2) := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Your cart is empty.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_pid := (v_item ->> 'productId')::bigint;
    v_qty := floor((v_item ->> 'quantity')::numeric)::integer;
    if v_qty < 1  then v_qty := 1;  end if;
    if v_qty > 20 then v_qty := 20; end if;

    select id, name, name_ar, price, category_id into v_product
      from products where id = v_pid and available = true;
    if not found then
      raise exception 'Product #% is no longer available.', v_pid;
    end if;

    v_sub := v_sub + (v_product.price * v_qty);
    v_lines := v_lines || jsonb_build_object(
      'productId',  v_product.id,
      'categoryId', v_product.category_id,
      'name',       v_product.name,
      'name_ar',    v_product.name_ar,
      'price',      v_product.price,
      'quantity',   v_qty,
      'lineTotal',  round(v_product.price * v_qty, 2)
    );
  end loop;

  return jsonb_build_object('lines', v_lines, 'subtotal', round(v_sub, 2));
end;
$$;


-- ───────────────────── 8 · DISCOUNT MATH HELPER ───────────────────
-- Money value of one discount row against priced cart lines.
create or replace function public._discount_value(
  d public.discounts,
  p_lines jsonb,
  p_subtotal numeric
)
returns numeric
language plpgsql
stable
as $$
declare
  v_base   numeric(10,2) := 0;
  v_amount numeric(10,2) := 0;
begin
  if d.type = 'product' then
    select coalesce(sum((l ->> 'lineTotal')::numeric), 0) into v_base
      from jsonb_array_elements(p_lines) l
     where (l ->> 'productId')::bigint = d.target_id;
  elsif d.type = 'category' then
    select coalesce(sum((l ->> 'lineTotal')::numeric), 0) into v_base
      from jsonb_array_elements(p_lines) l
     where (l ->> 'categoryId')::bigint = d.target_id;
  else
    v_base := p_subtotal;                      -- signup / coupon / global → whole order
  end if;

  if v_base <= 0 then
    return 0;
  end if;

  if d.value_type = 'percent' then
    v_amount := round(v_base * d.value / 100, 2);
    if d.max_discount is not null then
      v_amount := least(v_amount, d.max_discount);
    end if;
  else
    v_amount := least(d.value, v_base);
  end if;

  return least(greatest(v_amount, 0), p_subtotal);
end;
$$;


-- ───────────────────── 9 · validate_coupon(code, items, userId) ───
-- Read-only preview for the checkout screen. Never throws for a bad
-- code — returns {ok:false, message} so the UI can say why.
create or replace function public.validate_coupon(p jsonb)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code   text := upper(trim(coalesce(p ->> 'code', '')));
  v_user   uuid := nullif(p ->> 'userId', '')::uuid;
  v_priced jsonb;
  v_lines  jsonb;
  v_sub    numeric(10,2);
  v_d      discounts%rowtype;
  v_amount numeric(10,2);
begin
  if v_code = '' then
    return jsonb_build_object('ok', false, 'key', 'empty', 'message', 'Enter a coupon code.');
  end if;
  if v_user is not null and auth.uid() is distinct from v_user then
    return jsonb_build_object('ok', false, 'key', 'auth', 'message', 'Please sign in again.');
  end if;

  begin
    v_priced := public._price_cart(p -> 'items');
  exception when others then
    return jsonb_build_object('ok', false, 'key', 'cart', 'message', 'Your cart is empty or has unavailable items.');
  end;
  v_lines := v_priced -> 'lines';
  v_sub   := (v_priced ->> 'subtotal')::numeric;

  select * into v_d from discounts
   where code is not null and upper(code) = v_code
     and active
     and starts_at <= now()
     and (expires_at is null or expires_at > now())
     and (max_uses is null or used_count < max_uses)
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'key', 'invalid', 'message', 'This coupon code is invalid or has expired.');
  end if;
  if v_sub < v_d.min_order then
    return jsonb_build_object('ok', false, 'key', 'min_order', 'min', v_d.min_order, 'message',
      format('This coupon needs a minimum order of %s EGP.', v_d.min_order));
  end if;
  if v_d.type = 'signup' then
    if v_user is null then
      return jsonb_build_object('ok', false, 'key', 'signup_only', 'message', 'This coupon is for registered customers — please sign in.');
    end if;
    if exists (select 1 from delivery_orders where user_id = v_user) then
      return jsonb_build_object('ok', false, 'key', 'first_order', 'message', 'This welcome coupon works on your first order only.');
    end if;
  end if;

  v_amount := public._discount_value(v_d, v_lines, v_sub);
  if v_amount <= 0 then
    return jsonb_build_object('ok', false, 'key', 'not_applicable', 'message', 'This coupon does not apply to the items in your cart.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'key', 'applied',
    'amount', v_amount,
    'label', v_d.name,
    'kind', case when v_d.value_type = 'percent' then v_d.value::text || '%' else v_d.value::text || ' EGP' end
  );
end;
$$;


-- ───────────────────── 10 · place_delivery_order v5 ───────────────
-- Zones, structured address, coupons & automatic discounts,
-- loyalty redemption, customer auth link — all server-enforced.
drop function if exists public.place_delivery_order(jsonb) cascade;
create or replace function public.place_delivery_order(p jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text := trim(coalesce(p ->> 'name', ''));
  v_phone   text := trim(coalesce(p ->> 'phone', ''));
  v_detail  text := trim(coalesce(p ->> 'addressDetail', ''));
  v_maps    text := trim(coalesce(p ->> 'mapsLink', ''));
  v_notes   text := trim(coalesce(p ->> 'notes', ''));
  v_payment text := coalesce(p ->> 'payment', 'cash');
  v_zone_id    bigint := nullif(p ->> 'zoneId', '')::bigint;
  v_subzone_id bigint := nullif(p ->> 'subZoneId', '')::bigint;
  v_user    uuid := nullif(p ->> 'userId', '')::uuid;
  v_coupon  text := upper(trim(coalesce(p ->> 'coupon', '')));
  v_redeem  integer := greatest(coalesce((p ->> 'redeemPoints')::int, 0), 0);

  v_cfg     jsonb;
  v_enabled boolean := true;
  v_methods jsonb := '["cash", "card_on_delivery"]'::jsonb;
  v_free    numeric(10,2) := 0;
  v_min     numeric(10,2) := 0;
  v_eta     integer := 45;

  v_zone    record;
  v_subzone record;
  v_subname text := '';   -- plain var: reading a field of a never-assigned
                          -- record raises 55000, and guests may skip step 2
  v_priced  jsonb;
  v_lines   jsonb := '[]'::jsonb;
  v_subtotal numeric(10,2) := 0;
  v_fee     numeric(10,2) := 0;

  v_d         discounts%rowtype;
  v_amount    numeric(10,2);
  v_dis_amount numeric(10,2) := 0;
  v_dis_id    bigint;
  v_label     text := '';
  v_coupon_ok text := '';

  v_loy     jsonb;
  v_pv      numeric(10,2) := 0;
  v_min_r   integer := 0;
  v_max_r   integer := 0;
  v_bal     integer := 0;
  v_pts_discount numeric(10,2) := 0;

  v_total   numeric(10,2);
  v_address text;
  v_id      uuid;
  v_created timestamptz;
begin
  -- live configuration
  select value into v_cfg from delivery_settings where key = 'config';
  if v_cfg is not null then
    v_enabled := coalesce((v_cfg ->> 'enabled')::boolean, true);
    v_methods := coalesce(v_cfg -> 'payment_methods', v_methods);
    v_free    := coalesce((v_cfg ->> 'free_above')::numeric, 0);
    v_min     := coalesce((v_cfg ->> 'min_order')::numeric, 0);
    v_eta     := coalesce((v_cfg ->> 'estimated_minutes')::int, 45);
  end if;

  if not v_enabled then
    raise exception 'Delivery is temporarily unavailable — please call us to order.';
  end if;

  -- the signed-in customer may only order as themselves
  if v_user is not null and auth.uid() is distinct from v_user then
    raise exception 'Please sign in again before ordering.';
  end if;

  -- STEP 1+2 · zone & sub zone
  if v_zone_id is null then
    raise exception 'Please choose your delivery zone.';
  end if;
  select * into v_zone from delivery_zones where id = v_zone_id;
  if not found then
    raise exception 'That delivery zone no longer exists.';
  end if;
  if not v_zone.active then
    raise exception 'Delivery is currently unavailable in this zone.';
  end if;
  v_fee := v_zone.fee;
  if v_zone.free_above > 0 then
    v_free := v_zone.free_above;
  end if;

  if v_subzone_id is not null then
    select * into v_subzone from delivery_subzones where id = v_subzone_id;
    if not found or v_subzone.zone_id <> v_zone_id then
      raise exception 'Please choose a sub zone inside the selected zone.';
    end if;
    if not v_subzone.active then
      raise exception 'That sub zone is currently unavailable.';
    end if;
    -- v5.1 · the sub zone's own delivery fee always wins over the
    -- parent zone's fee (zone fee applies only when no sub zone is chosen).
    v_fee := v_subzone.delivery_fee;
    v_subname := v_subzone.name_en;
  end if;

  -- STEP 3 · contact & detailed address
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Please enter your full name.';
  end if;
  if char_length(v_phone) < 8 or char_length(v_phone) > 20 then
    raise exception 'Please enter a valid phone number.';
  end if;
  if char_length(v_detail) < 4 or char_length(v_detail) > 500 then
    raise exception 'Please write your full address (building, apartment, floor, landmark).';
  end if;
  if char_length(v_maps) > 500 or char_length(v_notes) > 500 then
    raise exception 'Some fields are too long.';
  end if;
  if not (v_methods ? v_payment) then
    raise exception 'Please choose an available payment method.';
  end if;

  -- prices, always server-side
  v_priced   := public._price_cart(p -> 'items');
  v_lines    := v_priced -> 'lines';
  v_subtotal := (v_priced ->> 'subtotal')::numeric;

  if v_min > 0 and v_subtotal < v_min then
    raise exception 'Minimum order for delivery is % EGP — your subtotal is % EGP.', v_min, v_subtotal;
  end if;

  if v_free > 0 and v_subtotal >= v_free then
    v_fee := 0;
  end if;

  -- ══ DISCOUNTS ══
  if v_coupon <> '' then
    select * into v_d from discounts
     where code is not null and upper(code) = v_coupon
       and active and starts_at <= now()
       and (expires_at is null or expires_at > now())
       and (max_uses is null or used_count < max_uses)
     limit 1;
    if not found then
      raise exception 'This coupon code is invalid or has expired.';
    end if;
    if v_subtotal < v_d.min_order then
      raise exception 'This coupon needs a minimum order of % EGP.', v_d.min_order;
    end if;
    if v_d.type = 'signup' then
      if v_user is null then
        raise exception 'This coupon is for registered customers — please sign in.';
      end if;
      if exists (select 1 from delivery_orders where user_id = v_user) then
        raise exception 'This welcome coupon works on your first order only.';
      end if;
    end if;
    v_dis_amount := public._discount_value(v_d, v_lines, v_subtotal);
    if v_dis_amount <= 0 then
      raise exception 'This coupon does not apply to the items in your cart.';
    end if;
    v_dis_id    := v_d.id;
    v_label     := v_d.name;
    v_coupon_ok := v_coupon;
  else
    -- best automatic discount (code-less): global / product / category / signup
    for v_d in
      select * from discounts
       where code is null and active and starts_at <= now()
         and (expires_at is null or expires_at > now())
         and (max_uses is null or used_count < max_uses)
       order by id
    loop
      if v_subtotal < v_d.min_order then
        continue;
      end if;
      if v_d.type = 'signup'
         and (v_user is null
              or exists (select 1 from delivery_orders where user_id = v_user)) then
        continue;
      end if;
      v_amount := public._discount_value(v_d, v_lines, v_subtotal);
      if v_amount > v_dis_amount then
        v_dis_amount := v_amount;
        v_dis_id     := v_d.id;
        v_label      := v_d.name;
      end if;
    end loop;
  end if;
  v_dis_amount := least(v_dis_amount, v_subtotal);

  -- ══ LOYALTY redemption ══
  if v_redeem > 0 then
    if v_user is null then
      raise exception 'Sign in to redeem loyalty points.';
    end if;
    select value into v_loy from loyalty_settings where key = 'config';
    if not coalesce((v_loy ->> 'enabled')::boolean, true) then
      raise exception 'Loyalty rewards are currently disabled.';
    end if;
    v_pv    := coalesce((v_loy ->> 'point_value_egp')::numeric, 0);
    v_min_r := coalesce((v_loy ->> 'min_redeem')::int, 0);
    v_max_r := coalesce((v_loy ->> 'max_redeem')::int, 0);
    if v_pv <= 0 then
      raise exception 'Redemption is not configured yet.';
    end if;
    if v_redeem < v_min_r then
      raise exception 'Minimum redemption is % points.', v_min_r;
    end if;
    if v_max_r > 0 and v_redeem > v_max_r then
      raise exception 'Maximum redemption per order is % points.', v_max_r;
    end if;
    select points into v_bal from loyalty_accounts where user_id = v_user;
    if not found or v_bal < v_redeem then
      raise exception 'Not enough points — your balance is %.', coalesce(v_bal, 0);
    end if;
    v_pts_discount := round(v_redeem * v_pv, 2);
    v_pts_discount := least(v_pts_discount, v_subtotal - v_dis_amount);
    -- atomic check-and-set: the balance check lives INSIDE the update, so two
    -- simultaneous orders redeeming the same wallet can never drive the
    -- balance negative — the loser raises here and its WHOLE order rolls back
    update loyalty_accounts
       set points = points - v_redeem
     where user_id = v_user
       and points >= v_redeem;
    if not found then
      raise exception 'Not enough points — your balance just changed, please try again.';
    end if;
  end if;

  v_total := greatest(round(v_subtotal - v_dis_amount - v_pts_discount + v_fee, 2), 0);

  v_address := left(
    v_zone.name_en
    || case when v_subname <> '' then ' — ' || v_subname else '' end
    || ' — ' || v_detail, 700);

  insert into delivery_orders
    (customer_name, customer_phone, address, maps_link, notes,
     payment_method, items, subtotal, delivery_fee, total, estimated_minutes,
     zone_id, subzone_id, address_detail, user_id,
     discount_id, discount_amount, discount_label, coupon_code, loyalty_redeemed)
  values
    (v_name, v_phone, v_address, v_maps, v_notes,
     v_payment, v_lines, v_subtotal, v_fee, v_total, v_eta,
     v_zone_id, v_subzone_id, v_detail, v_user,
     v_dis_id, v_dis_amount, left(v_label, 120), v_coupon_ok, v_redeem)
  returning id, created_at into v_id, v_created;

  if v_redeem > 0 then
    insert into loyalty_transactions (user_id, order_id, delta, balance_after, reason, note)
    select v_user, v_id, -v_redeem,
           (select points from loyalty_accounts where user_id = v_user),
           'redeem', 'Points redeemed on a delivery order';
  end if;

  if v_dis_id is not null then
    -- atomic usage counter: the limit is re-checked under the row lock, so two
    -- simultaneous checkouts can never exceed max_uses; when the limit was just
    -- reached this raises — and the whole RPC rolls back WITH the order row above
    update discounts
       set used_count = used_count + 1
     where id = v_dis_id
       and (max_uses is null or used_count < max_uses);
    if not found then
      raise exception 'This coupon has just reached its usage limit.';
    end if;
  end if;

  insert into delivery_status_history (order_id, status, note, changed_by)
  values (v_id, 'Received', 'Order placed online.', 'customer');

  return jsonb_build_object(
    'id', v_id,
    'status', 'Received',
    'items', v_lines,
    'subtotal', v_subtotal,
    'discount', v_dis_amount,
    'discountLabel', v_label,
    'pointsDiscount', v_pts_discount,
    'pointsRedeemed', v_redeem,
    'deliveryFee', v_fee,
    'total', v_total,
    'paymentMethod', v_payment,
    'estimatedMinutes', v_eta,
    'zone', v_zone.name_en,
    'subZone', v_subname,
    'createdAt', v_created
  );
end;
$$;


-- ───────────────────── 11 · advance_delivery v5 ───────────────────
--  Received → Accepted → Preparing → Ready → Out for Delivery → Delivered
--  · dispatch accepts either an EXISTING driver or a TEMPORARY one
--    (name + phone stored on this order only — never in drivers)
--  · Delivered awards loyalty points · Cancelled refunds redeemed points
drop function if exists public.advance_delivery(uuid, text, bigint, integer, text) cascade;
create or replace function public.advance_delivery(
  p_id uuid, p_next text,
  p_driver_id  bigint default null,
  p_eta        integer default null,
  p_note       text    default '',
  p_temp_name  text    default '',
  p_temp_phone text    default ''
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
  v_tname  text := trim(coalesce(p_temp_name, ''));
  v_tphone text := trim(coalesce(p_temp_phone, ''));
  v_pts    integer := 0;
begin
  select * into v_order from delivery_orders where id = p_id;
  if not found then
    raise exception 'Delivery order not found.';
  end if;

  if p_next = 'Cancelled' then
    if v_order.status in ('Delivered', 'Cancelled') then
      raise exception 'Order is already "%".', v_order.status;
    end if;

    -- refund redeemed loyalty points (registered customers only)
    if v_order.loyalty_redeemed > 0 and v_order.user_id is not null then
      insert into loyalty_accounts (user_id, points)
      values (v_order.user_id, 0)
      on conflict (user_id) do nothing;
      update loyalty_accounts
         set points = points + v_order.loyalty_redeemed
       where user_id = v_order.user_id;
      insert into loyalty_transactions (user_id, order_id, delta, balance_after, reason, note)
      select v_order.user_id, p_id, v_order.loyalty_redeemed,
             (select points from loyalty_accounts where user_id = v_order.user_id),
             'refund', 'Order cancelled — points returned';
    end if;

    update delivery_orders
       set status = 'Cancelled', loyalty_redeemed = 0
     where id = p_id
       and status not in ('Delivered', 'Cancelled')  -- compare-and-swap: a
                                                     -- racing cancel/advance
                                                     -- loses (no double refund)
    returning * into v_order;
    if not found then
      raise exception 'This order''s status just changed — refresh and try again.';
    end if;
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

    -- courier (permanent OR temporary) is mandatory once the order leaves
    if p_next = 'Out for Delivery' then
      if p_driver_id is not null then
        select * into v_driver from drivers where id = p_driver_id and active = true;
        if not found then
          raise exception 'That driver is no longer active — pick another one.';
        end if;
      elsif v_tname <> '' then
        if char_length(v_tname) < 2 or char_length(v_tname) > 60 then
          raise exception 'Temporary driver name must be 2–60 characters.';
        end if;
        if char_length(v_tphone) < 8 or char_length(v_tphone) > 20 then
          raise exception 'Temporary driver phone must be 8–20 characters.';
        end if;
      elsif v_order.driver_id is null and v_order.temp_driver_name = '' then
        raise exception 'Choose a driver or add a temporary driver before dispatching the order.';
      end if;
    end if;

    update delivery_orders
       set status = p_next,
           driver_id = case
             when p_driver_id is not null then p_driver_id
             when v_tname <> '' and p_next = 'Out for Delivery' then null
             else driver_id
           end,
           temp_driver_name = case
             when p_next = 'Out for Delivery' and p_driver_id is not null then ''
             when p_next = 'Out for Delivery' and v_tname <> '' then v_tname
             else temp_driver_name
           end,
           temp_driver_phone = case
             when p_next = 'Out for Delivery' and p_driver_id is not null then ''
             when p_next = 'Out for Delivery' and v_tname <> '' then v_tphone
             else temp_driver_phone
           end,
           estimated_minutes = coalesce(
             case when p_eta between 5 and 240 then p_eta end,
             estimated_minutes),
           delivery_note = coalesce(nullif(left(coalesce(p_note, ''), 300), ''), delivery_note)
     where id = p_id
       and status = v_order.status  -- compare-and-swap: two staff advancing the
                                    -- same order at once → the loser fails here
                                    -- (no double step, no double loyalty earn)
    returning * into v_order;
    if not found then
      raise exception 'This order''s status just changed — refresh and try again.';
    end if;

    -- loyalty earning lands exactly once, when the food reaches the door
    if p_next = 'Delivered' and v_order.user_id is not null then
      select coalesce((value ->> 'points_per_order')::int, 0)
        into v_pts
        from loyalty_settings
       where key = 'config'
         and coalesce((value ->> 'enabled')::boolean, true);
      if coalesce(v_pts, 0) > 0 then
        insert into loyalty_accounts (user_id, points)
        values (v_order.user_id, 0)
        on conflict (user_id) do nothing;
        update loyalty_accounts set points = points + v_pts where user_id = v_order.user_id;
        insert into loyalty_transactions (user_id, order_id, delta, balance_after, reason, note)
        select v_order.user_id, p_id, v_pts,
               (select points from loyalty_accounts where user_id = v_order.user_id),
               'earn', 'Points earned on a delivered order';
        update delivery_orders set loyalty_earned = v_pts where id = p_id;
        -- keep the caller's return object in sync with the row
        -- (v_order was RETURNING-captured BEFORE this credit)
        v_order.loyalty_earned := v_pts;
      end if;
    end if;
  end if;

  insert into delivery_status_history (order_id, status, note, changed_by)
  values (p_id, p_next, left(coalesce(p_note, ''), 300), 'staff');

  return (select jsonb_build_object(
    'id', v_order.id,
    'status', v_order.status,
    'driverId', v_order.driver_id,
    'tempDriverName', v_order.temp_driver_name,
    'tempDriverPhone', v_order.temp_driver_phone,
    'estimatedMinutes', v_order.estimated_minutes,
    'deliveryNote', v_order.delivery_note,
    'loyaltyEarned', v_order.loyalty_earned,
    'updatedAt', v_order.updated_at
  ));
end;
$$;


-- ───────────────────── 12 · get_overview v5 (delivery-only) ───────
drop function if exists public.get_overview() cascade;
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
  v_del_today   integer;
  v_del_revenue numeric(12,2);
  v_del_active  integer;
  v_drivers     integer;
  v_gallery     integer;
  v_rev_pending integer;
  v_banners     integer;
  v_zones       integer;
  v_coupons     integer;
  v_members     integer;
  v_recent      jsonb;
  v_day_start   timestamptz :=
    ((now() at time zone 'Africa/Cairo')::date)::timestamp at time zone 'Africa/Cairo';
begin
  select count(*)::integer into v_products   from products;
  select count(*)::integer into v_available  from products where available = true;
  select count(*)::integer into v_categories from categories;
  select count(*)::integer into v_media      from media_library;

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
  select count(*)::integer into v_zones       from delivery_zones where active = true;
  select count(*)::integer into v_coupons     from discounts
   where active and (expires_at is null or expires_at > now());
  select count(*)::integer into v_members     from loyalty_accounts;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created desc), '[]'::jsonb)
    into v_recent
    from (
      select o.id,
             o.customer_name as "customer",
             o.total,
             o.status,
             o.created_at  as "createdAt",
             jsonb_array_length(o.items) as "itemsCount",
             o.created_at  as "created"
        from delivery_orders o
       order by o.created_at desc
       limit 6
    ) t;

  return jsonb_build_object(
    'products',          v_products,
    'available',         v_available,
    'categories',        v_categories,
    'media',             v_media,
    'delivery_today',    v_del_today,
    'delivery_revenue',  v_del_revenue,
    'delivery_active',   v_del_active,
    'drivers_active',    v_drivers,
    'gallery',           v_gallery,
    'reviews_pending',   v_rev_pending,
    'banners',           v_banners,
    'zones_active',      v_zones,
    'coupons_active',    v_coupons,
    'loyalty_members',   v_members,
    'recent',            v_recent
  );
end;
$$;


-- ───────────────────── 12b · website_content keys may be camelCase ─
-- navItems / footerAbout are the Visual Builder's native keys; a
-- snake_case-only key check would reject both seeds and admin saves.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'website_content_key_check'
       and conrelid = 'public.website_content'::regclass
       and pg_get_constraintdef(oid) not like '%A-Z%'
  ) then
    alter table public.website_content drop constraint website_content_key_check;
    alter table public.website_content
      add constraint website_content_key_check check (key ~ '^[a-z][a-zA-Z0-9_]*$');
  end if;
end $$;


-- ───────────────────── 13 · GRANTS ────────────────────────────────
grant execute on function public.place_delivery_order(jsonb) to anon, authenticated;
grant execute on function public.advance_delivery(uuid, text, bigint, integer, text, text, text) to anon, authenticated;
grant execute on function public.validate_coupon(jsonb)      to anon, authenticated;
grant execute on function public.get_overview()              to anon, authenticated;

-- pricing helpers stay INTERNAL (Postgres grants EXECUTE to PUBLIC by
-- default) — they only ever run inside the SECURITY DEFINER RPCs above.
revoke execute on function public._price_cart(jsonb) from public;
revoke execute on function public._discount_value(discounts, jsonb, numeric) from public;


-- ───────────────────── 14 · TRIGGERS on delivery_orders update ────
-- (kept from v4; re-asserted for idempotency)
drop trigger if exists trg_delivery_touch on public.delivery_orders;
create trigger trg_delivery_touch before update on public.delivery_orders
  for each row execute function public.set_updated_at();


-- ───────────────────── 15 · SEED DATA ─────────────────────────────

-- 15.1 · features → delivery-only platform
update public.settings
   set value = '{"ordering":true,"reservations":false,"delivery":true}'
 where key = 'features';
insert into public.settings (key, value)
select 'features', '{"ordering":true,"reservations":false,"delivery":true}'
 where not exists (select 1 from public.settings where key = 'features');

-- 15.2 · loyalty configuration (admin-editable in Settings → Rewards)
insert into public.loyalty_settings (key, value) values
  ('config', '{
    "enabled": true,
    "points_per_order": 20,
    "signup_bonus": 50,
    "point_value_egp": 0.5,
    "min_redeem": 50,
    "max_redeem": 300
  }'::jsonb)
on conflict (key) do nothing;

-- 15.3 · Hurghada delivery zones (starter fees — confirm & edit in
--        Admin → Zones; everything is fully editable, nothing hardcoded)
insert into public.delivery_zones (name_en, name_ar, fee, active, sort_order)
select * from (values
  ('Al Ahyaa',         'الأحياء',          20, true, 10),
  ('El Dahar',         'الدهار',           25, true, 20),
  ('El Hadaba',        'الهضبة',           25, true, 30),
  ('El Kawther',       'الكوثر',           30, true, 40),
  ('Arabia',           'أرابيا',           30, true, 50),
  ('Sakkala',          'سقالة',            30, true, 60),
  ('Sheraton',         'شيراتون',          30, true, 70),
  ('Mubarak 7',        'مبارك 7',          35, true, 80),
  ('Mubarak 11',       'مبارك 11',         40, true, 90),
  ('Intercontinental', 'إنتركونتيننتال',   40, true, 100),
  ('Makadi Bay',       'خليج مكادي',       70, true, 110),
  ('Sahl Hasheesh',    'سهل حشيش',         80, true, 120),
  ('El Gouna',         'الجونة',           90, true, 130)
) as x(name_en, name_ar, fee, active, sort_order)
where not exists (select 1 from public.delivery_zones);

-- 15.4 · starter sub-zones (El Dahar from the brief + a few landmarks;
--        unlimited more can be added from Admin → Zones)
insert into public.delivery_subzones (zone_id, name_en, name_ar, delivery_fee, active, sort_order)
select z.id, x.name_en, x.name_ar, x.delivery_fee, true, x.sort_order
  from (values
    ('El Dahar',  'Nasr Street',      'شارع نصر',     25, 10),
    ('El Dahar',  'Dahar Square',     'ميدان الدهار', 25, 20),
    ('El Dahar',  'Post Office',      'مكتب البريد',  30, 30),
    ('El Dahar',  'Dahar Beach',      'شاطئ الدهار',  35, 40),
    ('Sakkala',   'Sakkala Square',   'ميدان سقالة',  30, 10),
    ('Sakkala',   'El Mamsha',        'الممشى',       35, 20),
    ('Sheraton',  'Sheraton Road',    'طريق شيراتون', 40, 10),
    ('El Kawther','Kawther Hospital Area', 'منطقة مستشفى الكوثر', 30, 10)
  ) as x(zone_en, name_en, name_ar, delivery_fee, sort_order)
  join public.delivery_zones z on z.name_en = x.zone_en
where not exists (select 1 from public.delivery_subzones);

-- 15.4b · one-time behaviour-preserving backfill: pre-existing sub zones
-- inherit their parent zone's fee so nothing changes for live customers
-- until the operator edits individual sub zone fees in Admin → Zones.
-- (guarded by a marker row → running this migration again NEVER
--  overwrites hand-tuned sub zone prices)
do $$
begin
  if not exists (select 1 from public.settings where key = 'subzone_fee_migrated') then
    update public.delivery_subzones s
       set delivery_fee = z.fee
      from public.delivery_zones z
     where z.id = s.zone_id
       and s.delivery_fee = 0;
    insert into public.settings (key, value) values ('subzone_fee_migrated', '1');
  end if;
end $$;

-- 15.5 · business TODO — refreshed for the delivery-only platform
update public.settings
   set value = '[
  {"text":"Upload the official logo (from our Facebook page) via Media Library → set it in Customizer → General","done":false},
  {"text":"Add menu pages whose prices were not verified yet: Seafood mains, Pizza, Shawerma Fatteh, Matcha drinks, Fresh juices, Cold drinks & Desserts","done":false},
  {"text":"Confirm per-zone delivery fees in Zones (starter values were estimated)","done":false},
  {"text":"Add or fine-tune sub zones for every main zone","done":false},
  {"text":"Add the real delivery captains with their numbers in Drivers (remove the demo driver)","done":false},
  {"text":"Replace the demo reviews with real Google reviews in Reviews","done":false},
  {"text":"Add interior photos to the Gallery (aquarium tank, kids corner, terrace at sunset)","done":false},
  {"text":"Fill Arabic names for products & categories (Menu Manager → edit item)","done":false},
  {"text":"Create the first coupons in Discounts (e.g. WELCOME10 signup coupon)","done":false},
  {"text":"Tune loyalty rewards in Settings → Rewards (points per order, redeem value)","done":false}
]'
 where key = 'business_todo';

-- ───────────────────── DONE ───────────────────────────────────────
-- Verify with:  select get_overview();          -- v4→v5 keys present
--               select count(*) from delivery_zones;   -- 13
--               select validate_coupon('{"code":"X","items":[{"productId":1,"quantity":1}]}'::jsonb);

-- ═══════════════════════════════════════════════════════════════════
--  v5.1.1 (2026-08-09) · reorder_rows — ONE atomic server-side reorder
--  (full rationale: supabase/schema.sql). SECURITY INVOKER — RLS is NOT
--  bypassed; hard-coded allowlist; writes nothing but sort_order.
-- ═══════════════════════════════════════════════════════════════════
create or replace function public.reorder_rows(p_table text, p_ids bigint[])
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_targets constant text[] := array[
    'categories', 'products', 'gallery', 'banners',
    'social_links', 'delivery_zones', 'delivery_subzones'
  ];
  v_n integer := 0;
begin
  if p_table is null or not (p_table = any (v_targets)) then
    raise exception 'reorder_rows: unknown target table.';
  end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;
  execute format(
    'update public.%I as t
        set sort_order = v.ord * 10
       from (select row_id, ord
               from unnest($1) with ordinality as u(row_id, ord)) as v
      where t.id = v.row_id',
    p_table)
  using p_ids;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

grant execute on function public.reorder_rows(text, bigint[]) to anon, authenticated;
