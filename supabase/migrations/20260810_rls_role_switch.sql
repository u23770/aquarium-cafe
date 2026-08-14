-- ═══════════════════════════════════════════════════════════════════
--  AQUARIUM CAFE — v5.1.2/v5.1.3 RLS FINAL POLICY SET (2026-08-10)
-- ═══════════════════════════════════════════════════════════════════
--  Run this on ANY database created by an older script (schema.sql from
--  before 2026-08-10, or any earlier migration chain).
--
--  Two corrections in one idempotent file:
--
--  1 · ROLE-SWITCH FIX (v5.1.2): public READS must keep working when a
--      customer login flips the shared client anon → authenticated, so all
--      operator SELECT policies (plus the customer review-submission INSERT,
--      still guarded by check (approved = false)) are recreated
--      "TO anon, authenticated".
--
--  2 · ADMIN-WRITE LOCKDOWN (v5.1.3): writes on the administrative tables
--      are recreated "TO anon" ONLY — a normal authenticated customer gets
--      ZERO direct INSERT/UPDATE/DELETE power. Admin/Waiter keep working
--      because their clients are session-isolated (shared/supabase.js) and
--      therefore always talk as `anon`.
--
--  Not touched by design: customer_profiles / loyalty_accounts /
--  loyalty_transactions (auth.uid() ownership), storage.objects ("to
--  public"), driver_locations (unused, deny-all).
--
--  Fully idempotent: drop-if-exists + create; safe to run repeatedly.
-- ═══════════════════════════════════════════════════════════════════

-- settings
drop policy if exists "settings: anon read" on public.settings;
create policy "settings: anon read"   on public.settings for select to anon, authenticated using (true);
drop policy if exists "settings: anon insert" on public.settings;
create policy "settings: anon insert" on public.settings for insert to anon with check (true);
drop policy if exists "settings: anon update" on public.settings;
create policy "settings: anon update" on public.settings for update to anon using (true) with check (true);
-- website_theme
drop policy if exists "theme: anon read" on public.website_theme;
create policy "theme: anon read"      on public.website_theme for select to anon, authenticated using (true);
drop policy if exists "theme: anon insert" on public.website_theme;
create policy "theme: anon insert"    on public.website_theme for insert to anon with check (true);
drop policy if exists "theme: anon update" on public.website_theme;
create policy "theme: anon update"    on public.website_theme for update to anon using (true) with check (true);
-- website_content
drop policy if exists "content: anon read" on public.website_content;
create policy "content: anon read"    on public.website_content for select to anon, authenticated using (true);
drop policy if exists "content: anon insert" on public.website_content;
create policy "content: anon insert"  on public.website_content for insert to anon with check (true);
drop policy if exists "content: anon update" on public.website_content;
create policy "content: anon update"  on public.website_content for update to anon using (true) with check (true);
-- website_sections
drop policy if exists "sections: anon read" on public.website_sections;
create policy "sections: anon read"   on public.website_sections for select to anon, authenticated using (true);
drop policy if exists "sections: anon insert" on public.website_sections;
create policy "sections: anon insert" on public.website_sections for insert to anon with check (true);
drop policy if exists "sections: anon update" on public.website_sections;
create policy "sections: anon update" on public.website_sections for update to anon using (true) with check (true);
-- media_library
drop policy if exists "media: anon read" on public.media_library;
create policy "media: anon read"      on public.media_library for select to anon, authenticated using (true);
drop policy if exists "media: anon insert" on public.media_library;
create policy "media: anon insert"    on public.media_library for insert to anon with check (true);
drop policy if exists "media: anon update" on public.media_library;
create policy "media: anon update"    on public.media_library for update to anon using (true) with check (true);
drop policy if exists "media: anon delete" on public.media_library;
create policy "media: anon delete"    on public.media_library for delete to anon using (true);
-- social_links
drop policy if exists "socials: anon read" on public.social_links;
create policy "socials: anon read"    on public.social_links for select to anon, authenticated using (true);
drop policy if exists "socials: anon insert" on public.social_links;
create policy "socials: anon insert"  on public.social_links for insert to anon with check (true);
drop policy if exists "socials: anon update" on public.social_links;
create policy "socials: anon update"  on public.social_links for update to anon using (true) with check (true);
drop policy if exists "socials: anon delete" on public.social_links;
create policy "socials: anon delete"  on public.social_links for delete to anon using (true);
-- categories
drop policy if exists "categories: anon read" on public.categories;
create policy "categories: anon read"   on public.categories for select to anon, authenticated using (true);
drop policy if exists "categories: anon insert" on public.categories;
create policy "categories: anon insert" on public.categories for insert to anon with check (true);
drop policy if exists "categories: anon update" on public.categories;
create policy "categories: anon update" on public.categories for update to anon using (true) with check (true);
drop policy if exists "categories: anon delete" on public.categories;
create policy "categories: anon delete" on public.categories for delete to anon using (true);
-- products
drop policy if exists "products: anon read" on public.products;
create policy "products: anon read"   on public.products for select to anon, authenticated using (true);
drop policy if exists "products: anon insert" on public.products;
create policy "products: anon insert" on public.products for insert to anon with check (true);
drop policy if exists "products: anon update" on public.products;
create policy "products: anon update" on public.products for update to anon using (true) with check (true);
drop policy if exists "products: anon delete" on public.products;
create policy "products: anon delete" on public.products for delete to anon using (true);
-- delivery_zones
drop policy if exists "zones: anon read" on public.delivery_zones;
create policy "zones: anon read"    on public.delivery_zones for select to anon, authenticated using (true);
drop policy if exists "zones: anon insert" on public.delivery_zones;
create policy "zones: anon insert"  on public.delivery_zones for insert to anon with check (true);
drop policy if exists "zones: anon update" on public.delivery_zones;
create policy "zones: anon update"  on public.delivery_zones for update to anon using (true) with check (true);
drop policy if exists "zones: anon delete" on public.delivery_zones;
create policy "zones: anon delete"  on public.delivery_zones for delete to anon using (true);
-- delivery_subzones
drop policy if exists "subzones: anon read" on public.delivery_subzones;
create policy "subzones: anon read"    on public.delivery_subzones for select to anon, authenticated using (true);
drop policy if exists "subzones: anon insert" on public.delivery_subzones;
create policy "subzones: anon insert"  on public.delivery_subzones for insert to anon with check (true);
drop policy if exists "subzones: anon update" on public.delivery_subzones;
create policy "subzones: anon update"  on public.delivery_subzones for update to anon using (true) with check (true);
drop policy if exists "subzones: anon delete" on public.delivery_subzones;
create policy "subzones: anon delete"  on public.delivery_subzones for delete to anon using (true);
-- discounts
drop policy if exists "discounts: anon read" on public.discounts;
create policy "discounts: anon read"    on public.discounts for select to anon, authenticated using (true);
drop policy if exists "discounts: anon insert" on public.discounts;
create policy "discounts: anon insert"  on public.discounts for insert to anon with check (true);
drop policy if exists "discounts: anon update" on public.discounts;
create policy "discounts: anon update"  on public.discounts for update to anon using (true) with check (true);
drop policy if exists "discounts: anon delete" on public.discounts;
create policy "discounts: anon delete"  on public.discounts for delete to anon using (true);
-- loyalty_settings
drop policy if exists "loyaltyset: anon read" on public.loyalty_settings;
create policy "loyaltyset: anon read"   on public.loyalty_settings for select to anon, authenticated using (true);
drop policy if exists "loyaltyset: anon insert" on public.loyalty_settings;
create policy "loyaltyset: anon insert" on public.loyalty_settings for insert to anon with check (true);
drop policy if exists "loyaltyset: anon update" on public.loyalty_settings;
create policy "loyaltyset: anon update" on public.loyalty_settings for update to anon using (true) with check (true);
-- drivers
drop policy if exists "drivers: anon read" on public.drivers;
create policy "drivers: anon read"    on public.drivers for select to anon, authenticated using (true);
drop policy if exists "drivers: anon insert" on public.drivers;
create policy "drivers: anon insert"  on public.drivers for insert to anon with check (true);
drop policy if exists "drivers: anon update" on public.drivers;
create policy "drivers: anon update"  on public.drivers for update to anon using (true) with check (true);
drop policy if exists "drivers: anon delete" on public.drivers;
create policy "drivers: anon delete"  on public.drivers for delete to anon using (true);
-- delivery_settings
drop policy if exists "delset: anon read" on public.delivery_settings;
create policy "delset: anon read"    on public.delivery_settings for select to anon, authenticated using (true);
drop policy if exists "delset: anon insert" on public.delivery_settings;
create policy "delset: anon insert"  on public.delivery_settings for insert to anon with check (true);
drop policy if exists "delset: anon update" on public.delivery_settings;
create policy "delset: anon update"  on public.delivery_settings for update to anon using (true) with check (true);
-- notification_settings
drop policy if exists "notset: anon read" on public.notification_settings;
create policy "notset: anon read"    on public.notification_settings for select to anon, authenticated using (true);
drop policy if exists "notset: anon insert" on public.notification_settings;
create policy "notset: anon insert"  on public.notification_settings for insert to anon with check (true);
drop policy if exists "notset: anon update" on public.notification_settings;
create policy "notset: anon update"  on public.notification_settings for update to anon using (true) with check (true);
-- delivery_orders
drop policy if exists "delivery: anon read" on public.delivery_orders;
create policy "delivery: anon read" on public.delivery_orders for select to anon, authenticated using (true);
-- delivery_status_history
drop policy if exists "delivery_hist: anon read" on public.delivery_status_history;
create policy "delivery_hist: anon read" on public.delivery_status_history for select to anon, authenticated using (true);
-- gallery
drop policy if exists "gallery: anon read" on public.gallery;
create policy "gallery: anon read"   on public.gallery for select to anon, authenticated using (true);
drop policy if exists "gallery: anon insert" on public.gallery;
create policy "gallery: anon insert" on public.gallery for insert to anon with check (true);
drop policy if exists "gallery: anon update" on public.gallery;
create policy "gallery: anon update" on public.gallery for update to anon using (true) with check (true);
drop policy if exists "gallery: anon delete" on public.gallery;
create policy "gallery: anon delete" on public.gallery for delete to anon using (true);
-- banners
drop policy if exists "banners: anon read" on public.banners;
create policy "banners: anon read"   on public.banners for select to anon, authenticated using (true);
drop policy if exists "banners: anon insert" on public.banners;
create policy "banners: anon insert" on public.banners for insert to anon with check (true);
drop policy if exists "banners: anon update" on public.banners;
create policy "banners: anon update" on public.banners for update to anon using (true) with check (true);
drop policy if exists "banners: anon delete" on public.banners;
create policy "banners: anon delete" on public.banners for delete to anon using (true);
-- reviews
drop policy if exists "reviews: anon read" on public.reviews;
create policy "reviews: anon read"   on public.reviews for select to anon, authenticated using (true);
drop policy if exists "reviews: anon submit" on public.reviews;
create policy "reviews: anon submit" on public.reviews for insert to anon, authenticated with check (approved = false);
drop policy if exists "reviews: anon update" on public.reviews;
create policy "reviews: anon update" on public.reviews for update to anon using (true) with check (true);
drop policy if exists "reviews: anon delete" on public.reviews;
create policy "reviews: anon delete" on public.reviews for delete to anon using (true);

-- ═══ done — public reads for everyone, admin writes for anon only ═══
