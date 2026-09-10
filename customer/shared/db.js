// ============================================================
//  Aquarium Cafe & Resturant — shared data helpers
//  Thin wrappers every site uses: consistent errors, count
//  queries, RPC calls, and the not-configured guard.
// ============================================================
import { supabase, isConfigured } from './supabase.js';

export { supabase, isConfigured };

const NOT_CONFIGURED =
  'Supabase is not configured yet — open shared/config.js and paste your Project URL and anon key, then reload this page.';

const GUEST_TRACK_KEY = 'aquarium_guest_tracking_v1';

function guestCredentials() {
  try {
    const v = JSON.parse(localStorage.getItem(GUEST_TRACK_KEY) || 'null');
    if (v && typeof v.id === 'string' && typeof v.token === 'string' && v.token.length >= 24) return v;
  } catch {}
  return null;
}

function guestIdFromUrl(url) {
  const m = String(url).match(/[?&]id=eq\\.([0-9a-f-]{36})(?:&|$)/i);
  return m ? m[1] : null;
}

/* Guest order rows are no longer readable through anon PostgREST. Route only
 * the matching active guest order to the token-authorized RPC. */
if (typeof window !== 'undefined' && typeof window.fetch === 'function' && !window.__aquariumGuestFetchPatched) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input?.url;
    const creds = guestCredentials();
    const url = String(rawUrl || '');

    if (creds && url.includes('/rest/v1/delivery_orders') && !url.includes('/rpc/')) {
      const orderId = guestIdFromUrl(url);
      if (orderId && orderId === creds.id && !/head=true/i.test(url)) {
        const rpcUrl = `${url.split('/rest/v1/')[0]}/rest/v1/rpc/get_guest_order`;
        const headers = new Headers(init?.headers || (typeof input !== 'string' ? input.headers : undefined));
        headers.set('content-type', 'application/json');
        const response = await nativeFetch(rpcUrl, { ...init, method: 'POST', headers, body: JSON.stringify({ p_order_id: creds.id, p_token: creds.token }) });
        if (response.ok) {
          const data = await response.json();
          return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return response;
      }
    }

    if (creds && url.includes('/rest/v1/delivery_status_history') && !url.includes('/rpc/')) {
      const m = url.match(/[?&]order_id=eq\\.([0-9a-f-]{36})(?:&|$)/i);
      if (m && m[1] === creds.id) {
        const rpcUrl = `${url.split('/rest/v1/')[0]}/rest/v1/rpc/get_guest_order_history`;
        const headers = new Headers(init?.headers || (typeof input !== 'string' ? input.headers : undefined));
        headers.set('content-type', 'application/json');
        const response = await nativeFetch(rpcUrl, { ...init, method: 'POST', headers, body: JSON.stringify({ p_order_id: creds.id, p_token: creds.token }) });
        if (response.ok) {
          const data = await response.json();
          return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return response;
      }
    }

    return nativeFetch(input, init);
  };
  window.__aquariumGuestFetchPatched = true;
}

export async function run(query, offlineMsg = 'Cannot reach Supabase right now — check your connection.') {
  if (!isConfigured) throw new Error(NOT_CONFIGURED);
  let res;
  try { res = await query; }
  catch { throw new Error(offlineMsg); }
  if (res?.error) {
    const err = new Error(res.error.message || 'Unexpected database error.');
    err.code = res.error.code;
    throw err;
  }
  return res?.data ?? null;
}

export async function runCount(query) {
  if (!isConfigured) throw new Error(NOT_CONFIGURED);
  let res;
  try { res = await query; }
  catch { throw new Error('Cannot reach Supabase right now — check your connection.'); }
  if (res?.error) throw new Error(res.error.message || 'Unexpected database error.');
  return res?.count ?? 0;
}

export async function rpc(name, args = {}) {
  const creds = typeof localStorage !== 'undefined' ? guestCredentials() : null;
  if (creds && (name === 'edit_delivery_order' || name === 'cancel_delivery_order') && args?.p_order_id === creds.id) {
    if (name === 'edit_delivery_order') {
      return run(supabase.rpc('edit_guest_order', { p_order_id: creds.id, p_token: creds.token, p_items: args.p_items }));
    }
    return run(supabase.rpc('cancel_guest_order', { p_order_id: creds.id, p_token: creds.token }));
  }
  const result = await run(supabase.rpc(name, args));
  if (name === 'place_delivery_order' && result?.id && result?.trackingToken) {
    saveGuestTracking(result.id, result.trackingToken);
    window.dispatchEvent(new CustomEvent('aquarium:order-tracking-ready', { detail: { id: result.id, token: result.trackingToken } }));
  }
  return result;
}

export function saveGuestTracking(id, token) {
  if (typeof localStorage === 'undefined' || !id || !token) return;
  localStorage.setItem(GUEST_TRACK_KEY, JSON.stringify({ id, token, ts: Date.now() }));
}

export function clearGuestTracking(id = null) {
  if (typeof localStorage === 'undefined') return;
  const creds = guestCredentials();
  if (!id || creds?.id === id) localStorage.removeItem(GUEST_TRACK_KEY);
}

/* ═══════════════ visible guest tracking ═══════════════
   The tracking credential is a random capability token. It is never placed
   in a normal query parameter; shared links use the URL hash instead. */
function trackingText(ar, en) { return ar ? en.ar : en.en; }

