// ============================================================
//  Aquarium Cafe & Resturant — Admin data layer (Supabase)
//  Website Management System edition:
//   · appearance  → settings / website_theme / website_content /
//                   website_sections  (the Visual Builder)
//   · media       → media_library + the "media" storage bucket
//   · menu        → categories & products (featured, sorting,
//                   availability, archive-safe deletes)
//   · overview    → get_overview() dashboard function
// ============================================================
import { supabase, isConfigured, run, runCount, rpc } from '../shared/db.js';
import { isExternalUrl, storagePathFromUrl } from '../shared/media.js';
import { STORAGE_BUCKET } from '../shared/config.js';
import {
  settingsFromRows, themeFromRows, contentFromRows, sectionsFromRows,
  settingsToRows, themeToRows, contentToRows,
} from '../shared/appearance.js';

const OFFLINE = 'Cannot reach Supabase right now — check your connection.';
const NOT_CONFIGURED =
  'Supabase is not configured yet — add your Project URL and anon key in shared/config.js.';

const PRODUCT_COLS =
  'id, category_id, name, name_ar, description, description_ar, price, image, badge, available, featured, sort_order, categories(name, name_ar, slug)';

/* ---------- row mappers ---------- */
const mapCategory = (c) => ({
  id: c.id,
  name: c.name,
  name_ar: c.name_ar ?? '',
  slug: c.slug,
  visible: c.visible !== false,
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
  available: p.available ? 1 : 0,
  featured: !!p.featured,
  sort_order: p.sort_order ?? 0,
  category: p.categories?.name ?? '',
  category_ar: p.categories?.name_ar ?? '',
  category_slug: p.categories?.slug ?? '',
});

const notFound = (err) =>
  err?.code === 'PGRST116'
    ? Object.assign(new Error('Not found — it may have just been removed.'), { code: 'PGRST116' })
    : err;

/* ═══════════════ overview (dashboard) ═══════════════ */
export function getOverview() {
  return rpc('get_overview');
}

/* ═══════════════ appearance (Visual Builder) ═══════════════ */
export async function getAppearance() {
  if (!isConfigured) throw new Error(NOT_CONFIGURED);
  const [settings, theme, content, sections] = await Promise.all([
    run(supabase.from('settings').select('key, value'), OFFLINE),
    run(supabase.from('website_theme').select('key, value'), OFFLINE),
    run(supabase.from('website_content').select('key, value'), OFFLINE),
    run(supabase.from('website_sections').select('id, label, position, visible').order('position'), OFFLINE),
  ]);
  return {
    settings: settingsFromRows(settings),
    theme: themeFromRows(theme),
    content: contentFromRows(content),
    sections: sectionsFromRows(sections),
  };
}

export async function saveSettings(settings) {
  await run(supabase.from('settings').upsert(settingsToRows(settings), { onConflict: 'key' }), OFFLINE);
  return { success: true };
}

export async function saveTheme(theme) {
  await run(supabase.from('website_theme').upsert(themeToRows(theme), { onConflict: 'key' }), OFFLINE);
  return { success: true };
}

export async function saveContent(content) {
  await run(supabase.from('website_content').upsert(contentToRows(content), { onConflict: 'key' }), OFFLINE);
  return { success: true };
}

/** One-click Save from the customizer: identity + theme + content. */
export async function saveAppearance({ settings, theme, content }) {
  if (settings) await saveSettings(settings);
  if (theme) await saveTheme(theme);
  if (content) await saveContent(content);
  return { success: true };
}

/* ---------- section manager ---------- */
export async function getSections() {
  const rows = await run(
    supabase.from('website_sections').select('id, label, position, visible').order('position'),
    OFFLINE
  );
  return sectionsFromRows(rows);
}

export async function saveSections(sections) {
  const rows = sections.map((s, i) => ({
    id: s.id,
    label: s.label,
    position: Number.isFinite(+s.position) ? +s.position : i * 10,
    visible: s.visible !== false,
  }));
  await run(supabase.from('website_sections').upsert(rows, { onConflict: 'id' }), OFFLINE);
  return { success: true };
}

/* ═══════════════ media library ═══════════════ */
const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};
const MAX_UPLOAD = 6 * 1024 * 1024;

const sanitizeFolder = (f) =>
  String(f || 'general').toLowerCase().replace(/[^a-z0-9/_-]+/g, '-').replace(/\/+/g, '/').replace(/^-+|-+$/g, '') || 'general';

