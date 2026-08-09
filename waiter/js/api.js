// ============================================================
//  Aquarium Cafe & Resturant — Waiter data layer (Supabase, v5)
//  Delivery-only dashboard: dispatch boards read delivery
//  orders (+ zones, drivers, temporary drivers, discounts,
//  loyalty usage); every status move runs inside the
//  advance_delivery() Postgres RPC — the strict step-by-step
//  flow is enforced server-side, so two devices can never
//  fight or skip a step. Realtime pushes make it instant.
// ============================================================
import { supabase, run, rpc } from '../../shared/db.js';

const OFFLINE = 'Connection lost — retrying…';

/* ═══════════════ DELIVERY ORDERS ═══════════════ */

/* ---------- row mapper (delivery order + driver/temp driver/zone) ---------- */
const mapDelivery = (o) => ({
  id: o.id,                       // uuid — also the tracking link
  short: '#' + String(o.id).slice(0, 4).toUpperCase(),
  customerName: o.customer_name,
  customerPhone: o.customer_phone,
  address: o.address,
  addressDetail: o.address_detail ?? '',
  mapsLink: o.maps_link || '',
  notes: o.notes || '',
  paymentMethod: o.payment_method,
  items: Array.isArray(o.items) ? o.items : [],
  subtotal: o.subtotal,
  deliveryFee: o.delivery_fee,
  total: o.total,
  status: o.status,
  driverId: o.driver_id,
  driverName: o.drivers?.name ?? '',
  driverPhone: o.drivers?.phone ?? '',
  tempDriverName: o.temp_driver_name ?? '',
  tempDriverPhone: o.temp_driver_phone ?? '',
  estimatedMinutes: o.estimated_minutes,
  deliveryNote: o.delivery_note || '',
  zoneId: o.zone_id,
  zone: o.delivery_zones ? { name_en: o.delivery_zones.name_en, name_ar: o.delivery_zones.name_ar ?? '' } : null,
  subZone: o.delivery_subzones ? { name_en: o.delivery_subzones.name_en, name_ar: o.delivery_subzones.name_ar ?? '' } : null,
  member: !!o.user_id,
  discountAmount: +(o.discount_amount ?? 0),
  discountLabel: o.discount_label ?? '',
  couponCode: o.coupon_code ?? '',
  loyaltyRedeemed: +(o.loyalty_redeemed ?? 0),
  loyaltyEarned: +(o.loyalty_earned ?? 0),
  createdAt: o.created_at,
  updatedAt: o.updated_at,
});

/* ---------- latest delivery orders (newest first; boards re-sort) ---------- */
export async function getDeliveryOrders() {
  const rows = await run(
    supabase
      .from('delivery_orders')
      .select(`id, customer_name, customer_phone, address, address_detail, maps_link, notes,
               payment_method, items, subtotal, delivery_fee, total, status, driver_id,
               estimated_minutes, delivery_note, zone_id,
               temp_driver_name, temp_driver_phone, user_id,
               discount_amount, discount_label, coupon_code, loyalty_redeemed, loyalty_earned,
               created_at, updated_at,
               drivers(name, phone),
               delivery_zones(name_en, name_ar),
               delivery_subzones(name_en, name_ar)`)
      .order('created_at', { ascending: false })
      .limit(250),
    OFFLINE
  );
  return { orders: (rows || []).map(mapDelivery) };
}

/* ---------- advance one step / cancel / dispatch (server-enforced) ----------
   Dispatch carries either a permanent driver OR a temporary one —
   the temp pair lives on this order only (never saved as a driver). */
export async function advanceDelivery(id, next, {
  driverId = null, eta = null, note = '', tempName = '', tempPhone = '',
} = {}) {
  const result = await rpc('advance_delivery', {
    p_id: id,
    p_next: next,
    p_driver_id: driverId,
    p_eta: eta,
    p_note: note,
    p_temp_name: tempName,
    p_temp_phone: tempPhone,
  });
  return { success: true, result };
}

/* ---------- active drivers for the dispatch picker ---------- */
export async function getDrivers(activeOnly = true) {
  let q = supabase
    .from('drivers')
    .select('id, name, phone, active')
    .order('name', { ascending: true });
  if (activeOnly) q = q.eq('active', true);
  const rows = await run(q, OFFLINE);
  return { drivers: rows || [] };
}

/* ---------- realtime: new delivery orders + status changes ---------- */
export function subscribeDeliveryOrders(onChange, onStatus) {
  return supabase
    .channel('aquarium-delivery-board')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders' }, onChange)
    .subscribe((status) => onStatus?.(status));
}
