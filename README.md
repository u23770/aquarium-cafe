# 🐠 Aquarium Cafe & Resturant — Commercial Delivery Platform v5

The complete digital platform for **Aquarium Cafe & Resturant** (Hurghada, Egypt) —
a production-ready, **delivery-only** restaurant operation built with
**pure HTML5 · CSS3 · Vanilla JavaScript (ES Modules)** and **Supabase**
(PostgreSQL + Row Level Security + Realtime + Storage + Auth) as the entire backend.

No frameworks. No build step. No Node dependencies. Open the HTML files and it runs.

---

## What's new in v5

| v4 | v5 |
|---|---|
| Dine-in + reservations + delivery | **Delivery only** — reservations & dine-in removed everywhere (DB, RPCs, apps, UI) |
| Flat single-line address | **3-step address**: Main Zone → unlimited Sub Zones → free detailed address; fee computed per zone in the DB |
| English only | **Full EN ⇄ AR** on all three apps — instant toggle, `dir="rtl"`, bilingual DB fields (`name_ar` etc.), bilingual order statuses & messages |
| — | **Customer accounts** (Supabase Auth) with guest checkout still available |
| — | **Loyalty points** — earn on delivered orders, signup bonus, admin-controlled value/min/max redemption, redeemable at checkout |
| — | **Discount engine** — signup / coupon / global / product / category, percent or fixed, min-order, caps, usage limits, expiry, enable/disable |
| — | **Temporary driver per order** — at “Ready for delivery” the waiter picks an existing driver *or* attaches a one-off name+phone that lives only on that order, callable by the customer |
| — | **Admin Menu Manager** — categories × products in one screen: add/edit/delete, move between categories, reorder, enable/disable, featured, bilingual fields |
| — | **Admin Delivery Zones** — zones & sub zones CRUD, **per-sub-zone delivery fee (overrides the zone fee)** + free-above, reorder, enable/disable |
| — | **Admin Discounts** — full discount/coupon editor |
| Silence | Loading states, error handling, validation, confirmations — everywhere |

## Architecture

```
aquarium-cafe/
├── customer/          ← public site (menu, cart, 3-step delivery checkout,
│   │                    live tracking, accounts + loyalty wallet, reviews,
│   │                    gallery, guides/announcements)
│   ├── index.html
│   ├── css/style.css  ← sea theme (#0d7d9e / #23b5d3 / navy #09384c, Poppins+Inter)
│   └── js/…           ← main, theme, menu, cart, delivery, auth, lang, reviews, gallery, api, ui
│
├── waiter/            ← dispatch board (six live columns: Received … Finished,
│   │                    permanent/temporary driver at “Ready for delivery”,
│   │                    sound + browser notifications)
│   └── index.html, css/waiter.css, js/… (api, delivery, lang, main, ui)
│
├── admin/             ← console (Overview · Customizer · Content · Media ·
│   │                    Sections · Menu Manager · Delivery Zones · Discounts ·
│   │                    Banners · Gallery · Reviews · Socials · Deliveries ·
│   │                    Drivers · Settings incl. Loyalty)
│   └── index.html, css/admin.css, js/…
│
├── shared/            ← config.js (★ your keys), supabase.js, db.js, media.js,
│                        appearance.js, i18n.js (the translation engine)
│
└── supabase/
    ├── schema.sql                       ← fresh install (all-in-one, idempotent)
    └── migrations/
        ├── 20260807_v4_to_v5.sql        ← upgrade an existing v4 DB in place (v5.1 included)
        ├── 20260808_v5_to_v51.sql       ← ONLY if you applied v4→v5 before 2026-08-08
        └── 20260802_v3_to_v4.sql        ← legacy
```

## Quick start (≈ 5 minutes)

1. **Create a Supabase project** (free tier is fine) at https://supabase.com/dashboard.
2. **Database** → open the SQL Editor, paste the contents of `supabase/schema.sql`,
   Run once. It creates every table, policy, RPC, trigger, the storage bucket,
   and seeds the bilingual menu, the 13 Hurghada delivery zones with sub zones —
   **each sub zone with its own delivery fee** — a welcome coupon, the loyalty
   rules and the business TODO checklist.
   *Upgrading an existing v4 database instead? Run
   `supabase/migrations/20260807_v4_to_v5.sql` — it is idempotent and keeps your data.
   Already on v5 from an earlier install? Run
   `supabase/migrations/20260808_v5_to_v51.sql` once — it adds per-sub-zone fees
   and the hardened RPCs without touching your data.*
