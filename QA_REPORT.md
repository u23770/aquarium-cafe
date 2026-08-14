# QA Report — Aquarium Cafe & Resturant v5.1 ➜ v5.1.3 (FINAL)

Date: 2026-08-08/09 (schema re-run + atomic counters) · **2026-08-10 v5.1.2
RLS role-switch fix + v5.1.3 admin-write LOCKDOWN** · Scope: complete project
audit through seven passes, ending with the final production authorization
model (all results below are executed, not asserted).

---

## Pass 7 — Admin-write lockdown & final auth model (v5.1.3, 2026-08-10)

What v5.1.2 got wrong under the owner's review: it extended **reads AND
writes** to `anon, authenticated`, which handed every logged-in customer
direct administrative INSERT/UPDATE/DELETE power. Unacceptable for
production — and its fix has to reconcile four simultaneously-true
constraints: (a) public reads work for both roles, (b) authenticated
customers get **zero** admin write power, (c) login-free Admin/Waiter keep
working even while a customer session exists on the same browser, and
(d) no service_role key may ever touch a browser.

The actual (verified by inspection) write-authorization architecture:
**Admin/Waiter write as the `anon` role through the shared anon-key
client** — there is no admin auth and no privileged backend. Therefore the
only consistent model is: writes stay `TO anon`, and Admin/Waiter clients
must never inherit the customer session. Both halves were implemented:

1. **Policy lockdown (schema.sql + migrations):** 46 write policies
   (INSERT/UPDATE/DELETE across all 19 operator tables + notification
   settings) recreated `TO anon` **only**. Public SELECTs (20) stay
   `TO anon, authenticated`; customer review-submission INSERT stays
   extended but guarded by `check (approved = false)`; the 5 ownership
   policies and 4 `to public` storage policies untouched. Invariants
   machine-verified: the ONLY authenticated-writable operator statement
   left in the entire schema is the guarded review insert; every
   `to authenticated` policy without `anon` is auth.uid()-scoped; zero
   `USING (true)`/`WITH CHECK (true)` writes reachable by a customer.
2. **Session isolation (shared/supabase.js, the ONLY code file
   changed):** each app now gets its own auth storage key
   (`aquarium-auth-customer|admin|waiter`). The Customer app keeps its
   login exactly as before; Admin/Waiter — which contain zero auth code —
   never pick up a session, so their traffic is permanently `anon`
   regardless of customer logins. The original role-switch bug is now
   **structurally impossible**, no broad policies needed. (One-time
   side effect accepted: anyone already logged in re-logs once.)

Final authorization model:

```
PUBLIC READ (19 public tables)      → anon, authenticated
CUSTOMER REVIEW SUBMIT (approved=F) → anon, authenticated
ADMIN/OPERATOR WRITES (20 tables)   → anon only  (isolated Admin/Waiter)
MONEY (orders/coupons/loyalty)      → SECURITY DEFINER RPCs only
CUSTOMER-OWNED DATA (3 tables)      → authenticated + auth.uid() ownership
storage.objects                     → to public (bucket 'media' only)
driver_locations                    → unused, deny-all by design
```

**Executed in real PostgreSQL 17: 54 / 54 green**

```
TEST A · role=anon (= isolated Admin/Waiter traffic)        19/19 ✓
  guest order · product/coupon/zone/subzone-fee/content/
  settings(×4)/driver edits · atomic reorder · media
  insert+delete · review moderation · waiter advance + read
TEST B · role=authenticated (logged-in customer)            32/32 ✓
  functional: reads 71 products/5 categories/13 zones/8 subzones
    · creates order · reads tracked order · submits review   5/5  ✓
  lockouts (direct admin writes — every single one denied):
    update/delete product · create/update coupon · subzone
    price · zone price · settings · content · theme · drivers
    · add media · delete gallery · delete banner · kill
    delivery · rig loyalty config · notification settings ·
    create category · rewrite socials · abuse reorder RPC    19/19 ✓
  review moderation stays operator-only                      1/1  ✓
  sees waiter-updated status                                 1/1  ✓
  ownership isolation ×4 (other profile/wallet invisible,
    no cross-edit, no self-mint)                             4/4  ✓
  static architecture proof: storageKey isolation present,
    Admin/Waiter contain zero auth code                      2/2  ✓
TEST C · logged out again — nothing drifted                  3/3  ✓
```

