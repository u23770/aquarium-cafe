# 🐠 Aquarium Cafe & Resturant — Commercial Delivery Platform v5

The complete digital platform for **Aquarium Cafe & Resturant** (Hurghada, Egypt) — a delivery-only restaurant operation built with pure HTML5/CSS3/Vanilla JavaScript and Supabase (PostgreSQL + RLS + Realtime + Storage + Auth).

No frameworks. No build step. No Node dependencies.

## Architecture

- `customer/` — public menu, cart, checkout, customer accounts, loyalty, reviews and order tracking.
- `waiter/` — authenticated staff dispatch board with live order status, drivers and notifications.
- `admin/` — authenticated admin console: content, theme, menu, zones, discounts, media, reviews, drivers, settings and commission statement.
- `shared/` — shared Supabase client/config/helpers.
- `supabase/schema.sql` — fresh v5.1 baseline.
- `supabase/migrations/` — incremental production migrations.

## Production authentication model

Admin and Waiter are **not anonymous operator clients**. They authenticate through the `staff-session` Edge Function and receive a normal Supabase Auth session. Authorization is then resolved server-side from `staff_profiles` (`admin` / `waiter`, active flag).

Customer sessions use a separate browser storage key from staff sessions. Customer users cannot use their authenticated role to obtain admin CRUD access.

Operator table writes are restricted to authenticated admins. Delivery status transitions are restricted to authenticated staff. Customer-owned data is owner-scoped.

## Quick start

1. Create a Supabase project.
2. For a **fresh database**, run `supabase/schema.sql`, then apply the production migrations in chronological order, including:
   - `20260909_staff_rbac_foundation.sql`
   - `20260910_production_security_hardening.sql`
3. Configure `shared/config.js` with the project URL and publishable/anon client key.
4. Enable Email Auth for customers.
5. Configure the `staff-session` Edge Function secrets for the admin/waiter access-code flow.
6. Deploy the `customer/`, `waiter/`, and `admin/` folders over HTTPS.

For an existing v4/v5 database, use the appropriate historical migrations first, then the RBAC/security migrations above. Do not treat the old v5.1.3 anonymous-operator model as a production security model.

## Money flow

`place_delivery_order(jsonb)` remains the authoritative checkout transaction. It re-prices the cart server-side, applies eligible discounts, validates loyalty redemption, calculates delivery/VAT/total, writes the order/history, and atomically updates usage counters.

Commission statements are calculated server-side at **5%** of eligible item sales after discounts, excluding delivery fees and VAT and excluding cancelled orders; the allowed period is capped at 32 days.

## Admin console map

| Page | What it controls |
|---|---|
| Overview | Deliveries, revenue, active orders, drivers, zones, discounts, loyalty and review queue |
| Customizer | Live visual configuration |
| Content | Contact, hours, branches and site text |
| Media Library | Upload/reuse/delete media |
| Sections | Homepage order and visibility |
| Menu Manager | Categories/products, bilingual content, availability, featured/reorder |
| Delivery Zones | Zones/sub-zones, delivery fees and free-above rules |
| Discounts | Coupons and automatic discounts |
| Banners / Gallery / Reviews / Socials | Marketing and moderation |
| Deliveries | Live delivery monitor |
| Drivers | Permanent driver roster |
| Commission | Period-based 5% commission statement + printable report |
| Settings | Delivery, loyalty, notifications and business configuration |

## Security notes

- RLS is enabled across the public tables.
- Admin CRUD requires an authenticated `staff_profiles.role = admin` user.
- Waiter delivery transitions require an authenticated active staff user.
- Customer profile/loyalty data is owner-scoped.
- Sensitive delivery-order reads are no longer public; they are restricted to staff or the authenticated order owner.
- Internal pricing and operator RPCs are not exposed to anonymous clients.
- The `service_role` key is never placed in browser code.

## Production verification

Before real orders, run the complete smoke test in `PRODUCTION_CHECKLIST.md`, including guest checkout, authenticated customer checkout, staff login, order status transitions, temporary drivers, push notifications, coupons, loyalty, media upload, admin CRUD and commission calculation.

## Documentation

- `DATABASE_CHANGES.md` — schema evolution notes
- `PRODUCTION_CHECKLIST.md` — go-live checklist
- `QA_REPORT.md` — historical QA results; verify again after the 2026-09-10 security changes
- `MODIFIED_FILES.md` — change summary