const checkImage = (file) => {
  const ext = EXT_BY_MIME[file.type];
  if (!ext) throw new Error('Send a PNG, JPG, WebP, GIF or SVG image.');
  if (file.size > MAX_UPLOAD) throw new Error('Image exceeds the 6 MB limit.');
  return ext;
};

const rand4 = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export async function listMedia() {
  const rows = await run(
    supabase.from('media_library').select('*').order('created_at', { ascending: false }),
    OFFLINE
  );
  return rows || [];
}

/** Upload a new image into a folder; returns the media_library row. */
export async function uploadMedia(file, folder = 'general') {
  if (!isConfigured) throw new Error(NOT_CONFIGURED);
  const ext = checkImage(file);
  const dir = sanitizeFolder(folder);
  const path = `${dir}/${Date.now().toString(36)}-${rand4()}.${ext}`;

  const res = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
  if (res.error) throw new Error(res.error.message || 'Upload failed.');

  const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  const row = await run(
    supabase
      .from('media_library')
      .insert({
        bucket: STORAGE_BUCKET,
        path,
        name: (file.name || path).replace(/\.[a-z0-9]+$/i, '').slice(0, 160),
        folder: dir,
        size_bytes: file.size,
        mime: file.type,
        public_url: pub.publicUrl,
      })
      .select()
      .single(),
    OFFLINE
  );
  return row;
}

/** Replace the file of an existing row (URL stays the same). */
export async function replaceMedia(media, file) {
  if (!isConfigured) throw new Error(NOT_CONFIGURED);
  checkImage(file);
  const res = await supabase.storage
    .from(media.bucket)
    .update(media.path, file, { contentType: file.type, cacheControl: '300', upsert: true });
  if (res.error) throw new Error(res.error.message || 'Replace failed.');

  return run(
    supabase
      .from('media_library')
      .update({ size_bytes: file.size, mime: file.type })
      .eq('id', media.id)
      .select()
      .single(),
    OFFLINE
  );
}

/** Delete the file + its catalogue row. */
export async function deleteMedia(media) {
  await supabase.storage.from(media.bucket).remove([media.path]);
  await run(supabase.from('media_library').delete().eq('id', media.id), OFFLINE);
  return { success: true };
}

/* ═══════════════ categories ═══════════════ */
export async function getCategories() {
  const rows = await run(
    supabase
      .from('categories')
      .select('id, name, name_ar, slug, visible, sort_order, products(count)')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true }),
    OFFLINE
  );
  return (rows || []).map(mapCategory);
}

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'category';

function cleanCategoryName(name) {
  const n = String(name ?? '').trim();
  if (n.length < 2 || n.length > 60) throw new Error('Category name must be 2–60 characters.');
  return n;
}

const cleanAr = (s, max = 80) => String(s ?? '').trim().slice(0, max);

async function uniqueSlug(base, excludeId = 0) {
  const rows = await run(supabase.from('categories').select('id, slug'), OFFLINE);
  const taken = new Set((rows || []).filter((r) => r.id !== excludeId).map((r) => r.slug));
  let slug = base, i = 2;
  while (taken.has(slug)) slug = `${base}-${i++}`;
  return slug;
}

async function nextSort(table, column = 'sort_order') {
  const row = await run(
    supabase.from(table).select(column).order(column, { ascending: false }).limit(1).maybeSingle(),
    OFFLINE
  );
  return (row?.[column] ?? 0) + 10;
}

export async function createCategory(name, nameAr = '') {
  const n = cleanCategoryName(name);
  const slug = await uniqueSlug(slugify(n));
  const row = await run(
    supabase
      .from('categories')
      .insert({ name: n, name_ar: cleanAr(nameAr, 60), slug, sort_order: await nextSort('categories') })
      .select()
      .single(),
    OFFLINE
  );
  return { ...row, product_count: 0 };
}

export async function updateCategory(id, name, extra = {}) {
  const patch = {
    ...(name !== undefined
      ? { name: cleanCategoryName(name), slug: await uniqueSlug(slugify(name), Number(id)) }
      : {}),
    ...(extra.name_ar !== undefined ? { name_ar: cleanAr(extra.name_ar, 60) } : {}),
    ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'name_ar')),
  };
  const row = await run(
    supabase.from('categories').update(patch).eq('id', id).select().single(),
    OFFLINE
  );
  return mapCategory({ ...row, products: [] });
}

