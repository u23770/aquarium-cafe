-- ═══════════════════════════════════════════════════════════════════
--  AQUARIUM CAFE & RESTURANT — PRODUCTION SCHEMA v5.1  (Supabase / PostgreSQL)
--  v5.1.1 · 2026-08-09 · atomic-counters hardening (coupon usage, loyalty
--          balances, order status) — see migrations/20260809_v51_atomic_guards.sql
--  v5.1.2 · 2026-08-10 · RLS role-switch fix — public READS are
--          "TO anon, authenticated" so a customer login never hides data —
--          migrations/20260810_rls_role_switch.sql
--  v5.1.3 · 2026-08-10 · ADMIN-WRITE LOCKDOWN — all admin-table writes are
--          "TO anon" only (never authenticated); session isolation in
--          shared/supabase.js keeps Admin/Waiter permanently `anon`
--  Hurghada · delivery-only: Customer site + Waiter board + Admin CMS
-- ═══════════════════════════════════════════════════════════════════
--  Run ONCE on a completely EMPTY Supabase project:
--    Dashboard → SQL Editor → New query → paste → Run
--
--  Contents (execution order):
--    0  reset ............... drops older Menta/Aquarium tables (no-op
--                             on a brand-new project)
--    1  trigger helpers ..... set_updated_at()
--    2  tables .............. settings, website_theme, website_content,
--                             website_sections, media_library, categories,
--                             products (multilingual), drivers,
--                             delivery_zones, delivery_subzones, discounts,
--                             delivery_orders, delivery_status_history,
--                             driver_locations, customer_profiles,
--                             loyalty_settings, loyalty_accounts,
--                             loyalty_transactions, gallery, reviews,
--                             banners, social_links, delivery_settings,
--                             notification_settings, loyalty_settings
--    3  triggers ............ auto updated_at + auth welcome (profile +
--                             loyalty account + signup bonus)
--    4  row level security .. anon operator policies + owner-only loyalty
--    5  rpc functions ....... _price_cart, _discount_value,
--                             validate_coupon, place_delivery_order,
--                             advance_delivery, get_overview
--    6  realtime ............ delivery_orders + appearance tables
--    7  storage ............. "media" public bucket + policies
--    8  seed data ........... REAL Aquarium business data (phone, address,
--                             hours, socials), FULL bilingual menu with the
--                             real photographed prices (hot drinks,
--                             smoothies, shisha, additions, kids), brand
--                             theme & content, gallery, banner, demo
--                             reviews & business TODO checklist
--
--  The script is FULLY IDEMPOTENT and self-healing:
--   · safe to run again after a success, a partial failure, or on top
--     of an older Aquarium install (all policies/triggers/indexes are
--     dropped or IF NOT EXISTS first; every seed has a conflict guard;
--     storage.objects policies are dropped-or-created explicitly).
--
--  NOTE · login-free single-operator restaurant governed by RLS.
--  See DATABASE_CHANGES.md §12 for adding Supabase Auth later.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────── 0 · RESET (fresh start) ─────────────────────
drop table if exists public.delivery_status_history cascade;
drop table if exists public.delivery_orders        cascade;
drop table if exists public.driver_locations       cascade;
drop table if exists public.drivers                cascade;
drop table if exists public.gallery                cascade;
drop table if exists public.reviews                cascade;
drop table if exists public.banners                cascade;
drop table if exists public.social_links           cascade;
drop table if exists public.delivery_settings      cascade;
drop table if exists public.notification_settings  cascade;
drop table if exists public.order_items            cascade;
drop table if exists public.orders                 cascade;
drop table if exists public.reservations           cascade;
drop table if exists public.products               cascade;
drop table if exists public.categories             cascade;
drop table if exists public.settings               cascade;
drop table if exists public.website_theme          cascade;
drop table if exists public.website_content        cascade;
drop table if exists public.website_sections       cascade;
drop table if exists public.media_library          cascade;

drop function if exists public.place_delivery_order(jsonb)  cascade;
drop function if exists public.advance_delivery(uuid, text, bigint, integer, text, text, text) cascade;
drop function if exists public.advance_delivery(uuid, text, bigint, integer, text) cascade;
drop function if exists public.validate_coupon(jsonb)       cascade;
drop function if exists public.get_overview()               cascade;
drop function if exists public._price_cart(jsonb)           cascade;
drop function if exists public._discount_value(discounts, jsonb, numeric) cascade;
drop function if exists public.handle_new_user()            cascade;

-- platform v5 is DELIVERY-ONLY: dine-in + reservations are gone
-- (they were already dropped above; v4 data is preserved by the migration instead).
drop trigger if exists on_auth_user_created on auth.users;

-- v5 new structures
drop table if exists public.loyalty_transactions cascade;
drop table if exists public.loyalty_accounts     cascade;
drop table if exists public.customer_profiles    cascade;
drop table if exists public.loyalty_settings     cascade;
drop table if exists public.discounts            cascade;
drop table if exists public.delivery_subzones    cascade;
drop table if exists public.delivery_zones       cascade;

-- legacy v2 storage bucket (no-op on a fresh project)
do $$ begin
  delete from storage.objects where bucket_id = 'product-images';
  delete from storage.buckets where id = 'product-images';
exception when others then null;
end $$;


-- ───────────────────── 1 · TRIGGER HELPERS ─────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ───────────────────── 2 · TABLES ──────────────────────────────────

