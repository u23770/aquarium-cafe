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
  const m = String(url).match(/[?&]id=eq\.([0-9a-f-]{36})(?:&|$)/i);
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
      const m = url.match(/[?&]order_id=eq\.([0-9a-f-]{36})(?:&|$)/i);
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