export async function deleteCategory(id) {
  const cat = await run(supabase.from('categories').select('id, name').eq('id', id).maybeSingle(), OFFLINE);
  const count = await runCount(supabase.from('products').select('*', { count: 'exact', head: true }).eq('category_id', id));
  if (!cat) throw new Error('Category not found.');
  if (count > 0)
    throw new Error(`“${cat.name}” still holds ${count} product${count > 1 ? 's' : ''} — move or delete them first.`);
  await run(supabase.from('categories').delete().eq('id', id), OFFLINE);
  return { success: true, deleted: Number(id) };
}

/** Persist a new explicit order (array of ids, top → bottom). */
export async function saveCategoryOrder(ids) {
  // ONE atomic call: reorder_rows() applies every position inside a single
  // server-side UPDATE (supabase/schema.sql). A bulk UPSERT cannot be used
  // here — these tables have GENERATED ALWAYS identity keys and PostgREST's
  // upsert would try to SET the identity column, which PostgreSQL rejects.
  await rpc('reorder_rows', { p_table: 'categories', p_ids: ids });
  return { success: true };
}

/* ═══════════════ products ═══════════════ */
export async function getProducts() {
  const rows = await run(
    supabase.from('products').select(PRODUCT_COLS)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true }),
    OFFLINE
  );
  return (rows || []).map(mapProduct);
}

function cleanProduct(body, { partial = false } = {}) {
  const p = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (name.length < 2 || name.length > 80) throw new Error('Product name must be 2–80 characters.');
    p.name = name;
  }
  if (!partial || body.name_ar !== undefined) p.name_ar = String(body.name_ar ?? '').trim().slice(0, 80);
  if (!partial || body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0 || price > 100000)
      throw new Error('Price must be a number between 0 and 100000.');
    p.price = Math.round(price * 100) / 100;
  }
  if (!partial || body.category_id !== undefined) {
    const category_id = Number(body.category_id);
    if (!Number.isInteger(category_id) || category_id <= 0) throw new Error('Please choose a valid category.');
    p.category_id = category_id;
  }
  if (!partial || body.description !== undefined) p.description = String(body.description ?? '').trim().slice(0, 600);
  if (!partial || body.description_ar !== undefined) p.description_ar = String(body.description_ar ?? '').trim().slice(0, 600);
  if (!partial || body.badge !== undefined) p.badge = String(body.badge ?? '').trim().slice(0, 30);
  if (!partial || body.image !== undefined) {
    const image = String(body.image ?? '').trim().slice(0, 500);
    if (image && !isExternalUrl(image) && !/^images\/[\w./-]+$/.test(image))
      throw new Error('Invalid image path.');
    p.image = image;
  }
  if (!partial || body.available !== undefined) p.available = !!body.available;
  if (body.featured !== undefined) p.featured = !!body.featured;
  if (body.sort_order !== undefined) p.sort_order = Math.trunc(Number(body.sort_order) || 0);
  return p;
}

export async function createProduct(payload) {
  const p = cleanProduct(payload);
  if (p.sort_order === undefined || !payload.sort_order) p.sort_order = await nextSort('products');
  try {
    const row = await run(supabase.from('products').insert(p).select(PRODUCT_COLS).single(), OFFLINE);
    return mapProduct(row);
  } catch (err) {
    if (err.code === '23503') throw new Error('Please choose a valid category.');
    throw notFound(err);
  }
}

export async function updateProduct(id, payload) {
  const p = cleanProduct(payload, { partial: true });
  if (!Object.keys(p).length) return { success: true, id: Number(id) };

  let oldImage = null;
  if (p.image !== undefined) {
    oldImage = (await run(supabase.from('products').select('image').eq('id', id).maybeSingle(), OFFLINE))?.image ?? null;
  }

  try {
    const row = await run(
      supabase.from('products').update(p).eq('id', id).select(PRODUCT_COLS).single(),
      OFFLINE
    );
    if (p.image !== undefined && oldImage && oldImage !== p.image && isExternalUrl(oldImage))
      deleteOrphan(oldImage).catch(() => {}); // free the replaced file
    return mapProduct(row);
  } catch (err) {
    if (err.code === '23503') throw new Error('Please choose a valid category.');
    throw notFound(err);
  }
}

