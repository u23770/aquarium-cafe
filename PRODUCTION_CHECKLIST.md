# Production Checklist — Aquarium Cafe & Restaurant (current)

Run this list top-to-bottom before launch. The current production model uses authenticated staff RBAC, token-authorized guest order tracking, server-side checkout calculations, and Realtime updates.

## 1. Supabase database

- [ ] Fresh database: run `supabase/schema.sql`, then apply **all** migrations in `supabase/migrations/` in chronological order.
- [ ] Existing database: apply only the migrations required to bring that database forward, ending with the current 2026-09-10 security/guest-tracking migrations.
- [ ] Configure the project URL + publishable/anon client key in each app's `shared/config.js`.
- [ ] Customer Email Auth is configured as intended.
- [ ] Admin/Waiter staff-session flow is configured with its required Edge Function secrets.
- [ ] Authentication redirect URLs include the real HTTPS domain.
- [ ] Storage bucket `media` exists and has the intended public-read policy.
- [ ] Realtime publication includes `delivery_orders` and every table actually used by the live customer/waiter flows.
- [ ] Web Push VAPID public key is configured in the customer/waiter push helper; the private key is never shipped to the browser.

## 2. Security verification

- [ ] `cancel_delivery_order` and `edit_delivery_order` are authenticated-only; guests use the token-authorized guest wrappers.
- [ ] Guest tracking stores only a random tracking token locally; the raw token is not displayed as a technical field to the customer.
- [ ] Guest tracking RPCs validate the token hash before returning order data or allowing guest mutations.
- [ ] Customer order/status-history reads are not public table reads.
- [ ] Admin CRUD requires an active `staff_profiles` admin.
- [ ] Waiter status transitions require an active staff role.
- [ ] No browser code contains a `service_role`/secret key.

## 3. Customer app smoke test

- [ ] `/customer` loads over HTTPS.
- [ ] EN ⇄ AR switch works and RTL layout remains usable.
- [ ] Menu categories, search, sort, favorites, product modal, quantity controls and Add-to-cart all work.
- [ ] Cart opens/closes, quantity +/- works, remove works, empty-cart Browse works, and checkout is disabled when empty.
- [ ] Checkout: zone → sub-zone/skip → address → payment works.
- [ ] GPS Maps helper fills a valid Google Maps URL when permission is granted; denial shows a normal user-facing error.
- [ ] Coupon validation and automatic discounts work.
- [ ] Loyalty points are shown only when applicable and are revalidated server-side.
- [ ] Successful checkout shows a simple confirmation and a normal **Track Order** action; security tokens are invisible.
- [ ] The active order can be reopened from the site's tracking pill while it is in progress.
- [ ] Tracking shows status timeline, ETA, history, and driver/call details when available.
- [ ] Customer push notification permission is optional; if already granted, registration happens automatically in the background.
- [ ] Edit/cancel buttons appear only while the order is actually editable.
- [ ] Delivered/Cancelled orders stop the live tracking subscription and active-order reminder.
- [ ] Reviews, gallery/lightbox, account/profile and PWA install controls work.

## 4. Waiter app smoke test

- [ ] `/waiter` requires the staff session before loading order data.
- [ ] Six delivery status columns render correctly.
- [ ] Realtime updates move/refresh cards without a manual reload.
- [ ] Polling safety refresh continues to work if Realtime temporarily drops.
- [ ] Sound toggle works and respects mute state.
- [ ] Refresh button works.
- [ ] Print is available from **Received** and **Accepted** as well as later stages where appropriate.
- [ ] Accept → Preparing → Ready → Out for Delivery → Delivered works.
- [ ] Temporary-driver flow works and customer tracking receives the driver details.
- [ ] Staff push notifications work after the browser grants permission.
- [ ] Notification clicks highlight the intended order without changing its status.

## 5. Admin app smoke test

- [ ] `/admin` requires the staff session before loading protected data.
- [ ] Sidebar navigation works on desktop and mobile.
- [ ] Overview loads.
- [ ] Customizer/content/media/sections/menu/zones/discounts/banners/gallery/reviews/socials/deliveries/drivers/settings pages load.
- [ ] Save/reorder/delete actions work and do not stack duplicate handlers after navigation.
- [ ] Menu/category/product availability changes propagate to the customer app.
- [ ] Zone/sub-zone fee changes affect new orders only; existing orders retain their stored snapshot.
- [ ] Discount usage counters remain atomic under repeated checkout attempts.
- [ ] Loyalty redemption/earn/refund remains atomic.
- [ ] Commission statement calculates server-side at 5%, excludes delivery/VAT, excludes cancelled orders, and rejects periods over 32 days.

## 6. Real end-to-end test

1. Place a real guest test order.
2. Confirm it appears on Waiter and Admin.
3. Advance it through every delivery status.
4. Open customer tracking and confirm each status changes live.
5. Test customer push notifications.
6. Test temporary driver + call button.
7. Test edit/cancel while the order is still editable.
8. Test a coupon and loyalty redemption on separate orders.
9. Deliver the test order and confirm loyalty credit is applied once.
10. Repeat with a logged-in customer and verify ownership isolation.

## 7. Operational configuration

- [ ] Admin Settings: real minimum order, ETA, free-above threshold and payment methods.
- [ ] Admin Content: real phone/WhatsApp, address, hours and branches.
- [ ] Admin Socials: real social links.
- [ ] Business TODO items completed.
- [ ] Seed/demo menu photos replaced with production photos.
- [ ] Real domain/HTTPS configured before public launch.

## 8. Rollback

- Code rollback: redeploy the last known-good static bundle only when its database contract is compatible.
- Database rollback: restore the pre-migration backup/snapshot; do not manually reverse security migrations in production unless the dependent code is rolled back with them.
