// ============================================================
//  Aquarium Cafe & Resturant — Customer data layer (Supabase, v5)
//  Public reads (appearance / categories / products / zones /
//  gallery / reviews / banners / socials / delivery & loyalty
//  settings) come straight from PostgREST; checkout runs inside
//  Postgres — atomic, priced & validated server-side.
//  v5 adds: Supabase Auth accounts, delivery zones, coupon
//  validation, loyalty points (read-only — RPCs write them).
// ============================================================
import { supabase, run, runCount, rpc } from '../../shared/db.js';

const OFFLINE = 'Cannot reach the restaurant right now — check your connection.';

/* ---------- row mappers (DB snake_case → app shape) ---------- */
const mapCategory = (c) => ({
  id: c.id,
  name: c.name,
  name_ar: c.name_ar ?? '',
  slug: c.slug,
  sort_order: c.sort_order ?? 0,
  product_count: Array.isArray(c.products) ? c.products[0]?.count ?? 0 : 0,
});

const mapProduct = (p) => ({
  id: p.id,
  category_id: p.category_id,
  name: p.name,
  name_ar: p.name_ar ?? '',
  description: p.description,
  description_ar: p.description_ar ?? '',
  price: p.price,
  image: p.image,
  badge: p.badge,
  featured: !!p.featured,
  sort_order: p.sort_order ?? 0,
  available: p.available ? 1 : 0,
  category: p.categories?.name ?? '',
  category_ar: p.categories?.name_ar ?? '',
  category_slug: p.categories?.slug ?? '',
});

/* ═══════════════ appearance (Visual Builder output) ═══════════════
   One round of parallel fetches: identity, theme, content, sections.
   Social links live in the social_links TABLE — they are folded
   into the content.socials object here so the theme engine needs no
   special casing (rows win over website_content.socials). */
export async function getAppearance() {
  const [settings, theme, content, sections, socials] = await Promise.all([
    run(supabase.from('settings').select('key, value'), OFFLINE),
    run(supabase.from('website_theme').select('key, value'), OFFLINE),
    run(supabase.from('website_content').select('key, value'), OFFLINE),
    run(supabase.from('website_sections').select('id, label, position, visible'), OFFLINE),
    run(supabase.from('social_links').select('platform, url, visible').eq('visible', true), OFFLINE),
  ]);

  const socialRows = socials || [];
  if (socialRows.length) {
    const folded = Object.fromEntries(socialRows.map((r) => [r.platform, r.url]).filter(([, u]) => u));
    const idx = (content || []).findIndex((r) => r.key === 'socials');
    const row = { key: 'socials', value: folded };
    if (idx >= 0) content[idx] = row;
    else (content || []).push(row);
  }

  return { settings, theme, content, sections };
}

/* Realtime: open tabs hot-apply changes the moment the admin saves. */
export function subscribeAppearance(onChange) {
  const tables = ['settings', 'website_theme', 'website_content', 'website_sections', 'social_links'];
  const ch = supabase.channel('aquarium-appearance-live');
  for (const t of tables)
    ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, onChange);
  return ch.subscribe();
}

/* ---------- categories (visible only, with product count) ---------- */
export async function getCategories() {
  const rows = await run(
    supabase
      .from('categories')
      .select('id, name, name_ar, slug, sort_order, products(count)')
      .eq('visible', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true }),
    OFFLINE
  );
  return (rows || []).map(mapCategory);
}

/* ---------- products (available only, joined with category) ---------- */
export function getProducts(category = 'all') {
  // !inner is only needed when filtering on the joined category slug
  const join = category && category !== 'all' ? 'categories!inner(name, name_ar, slug)' : 'categories(name, name_ar, slug)';
  let q = supabase
    .from('products')
    .select(`id, category_id, name, name_ar, description, description_ar, price, image, badge, featured, sort_order, available, ${join}`)
    .eq('available', true)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (category && category !== 'all') q = q.eq('categories.slug', category);
  return run(q, OFFLINE).then((rows) => (rows || []).map(mapProduct));
}

export async function getProduct(id) {
  try {
    const row = await run(
      supabase
        .from('products')
        .select('id, category_id, name, name_ar, description, description_ar, price, image, badge, featured, sort_order, available, categories(name, name_ar, slug)')
        .eq('id', id)
        .eq('available', true)
        .single(),
      OFFLINE
    );
    return mapProduct(row);
  } catch (err) {
    if (err.code === 'PGRST116') throw new Error('Product not found.');
    throw err;
  }
}

/* ═══════════════ CUSTOMER ACCOUNTS (Supabase Auth) ═══════════════
   Sign-up writes full_name/phone into raw user metadata → the
   on_auth_user_created trigger creates customer_profiles +
   loyalty_accounts (+ welcome bonus) in one atomic step. */