export async function deleteProduct(id) {
  const existing = await run(
    supabase.from('products').select('id, name, image').eq('id', id).maybeSingle(),
    OFFLINE
  );
  if (!existing) throw new Error('Product not found.');

  // v5: delivery orders snapshot items as JSONB, so products can always be
  // deleted safely. The legacy dine-in order_items table only exists on
  // upgraded v4 databases (fresh v5 installs don't have it) — when it's
  // there, referenced products are archived instead of deleted, protecting
  // dine-in history. Missing table → zero refs.
  let refs = 0;
  try {
    const { count } = await supabase
      .from('order_items').select('*', { count: 'exact', head: true }).eq('product_id', id);
    refs = count ?? 0;
  } catch { refs = 0; } /* missing table on fresh v5 installs → zero refs */

  if (refs > 0) {
    await run(supabase.from('products').update({ available: false }).eq('id', id), OFFLINE);
    return {
      success: true,
      archived: true,
      message: `“${existing.name}” appears in ${refs} past order${refs > 1 ? 's' : ''} — it was archived (hidden from the menu) to protect order history.`,
    };
  }

  await run(supabase.from('products').delete().eq('id', id), OFFLINE);
  if (existing.image && isExternalUrl(existing.image)) deleteOrphan(existing.image).catch(() => {});
  return { success: true, deleted: Number(id) };
}

/** Persist a new explicit product order (array of ids). */
export async function saveProductOrder(ids) {
  // ONE atomic call — see saveCategoryOrder
  await rpc('reorder_rows', { p_table: 'products', p_ids: ids });
  return { success: true };
}

/* ═══════════════ uploads & storage helpers ═══════════════ */

/** Direct upload shorthand (returns the public URL, media-library tracked). */
export async function uploadImage(file, folder = 'general') {
  const row = await uploadMedia(file, folder);
  return row.public_url;
}

/** Delete a stored image + its media-library row, if it is orphaned. */
export async function deleteOrphan(pathOrUrl) {
  const ref = storagePathFromUrl(pathOrUrl);
  if (!ref) return { success: true };
  await supabase.storage.from(ref.bucket).remove([ref.path]);
  await supabase.from('media_library').delete().eq('bucket', ref.bucket).eq('path', ref.path);
  return { success: true };
}

/** Back-compat name used before the Media Library existed. */
export const deleteUpload = deleteOrphan;

/* ════════════════════════════════════════════════════════════
   V4 · operations & marketing — drivers, delivery monitor,
   KV operation settings, business TODO, gallery, reviews,
   banners, social links
   ════════════════════════════════════════════════════════════ */

/* ---------- business TODO checklist (settings.business_todo) ---------- */
export async function getBusinessTodo() {
  const row = await run(
    supabase.from('settings').select('value').eq('key', 'business_todo').maybeSingle(),
    OFFLINE
  );
  try {
    const t = JSON.parse(row?.value ?? '[]');
    return Array.isArray(t)
      ? t.map((x) => ({ text: String(x?.text ?? '').slice(0, 300), done: !!x?.done })).filter((x) => x.text)
      : [];
  } catch {
    return [];
  }
}

export async function saveBusinessTodo(items) {
  const value = JSON.stringify(
    (items || []).map((x) => ({ text: String(x.text ?? '').slice(0, 300), done: !!x.done }))
  ).slice(0, 1900);
  await run(supabase.from('settings').upsert({ key: 'business_todo', value }, { onConflict: 'key' }), OFFLINE);
  return { success: true };
}

/* ---------- operation KV configs (delivery / loyalty / notification) ---------- */
export async function getKVConfig(table) {
  const row = await run(supabase.from(table).select('value').eq('key', 'config').maybeSingle(), OFFLINE);
  return row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {};
}

export async function saveKVConfig(table, config) {
  // RLS grants UPDATE only on the config row (single-operator model),
  // so upsert (which also needs INSERT rights) would fail — plain update.
  const row = await run(
    supabase.from(table).update({ value: config }).eq('key', 'config').select('key'),
    OFFLINE
  );
  if (Array.isArray(row) && row.length === 0)
    throw new Error('Settings row is missing — re-run the database setup (supabase/schema.sql).');
  return { success: true };
}

/* ═══════════════ drivers ═══════════════ */
const mapDriver = (d) => ({
  id: d.id,
  name: d.name,
  phone: d.phone,
  active: d.active !== false,
  notes: d.notes ?? '',
  createdAt: d.created_at,
});

export async function getDrivers(activeOnly = false) {
  let q = supabase.from('drivers').select('*').order('name', { ascending: true });
  if (activeOnly) q = q.eq('active', true);
  const rows = await run(q, OFFLINE);
  return (rows || []).map(mapDriver);
}

function cleanDriver(body, { partial = false } = {}) {
  const d = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (name.length < 2 || name.length > 60) throw new Error('Driver name must be 2–60 characters.');
    d.name = name;
  }
  if (!partial || body.phone !== undefined) {
    const phone = String(body.phone ?? '').trim();
    if (phone.length < 8 || phone.length > 20) throw new Error('Phone must be 8–20 characters.');
    d.phone = phone;
  }
  if (!partial || body.notes !== undefined) d.notes = String(body.notes ?? '').trim().slice(0, 200);
  if (body.active !== undefined) d.active = !!body.active;
  return d;
}