function installGuestTrackingUI() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.getElementById('aquariumGuestTracking')) return;

  const css = document.createElement('style');
  css.id = 'aquariumGuestTrackingCss';
  css.textContent = `
    #aquariumGuestTracking{position:fixed;right:18px;bottom:18px;z-index:9999;font:600 14px/1.4 system-ui,sans-serif}
    #aquariumGuestTracking .agt-btn{border:0;border-radius:999px;padding:12px 16px;cursor:pointer;background:#111;color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.2)}
    #aquariumGuestTracking .agt-panel{position:absolute;right:0;bottom:54px;width:min(360px,calc(100vw - 32px));background:#fff;color:#111;border-radius:18px;padding:18px;box-shadow:0 14px 50px rgba(0,0,0,.22);display:none}
    #aquariumGuestTracking.open .agt-panel{display:block}
    #aquariumGuestTracking h3{margin:0 0 12px;font-size:18px}
    #aquariumGuestTracking .agt-status{padding:12px;border-radius:12px;background:#f3f5f7;margin:10px 0}
    #aquariumGuestTracking .agt-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
    #aquariumGuestTracking button.agt-action{border:1px solid #ddd;background:#fff;border-radius:10px;padding:9px 11px;cursor:pointer}
    #aquariumGuestTracking .agt-error{color:#b42318;font-size:13px}
  `;
  document.head.appendChild(css);

  const root = document.createElement('div');
  root.id = 'aquariumGuestTracking';
  root.innerHTML = `
    <div class="agt-panel" role="dialog" aria-label="Order tracking">
      <h3 class="agt-title"></h3>
      <div class="agt-status"></div>
      <div class="agt-meta"></div>
      <div class="agt-actions">
        <button class="agt-action agt-copy" type="button"></button>
        <button class="agt-action agt-refresh" type="button"></button>
        <button class="agt-action agt-close" type="button"></button>
      </div>
      <div class="agt-error" hidden></div>
    </div>
    <button class="agt-btn" type="button"></button>
  `;
  document.body.appendChild(root);

  const ar = () => document.documentElement.lang === 'ar' || document.documentElement.dir === 'rtl';
  const setLabels = () => {
    const a = ar();
    root.querySelector('.agt-btn').textContent = a ? 'تتبع الطلب' : 'Track Order';
    root.querySelector('.agt-title').textContent = a ? 'تتبع طلبك' : 'Track your order';
    root.querySelector('.agt-copy').textContent = a ? 'نسخ رابط التتبع' : 'Copy tracking link';
    root.querySelector('.agt-refresh').textContent = a ? 'تحديث' : 'Refresh';
    root.querySelector('.agt-close').textContent = a ? 'إغلاق' : 'Close';
  };
  setLabels();

  const statusOrder = ['Received','Accepted','Preparing','Ready','Out for Delivery','Delivered'];
  const statusMap = { Received:['تم استلام الطلب','Order received'], Accepted:['تم قبول الطلب','Order accepted'], Preparing:['جاري التحضير','Preparing'], Ready:['الطلب جاهز','Ready'], 'Out for Delivery':['خرج للتوصيل','Out for delivery'], Delivered:['تم التوصيل','Delivered'], Cancelled:['تم إلغاء الطلب','Cancelled'] };

  async function loadTracking(id = null, token = null) {
    const creds = id && token ? { id, token } : guestCredentials();
    if (!creds) return false;
    root.querySelector('.agt-error').hidden = true;
    root.querySelector('.agt-status').textContent = ar() ? 'جاري التحميل…' : 'Loading…';
    try {
      const order = await run(supabase.rpc('get_guest_order', { p_order_id: creds.id, p_token: creds.token }));
      if (!order) throw new Error('Order not found.');
      saveGuestTracking(creds.id, creds.token);
      const label = statusMap[order.status] || [order.status || 'Unknown', order.status || 'Unknown'];
      root.querySelector('.agt-status').innerHTML = `<strong>${ar() ? label[0] : label[1]}</strong><br><small>${order.status || ''}</small>`;
      root.querySelector('.agt-meta').textContent = `${ar() ? 'رقم الطلب' : 'Order'}: ${creds.id.slice(0,8).toUpperCase()} · ${ar() ? 'الإجمالي' : 'Total'}: ${Number(order.total || 0).toFixed(2)}`;
      return true;
    } catch (e) {
      root.querySelector('.agt-error').textContent = e?.message || (ar() ? 'تعذر تحميل الطلب.' : 'Could not load the order.');
      root.querySelector('.agt-error').hidden = false;
      return false;
    }
  }

  const open = async () => { root.classList.add('open'); setLabels(); await loadTracking(); };
  root.querySelector('.agt-btn').addEventListener('click', open);
  root.querySelector('.agt-close').addEventListener('click', () => root.classList.remove('open'));
  root.querySelector('.agt-refresh').addEventListener('click', () => loadTracking());
  root.querySelector('.agt-copy').addEventListener('click', async () => {
    const c = guestCredentials();
    if (!c) return;
    const url = `${location.origin}${location.pathname}${location.search}#track=${encodeURIComponent(c.id + '.' + c.token)}`;
    try { await navigator.clipboard.writeText(url); } catch {}
  });

  function consumeTrackingHash() {
    const m = String(location.hash || '').match(/^#track=([^&]+)$/);
    if (!m) return;
    const raw = decodeURIComponent(m[1]);
    const dot = raw.indexOf('.');
    if (dot <= 0) return;
    const id = raw.slice(0, dot);
    const token = raw.slice(dot + 1);
    if (!/^[0-9a-f-]{36}$/i.test(id) || token.length < 24) return;
    saveGuestTracking(id, token);
    root.classList.add('open');
    loadTracking(id, token);
  }

  window.addEventListener('hashchange', consumeTrackingHash);
  window.addEventListener('aquarium:order-tracking-ready', (e) => {
    const d = e.detail || {};
    if (d.id && d.token) {
      root.classList.add('open');
      loadTracking(d.id, d.token);
    }
  });

  consumeTrackingHash();
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installGuestTrackingUI, { once: true });
  else installGuestTrackingUI();
}
