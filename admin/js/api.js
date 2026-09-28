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
  if (!partial || body.max_uses_per_user !== undefined) {
    const v = body.max_uses_per_user === '' || body.max_uses_per_user == null ? null : Math.trunc(Number(body.max_uses_per_user));
    if (v != null && (!Number.isInteger(v) || v <= 0)) throw new Error('Per-user limit must be a positive integer.');
    d.max_uses_per_user = v;
  }
  if (body.free_delivery !== undefined) d.free_delivery = !!body.free_delivery;
  if (body.priority !== undefined) {
    const v = Math.trunc(Number(body.priority));
    if (!Number.isInteger(v) || v < 0 || v > 100000) throw new Error('Priority must be between 0 and 100000.');
    d.priority = v;
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