export async function createDriver(payload) {
  const row = await run(
    supabase.from('drivers').insert(cleanDriver(payload)).select().single(),
    OFFLINE
  );
  return mapDriver(row);
}

export async function updateDriver(id, patch) {
  const p = cleanDriver(patch, { partial: true });
  if (!Object.keys(p).length) return { success: true, id: Number(id) };
  const row = await run(supabase.from('drivers').update(p).eq('id', id).select().single(), OFFLINE);
  return mapDriver(row);
}

/** Past orders keep their data: driver_id is set to null automatically. */
export async function deleteDriver(id) {
  await run(supabase.from('drivers').delete().eq('id', id), OFFLINE);
  return { success: true };
}

/* ═══════════════ delivery monitor (read-only) ═══════════════ */
export async function getDeliveries(limit = 120) {
  const rows = await run(
    supabase
      .from('delivery_orders')
      .select(`id, customer_name, customer_phone, address, maps_link, notes, payment_method,
               items, subtotal, delivery_fee, vat_amount, total, status, driver_id, estimated_minutes,
               delivery_note, temp_driver_name, temp_driver_phone, user_id,
               discount_amount, discount_label, coupon_code, loyalty_redeemed, loyalty_earned,
               created_at,
               drivers(name, phone),
               delivery_zones(name_en, name_ar),
               delivery_subzones(name_en, name_ar)`)
      .order('created_at', { ascending: false })
      .limit(limit),
    OFFLINE
  );
  return rows || [];
}

export async function getDeliveryHistory(orderId) {
  const rows = await run(
    supabase
      .from('delivery_status_history')
      .select('id, status, note, changed_by, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true }),
    OFFLINE
  );
  return rows || [];
}

export function subscribeDeliveries(onChange) {
  return supabase
    .channel('aquarium-admin-deliveries')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders' }, onChange)
    .subscribe();
}

/* ═══════════════ gallery ═══════════════ */
export async function getGallery() {
  const rows = await run(
    supabase.from('gallery').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true }),
    OFFLINE
  );
  return rows || [];
}

export async function createGalleryItem({ image, title = '' }) {
  const img = String(image ?? '').trim();
  if (!img) throw new Error('Choose an image first.');
  if (img.length > 500) throw new Error('Image path is too long.');
  const row = await run(
    supabase
      .from('gallery')
      .insert({ image: img, title: String(title).trim().slice(0, 120), sort_order: await nextSort('gallery') })
      .select()
      .single(),
    OFFLINE
  );
  return row;
}

export async function updateGalleryItem(id, patch) {
  const p = {};
  if (patch.title !== undefined) p.title = String(patch.title).trim().slice(0, 120);
  if (patch.image !== undefined) p.image = String(patch.image).trim().slice(0, 500);
  if (patch.visible !== undefined) p.visible = !!patch.visible;
  if (patch.sort_order !== undefined) p.sort_order = Math.trunc(Number(patch.sort_order) || 0);
  if (!Object.keys(p).length) return { success: true };
  const row = await run(supabase.from('gallery').update(p).eq('id', id).select().single(), OFFLINE);
  return row;
}

export async function deleteGalleryItem(id) {
  await run(supabase.from('gallery').delete().eq('id', id), OFFLINE);
  return { success: true };
}

export async function saveGalleryOrder(ids) {
  // ONE atomic call — see saveCategoryOrder
  await rpc('reorder_rows', { p_table: 'gallery', p_ids: ids });
  return { success: true };
}

/* ═══════════════ reviews (moderation) ═══════════════ */
export async function getReviews() {
  const rows = await run(
    supabase.from('reviews').select('*').order('created_at', { ascending: false }).limit(300),
    OFFLINE
  );
  return rows || [];
}

export async function setReviewApproved(id, approved) {
  const row = await run(
    supabase.from('reviews').update({ approved: !!approved }).eq('id', id).select().single(),
    OFFLINE
  );
  return row;
}

export async function deleteReview(id) {
  await run(supabase.from('reviews').delete().eq('id', id), OFFLINE);
  return { success: true };
}