export async function signUpCustomer({ name, phone, email, password }) {
  if (!supabase.auth) throw new Error(OFFLINE);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name, phone } },
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code, status: error.status });
  // Supabase answers 200 with an obfuscated, identity-less user object
  // when the email is ALREADY registered (anti-enumeration). Detect it,
  // or the UI would happily say "check your inbox" for an account that
  // will never be created.
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw Object.assign(new Error('This email is already registered — try signing in instead.'), {
      code: 'user_already_exists',
    });
  }
  // "Confirm email" enabled → no session yet; tell the UI to say so.
  return { user: data?.user ?? null, session: data?.session ?? null };
}

export async function signInCustomer({ email, password }) {
  if (!supabase.auth) throw new Error(OFFLINE);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw Object.assign(new Error(error.message), { code: error.code, status: error.status });
  return { user: data?.user ?? null, session: data?.session ?? null };
}

export async function signOutCustomer() {
  if (!supabase.auth) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function getSession() {
  if (!supabase.auth) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session ?? null;
  } catch {
    return null;
  }
}

/** Fires on every auth change (sign-in / sign-out / token refresh). */
export function onAuthChange(cb) {
  if (!supabase.auth) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data?.subscription?.unsubscribe?.();
}

/* ---------- customer profile (owned row) ---------- */
export async function getMyProfile(userId) {
  const row = await run(
    supabase.from('customer_profiles').select('id, full_name, phone').eq('id', userId).maybeSingle(),
    OFFLINE
  );
  return row ? { name: row.full_name ?? '', phone: row.phone ?? '' } : null;
}

export async function saveMyProfile(userId, { name, phone }) {
  await run(
    supabase
      .from('customer_profiles')
      .upsert({ id: userId, full_name: String(name ?? '').slice(0, 80), phone: String(phone ?? '').slice(0, 20) }),
    OFFLINE
  );
  return { success: true };
}

/* ---------- loyalty (owner read-only; RPCs write) ---------- */
export async function getLoyaltyConfig() {
  const row = await run(
    supabase.from('loyalty_settings').select('value').eq('key', 'config').maybeSingle(),
    OFFLINE
  );
  const v = row?.value || {};
  return {
    enabled: v.enabled !== false,
    pointsPerOrder: +(v.points_per_order ?? 0),
    signupBonus: +(v.signup_bonus ?? 0),
    pointValue: +(v.point_value_egp ?? 0),
    minRedeem: +(v.min_redeem ?? 0),
    maxRedeem: +(v.max_redeem ?? 0),
  };
}

export async function getMyPoints(userId) {
  const row = await run(
    supabase.from('loyalty_accounts').select('points').eq('user_id', userId).maybeSingle(),
    OFFLINE
  );
  return +(row?.points ?? 0);
}

/** Points history — every movement, newest first. */
export async function getMyLoyaltyHistory(userId, limit = 60) {
  const rows = await run(
    supabase
      .from('loyalty_transactions')
      .select('id, delta, balance_after, reason, note, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit),
    OFFLINE
  );
  return rows || [];
}

/* ═══════════════ DELIVERY ═══════════════ */

const mapDelivery = (o) => ({
  id: o.id,
  name: o.customer_name,
  phone: o.customer_phone,
  address: o.address,
  addressDetail: o.address_detail ?? '',
  mapsLink: o.maps_link ?? '',
  notes: o.notes ?? '',
  paymentMethod: o.payment_method,
  items: Array.isArray(o.items) ? o.items : [],
  subtotal: +o.subtotal,
  deliveryFee: +o.delivery_fee,
  total: +o.total,
  status: o.status,
  driverId: o.driver_id,
  estimatedMinutes: o.estimated_minutes,
  deliveryNote: o.delivery_note ?? '',
  zoneId: o.zone_id,
  subZoneId: o.subzone_id,
  zone: o.delivery_zones ? { name_en: o.delivery_zones.name_en, name_ar: o.delivery_zones.name_ar ?? '' } : null,
  subZone: o.delivery_subzones ? { name_en: o.delivery_subzones.name_en, name_ar: o.delivery_subzones.name_ar ?? '' } : null,
  tempDriverName: o.temp_driver_name ?? '',
  tempDriverPhone: o.temp_driver_phone ?? '',
  discountAmount: +(o.discount_amount ?? 0),
  discountLabel: o.discount_label ?? '',
  couponCode: o.coupon_code ?? '',
  loyaltyRedeemed: +(o.loyalty_redeemed ?? 0),
  loyaltyEarned: +(o.loyalty_earned ?? 0),
  createdAt: o.created_at,
  updatedAt: o.updated_at,
});

/** Delivery configuration (fee floors, min order, ETA, payment methods, note). */
export async function getDeliverySettings() {
  const row = await run(
    supabase.from('delivery_settings').select('value').eq('key', 'config').maybeSingle(),
    OFFLINE
  );
  const v = row?.value || {};
  return {
    enabled: v.enabled !== false,
    fee: +(v.fee ?? 0),
    freeAbove: +(v.free_above ?? 0),
    minOrder: +(v.min_order ?? 0),
    estimatedMinutes: +(v.estimated_minutes ?? 45),
    paymentMethods: Array.isArray(v.payment_methods) ? v.payment_methods : ['cash'],
    note: v.note ?? '',
  };
}

/* ---------- delivery zones (Step 1 → Step 2) ---------- */
export async function getDeliveryZones() {
  const rows = await run(
    supabase
      .from('delivery_zones')
      .select('id, name_en, name_ar, fee, free_above, sort_order, delivery_subzones(id, zone_id, name_en, name_ar, delivery_fee, active, sort_order)')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true }),
    OFFLINE
  );
  return (rows || []).map((z) => ({
    id: z.id,
    name_en: z.name_en,
    name_ar: z.name_ar ?? '',
    fee: +z.fee,
    freeAbove: +(z.free_above ?? 0),
    subZones: (Array.isArray(z.delivery_subzones) ? z.delivery_subzones : [])
      .filter((s) => s.active)
      .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id))
      .map((s) => ({
        id: s.id,
        name_en: s.name_en,
        name_ar: s.name_ar ?? '',
        fee: +(s.delivery_fee ?? 0), // v5.1 — each sub zone has its own fee
      })),
  }));
}