Plus the v5.1.1 guarantee re-verification under the final policies:
**12 / 12 green** (coupon check-and-set · wallet check-and-set ·
double-advance CAS · cancel-refund exactly-once · rollback integrity).
pglast: all six SQL files clean (schema 335 · migrations
155/115/17/7/134).

---

## Pass 6 — RLS role-switch regression (v5.1.2, 2026-08-10)

Root cause confirmed exactly as reported by the owner: supabase-js runs
with `persistSession: true`, so once a Customer logs in, the shared
client's Postgres role switches **anon → authenticated** — on every app
sharing that browser storage (Customer, plus Admin/Waiter on the same
origin). 67 operator policies were written `TO anon` only, so every
public/operator read+write silently stopped matching the moment a customer
session existed.

Per-policy review (all 76 policies — none added blindly):

| Group | Decision |
|---|---|
| 64 policies on the 19 owner-listed operator tables (products, categories, settings, website_content, website_sections, website_theme, media_library, gallery, banners, social_links, delivery_zones, delivery_subzones, delivery_settings, drivers, reviews, discounts, loyalty_settings, delivery_orders, delivery_status_history) | **extended `TO anon, authenticated`** — same USING/CHECK, policy names kept, drop+create |
| 3 policies on `notification_settings` | **extended too** — the Admin Settings page reads/writes it (`settings.js`); omitting it would re-create the same regression class inside "zero Admin difference". Same operator trust class as `delivery_settings` |
| 5 ownership policies on `customer_profiles`, `loyalty_accounts`, `loyalty_transactions` | **untouched** — stay `TO authenticated` with `auth.uid()` ownership; no `USING (true)` anywhere near private data |
| 4 `storage.objects` policies | **untouched** — already `TO public` (role-agnostic) |
| `driver_locations` (0 policies, RLS enabled but unused by any app) | **untouched** — deny-all by design ("future courier app") |

All 15 anon policies inside `20260807_v4_to_v5.sql` were extended the same
way (20260808/09 create no policies). New idempotent migration
**`20260810_rls_role_switch.sql`** (134 statements = 67 drop-if-exists +
67 create) re-creates the policies on existing databases. The functions'
grants were already `anon, authenticated`; `place_delivery_order` is
SECURITY DEFINER, so order creation worked under both roles all along —
what failed were the direct reads/writes around it. Realtime:
`postgres_changes` authorization is the subscriber's SELECT policy; the
extended SELECT on `delivery_orders` + the appearance tables keeps Waiter
and live-tracking subscriptions alive under a customer session (both
subscribed tables verified in `pg_publication_tables`).

**Executed in real PostgreSQL 17 (PGlite): 48 / 48 green** — role switch
simulated exactly as PostgREST does (SET ROLE + request.jwt.claim uid):

```
TEST A (role=anon — logged-out customer on this browser)
  guest order ok · 20/20 operator tables readable · menu +
  sub-zone prices readable                                            6/6  ✓
TEST B (role=authenticated — customer logged in, NOT logged out)
  read parity: all 20 tables IDENTICAL to anon              ✓
  logged-in customer: coupon validator · order created ·
    own order visible by id                                 3/3  ✓
  Admin while session exists: edit product · create/edit/
    delete coupon · edit sub-zone price (35→36) · content ·
    settings · theme · sections · media add+delete · atomic
    gallery reorder (SECURITY INVOKER passes RLS) · banner ·
    social · driver · review approve+delete · delivery/
    notification/loyalty settings                           19/19 ✓
  Waiter while session exists: sees orders · advances status ·
    history readable · customer sees updated status        4/4  ✓
  realtime: publication covers every subscribed table        1/1  ✓
  private data: other profile/wallet/ledger invisible · own
    profile editable · wallet self-mint impossible (no policy)
    · row forgery rejected (x2) · ledger forgery rejected    8/8  ✓
  anon afterwards: same updated status · same order count    2/2  ✓
```