/* ═══════════════ banners ═══════════════ */
function cleanBanner(body, { partial = false } = {}) {
  const b = {};
  if (!partial || body.title !== undefined) {
    const title = String(body.title ?? '').trim();
    if (!title || title.length > 120) throw new Error('Banner title is required (max 120 characters).');
    b.title = title;
  }
  if (!partial || body.subtitle !== undefined) b.subtitle = String(body.subtitle ?? '').trim().slice(0, 200);
  if (!partial || body.image !== undefined) b.image = String(body.image ?? '').trim().slice(0, 500);
  if (!partial || body.cta_text !== undefined) b.cta_text = String(body.cta_text ?? '').trim().slice(0, 40);
  if (!partial || body.cta_link !== undefined) b.cta_link = String(body.cta_link ?? '').trim().slice(0, 300);
  if (body.visible !== undefined) b.visible = !!body.visible;
  if (body.sort_order !== undefined) b.sort_order = Math.trunc(Number(body.sort_order) || 0);
  return b;
}

export async function getBanners() {
  const rows = await run(
    supabase.from('banners').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true }),
    OFFLINE
  );
  return rows || [];
}

export async function createBanner(payload) {
  const b = cleanBanner(payload);
  if (b.sort_order === undefined) b.sort_order = await nextSort('banners');
  const row = await run(supabase.from('banners').insert(b).select().single(), OFFLINE);
  return row;
}

export async function updateBanner(id, patch) {
  const b = cleanBanner(patch, { partial: true });
  if (!Object.keys(b).length) return { success: true };
  const row = await run(supabase.from('banners').update(b).eq('id', id).select().single(), OFFLINE);
  return row;
}

export async function deleteBanner(id) {
  await run(supabase.from('banners').delete().eq('id', id), OFFLINE);
  return { success: true };
}

export async function saveBannerOrder(ids) {
  // ONE atomic call — see saveCategoryOrder
  await rpc('reorder_rows', { p_table: 'banners', p_ids: ids });
  return { success: true };
}

/* ═══════════════ social links ═══════════════ */
export async function getSocialLinks() {
  const rows = await run(
    supabase.from('social_links').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true }),
    OFFLINE
  );
  return rows || [];
}

const cleanPlatform = (p) => {
  const v = String(p ?? '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{0,19}$/.test(v)) throw new Error('Platform may only contain lowercase letters, digits and underscores.');
  return v;
};

export async function createSocialLink({ platform, url = '', visible = true }) {
  try {
    const row = await run(
      supabase
        .from('social_links')
        .insert({
          platform: cleanPlatform(platform),
          url: String(url).trim().slice(0, 500),
          visible: !!visible,
          sort_order: await nextSort('social_links'),
        })
        .select()
        .single(),
      OFFLINE
    );
    return row;
  } catch (err) {
    if (err.code === '23505') throw new Error(`“${platform}” already exists — edit its link instead.`);
    throw err;
  }
}

export async function updateSocialLink(id, patch) {
  const p = {};
  if (patch.url !== undefined) p.url = String(patch.url).trim().slice(0, 500);
  if (patch.visible !== undefined) p.visible = !!patch.visible;
  if (patch.sort_order !== undefined) p.sort_order = Math.trunc(Number(patch.sort_order) || 0);
  if (!Object.keys(p).length) return { success: true };
  const row = await run(supabase.from('social_links').update(p).eq('id', id).select().single(), OFFLINE);
  return row;
}

export async function deleteSocialLink(id) {
  await run(supabase.from('social_links').delete().eq('id', id), OFFLINE);
  return { success: true };
}

export async function saveSocialOrder(ids) {
  // ONE atomic call — see saveCategoryOrder
  await rpc('reorder_rows', { p_table: 'social_links', p_ids: ids });
  return { success: true };
}

/* ════════════════════════════════════════════════════════════
   V5 · delivery zones & sub zones (Admin → Zones)
   Main zones carry the per-zone delivery fee (+ optional
   free-above override); sub zones are unlimited per zone.
   Everything is orderable & toggleable — nothing hardcoded.
   ════════════════════════════════════════════════════════════ */
const mapZone = (z) => ({
  id: z.id,
  name_en: z.name_en,
  name_ar: z.name_ar ?? '',
  fee: +z.fee,
  free_above: +(z.free_above ?? 0),
  active: z.active !== false,
  sort_order: z.sort_order ?? 0,
  subZones: (Array.isArray(z.delivery_subzones) ? z.delivery_subzones : [])
    .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id))
    .map((s) => ({
      id: s.id,
      zone_id: s.zone_id,
      name_en: s.name_en,
      name_ar: s.name_ar ?? '',
      fee: +(s.delivery_fee ?? 0), // v5.1 — independent per-sub-zone fee
      active: s.active !== false,
      sort_order: s.sort_order ?? 0,
    })),
});