/** Live coupon check — read-only preview inside validate_coupon(). */
export async function validateCoupon({ code, items, userId }) {
  const res = await rpc('validate_coupon', {
    p: { code, userId: userId || '', items },
  });
  return res || { ok: false, key: 'invalid' };
}

/** Active, code-less discounts — read-only auto-discount PREVIEW at checkout.
    (place_delivery_order recomputes them authoritatively.) */
export async function getAutoDiscounts() {
  const now = new Date().toISOString();
  const rows = await run(
    supabase
      .from('discounts')
      .select('id, name, type, code, value_type, value, min_order, max_discount, max_uses, used_count, starts_at, expires_at, target_id')
      .is('code', null)
      .eq('active', true)
      .lte('starts_at', now),
    OFFLINE
  );
  return (rows || []).filter((d) => {
    if (d.expires_at && d.expires_at <= now) return false;
    if (d.max_uses != null && d.used_count >= d.max_uses) return false;
    return true;
  });
}

/** How many delivery orders this member already placed (signup discount rule). */
export async function countMyOrders(userId) {
  return runCount(
    supabase.from('delivery_orders').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  );
}

/** Place a delivery order — zones, discounts & loyalty settled inside Postgres. */
export async function placeDeliveryOrder(payload) {
  const order = await rpc('place_delivery_order', { p: payload });
  return { success: true, order };
}

/** Fetch one delivery order by its (unguessable) uuid tracking id. */
export async function getDeliveryOrder(id) {
  try {
    const row = await run(
      supabase
        .from('delivery_orders')
        .select(`id, customer_name, customer_phone, address, address_detail, maps_link, notes,
                 payment_method, items, subtotal, delivery_fee, total, status, driver_id,
                 estimated_minutes, delivery_note, zone_id, subzone_id,
                 temp_driver_name, temp_driver_phone,
                 discount_amount, discount_label, coupon_code, loyalty_redeemed, loyalty_earned,
                 created_at, updated_at,
                 drivers(name, phone),
                 delivery_zones(name_en, name_ar),
                 delivery_subzones(name_en, name_ar)`)
        .eq('id', id)
        .single(),
      OFFLINE
    );
    return { ...mapDelivery(row), driver: row.drivers ? { name: row.drivers.name, phone: row.drivers.phone } : null };
  } catch (err) {
    if (err.code === 'PGRST116') throw new Error('Order not found — check the tracking link.');
    throw err;
  }
}

/** Timestamped journey of one delivery order. */
export async function getDeliveryHistory(id) {
  const rows = await run(
    supabase
      .from('delivery_status_history')
      .select('status, note, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    OFFLINE
  );
  return rows || [];
}

/** Live tracking — fires the moment the waiter moves the order. */
export function subscribeDeliveryOrder(id, onChange) {
  return supabase
    .channel('aquarium-delivery-' + id)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'delivery_orders', filter: `id=eq.${id}` },
      onChange
    )
    .subscribe();
}

/* ═══════════════ marketing content: banners / gallery / reviews ═══════════════ */
export async function getBanners() {
  const rows = await run(
    supabase
      .from('banners')
      .select('id, title, subtitle, image, cta_text, cta_link')
      .eq('visible', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
      .limit(3),
    OFFLINE
  );
  return rows || [];
}

export async function getGallery() {
  const rows = await run(
    supabase
      .from('gallery')
      .select('id, image, title')
      .eq('visible', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
      .limit(60),
    OFFLINE
  );
  return rows || [];
}

/** Approved reviews only — newest first. */
export async function getReviews(limit = 12) {
  const rows = await run(
    supabase
      .from('reviews')
      .select('id, customer_name, rating, text, created_at')
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(limit),
    OFFLINE
  );
  return rows || [];
}

/** Submit a guest review — always lands unapproved (moderation). */
export async function submitReview({ name, rating, text }) {
  const cleanName = String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const cleanText = String(text ?? '').trim().slice(0, 600);
  await run(
    supabase.from('reviews').insert({ customer_name: cleanName, rating, text: cleanText }),
    OFFLINE
  );
  return { success: true };
}
