# Production Checklist — Aquarium Cafe & Resturant **v5.1 (final)**

Run this list top-to-bottom on launch day.

## Supabase

- [ ] Project created; **SQL Editor → `supabase/schema.sql` → Run** (fresh) **or** `supabase/migrations/20260807_v4_to_v5.sql` (upgrade of a live v4 DB).
- [ ] *Only if the DB was migrated to v5 before 2026-08-08:* also run `supabase/migrations/20260808_v5_to_v51.sql` once.
- [ ] `Project Settings → API`: `SUPABASE_URL` + `anon` key copied into **`shared/config.js`**.
- [ ] **Authentication → Providers**: Email enabled. Decide *Confirm email* (off = instant signups; on = verification mails — both supported).
- [ ] **Authentication → URL Configuration**: Site URL + redirect URLs include your real domain (`https://your-domain/**`).
- [ ] **Storage**: bucket `media` exists (created by schema.sql); public read ✓.
- [ ] **Database → Replication / Realtime**: `delivery_orders` is in the realtime publication (the waiter board + customer tracking depend on it). schema.sql adds it — verify in *Database → Publications*.
- [ ] Optional but recommended: schedule a daily **Database backup** (Supabase does this on paid tiers automatically).

## Apps (static hosting)

- [ ] Serve the whole `aquarium-cafe/` folder over **HTTPS** (Netlify / Vercel / GitHub Pages / Nginx — no server code needed).
- [ ] `/customer` loads, toggle EN ⇄ AR works, menu shows seeded products.
- [ ] `/waiter` loads, **six columns** visible, sound toggle works, browser-notification permission granted on the dispatch device.
- [ ] `/admin` loads, **sidebar → Menu Manager / Delivery Zones / Discounts** present, save pill turns green on any edit.

## Operational smoke test (5 minutes)

- [ ] Place a real test order as a guest: pick zone → sub zone → address → cash. Watch it appear on the waiter board *and* admin Deliveries instantly.
- [ ] **Per-sub-zone pricing**: set zone El Dahar = 25 EGP but its sub zone *Dahar Beach* = 35 EGP; checkout must charge **35** when the sub zone is picked, **25** when skipped. Then change Dahar Beach to 40 — the **old order keeps 35**, the **next order charges 40**.
- [ ] Advance it: Accept → Preparing → **Ready for delivery → add a temporary driver** → Out for delivery → Delivered. Confirm the customer tracking page shows the captain card with a call button.
- [ ] Create a coupon in Admin → Discounts (e.g. `TEST10` 10%), apply it at checkout, confirm the row total and the coupon’s `used_count` increments.
- [ ] Register a customer account → verify the profile shows the signup bonus points; place an order as that member, deliver it, confirm points are credited once.
- [ ] Redeem points on the next order (checkbox at checkout) and confirm the discount line + ledger entry.
- [ ] Disable a zone, a sub zone, and a product — confirm they vanish from the customer flow within a second (realtime).
- [ ] Move a product to another category, reorder two categories — confirm the customer menu mirrors the order.

## Housekeeping

- [ ] Admin → Settings: set real **minimum order**, **ETA**, **free-above**, payment methods, loyalty numbers.
- [ ] Admin → Content: real phones, WhatsApp, address, hours, branches.
- [ ] Admin → Content → Socials page: real social links.
- [ ] Admin → Settings → Business TODO: complete the 10 seeded items (legal name spelling, license, etc.).
- [ ] Replace seeded menu photos with real ones (Media Library uploads are recommended — they survive hosting moves).

## Rollback plan

Code-only rollback: redeploy the v4 static bundle against the same database (v5 is additive except the dropped `reservations` table and RPC, which the v4 bundle recreates its own way).

Database rollback (rare): restore from the pre-upgrade snapshot/backup.