export async function getZones() {
  const rows = await run(
    supabase
      .from('delivery_zones')
      .select('id, name_en, name_ar, fee, free_above, active, sort_order, delivery_subzones(id, zone_id, name_en, name_ar, delivery_fee, active, sort_order)')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true }),
    OFFLINE
  );
  return (rows || []).map(mapZone);
}

function cleanZone(body, { partial = false } = {}) {
  const z = {};
  if (!partial || body.name_en !== undefined) {
    const name = String(body.name_en ?? '').trim();
    if (name.length < 2 || name.length > 60) throw new Error('Zone name must be 2–60 characters.');
    z.name_en = name;
  }
  if (!partial || body.name_ar !== undefined) z.name_ar = String(body.name_ar ?? '').trim().slice(0, 60);
  if (!partial || body.fee !== undefined) {
    const fee = Number(body.fee);
    if (!Number.isFinite(fee) || fee < 0 || fee > 10000) throw new Error('Fee must be a number between 0 and 10000.');
    z.fee = Math.round(fee * 100) / 100;
  }
  if (!partial || body.free_above !== undefined) {
    const fa = Number(body.free_above);
    if (!Number.isFinite(fa) || fa < 0 || fa > 100000) throw new Error('Free-above must be a positive number.');
    z.free_above = Math.round(fa * 100) / 100;
  }
  if (body.active !== undefined) z.active = !!body.active;
  return z;
}

export async function createZone(payload) {
  const row = await run(
    supabase
      .from('delivery_zones')
      .insert({ ...cleanZone(payload), sort_order: await nextSort('delivery_zones') })
      .select()
      .single(),
    OFFLINE
  );
  return { ...row, subZones: [] };
}

export async function updateZone(id, patch) {
  const z = cleanZone(patch, { partial: true });
  if (!Object.keys(z).length) return { success: true };
  const row = await run(
    supabase.from('delivery_zones').update(z).eq('id', id).select().single(),
    OFFLINE
  );
  return row;
}

/** Deleting a zone cascades its sub zones; past orders keep their data (set null). */
export async function deleteZone(id) {
  await run(supabase.from('delivery_zones').delete().eq('id', id), OFFLINE);
  return { success: true };
}

export async function saveZoneOrder(ids) {
  // ONE atomic call — see saveCategoryOrder
  await rpc('reorder_rows', { p_table: 'delivery_zones', p_ids: ids });
  return { success: true };
}

/* ---------- sub zones (each with its own delivery fee) ---------- */
const cleanSubFee = (v) => {
  const fee = Number(v);
  if (!Number.isFinite(fee) || fee < 0 || fee > 10000) throw new Error('Fee must be a number between 0 and 10000.');
  return Math.round(fee * 100) / 100;
};

export async function createSubZone({ zone_id, name_en, name_ar = '', fee = 0 }) {
  const name = String(name_en ?? '').trim();
  if (name.length < 2 || name.length > 80) throw new Error('Sub zone name must be 2–80 characters.');
  const row = await run(
    supabase
      .from('delivery_subzones')
      .insert({
        zone_id,
        name_en: name,
        name_ar: String(name_ar ?? '').trim().slice(0, 80),
        delivery_fee: cleanSubFee(fee),
        sort_order: await nextSort('delivery_subzones'),
      })
      .select()
      .single(),
    OFFLINE
  );
  return row;
}

export async function updateSubZone(id, patch) {
  const s = {};
  if (patch.name_en !== undefined) {
    const name = String(patch.name_en).trim();
    if (name.length < 2 || name.length > 80) throw new Error('Sub zone name must be 2–80 characters.');
    s.name_en = name;
  }
  if (patch.name_ar !== undefined) s.name_ar = String(patch.name_ar).trim().slice(0, 80);
  if (patch.fee !== undefined) s.delivery_fee = cleanSubFee(patch.fee);
  if (patch.active !== undefined) s.active = !!patch.active;
  if (patch.sort_order !== undefined) s.sort_order = Math.trunc(Number(patch.sort_order) || 0);
  if (!Object.keys(s).length) return { success: true };
  const row = await run(
    supabase.from('delivery_subzones').update(s).eq('id', id).select().single(),
    OFFLINE
  );
  return row;
}

export async function deleteSubZone(id) {
  await run(supabase.from('delivery_subzones').delete().eq('id', id), OFFLINE);
  return { success: true };
}