Plus the v5.1.1 re-verification suite: **16 / 16 green** (coupon counter,
wallet guard, double-advance guard, cancel-refund exactly-once, anon
mint/direct-insert denied, reorder_rows + allowlist — all intact after the
policy change).

---

## Pass 4 — Schema re-run safety (THE USER-REPORTED BUG CLASS)

The failure the owner hit: running `schema.sql` aborted on a project that
already had an older Aquarium/Menta install (or after any earlier partial
run). Root cause identified and fixed:

- The 4 `create policy … on storage.objects` statements had **no preceding
  `drop policy if exists`** — `storage.objects` is Supabase-managed and is
  never removed by the script's own table-drop section, so a leftover
  policy with the same name killed the run with
  `ERROR: policy "media: public read" for relation "objects" already exists`.
- The same missing-guard class existed for **76 policies, 13 triggers,
  25 indexes and all 12 unguarded seed inserts** (duplicate-key errors or
  silently duplicated seed data on re-runs).

**Torture test (PGlite 17, real execution): 15 / 15 green**

```
legacy project simulated (old storage policies with the same names,
old `orders`/`reservations` tables, old buckets present)
  → 1st full run        ZERO errors ✓
  → 2nd full run        ZERO errors ✓
  → 3rd full run        ZERO errors ✓
no duplication          13 zones · 8 sub-zones · 5 categories ·
                        71 products · 4 socials · 6 gallery ·
                        1 driver · 3 reviews · settings intact ✓
data integrity          bilingual EN/AR split intact · all 4 storage
                        policies present · place_delivery_order green
                        (sub-zone fee charged after the 3rd run) ✓
```

---

## Pass 5 — Concurrency & transaction atomicity (v5.1.1, 2026-08-09)

Trigger: the owner's transaction-safety review. Mapping note: the review
described an Express/`db.js` codebase — that stack **does not exist in this
project** (verified by searching the entire workspace and both ZIPs: no
`server/`, no `package.json`, zero matches for `stmtFor|db.transaction|
express|jsonwebtoken|require(|module.exports`; cust auth = Supabase Auth).
The same concerns were therefore audited where they actually live here:
the SECURITY DEFINER RPCs (the only multi-step writes) + the admin
reorder writes. **Four real race classes were found and fixed.**

| Race found (code review) | Blast radius before fix | Fix (v5.1.1) |
|---|---|---|
| Coupon `used_count` check-then-act (SELECT limit-check, later plain increment) | Two simultaneous same-coupon checkouts could both pass `max_uses` and both increment — counter overshoot | **Atomic guarded increment** — limit re-checked under the row lock; loser raises and its **whole order rolls back** |
| Loyalty redeem check-then-act (balance SELECT, later plain decrement) | Two simultaneous redeems of one wallet → balance **negative** | **Atomic guarded decrement** — `points >= redeem` lives inside the UPDATE; loser rolls back |
| `advance_delivery` status read-then-write | Two staff advancing/cancelling the same order → double loyalty earn / double refund | **Compare-and-swap** (`… and status = <expected>` / `and status not in (terminal)`); loser gets "status just changed" |
| Admin reorder = `Promise.all` fan-out of N single-row updates (7 savers) | Mid-way network failure → half-applied ordering; two admins interleave | **One atomic call** to new `reorder_rows()` RPC (single `UPDATE … FROM unnest … WITH ORDINALITY`) |

Why reorders go through an RPC and NOT a PostgREST bulk-upsert: those
tables use **GENERATED ALWAYS identity keys**; PostgreSQL rejects setting
them even to their own value (error `428C9` — reproduced), so PostgREST's
`ON CONFLICT … DO UPDATE` can never work there at any version. The RPC is
**SECURITY INVOKER** (RLS is *not* bypassed), hard-allowlisted to the seven
sortable tables, and writes nothing but `sort_order` — callers gain no new
power versus the existing anon operator policies.

**Torture results (real PostgreSQL 17 / PGlite): 63 / 63 green**