-- ┌────────────────────────────────────────────────────────────────┐
-- │ WEBSITE MANAGEMENT (Admin CMS · Visual Builder output)         │
-- └────────────────────────────────────────────────────────────────┘

-- 2.1 · settings — restaurant identity & feature switches (key/text)
create table public.settings (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value      text not null default '' check (char_length(value) <= 2000),
  updated_at timestamptz not null default now()
);
comment on table public.settings is
  'Identity: cafe_name, slogan, description, copyright, logo_url, favicon_url, currency, features(json), business_todo(json).';

-- 2.2 · website_theme — every visual option of the Visual Builder
create table public.website_theme (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2.3 · website_content — texts, contact, hours, branches, highlights
-- (keys come straight from the Visual Builder and include camelCase
--  entries like navItems / footerAbout — the check must allow them)
create table public.website_content (
  key        text primary key check (key ~ '^[a-z][a-zA-Z0-9_]*$'),
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2.4 · website_sections — homepage section order & visibility
create table public.website_sections (
  id         text primary key check (id ~ '^[a-z][a-z0-9_]*$'),
  label      text not null default '',
  position   integer not null default 0,
  visible    boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 2.5 · media_library — catalogue of every uploaded image
create table public.media_library (
  id         bigint generated always as identity primary key,
  bucket     text not null default 'media',
  path       text not null,
  name       text not null default '' check (char_length(name) <= 160),
  folder     text not null default 'general' check (char_length(folder) <= 120),
  size_bytes bigint not null default 0,
  mime       text not null default '' check (char_length(mime) <= 60),
  public_url text not null default '' check (char_length(public_url) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, path)
);

-- 2.6 · social_links — footer/contact social icons (table-driven)
create table public.social_links (
  id         bigint generated always as identity primary key,
  platform   text not null check (platform ~ '^[a-z][a-z0-9_]{0,19}$') unique,
  url        text not null default '' check (char_length(url) <= 500),
  visible    boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ┌────────────────────────────────────────────────────────────────┐
-- │ MENU                                                           │
-- └────────────────────────────────────────────────────────────────┘

create table public.categories (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 2 and 60),
  name_ar    text not null default '' check (char_length(name_ar) <= 60),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  visible    boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id          bigint generated always as identity primary key,
  category_id bigint not null references public.categories(id) on delete restrict,
  name        text not null check (char_length(name) between 2 and 80),
  name_ar     text not null default '' check (char_length(name_ar) <= 80),
  description text not null default '' check (char_length(description) <= 600),
  description_ar text not null default '' check (char_length(description_ar) <= 600),
  price       numeric(10,2) not null default 0 check (price >= 0),
  image       text not null default '' check (char_length(image) <= 500),
  badge       text not null default '' check (char_length(badge) <= 24),
  available   boolean not null default true,
  featured    boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ┌────────────────────────────────────────────────────────────────┐
-- │ DELIVERY SYSTEM                                                │
-- └────────────────────────────────────────────────────────────────┘

-- 2.12 · drivers — delivery captains (name + phone shown on tracking)
create table public.drivers (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 2 and 60),
  phone      text not null check (char_length(phone) between 8 and 20),
  active     boolean not null default true,
  notes      text not null default '' check (char_length(notes) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.delivery_zones (
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

create table public.delivery_subzones (
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

-- 2.13 · delivery_settings — fees, ETA, payments (key/jsonb)
create table public.delivery_settings (
  key   text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null default '{}'::jsonb
);

-- 2.14 · delivery_orders — the uuid IS the (unguessable) tracking link
create table public.delivery_orders (
  id                uuid primary key default gen_random_uuid(),
  customer_name     text not null check (char_length(customer_name) between 2 and 80),
  customer_phone    text not null check (char_length(customer_phone) between 8 and 20),
  address           text not null check (char_length(address) between 4 and 700),
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
  -- v5: zones · structured address · temp driver · accounts · discounts · loyalty
  zone_id           bigint references public.delivery_zones(id) on delete set null,
  subzone_id        bigint references public.delivery_subzones(id) on delete set null,
  address_detail    text not null default '' check (char_length(address_detail) <= 500),
  temp_driver_name  text not null default '' check (char_length(temp_driver_name) <= 60),
  temp_driver_phone text not null default '' check (char_length(temp_driver_phone) <= 20),
  user_id           uuid references auth.users(id) on delete set null,
  discount_id       bigint references public.discounts(id) on delete set null,
  discount_amount   numeric(10,2) not null default 0,
  discount_label    text not null default '' check (char_length(discount_label) <= 120),
  coupon_code       text not null default '' check (char_length(coupon_code) <= 24),
  loyalty_redeemed  integer not null default 0,
  loyalty_earned    integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 2.15 · delivery_status_history — every step, timestamped
create table public.delivery_status_history (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.delivery_orders(id) on delete cascade,
  status     text not null,
  note       text not null default '',
  changed_by text not null default 'staff',
  created_at timestamptz not null default now()
);

-- 2.16 · driver_locations — GPS-ready (written by a future courier app)
create table public.driver_locations (
  id         bigint generated always as identity primary key,
  driver_id  bigint not null references public.drivers(id) on delete cascade,
  lat        numeric(9,6) not null,
  lng        numeric(9,6) not null,
  created_at timestamptz not null default now()
);


-- ┌────────────────────────────────────────────────────────────────┐
-- │ CUSTOMER ACCOUNTS + LOYALTY + DISCOUNTS (v5)                   │
-- └────────────────────────────────────────────────────────────────┘

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

-- ┌────────────────────────────────────────────────────────────────┐
-- │ MARKETING CONTENT                                              │
-- └────────────────────────────────────────────────────────────────┘

create table public.gallery (
  id         bigint generated always as identity primary key,
  image      text not null check (char_length(image) <= 500),
  title      text not null default '' check (char_length(title) <= 120),
  visible    boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.reviews (
  id            bigint generated always as identity primary key,
  customer_name text not null check (char_length(customer_name) between 2 and 60),
  rating        integer not null check (rating between 1 and 5),
  text          text not null check (char_length(text) between 4 and 600),
  source        text not null default 'website' check (char_length(source) <= 20),
  approved      boolean not null default false,
  created_at    timestamptz not null default now()
);

create table public.banners (
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

-- ┌────────────────────────────────────────────────────────────────┐
-- │ OPERATION SETTINGS                                             │
-- └────────────────────────────────────────────────────────────────┘

create table public.notification_settings (
  key   text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null default '{}'::jsonb
);

-- 2.x · indexes
create index if not exists idx_products_category     on public.products (category_id);
create index if not exists idx_products_available    on public.products (sort_order, id) where available = true;
create index if not exists idx_products_featured     on public.products (featured) where available = true and featured = true;
create index if not exists idx_categories_order      on public.categories (sort_order, id);
create index if not exists idx_media_folder          on public.media_library (folder);
create index if not exists idx_media_created         on public.media_library (created_at desc);
create index if not exists idx_sections_position     on public.website_sections (position);
create index if not exists idx_delivery_status       on public.delivery_orders (status, created_at desc);
create index if not exists idx_delivery_active       on public.delivery_orders (created_at)
  where status not in ('Delivered', 'Cancelled');
create index if not exists idx_delivery_driver       on public.delivery_orders (driver_id);
create index if not exists idx_delivery_phone        on public.delivery_orders (customer_phone);
create index if not exists idx_delivery_hist_order   on public.delivery_status_history (order_id, created_at);
create index if not exists idx_driver_loc_driver     on public.driver_locations (driver_id, created_at desc);
create index if not exists idx_drivers_active        on public.drivers (id) where active = true;
create index if not exists idx_gallery_order         on public.gallery (sort_order, id);
create index if not exists idx_reviews_approved      on public.reviews (created_at desc) where approved = true;
create index if not exists idx_banners_order         on public.banners (sort_order, id);
create index if not exists idx_socials_order         on public.social_links (sort_order, id);
create index if not exists idx_zones_order    on public.delivery_zones (sort_order, id) where active = true;
create index if not exists idx_subzones_zone  on public.delivery_subzones (zone_id, sort_order, id);
create index if not exists idx_delivery_zone  on public.delivery_orders (zone_id);
create index if not exists idx_loyalty_tx_user  on public.loyalty_transactions (user_id, created_at desc);
create index if not exists idx_loyalty_tx_order on public.loyalty_transactions (order_id);
create index if not exists idx_discounts_active on public.discounts (active, starts_at, expires_at);
create unique index if not exists idx_discounts_code_u on public.discounts (upper(code)) where code is not null;
create index if not exists idx_delivery_user   on public.delivery_orders (user_id, created_at desc) where user_id is not null;


-- ───────────────────── 3 · TRIGGERS ────────────────────────────────
drop trigger if exists trg_settings_touch on public.settings;
create trigger trg_settings_touch     before update on public.settings         for each row execute function public.set_updated_at();
drop trigger if exists trg_theme_touch on public.website_theme;
create trigger trg_theme_touch        before update on public.website_theme    for each row execute function public.set_updated_at();
drop trigger if exists trg_content_touch on public.website_content;
create trigger trg_content_touch      before update on public.website_content  for each row execute function public.set_updated_at();
drop trigger if exists trg_sections_touch on public.website_sections;
create trigger trg_sections_touch     before update on public.website_sections for each row execute function public.set_updated_at();
drop trigger if exists trg_media_touch on public.media_library;
create trigger trg_media_touch        before update on public.media_library    for each row execute function public.set_updated_at();
drop trigger if exists trg_categories_touch on public.categories;
create trigger trg_categories_touch   before update on public.categories       for each row execute function public.set_updated_at();
drop trigger if exists trg_products_touch on public.products;
create trigger trg_products_touch     before update on public.products         for each row execute function public.set_updated_at();
drop trigger if exists trg_drivers_touch on public.drivers;
create trigger trg_drivers_touch      before update on public.drivers          for each row execute function public.set_updated_at();
drop trigger if exists trg_delivery_touch on public.delivery_orders;
create trigger trg_delivery_touch     before update on public.delivery_orders  for each row execute function public.set_updated_at();
drop trigger if exists trg_zones_touch on public.delivery_zones;
create trigger trg_zones_touch        before update on public.delivery_zones    for each row execute function public.set_updated_at();
drop trigger if exists trg_subzones_touch on public.delivery_subzones;
create trigger trg_subzones_touch     before update on public.delivery_subzones for each row execute function public.set_updated_at();
drop trigger if exists trg_profiles_touch on public.customer_profiles;
create trigger trg_profiles_touch     before update on public.customer_profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_discounts_touch on public.discounts;
create trigger trg_discounts_touch    before update on public.discounts        for each row execute function public.set_updated_at();

-- Welcome profile + loyalty account + signup bonus on every signup

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


-- ───────────────────── 4 · ROW LEVEL SECURITY ──────────────────────
alter table public.settings               enable row level security;
alter table public.website_theme          enable row level security;
alter table public.website_content        enable row level security;
alter table public.website_sections       enable row level security;
alter table public.media_library          enable row level security;
alter table public.social_links           enable row level security;
alter table public.categories             enable row level security;
alter table public.products               enable row level security;
alter table public.delivery_zones         enable row level security;
alter table public.delivery_subzones      enable row level security;
alter table public.discounts              enable row level security;
alter table public.customer_profiles      enable row level security;
alter table public.loyalty_settings       enable row level security;
alter table public.loyalty_accounts       enable row level security;
alter table public.loyalty_transactions   enable row level security;
alter table public.drivers                enable row level security;
alter table public.delivery_settings      enable row level security;
alter table public.delivery_orders        enable row level security;
alter table public.delivery_status_history enable row level security;
alter table public.driver_locations       enable row level security;
alter table public.gallery                enable row level security;
alter table public.reviews                enable row level security;
alter table public.banners                enable row level security;
alter table public.notification_settings  enable row level security;

-- settings / theme / content / sections — read; builder writes; no delete
drop policy if exists "settings: anon read" on public.settings;
create policy "settings: anon read"   on public.settings for select to anon, authenticated using (true);
drop policy if exists "settings: anon insert" on public.settings;
create policy "settings: anon insert" on public.settings for insert to anon with check (true);
drop policy if exists "settings: anon update" on public.settings;
create policy "settings: anon update" on public.settings for update to anon using (true) with check (true);

drop policy if exists "theme: anon read" on public.website_theme;
create policy "theme: anon read"      on public.website_theme for select to anon, authenticated using (true);
drop policy if exists "theme: anon insert" on public.website_theme;
create policy "theme: anon insert"    on public.website_theme for insert to anon with check (true);
drop policy if exists "theme: anon update" on public.website_theme;
create policy "theme: anon update"    on public.website_theme for update to anon using (true) with check (true);

drop policy if exists "content: anon read" on public.website_content;
create policy "content: anon read"    on public.website_content for select to anon, authenticated using (true);
drop policy if exists "content: anon insert" on public.website_content;
create policy "content: anon insert"  on public.website_content for insert to anon with check (true);
drop policy if exists "content: anon update" on public.website_content;
create policy "content: anon update"  on public.website_content for update to anon using (true) with check (true);

drop policy if exists "sections: anon read" on public.website_sections;
create policy "sections: anon read"   on public.website_sections for select to anon, authenticated using (true);
drop policy if exists "sections: anon insert" on public.website_sections;
create policy "sections: anon insert" on public.website_sections for insert to anon with check (true);
drop policy if exists "sections: anon update" on public.website_sections;
create policy "sections: anon update" on public.website_sections for update to anon using (true) with check (true);

-- media_library — full CRUD (Media Library page)
drop policy if exists "media: anon read" on public.media_library;
create policy "media: anon read"      on public.media_library for select to anon, authenticated using (true);
drop policy if exists "media: anon insert" on public.media_library;
create policy "media: anon insert"    on public.media_library for insert to anon with check (true);
drop policy if exists "media: anon update" on public.media_library;
create policy "media: anon update"    on public.media_library for update to anon using (true) with check (true);
drop policy if exists "media: anon delete" on public.media_library;
create policy "media: anon delete"    on public.media_library for delete to anon using (true);

-- social_links — full CRUD (Social page); rows are never deleted from the UI
drop policy if exists "socials: anon read" on public.social_links;
create policy "socials: anon read"    on public.social_links for select to anon, authenticated using (true);
drop policy if exists "socials: anon insert" on public.social_links;
create policy "socials: anon insert"  on public.social_links for insert to anon with check (true);
drop policy if exists "socials: anon update" on public.social_links;
create policy "socials: anon update"  on public.social_links for update to anon using (true) with check (true);
drop policy if exists "socials: anon delete" on public.social_links;
create policy "socials: anon delete"  on public.social_links for delete to anon using (true);

-- categories / products — full CRUD (menu management)
drop policy if exists "categories: anon read" on public.categories;
create policy "categories: anon read"   on public.categories for select to anon, authenticated using (true);
drop policy if exists "categories: anon insert" on public.categories;
create policy "categories: anon insert" on public.categories for insert to anon with check (true);
drop policy if exists "categories: anon update" on public.categories;
create policy "categories: anon update" on public.categories for update to anon using (true) with check (true);
drop policy if exists "categories: anon delete" on public.categories;
create policy "categories: anon delete" on public.categories for delete to anon using (true);

drop policy if exists "products: anon read" on public.products;
create policy "products: anon read"   on public.products for select to anon, authenticated using (true);
drop policy if exists "products: anon insert" on public.products;
create policy "products: anon insert" on public.products for insert to anon with check (true);
drop policy if exists "products: anon update" on public.products;
create policy "products: anon update" on public.products for update to anon using (true) with check (true);
drop policy if exists "products: anon delete" on public.products;
create policy "products: anon delete" on public.products for delete to anon using (true);

-- zones / subzones — public read, operator write
drop policy if exists "zones: anon read" on public.delivery_zones;
create policy "zones: anon read"    on public.delivery_zones for select to anon, authenticated using (true);
drop policy if exists "zones: anon insert" on public.delivery_zones;
create policy "zones: anon insert"  on public.delivery_zones for insert to anon with check (true);
drop policy if exists "zones: anon update" on public.delivery_zones;
create policy "zones: anon update"  on public.delivery_zones for update to anon using (true) with check (true);
drop policy if exists "zones: anon delete" on public.delivery_zones;
create policy "zones: anon delete"  on public.delivery_zones for delete to anon using (true);

drop policy if exists "subzones: anon read" on public.delivery_subzones;
create policy "subzones: anon read"    on public.delivery_subzones for select to anon, authenticated using (true);
drop policy if exists "subzones: anon insert" on public.delivery_subzones;
create policy "subzones: anon insert"  on public.delivery_subzones for insert to anon with check (true);
drop policy if exists "subzones: anon update" on public.delivery_subzones;
create policy "subzones: anon update"  on public.delivery_subzones for update to anon using (true) with check (true);
drop policy if exists "subzones: anon delete" on public.delivery_subzones;
create policy "subzones: anon delete"  on public.delivery_subzones for delete to anon using (true);

-- discounts — readable/writable by the operator (same trust model as menu);
-- coupon validity is enforced server-side in the RPCs.
drop policy if exists "discounts: anon read" on public.discounts;
create policy "discounts: anon read"    on public.discounts for select to anon, authenticated using (true);
drop policy if exists "discounts: anon insert" on public.discounts;
create policy "discounts: anon insert"  on public.discounts for insert to anon with check (true);
drop policy if exists "discounts: anon update" on public.discounts;
create policy "discounts: anon update"  on public.discounts for update to anon using (true) with check (true);
drop policy if exists "discounts: anon delete" on public.discounts;
create policy "discounts: anon delete"  on public.discounts for delete to anon using (true);

drop policy if exists "loyaltyset: anon read" on public.loyalty_settings;
create policy "loyaltyset: anon read"   on public.loyalty_settings for select to anon, authenticated using (true);
drop policy if exists "loyaltyset: anon insert" on public.loyalty_settings;
create policy "loyaltyset: anon insert" on public.loyalty_settings for insert to anon with check (true);
drop policy if exists "loyaltyset: anon update" on public.loyalty_settings;
create policy "loyaltyset: anon update" on public.loyalty_settings for update to anon using (true) with check (true);

-- profiles — the signed-in customer owns exactly one row
drop policy if exists "profiles: owner read" on public.customer_profiles;
create policy "profiles: owner read"   on public.customer_profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "profiles: owner insert" on public.customer_profiles;
create policy "profiles: owner insert" on public.customer_profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "profiles: owner update" on public.customer_profiles;
create policy "profiles: owner update" on public.customer_profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- loyalty points — read-only to their owner; RPCs write them
drop policy if exists "loyalty: owner read" on public.loyalty_accounts;
create policy "loyalty: owner read" on public.loyalty_accounts for select to authenticated using (auth.uid() = user_id);

drop policy if exists "loyalty_tx: owner read" on public.loyalty_transactions;
create policy "loyalty_tx: owner read" on public.loyalty_transactions for select to authenticated using (auth.uid() = user_id);

-- drivers — readable (courier name/phone shown on the live tracking screen)
drop policy if exists "drivers: anon read" on public.drivers;
create policy "drivers: anon read"    on public.drivers for select to anon, authenticated using (true);
drop policy if exists "drivers: anon insert" on public.drivers;
create policy "drivers: anon insert"  on public.drivers for insert to anon with check (true);
drop policy if exists "drivers: anon update" on public.drivers;
create policy "drivers: anon update"  on public.drivers for update to anon using (true) with check (true);
drop policy if exists "drivers: anon delete" on public.drivers;
create policy "drivers: anon delete"  on public.drivers for delete to anon using (true);

-- delivery settings — read; admin writes; no delete
drop policy if exists "delset: anon read" on public.delivery_settings;
create policy "delset: anon read"    on public.delivery_settings for select to anon, authenticated using (true);
drop policy if exists "delset: anon insert" on public.delivery_settings;
create policy "delset: anon insert"  on public.delivery_settings for insert to anon with check (true);
drop policy if exists "delset: anon update" on public.delivery_settings;
create policy "delset: anon update"  on public.delivery_settings for update to anon using (true) with check (true);


drop policy if exists "notset: anon read" on public.notification_settings;
create policy "notset: anon read"    on public.notification_settings for select to anon, authenticated using (true);
drop policy if exists "notset: anon insert" on public.notification_settings;
create policy "notset: anon insert"  on public.notification_settings for insert to anon with check (true);
drop policy if exists "notset: anon update" on public.notification_settings;
create policy "notset: anon update"  on public.notification_settings for update to anon using (true) with check (true);

-- delivery_orders — READ-ONLY via the unguessable uuid tracking link;
-- writes happen exclusively inside place_delivery_order / advance_delivery.
drop policy if exists "delivery: anon read" on public.delivery_orders;
create policy "delivery: anon read" on public.delivery_orders for select to anon, authenticated using (true);

-- delivery_status_history — read-only feed for the tracking timeline
drop policy if exists "delivery_hist: anon read" on public.delivery_status_history;
create policy "delivery_hist: anon read" on public.delivery_status_history for select to anon, authenticated using (true);

-- driver_locations — service-role only (a future courier app); anon gets nothing.

-- gallery / banners — public read, admin write
drop policy if exists "gallery: anon read" on public.gallery;
create policy "gallery: anon read"   on public.gallery for select to anon, authenticated using (true);
drop policy if exists "gallery: anon insert" on public.gallery;
create policy "gallery: anon insert" on public.gallery for insert to anon with check (true);
drop policy if exists "gallery: anon update" on public.gallery;
create policy "gallery: anon update" on public.gallery for update to anon using (true) with check (true);
drop policy if exists "gallery: anon delete" on public.gallery;
create policy "gallery: anon delete" on public.gallery for delete to anon using (true);

drop policy if exists "banners: anon read" on public.banners;
create policy "banners: anon read"   on public.banners for select to anon, authenticated using (true);
drop policy if exists "banners: anon insert" on public.banners;
create policy "banners: anon insert" on public.banners for insert to anon with check (true);
drop policy if exists "banners: anon update" on public.banners;
create policy "banners: anon update" on public.banners for update to anon using (true) with check (true);
drop policy if exists "banners: anon delete" on public.banners;
create policy "banners: anon delete" on public.banners for delete to anon using (true);

-- reviews — anyone reads; anyone can SUBMIT (always unapproved → moderation);
-- admin approves / removes. (Single-operator model — see DATABASE_CHANGES §12.)
drop policy if exists "reviews: anon read" on public.reviews;
create policy "reviews: anon read"   on public.reviews for select to anon, authenticated using (true);
drop policy if exists "reviews: anon submit" on public.reviews;
create policy "reviews: anon submit" on public.reviews for insert to anon, authenticated with check (approved = false);
drop policy if exists "reviews: anon update" on public.reviews;
create policy "reviews: anon update" on public.reviews for update to anon using (true) with check (true);
drop policy if exists "reviews: anon delete" on public.reviews;
create policy "reviews: anon delete" on public.reviews for delete to anon using (true);


-- ───────────────────── 5 · RPC FUNCTIONS ───────────────────────────

-- 5.1 · _price_cart(items) — single source of truth for pricing & discount math
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

-- 5.2 · _discount_value(discount, lines, subtotal) — discount math
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

-- 5.3 · validate_coupon(code, items, userId) — live checkout preview (read-only)
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

-- 5.4 · place_delivery_order(payload) — zones + discounts + loyalty + auth.
--       Everything validated and priced 100% server-side.
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
  v_subname text := '';   -- plain var: reading a field of an never-assigned
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

-- 5.5 · advance_delivery(order, next, driver?, eta?, note?, tempName?, tempPhone?)
--       temporary drivers, points on deliver, points refund on cancel
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

-- 5.6 · get_overview() — admin dashboard counters (delivery-only)
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


-- ═══════════════════════════════════════════════════════════════════
--  v5.1.1 · reorder_rows — ONE atomic server-side reorder
-- ═══════════════════════════════════════════════════════════════════
--  The admin panel reorders categories, products, gallery photos, banners,
--  social links, zones and sub zones by sending the desired id order.
--  Those tables use GENERATED ALWAYS identity keys — so a bulk PostgREST
--  UPSERT can never work against them (its DO UPDATE would SET the identity
--  column, which PostgreSQL rejects with 428C9), while a client-side loop
--  of single-row UPDATEs can leave a half-applied reorder on a mid-way
--  network failure.  This helper applies ALL positions in ONE statement:
--  fully atomic, SECURITY INVOKER (RLS is NOT bypassed), hard-coded
--  allowlist of the seven sortable tables, and it writes nothing but
--  sort_order — callers can do nothing they couldn't already do through
--  the existing anon operator policies.
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


-- ───────────────────── 5b · GRANTS ───────────────────────────────────
grant execute on function public.place_delivery_order(jsonb)     to anon, authenticated;
grant execute on function public.advance_delivery(uuid, text, bigint, integer, text, text, text) to anon, authenticated;
grant execute on function public.validate_coupon(jsonb)          to anon, authenticated;
grant execute on function public.get_overview()                  to anon, authenticated;
grant execute on function public.reorder_rows(text, bigint[])     to anon, authenticated;

-- pricing helpers stay INTERNAL (Postgres grants EXECUTE to PUBLIC by
-- default) — they only ever run inside the SECURITY DEFINER RPCs above.
revoke execute on function public._price_cart(jsonb) from public;
revoke execute on function public._discount_value(discounts, jsonb, numeric) from public;


-- ───────────────────── 6 · REALTIME ────────────────────────────────
alter table public.delivery_orders replica identity full;
alter table public.settings        replica identity full;
alter table public.website_theme   replica identity full;
alter table public.website_content replica identity full;
alter table public.website_sections replica identity full;

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'delivery_orders', 'settings',
      'website_theme', 'website_content', 'website_sections'
    ] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;


-- ───────────────────── 7 · STORAGE ─────────────────────────────────
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "media: public read" on storage.objects;
create policy "media: public read"   on storage.objects for select to public
  using (bucket_id = 'media');
drop policy if exists "media: public insert" on storage.objects;
create policy "media: public insert" on storage.objects for insert to public
  with check (bucket_id = 'media');
drop policy if exists "media: public update" on storage.objects;
create policy "media: public update" on storage.objects for update to public
  using (bucket_id = 'media') with check (bucket_id = 'media');
drop policy if exists "media: public delete" on storage.objects;
create policy "media: public delete" on storage.objects for delete to public
  using (bucket_id = 'media');


-- ───────────────────── 8 · SEED DATA ───────────────────────────────
-- REAL Aquarium Cafe & Resturant business data, gathered from public
-- sources (Google Maps, official Facebook, Restaurant Guru, customer
-- photos of the printed menu). Menu prices are the REAL ones from the
-- photographed paper menu — pages whose prices could not be verified
-- are listed in the business_todo checklist instead of being invented.

-- 8.1 · identity & checklist
insert into public.settings (key, value) values
  ('cafe_name',   'Aquarium Cafe & Resturant'),
  ('slogan',      'Sea View · Seafood · Coffee & Shisha'),
  ('description', 'A family terrace directly on the Hurghada waterfront — fresh seafood, generous shisha, fresh juices and real coffee, with an indoor aquarium and a kids'' play corner.'),
  ('copyright',   '© {year} Aquarium Cafe & Resturant — on the Hurghada corniche, behind the General Hospital.'),
  ('logo_url',    'images/logo.svg'),
  ('favicon_url', 'images/logo.svg'),
  ('currency',    'EGP'),
  ('features',    '{"ordering":true,"reservations":false,"delivery":true}'),
  ('business_todo', '[
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
]')
on conflict (key) do nothing;

-- 8.2 · website theme — Aquarium marine brand (from the printed menu:
--       deep-sea blue + bright aqua on white, rounded bold headings)
insert into public.website_theme (key, value) values
('colors', '{
  "primary": "#0d7d9e", "secondary": "#0b5b78", "accent": "#23b5d3",
  "background": "#f3fafc", "sectionBg": "#e4f3f7", "cardBg": "#ffffff",
  "buttonBg": "#0d7d9e", "buttonHover": "#0a647f",
  "text": "#2b5261", "heading": "#09384c", "border": "#d3e8ee",
  "footerBg": "#09384c", "navbarBg": "#09384c", "overlay": "#06293a"
}'::jsonb),
('typography', '{
  "headingFont": "Poppins", "bodyFont": "Inter",
  "bodySize": 16, "h1Size": 58, "h2Size": 36, "h3Size": 20,
  "headingWeight": 700, "bodyWeight": 400,
  "letterSpacing": 0, "lineHeight": 1.65
}'::jsonb),
('layout', '{
  "containerWidth": 1200, "spacing": 18, "sectionPadding": 92,
  "cardRadius": 20, "shadowSize": "medium", "gridColumns": 3
}'::jsonb),
('navbar', '{"style": "glass", "sticky": true, "blur": true, "transparency": 88, "logoSize": 40}'::jsonb),
('hero',   '{"bgColor": "#06293a", "overlayColor": "#06293a", "overlayOpacity": 55}'::jsonb),
('card',   '{"style": "elevated", "imageRatio": "4:3", "imageSize": "medium", "radius": 20, "shadow": "medium", "hover": "lift", "spacing": 18}'::jsonb),
('buttons','{"radius": 14, "style": "solid", "size": "medium", "animation": "lift"}'::jsonb),
('animations', '{"enabled": true, "type": "rise", "duration": 700, "speed": 100}'::jsonb)
on conflict (key) do nothing;

-- 8.3 · website content
insert into public.website_content (key, value) values
('hero', '{
  "title": "Dine where the sea meets your table",
  "subtitle": "Fresh seafood, creamy smoothies, generous shisha and slow coffee — a family terrace on the Hurghada corniche, behind the General Hospital.",
  "buttonText": "Explore the menu",
  "buttonLink": "#menu",
  "imageUrl": "images/hero-sea.jpg"
}'::jsonb),
('navItems', '[
  {"label": "Home",    "href": "#hero"},
  {"label": "Menu",    "href": "#menu"},
  {"label": "Gallery", "href": "#gallery"},
  {"label": "About",   "href": "#about"},
  {"label": "Reviews", "href": "#reviews"},
  {"label": "Contact", "href": "#contact"}
]'::jsonb),
('about', '{
  "title": "A terrace on the water, since day one",
  "text": "Aquarium is where Hurghada families come to breathe. Our wooden terrace sits directly above the Red Sea, an aquarium tank glows inside, and the little ones have their own play corner while you finish your shisha. The kitchen moves between the day''s fresh catch, stone-oven pizza and proper espresso — and the smoothie bar never stops. Morning coffee here is quiet; evenings are pure Red Sea.",
  "imageUrl": "images/seafood.jpg"
}'::jsonb),
('highlights', '["Sea View Terrace", "Fresh Seafood", "Shisha Lounge", "Fresh Juices & Smoothies", "Family Friendly", "Behind the General Hospital · Hurghada"]'::jsonb),
('contact', '{
  "address": "Behind the General Hospital (El Mustashfa El Aam), Hurghada, Red Sea — plus code 7R69+JH",
  "phones": ["+20 10 13913636"],
  "whatsapp": "https://wa.me/201013913636",
  "email": "aquariumseaview@gmail.com",
  "mapsUrl": "https://maps.app.goo.gl/D1q6Viif77U9MWqm8"
}'::jsonb),
('hours', '[
  {"days": "Every day", "time": "8:00 AM – 2:00 AM"}
]'::jsonb),
('branches', '[
  {"name": "Aquarium — Main Terrace", "address": "Behind the General Hospital, Hurghada", "phone": "+20 10 13913636"}
]'::jsonb),
('socials', '{}'::jsonb),
('footerAbout', '"Fresh seafood, shisha and slow coffee right on the Hurghada waterfront — bring the family, stay for the sunset."'::jsonb)
on conflict (key) do nothing;

-- 8.4 · homepage sections (order + visibility)
insert into public.website_sections (id, label, position, visible) values
  ('hero',       'Hero',              0,  true),
  ('highlights', 'Highlights strip',  10, true),
  ('banner',     'Promo banner',      15, true),
  ('menu',       'Menu',              20, true),
  ('gallery',    'Gallery',           25, true),
  ('about',      'About',             30, true),
  ('reviews',    'Reviews',           35, true),
  ('contact',    'Contact & hours',   40, true),
  ('footer',     'Footer',            50, true)
on conflict (id) do nothing;

-- 8.5 · operation settings
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

insert into public.notification_settings (key, value) values
  ('config', '{"sound": true, "browser": false}'::jsonb)
on conflict (key) do nothing;

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

-- 8.6 · social links (real, from the official Facebook page)
insert into public.social_links (platform, url, visible, sort_order) values
  ('facebook',  'https://www.facebook.com/Aquariumcafeandrestaurant', true, 10),
  ('instagram', 'https://www.instagram.com/aquarium.hurghada',        true, 20),
  ('tiktok',    'https://www.tiktok.com/@aquarium.restaurant',        true, 30),
  ('whatsapp',  'https://wa.me/201013913636',                         true, 40)
on conflict (platform) do nothing;

-- 8.7 · menu — REAL prices from the photographed paper menu (EGP)
-- deterministic menu ids are required here: discounts target products /
-- categories by id, and the operator photos map to stable rows.
-- OVERRIDING SYSTEM VALUE is the official escape for GENERATED ALWAYS keys.
insert into public.categories (id, name, name_ar, slug, sort_order, visible)
overriding system value values
  (1, 'Hot Drinks', 'مشروبات ساخنة', 'hot-drinks', 10, true),
  (2, 'Smoothies',  'سموذي وعصائر',  'smoothies',  20, true),
  (3, 'Shisha',     'شيشة',          'shisha',     30, true),
  (4, 'Additions',  'إضافات',        'additions',  40, true),
  (5, 'Kids',       'الأطفال',       'kids',       50, true)
on conflict (id) do nothing;

insert into public.products
  (id, category_id, name, description, price, image, badge, available, featured, sort_order)
overriding system value values
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
  (71, 5, 'Dodo Meal · وجبة دودو', 'Onion rings, chicken strips, fried mozzarella and Friskas fries — the full kids'' feast.', 130, 'images/kids-meal.jpg', 'Kids favorite', true, true, 1)
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('public.categories', 'id'),
              greatest((select max(id) from public.categories), 1), true);
select setval(pg_get_serial_sequence('public.products', 'id'),
              greatest((select max(id) from public.products), 1), true);

-- the seed names above are typed "EN · AR" for readability; split them
-- into the bilingual columns the language toggle actually reads
update public.products
   set name    = btrim(split_part(name, ' · ', 1)),
       name_ar = btrim(split_part(name, ' · ', 2))
 where name like '% · %'
   and split_part(name, ' · ', 3) = ''
   and btrim(name_ar) = '';

-- 8.9 · Hurghada delivery zones + starter sub-zones (Admin → Zones)
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
) as v(name_en, name_ar, fee, active, sort_order)
where not exists (select 1 from public.delivery_zones);

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

-- 8.8 · gallery (bundled brand photos — owner replaces with real shots)
insert into public.gallery (image, title, visible, sort_order)
select * from (values
  ('images/hero-sea.jpg',  'The terrace on the water',   true, 10),
  ('images/seafood.jpg',   'Fresh catch, grilled daily', true, 20),
  ('images/shisha.jpg',    'Shisha nights',              true, 30),
  ('images/pizza.jpg',     'From the stone oven',        true, 40),
  ('images/kids-meal.jpg', 'Little sailors welcome',     true, 50),
  ('images/smoothie-berry.jpg', 'The smoothie bar',      true, 60)
) as v(image, title, visible, sort_order)
where not exists (select 1 from public.gallery);

-- 8.9 · promo banner
insert into public.banners (title, subtitle, image, cta_text, cta_link, visible, sort_order)
select * from (values
  ('Fresh catch, every day 🐟', 'Ask our team about today''s fish & seafood selection — priced on the spot.',
   'images/seafood.jpg', 'See the menu', '#menu', true, 10)
) as v(title, subtitle, image, cta_text, cta_link, visible, sort_order)
where not exists (select 1 from public.banners);

-- 8.10 · demo reviews (replace with real Google reviews — see checklist)
insert into public.reviews (customer_name, rating, text, source, approved)
select * from (values
  ('Omar K.',  5, 'Sea view at sunset is unbeatable and the staff are genuinely kind. The seafood mix is a must.', 'demo', true),
  ('Julia M.', 4, 'Great smoothies and fair prices — the terrace is lovely and quiet in the mornings.', 'demo', true),
  ('Ahmed S.', 5, 'Lemon-mint and the special shisha on the water — my daily spot in Hurghada.', 'demo', true)
) as v(customer_name, rating, text, source, approved)
where not exists (select 1 from public.reviews);

-- 8.12 · demo driver (REMOVE after adding the real captains)
insert into public.drivers (name, phone, active, notes)
select * from (values
  ('Captain (Demo)', '+20 100 000 0001', true, 'Demo driver — replace with the real delivery captain in Drivers.')
) as v(name, phone, active, notes)
where not exists (select 1 from public.drivers);

-- make PostgREST pick up the new schema immediately
notify pgrst, 'reload schema';

-- ═══════════════ schema ready — see you on the corniche 🌊 ═══════════════
