# Database changes — v4 ➜ v5 ➜ **v5.1 (final production release)**

Three files cover every environment:

- **`supabase/schema.sql`** — fresh install (all-in-one, idempotent: safe to re-run).
- **`supabase/migrations/20260807_v4_to_v5.sql`** — in-place upgrade of an existing v4 database (includes the v5.1 finalization). Idempotent; preserves all data; only additive changes plus the explicit removals listed below.
- **`supabase/migrations/20260808_v5_to_v51.sql`** — **run this only if you already applied the v4→v5 migration before the final pass** (i.e. your DB is "v5"). Adds per-sub-zone fees and re-releases the hardened RPCs. Fully idempotent — hand-tuned prices survive re-runs (one-time backfill is guarded by a marker row).
- **`supabase/migrations/20260809_v51_atomic_guards.sql`** — **v5.1.1 concurrency hardening (2026-08-09).** Re-releases `place_delivery_order` + `advance_delivery` with atomic guards (coupon counter check-and-set, wallet check-and-set, status compare-and-swap) and adds `reorder_rows()` (one atomic server-side reorder RPC for the admin panel, SECURITY INVOKER). No table/data/RLS changes; fully idempotent. (The same guards and function are also mirrored into the two earlier migration files so any run order converges.)
- **`supabase/migrations/20260810_rls_role_switch.sql`** — **FINAL policy set (v5.1.2 + v5.1.3, 2026-08-10).** Re-creates all 67 operator policies idempotently (drop+create): public SELECTs `TO anon, authenticated` (a customer login can never hide public data again), guarded review submit for both roles, and **all admin/operator writes `TO anon` only** — a logged-in customer gets zero direct admin CRUD. Private customer tables (`customer_profiles`, `loyalty_accounts`, `loyalty_transactions`) stay strictly owner-only; `storage.objects` stays `to public`; unused `driver_locations` stays deny-all. Companion change (code, one file): `shared/supabase.js` gives each app its own auth storage key so Admin/Waiter traffic is permanently `anon` — that is what lets the writes stay locked to `anon` without ever breaking the login-free panels. (One-time side effect: existing sessions re-login once.)

All files were machine-validated with pglast (333 / 113 / 15 / 155 statements) **and executed end-to-end in a real PostgreSQL 17 (PGlite) — 56/56 assertions green** (checkout, fees, coupons, loyalty, RLS, migrations replayed 3×, plus a brutality pass: legacy project simulation + 3 consecutive full runs of `schema.sql` with zero errors).

> **Re-run safety (2026-08-08, second pass on `schema.sql`):** the script is now safe to paste into SQL Editor **any number of times**, including on projects that still hold an older Aquarium/Menta install. Every one of the 76 policies, 13 triggers, 25 indexes and 12 seed inserts is guarded (`drop … if exists` / `if not exists` / conflict guards). Specific fix for the owner-reported abort: the 4 `storage.objects` policies are now dropped-if-exists first — `storage.objects` is Supabase-managed, so old policies there survived the script's own table drops and killed the run.
>
> **Which file do I run?** Brand-new project or you want a clean reset → `schema.sql` (it intentionally drops and recreates the `public` schema objects — **your old data is wiped by design**). Existing project with data you want to keep → run the two migrations instead: `20260807_v4_to_v5.sql` then `20260808_v5_to_v51.sql`.

---

## Removed (delivery-only platform)

| Object | Fate |
|---|---|
| `public.reservations` (v4) | **Dropped** by the migration (step verified against live DB: table did not carry production dependencies) |
| `public.orders`, `public.order_items` (v4 dine-in) | Kept untouched if present — read-only history; the apps no longer query them |
| Features flag `reservations` | Pinned to `false`; the customer/waiter apps no longer render any of it |

## New tables

| Table | Purpose |
|---|---|
| `delivery_zones` | `name_en/name_ar`, `fee`, `free_above`, `active`, `sort_order` |
| `delivery_subzones` | `zone_id → cascade`, `name_en/name_ar`, **`delivery_fee` (v5.1 — every sub zone has its own fee; it always wins over the parent zone fee)**, `active`, `sort_order`, `updated_at` |
| `discounts` | `type` (`signup|coupon|product|category|global`), `code` (unique, `^[A-Za-z0-9_-]{3,24}$`), `value_type` (`percent|fixed`), `value`, `min_order`, `max_discount`, `max_uses`, `used_count`, `active`, `starts_at`, `expires_at`, `target_id` |
| `customer_profiles` | Mirror of `auth.users` (`id` PK → `auth.users`), `full_name`, `phone` |
| `loyalty_accounts` | Per-customer `points` balance (`user_id` PK → `auth.users`) |
| `loyalty_transactions` | Append-only ledger (`delta` signed points, `balance_after`, `reason` signup_bonus/earn/redeem/refund, `note`, `order_id`) |
| `loyalty_settings` | KV row `config`: `enabled, points_per_order, signup_bonus, point_value_egp, min_redeem, max_redeem` |

## Changed tables

