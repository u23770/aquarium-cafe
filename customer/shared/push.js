// Aquarium Cafe — Web Push registration helper
// Set the same VAPID public key in this file for Customer and Waiter.
// Never put the VAPID private key in the frontend.
const VAPID_PUBLIC_KEY = 'BD0a4vUKCbDGvSXl6vVA-CIj8Cd2xwfd-eLv0mjAFJZewcXmFkj5v5OVz7aSEYc2VYezdMUeXwjCHlFYBq3YcGs';
const SUPABASE_URL = window.__SUPABASE_URL__ || '';
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__ || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function getConfig() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('./config.js');
  return { url: SUPABASE_URL, anon: SUPABASE_ANON_KEY };
}

export async function registerPush(role, orderId = null) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('Push notifications are not supported by this browser.');
  }
  if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.includes('REPLACE_WITH')) {
    throw new Error('VAPID public key is not configured yet.');
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();

  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
  }

  const cfg = await getConfig();
  const endpoint = sub.endpoint;
  const keys = sub.toJSON().keys || {};
  const payload = {
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    role,
    order_id: orderId
  };

  const res = await fetch(`${cfg.url}/rest/v1/rpc/register_push_subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: cfg.anon,
      Authorization: `Bearer ${cfg.anon}`
    },
    body: JSON.stringify({ p: payload })
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || 'Could not register notifications.');
  }
  return sub;
}

export async function autoRegisterGrantedPush(role, orderId = null) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try { return await registerPush(role, orderId); } catch { return null; }
  }
  return null;
}
