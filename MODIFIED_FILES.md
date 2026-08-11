# Modified files — v5.1 final production pass (2026-08-08) + v5.1.1 (2026-08-09)

Everything below was changed in the FINAL audit/repair pass, the schema
re-run-safety pass that followed it (owner report: "schema.sql is full of
errors when I run it"), and the **v5.1.1 concurrency/atomicity pass**
(transaction-safety review). The UI design, colors, typography, layouts
and animations were **not** touched. No Express/Node backend exists or was
added — the reviewed `server/db.js` codebase is not part of this project
(verified by full-tree search).

## Database

| File | Change |
|---|---|
| `supabase/schema.sql` — v5.1.3 ADMIN-WRITE LOCKDOWN (2026-08-10, 5th pass) | **Production security correction:** the 46 operator WRITE policies (INSERT/UPDATE/DELETE on all 19 admin tables + `notification_settings`) recreated `TO anon` **only** — a logged-in customer now gets zero direct admin power. What stays extended (`TO anon, authenticated`): all 20 public SELECTs + the guarded customer review-submission INSERT (`check (approved = false)`). Untouched: 5 ownership policies (`auth.uid()`), 4 storage `to public` policies, deny-all `driver_locations`. Machine-verified invariants: the only authenticated-writable operator statement in the schema is the guarded review insert; no `USING(true)`/`CHECK(true)` write is reachable by any customer |
| `supabase/migrations/20260810_rls_role_switch.sql` — regenerated | Now contains the FINAL policy set (both halves: role-switch read fix + admin-write lockdown) as 67 drop+create pairs; idempotent; running it on ANY older DB converges to the final model regardless of which earlier files were applied |
| `supabase/migrations/20260807_v4_to_v5.sql` — v5.1.3 mirror | Its 11 operator write policies locked to `anon` (4 extended SELECTs + 5 ownership policies untouched) |
| `supabase/schema.sql` — v5.1.2 RLS role-switch fix (2026-08-10, 4th pass) | **The login regression fix:** 67 operator policies changed `TO anon` → `TO anon, authenticated` (64 on the 19 owner-listed tables + 3 on `notification_settings`, which the Admin Settings page depends on), keeping identical USING/CHECK expressions and policy names, each behind `drop policy if exists`. After a customer login switches the shared client's role anon→authenticated, Admin/Waiter/Customer keep 100% of their previous permissions — per-policy review, nothing added blindly: 5 ownership policies (`customer_profiles`, `loyalty_accounts`, `loyalty_transactions`) stay `auth.uid()`-owner-only (no `USING (true)` near private data), 4 `storage.objects` policies stay `to public`, unused `driver_locations` stays deny-all · header stamped v5.1.2 |
| `supabase/migrations/20260810_rls_role_switch.sql` | **New file** — same 67 drop+create pairs for existing databases (134 statements, fully idempotent) |
| `supabase/migrations/20260807_v4_to_v5.sql` — v5.1.2 | Its 15 `TO anon` policy definitions extended identically, so a v4 upgrade that stops mid-chain still lands correct final policies (its 5 owner-only policies untouched) |
| `supabase/schema.sql` — v5.1.1 atomic-counters (2026-08-09, 3rd pass) | **Four real race classes fixed** (see QA_REPORT Pass 5): coupon `used_count` → atomic guarded increment (limit re-checked under row lock; loser rolls its WHOLE order back) · loyalty redeem → atomic guarded decrement (`points >= redeem` inside the UPDATE — wallet can never go negative concurrently) · `advance_delivery` → compare-and-swap status guards (advance `… and status = <expected>`; cancel `… and status not in ('Delivered','Cancelled')`) — no double earn / double refund · **new `reorder_rows(text, bigint[])` RPC** — one atomic server-side reorder for the 7 allowlisted sortable tables; SECURITY INVOKER (RLS not bypassed), writes only `sort_order`; a PostgREST bulk-upsert is provably impossible there (GENERATED ALWAYS keys → `428C9`, reproduced) · grant to anon/authenticated · header stamped v5.1.1 |
| `supabase/migrations/20260809_v51_atomic_guards.sql` | **New file** — for databases already on v5/v5.1: re-releases the two hardened RPCs + adds `reorder_rows` + grants. Fully idempotent (CREATE OR REPLACE only), safe to run repeatedly and in any order |
| `supabase/migrations/20260807_v4_to_v5.sql` | Same 4 atomic guards inside its copy of the RPC bodies + `reorder_rows` appended (any run order converges to identical final definitions) |
| `supabase/migrations/20260808_v5_to_v51.sql` | Same 4 atomic guards + `reorder_rows` appended |
| `supabase/schema.sql` — re-run safety (2026-08-08, 2nd pass) | **Fixes the reported run-abort failures:** `drop policy if exists` before all **76** `create policy` (incl. the 4 on `storage.objects` that killed runs on legacy projects — `storage.objects` is Supabase-managed so the script's own table drops never removed its old policies) · `IF NOT EXISTS` on all **25** `create index` · `drop trigger if exists` before all **13** triggers · conflict guards on all **12** seed inserts (`ON CONFLICT DO NOTHING` for key/id/platform tables, `WHERE NOT EXISTS` for zones/sub-zones/gallery/banners/reviews/drivers) → zero duplication on re-runs · duplicated drop-table trio removed from reset block · header now documents full idempotency. **Torture-tested:** legacy project + 3 consecutive full runs = zero errors (see QA_REPORT Pass 4) |
| `supabase/schema.sql` — v5.1 (1st pass) | Per-sub-zone `delivery_fee` + `updated_at` + `trg_subzones_touch` · `_price_cart` selects `name_ar` into the record (record-field bug) · `place_delivery_order` sub-zone fee override + `v_subname` fix (unassigned-record crash) · `website_content` key check accepts camelCase · menu seed uses `OVERRIDING SYSTEM VALUE` + splits names into clean EN/AR columns · categories seeded with Arabic names · header v4→v5.1 typo · duplicate banner comment removed · PUBLIC revoke on pricing helpers |
| `supabase/migrations/20260807_v4_to_v5.sql` | Same five fixes for the upgrade path + idempotent column/constraint guards + `trg_subzones_touch` + one-time marker-guarded fee backfill (`subzone_fee_migrated`) + seeded sub-zone fees + camelCase key-check repair block + helper revokes |
| `supabase/migrations/20260808_v5_to_v51.sql` | **New file** — for databases already on v5: ALTERs, backfill-with-marker, re-released `_price_cart` / `place_delivery_order` / `advance_delivery`, camelCase key-check repair, helper revokes. Fully idempotent |

## Shared core

| File | Change |
|---|---|
| `shared/supabase.js` — v5.1.3 session isolation (**the only code file changed in the security passes**) | Each app now gets its own auth storage key (`aquarium-auth-customer|admin|waiter`, derived from the URL path). Why: all three apps share one origin + one Supabase project, so by default they shared ONE auth bucket — any customer login flipped Admin/Waiter from `anon` to `authenticated`. After isolation the Customer app keeps its login exactly as before, while Admin/Waiter (zero auth code by design) never inherit a session — their requests are **permanently `anon`**, which is precisely the role their operator write policies grant. The role-switch regression is now structurally impossible. One-time side effect: anyone already logged in re-logs once |

## Admin panel

| File | Change |
|---|---|
| `admin/js/api.js` — v5.1.1 | The seven reorder savers (`saveCategoryOrder`, `saveProductOrder`, `saveGalleryOrder`, `saveBannerOrder`, `saveSocialOrder`, `saveZoneOrder`, `saveSubZoneOrder`) now make **one atomic call** — `rpc('reorder_rows', …)` — instead of a `Promise.all` fan-out of N single-row updates that could half-apply on a mid-way failure. Identical exported names/signatures → **zero changes in callers and zero UI changes**. Note: a bulk PostgREST UPSERT was tried first and abandoned after execution proved it impossible (GENERATED ALWAYS identity keys reject PostgREST's `DO UPDATE SET id = EXCLUDED.id` with error 428C9) |
| `admin/js/zones.js` | Sub-zone rows gained their own **fee input** (`data-f="s-fee"`), the adder row gained a fee field pre-filled with the zone fee, save handlers wired (`updateSubZone`/`createSubZone` with fee), inline validation |
| `admin/js/api.js` | `mapZone`/`getZones` carry `delivery_fee`; `createSubZone`/`updateSubZone` accept + validate `fee` (0–10000) via `cleanSubFee` |
| `admin/js/lang.js` | New keys EN+AR: `zn.subFee`, `zn.subFeeHint`, `zn.feeBad`; `zn.note` rewritten in both languages to explain sub-zone-fee precedence |
| `admin/css/admin.css` | `.zsub__fee` sizing; `.zsub` grid widened to 5 columns; deterministic mobile placement for all five cells + adder row |

## Customer website

| File | Change |
|---|---|
| `customer/js/api.js` | `getDeliveryZones` selects+maps sub-zone `delivery_fee`; `signUpCustomer` detects Supabase’s identity-less “already registered” response → real error instead of a fake success |
| `customer/js/delivery.js` | `feeFor()` honors the picked sub zone (its fee wins; free-above still applies on top) · sub-zone buttons now show their fee · totals re-paint on sub-zone pick/skip |

## Docs

README.md · DATABASE_CHANGES.md · QA_REPORT.md · PRODUCTION_CHECKLIST.md ·
this file — all updated for v5.1 (verification numbers, upgrade paths,
per-sub-zone pricing tests).

## Verification artifacts

- Real-PostgreSQL simulation (PGlite 17): **56/56 assertions** — 41 journey
  assertions + 15 brutality re-run assertions (legacy project + 3
  consecutive runs of `schema.sql`, zero errors, zero data duplication) —
  **plus the v5.1.1 atomicity suite: 63/63 assertions** (coupon/wallet/
  status guards, cancel-refund exactly-once, RLS, reorder_rows, migration
  replay) — **plus the v5.1.2 RLS role-switch suite: 48/48 assertions
  (TEST A anon ↔ TEST B authenticated parity, mandatory acceptance list)
  + 16/16 v5.1.1 re-verification under v5.1.2** — **plus the v5.1.3
  lockdown suite: 54/54 assertions (operator surface intact as anon · 23
  authenticated lockouts enforced · ownership isolation) + 12/12 v5.1.1
  guarantee re-verification under the final policies** —
  see QA_REPORT.md Passes 5–7.
- Static battery: 42 JS files, 6 SQL files (pglast: schema 335 · v4→v5 115 ·
  v5→v5.1 17 · v5.1.1 7 · v3→v4 155 stmts), i18n/i18n-parity,
  DOM-id/icon/CSS contracts, HTTP smoke — all green.
- Full-project await sweep (2026-08-09): regex+manual review of every
  write call site — zero un-awaited DB writes; the only fire-and-forget
  calls are pre-verified UI-only (session hydrate, totals preview repaint,
  tracking pill refresh, splash hide). The remaining `Promise.all` in
  `admin/js/api.js` is read-only (`getAppearance`).