| Table | Change |
|---|---|
| `categories` | already had `visible`; v5 adds/uses `name_ar` |
| `products` | adds `name_ar`, `description_ar`, `featured` (featured existed since v4) |
| `delivery_orders` | adds `zone_id`, `subzone_id`, `address_detail`, `temp_driver_name`, `temp_driver_phone`, `user_id`, `discount_id`, `discount_amount`, `discount_label`, `coupon_code`, `loyalty_redeemed`, `loyalty_earned` |
| `drivers` | unchanged (permanent roster); temp drivers never land here — they live on the order row only |

## Functions / triggers

| Object | Notes |
|---|---|
| `place_delivery_order(jsonb)` | Single transactional checkout: server-side cart pricing, best automatic discount, coupon re-validation, loyalty redeem, **sub-zone fee (v5.1)** / zone fee fallback (+free-above override, global fallback), payment-method + min-order validation, coupon usage increment, history row |
| `validate_coupon(jsonb)` | Read-only pre-check used at checkout; returns `{ok, key, amount, label, kind, min}` |
| `advance_delivery(uuid,text,bigint,integer,text,text,text)` | Waiter board status machine; credits points exactly once on first `Delivered`; carries temp-driver fields |
| `_price_cart(jsonb)`, `_discount_value(discounts,jsonb,numeric)` | Internal helpers (server-side math) |
| `get_overview()` | Dashboard aggregates incl. `zones_active`, `coupons_active`, `loyalty_members`, recent orders |
| `handle_new_user()` | Auth trigger: creates profile + loyalty account + signup bonus from `raw_user_meta_data` |
| `set_updated_at()` | Standard trigger |

## RLS highlights

- Zones/subzones/discounts/loyalty-settings: anon CRUD (single-operator console model, same as v4 admin pages).
- `customer_profiles`, `loyalty_accounts`, `loyalty_transactions`: authenticated **owner-only** reads (profile insert/update by owner).
- `delivery_orders` + history: anon read; **writes only via SECURITY DEFINER RPCs**.
- Config KV tables (`delivery_settings`, `loyalty_settings`, `notification_settings`): anon UPDATE on `key='config'` only (never INSERT — seeded at install).

## Seeds

- 13 Hurghada zones with Arabic names and fees 20–90 EGP + starter sub zones,
  **each sub zone with its own explicit fee** (El Dahar: Nasr Street 25,
  Dahar Square 25, Post Office 30, Dahar Beach 35…).
- Menu seeded truly bilingual: product names are split into clean
  `name` (EN) + `name_ar` (AR) at install; categories carry `name_ar`.
- Loyalty: `{enabled:true, points_per_order:20, signup_bonus:50, point_value_egp:0.5, min_redeem:50, max_redeem:300}`.
- `features`: `{"ordering":true,"reservations":false,"delivery":true}`.
- 10-item `business_todo` checklist; welcome coupon.

## v5.1 — production-release hardening (found by full-DB simulation, all fixed)

| # | Bug | Fix |
|---|---|---|
| 1 | `_price_cart` selected `id, name, price, category_id` into a record but read `v_product.name_ar` → **every order & coupon check raised** `record "v_product" has no field "name_ar"` | `name_ar` added to the `select … into` |
| 2 | `place_delivery_order` returned/read `v_subzone.name_en` even when no sub zone was chosen → **`record "v_subzone" is not assigned yet` (55000)** for guest/zone-only orders | plain `v_subname` text set inside the sub-zone branch |
| 3 | Delivery fee was only per **zone**; the platform spec requires **per-sub-zone fees that override the zone fee** | `delivery_subzones.delivery_fee` (numeric ≥ 0 ≤ 10000) + server override in `place_delivery_order` + admin UI + customer preview; orders keep the snapshotted `delivery_orders.delivery_fee` forever (historical prices provably unchanged) |
| 4 | `website_content.key` check was snake_case-only, but the Visual Builder upserts camelCase keys (`navItems`, `footerAbout`) → fresh seed + admin content saves rejected | check relaxed to `^[a-z][a-zA-Z0-9_]*$` (schema + guarded migration block) |
| 5 | Menu seed inserted explicit ids into `GENERATED ALWAYS AS IDENTITY` columns → fresh install refused the seed | `OVERRIDING SYSTEM VALUE` (deterministic ids are required: discounts target them) |
| 6 | `advance_delivery` returned the pre-earn snapshot → RPC answered `loyaltyEarned: 0` on the `Delivered` step | return object synced after credit |
| 7 | Pricing helpers callable directly via RPC (Postgres grants `EXECUTE` to PUBLIC by default) | `revoke execute … from public` on `_price_cart` / `_discount_value` |
| 8 | Duplicate-email signup could show a success state (Supabase anti-enumeration answer) | `signUpCustomer` detects the identity-less response and surfaces "already registered" |

## Rollback notes

- All v5/v5.1 additions are additive except the dropped `reservations` table. Old orders are never mutated by migrations (fees are snapshotted at checkout).