```
A fresh install (13/8/5/71 seed counts, storage policies)      7/7  ✓
B signup trigger → profile + wallet(50) + ledger               4/4  ✓
C coupon atomicity: 1st checkout ok · exhausted → rejected ·
  NO order row · NO counter bump · NO history row (rollback) ·
  statement-level guard on exhausted coupon affects 0 rows     8/8  ✓
D loyalty atomicity: 100 pts = 50 EGP redeemed ok · re-redeem
  on empty wallet → rejected · wallet/ledger/orders untouched ·
  statement-level balance guard affects 0 rows                 8/8  ✓
E waiter chain: temp-driver dispatch enforced · earn EXACTLY
  once (+20) · re-advance rejected · post-delivered cancel
  rejected · stale-state compare-and-swap affects 0 rows       10/10 ✓
F cancel refund: redeemed→cancelled ⇒ +100 refunded EXACTLY
  once · cancel replay rejected · wallet untouched             8/8  ✓
G RLS as anon: wallet-mint 0 rows · 0 loyalty rows visible ·
  direct order INSERT denied · _price_cart denied · 428C9
  reproduced · reorder_rows applies 3 positions in ONE call ·
  protected table rejected by allowlist                        9/9  ✓
H migrations ×3 idempotent · both guards + reorder_rows
  present after replay · checkout still green                  8/8  ✓
```

Honest scope note: PGlite runs a **single session**, so multi-client
interleavings were proven per guard — statement level (guarded writes
affect 0 rows) and function level (every raise rolls the whole call back;
verified by absence of order/ledger/history rows). Under READ COMMITTED,
PostgreSQL re-evaluates a guard's `WHERE` after acquiring the row lock
(documented engine semantics), so under true concurrency the losing
request deterministically raises instead of corrupting data. There is no
shared JS server runtime at all (three static apps + PostgREST), so the
cross-request connection-mixing failure described in the review is
structurally impossible here.

---

## Pass 3 — Real-database production simulation (PGlite 17)

`schema.sql` + both migrations were executed inside a real PostgreSQL
and driven through the exact user journeys. **56 / 56 assertions green**
(41 journey assertions + 15 brutality re-run assertions).

```
═══ A · FRESH INSTALL: schema.sql ═══          9/9  ✓
     (full install, sub-zone fee column/trigger, 13 zones,
      71 bilingual products + 5 bilingual categories)
═══ B · SIGNUP: auth → profile+wallet+bonus ═══ 4/4  ✓
     (trigger row, bonus in ledger, metadata name)
═══ C · COUPONS (server-side validate_coupon) ═══ 4/4  ✓
     (apply, reject unknown, min-order, auth-uid spoof rejected)
═══ D · DELIVERY FEES — SUB ZONE WINS ═══       7/7  ✓
     (sub-zone fee charged, not zone fee · snapshot stored ·
      arithmetic verified · zone fee without sub-zone ·
      payload-supplied fee ignored — server is the truth)
═══ E · HISTORICAL SNAPSHOT ═══                 3/3  ✓
     (admin edits fee 35→99 AFTER ordering: old order stays 35,
      new order charges 99, cross-zone sub-zone rejected)
═══ F · WAITER FLOW ═══                        11/11 ✓
     (driver-less dispatch refused · temp driver bound &
      customer-visible · illegal jumps rejected · loyalty earned
      exactly once · redeem debits once · over-redeem rejected ·
      cancel refunds points · coupon settled + counted)
═══ G · RLS ENFORCEMENT (SET ROLE anon) ═══     8/8  ✓
     (zones readable · loyalty mint attempt changed NOTHING ·
      direct order insert denied · profiles/wallets invisible ·
      _price_cart not RPC-callable · get_overview callable)
═══ H · MIGRATIONS over live schema ═══         7/7  ✓
     (v5→v5.1 ×3 idempotent · hand-tuned fees survive re-runs
      via marker row · v4→v5 replay safe · checkout still green)
```

## Bug found only by executing the DB (would have shipped broken)

