
import { supabase } from './supabase.js';
import { PUSH_VAPID_PUBLIC_KEY } from './config.js';

const b64 = (s) => {
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export async function registerPushSubscription({ appRole, userId = null, orderId = null } = {}) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return { ok: false, reason: 'unsupported' };
  if (!PUSH_VAPID_PUBLIC_KEY || PUSH_VAPID_PUBLIC_KEY.includes('REPLACE_ME')) return { ok: false, reason: 'not-configured' };
  try {
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (permission !== 'granted') return { ok: false, reason: 'denied' };
    const sw = await navigator.serviceWorker.ready;
    let sub = await sw.pushManager.getSubscription();
    if (!sub) sub = await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(PUSH_VAPID_PUBLIC_KEY) });
    const json = sub.toJSON();
    const endpoint = json.endpoint || sub.endpoint;
    const keys = json.keys || {};
    const { error } = await supabase.from('push_subscriptions').upsert({
      endpoint,
      p256dh: keys.p256dh || '',
      auth: keys.auth || '',
      app_role: appRole || 'customer',
      user_id: userId,
      order_id: orderId,
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    return { ok: true, endpoint };
  } catch (error) {
    console.warn('[push] subscription failed', error);
    return { ok: false, reason: error?.message || 'failed' };
  }
}