3. **Configuration** → `Project Settings → API`, copy the **Project URL** and the
   **anon public key** into `shared/config.js` (the only file you must edit).
4. **Auth** → Authentication → Providers → enable **Email** sign-ups. For a
   frictionless launch you may turn *Confirm email* off; customers can also check
   out as guests.
5. **Serve the folder** with any static host:
   `python3 -m http.server 8080` (or Netlify / Vercel / GitHub Pages / Nginx) →
   open `/customer`, `/waiter`, `/admin`.

That's it. Seeded data gets you a working restaurant immediately; everything is
editable from the Admin console.

## Language & RTL

Every app carries an instant **EN ⇄ AR** toggle (top-right). Translation covers
navigation, buttons, forms, placeholders, validation messages, toasts,
notifications, order/coupon statuses, menu content (bilingual DB columns),
zone names, tracking statuses and driver-call actions. Selections persist and
Arabic flips the layout to `dir="rtl"` automatically — the visual design is untouched.

## Money flow (all enforced inside PostgreSQL)

`place_delivery_order(jsonb)` is the only way an order is created. In one transaction it:

1. Re-prices the cart from the live `products` table (client prices are ignored).
2. Applies the best eligible **discount** (global / product / category automatic,
   coupon via `validate_coupon`, signup for first-time members).
3. Redeems **loyalty points** and enforces min/max and the point value.
4. Looks up the **delivery fee** — the picked **sub zone's own fee** always
   wins; the zone fee applies when no sub zone is chosen; the per-zone
   free-above override (then the global threshold) can zero it.
5. Validates the payment method against the enabled ones and the minimum order.
6. Writes the order + status history, increments coupon usage — returns a full
   server-computed summary the customer sees on the “order placed” screen.

Points are credited exactly once when an order reaches **Delivered**
(`advance_delivery()`), so cancels/refunds never leak points.

## Admin console map

| Page | What it controls |
|---|---|
| Overview | Today’s deliveries, revenue, active orders, drivers, zones, live discounts, loyalty members, review queue, latest orders |
| Customizer | Live-preview visual builder: identity, palette, typography, layout, hero, navbar, cards, buttons, animations |
| Content | About, contact, phones, hours, branches, highlights ribbon, footer |
| Media Library | Upload / replace / delete / reuse images, folders, storage cleanup |
| Sections | Drag-reorder homepage sections, show/hide, feature switches (ordering, delivery) |
| **Menu Manager** | Categories & products in one screen — CRUD, reorder, move between categories, enable/disable, featured, EN+AR |
| **Delivery Zones** | Zones & sub zones CRUD, **own fee per sub zone** (overrides the zone fee), zone fallback fee + free-above threshold, reorder, enable/disable |
| **Discounts** | Signup / coupon / product / category / global — percent or fixed, min-order, cap, usage limit, expiry, active |
| Banners / Gallery / Reviews / Socials | Marketing surfaces & moderation |
| Deliveries | Read-only live monitor (zones, captains incl. temp, totals, discounts, points) |
| Drivers | Permanent roster used at dispatch |
| Settings | Delivery (min order, ETA, free-above, payment methods), **Loyalty** (earn, signup bonus, value, min/max redeem), notifications, business TODO |

## Security model

- Row Level Security everywhere; the anon key can only read public content and
  call the SECURITY DEFINER RPCs listed above — no direct order writes.
- Prices, discounts, points, fees and statuses are validated **inside** Postgres.
- Customer profiles, loyalty accounts and transactions are visible to their owner only.
- Auth sessions persist safely (`persistSession`, `autoRefreshToken`).

## Documentation

- `DATABASE_CHANGES.md` — full v4 → v5 schema delta & rollback notes
- `PRODUCTION_CHECKLIST.md` — go-live checklist
- `QA_REPORT.md` — the validation battery results
- `MODIFIED_FILES.md` — everything this upgrade touched