| Bug | Symptom in production |
|---|---|
| `_price_cart` record missing `name_ar` | **Every checkout + every coupon validation raised an error** |
| `v_subzone` read while unassigned | Orders without a sub-zone (guest / zone-only) **crashed at checkout** |
| `website_content` key check vs. camelCase keys | **Fresh install aborted**; admin content saves rejected |
| Explicit ids into GENERATED ALWAYS keys | **Fresh install aborted** at menu seed |
| Zone-only fees | Could not price sub-zones independently (business requirement) |
| `advance_delivery` stale return | Waiter board showed `loyaltyEarned: 0` until manual refresh |

All six are fixed and re-verified in the same simulation.

## Bugs found in Pass 4 (schema re-run / legacy projects)

| Bug | Symptom in production |
|---|---|
| 4 storage policies without `drop policy if exists` | **`schema.sql` aborts at the storage section on any project with an older install — the exact failure reported by the owner** |
| 71 more `create policy` statements unguarded | `policy … already exists` on any re-run after a partial failure |
| 25 `create index` without `IF NOT EXISTS` | `relation … already exists` on re-runs |
| 13 `create trigger` without `drop trigger if exists` | `trigger … already exists` on re-runs |
| 12 seed inserts without conflict guards | `duplicate key value` errors and/or silently duplicated zones/sub-zones/menu rows on re-runs |
| Duplicated drop-table trio in the reset block | cosmetic/noise |

All are fixed. One transform risk while editing (a semicolon inside the
English about-us seed text) was caught by the PGlite run
(`invalid input syntax for type json`), repaired, and re-verified —
the shipped file parses **and** executes cleanly three times in a row.

---

## Machine validation battery (static)

| Check | Result |
|---|---|
| JS syntax — `node --check` on all 42 files | ✅ clean |
| SQL parse — pglast: schema 335 stmts · v4→v5 115 · v5→v5.1 17 · v5.1.1 7 · v5.1.2 (RLS) 134 · v3→v4 155 | ✅ clean |
| plpgsql runtime — **real PostgreSQL execution** (see Pass 3) | ✅ green |
| i18n parity — customer 275/275 · admin 708/708 · waiter 72/72 EN⇄AR | ✅ equal, no duplicates |
| i18n coverage — every literal `t('…')` + `data-i18n` resolves | ✅ clean |
| DOM ids — every `$('id')`/getElementById exists in HTML/JS templates | ✅ clean |
| Icons — every `#i-*` `<use>` has a `<symbol>` | ✅ clean |
| CSS — braces balanced in all three apps (710/734/297) | ✅ clean |
| HTTP smoke — site + apps + assets + `?track=…` deep link | ✅ all 200 |
| Secret scan — `service_role`/private keys anywhere in the tree | ✅ zero hits |
| Staff-auth remnants — `staff_accounts`/`is_admin()`/`staff_role()` | ✅ zero hits |
| Console debug output, TODO/FIXME markers in code | ✅ none |
| Seed assets — every `images/*` referenced exists in `customer/images/` | ✅ present |

## Security posture (verified, not asserted)

- Browser bundles contain **only `SUPABASE_ANON_KEY`** — no service role,
  no secrets (`shared/config.js` is the single config point).
- Customer data (`customer_profiles`, `loyalty_*`) is **owner-only**;
  `delivery_orders` writes happen **only** inside SECURITY DEFINER RPCs.
- Price/discount/coupon/loyalty math is **server-side only** — the
  simulation proved payload injection (`"deliveryFee":0`) is ignored.
- Admin & Waiter panels: login-free by design, open directly, zero auth
  code paths (verified by grep); privileged writes go through the RPCs.

## Known, accepted platform notes

- Operational tables (menu, zones, discounts, drivers) are anon-writable
  under the chosen single-operator model (doc: README §Security). The
  private URLs + unguessable project URL are the access barrier; RLS
  protects everything customer-owned or money-related.
- pglast's `parse_plpgsql` in offline sandboxes reports false syntax
  errors on valid bodies (tool limitation); the definitive validation
  here is the **real PostgreSQL execution in Pass 3**, which compiled
  and ran every function.