export async function saveSubZoneOrder(pairs) {
  // ONE atomic call — see saveCategoryOrder
  await rpc('reorder_rows', { p_table: 'delivery_subzones', p_ids: pairs });
  return { success: true };
}

/* ════════════════════════════════════════════════════════════
   V5 · discounts & coupons (Admin → Discounts)
   signup / coupon / product / category / global — percent or
   fixed, with min-order, caps, usage limits and expiry.
   Validity is re-checked inside the database RPCs.
   ════════════════════════════════════════════════════════════ */
export async function getDiscounts() {
  const rows = await run(
    supabase.from('discounts').select('*').order('id', { ascending: true }),
    OFFLINE
  );
  return rows || [];
}

function cleanDiscount(body, { partial = false } = {}) {
  const d = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (name.length < 2 || name.length > 80) throw new Error('Discount name must be 2–80 characters.');
    d.name = name;
  }
  if (!partial || body.type !== undefined) {
    const type = String(body.type ?? '').trim();
    if (!['signup', 'coupon', 'product', 'category', 'global'].includes(type))
      throw new Error('Unknown discount type.');
    d.type = type;
  }
  if (!partial || body.code !== undefined) {
    let code = String(body.code ?? '').trim();
    if (code === '') code = null;
    if (code != null && !/^[A-Za-z0-9_-]{3,24}$/.test(code))
      throw new Error('Coupon code: 3–24 letters, digits, - or _.');
    d.code = code;
  }
  if (!partial || body.value_type !== undefined) {
    if (!['percent', 'fixed'].includes(body.value_type)) throw new Error('Pick percent or fixed.');
    d.value_type = body.value_type;
  }
  if (!partial || body.value !== undefined) {
    const v = Number(body.value);
    if (!Number.isFinite(v) || v <= 0 || v > 100000) throw new Error('Value must be positive.');
    d.value = Math.round(v * 100) / 100;
  }
  if (!partial || body.min_order !== undefined) {
    const v = Number(body.min_order ?? 0);
    d.min_order = Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
  }
  if (!partial || body.max_discount !== undefined) {
    const v = body.max_discount === '' || body.max_discount == null ? null : Number(body.max_discount);
    if (v != null && (!Number.isFinite(v) || v <= 0)) throw new Error('Max discount must be positive.');
    d.max_discount = v;
  }
  if (!partial || body.max_uses !== undefined) {
    const v = body.max_uses === '' || body.max_uses == null ? null : Math.trunc(Number(body.max_uses));
    if (v != null && (!Number.isInteger(v) || v <= 0)) throw new Error('Max uses must be a positive integer.');
    d.max_uses = v;
  }
  if (body.active !== undefined) d.active = !!body.active;
  if (body.starts_at !== undefined) d.starts_at = body.starts_at || new Date().toISOString();
  if (body.expires_at !== undefined) d.expires_at = body.expires_at || null;
  if (body.target_id !== undefined) d.target_id = body.target_id ? Number(body.target_id) : null;
  return d;
}

/** cross-field rules the UI mirrors (the DB CHECKs are the final guard) */
function discountRules(p) {
  if (p.type === 'coupon' && !p.code) throw new Error('A coupon needs a code.');
  if ((p.type === 'product' || p.type === 'category') && !p.target_id)
    throw new Error('Pick what this discount applies to.');
  if (p.value_type === 'percent' && p.value > 100) throw new Error('Percent cannot exceed 100.');
  if (p.expires_at && p.starts_at && new Date(p.expires_at) <= new Date(p.starts_at))
    throw new Error('Expiry must be after the start date.');
}

export async function createDiscount(body) {
  const d = cleanDiscount(body);
  discountRules(d);
  try {
    const row = await run(supabase.from('discounts').insert(d).select().single(), OFFLINE);
    return row;
  } catch (err) {
    if (err.code === '23505') throw new Error('That coupon code already exists.');
    throw err;
  }
}

export async function updateDiscount(id, body) {
  const d = cleanDiscount(body, { partial: false });
  discountRules(d);
  try {
    const row = await run(supabase.from('discounts').update(d).eq('id', id).select().single(), OFFLINE);
    return row;
  } catch (err) {
    if (err.code === '23505') throw new Error('That coupon code already exists.');
    throw err;
  }
}

export async function setDiscountActive(id, active) {
  const row = await run(
    supabase.from('discounts').update({ active: !!active }).eq('id', id).select().single(),
    OFFLINE
  );
  return row;
}

export async function deleteDiscount(id) {
  await run(supabase.from('discounts').delete().eq('id', id), OFFLINE);
  return { success: true };
}
