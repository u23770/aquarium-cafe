import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('PUSH_VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('PUSH_VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('PUSH_VAPID_SUBJECT') || 'mailto:owner@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const headers = {
  'Content-Type': 'application/json',
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
};

const db = async (path: string, init: RequestInit = {}) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(await r.text());
  return r.status === 204 ? null : r.json();
};

Deno.serve(async (req) => {
  try {
    const event = await req.json();
    const record = event.record || event;
    const payload = record.payload || {};
    const type = record.event_type || event.type;
    const orderId = record.order_id || payload.id;
    if (!orderId) return new Response(JSON.stringify({ ok: true, skipped: true }), { headers });

    const subscriptions = await db(`push_subscriptions?active=eq.true&select=id,endpoint,p256dh,auth,app_role,user_id,order_id`);
    const targets = (subscriptions || []).filter((s: any) =>
      type === 'new_order'
        ? s.app_role === 'waiter'
        : (s.app_role === 'waiter' || s.user_id === record.user_id || s.order_id === orderId)
    );

    const title = type === 'new_order' ? 'Aquarium Café · New order' : 'Aquarium Café · Order update';
    const body = type === 'new_order'
      ? `New delivery order #${String(orderId).slice(-6).toUpperCase()} — ${payload.customerName || 'Customer'} · ${payload.total ?? ''} EGP`
      : `Order #${String(orderId).slice(-6).toUpperCase()} is now ${record.status || payload.status}`;
    const url = type === 'new_order' ? '../waiter/' : `../customer/?track=${encodeURIComponent(orderId)}`;

    let sent = 0;
    const dead: number[] = [];
    for (const sub of targets) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title, body, tag: `order-${orderId}`, url }));
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(sub.id);
      }
    }

    if (dead.length) {
      await db(`push_subscriptions?id=in.(${dead.join(',')})`, { method: 'PATCH', body: JSON.stringify({ active: false }), headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' } });
    }

    // Mark this queue event as handled when the optional column exists.
    return new Response(JSON.stringify({ ok: true, sent, removed: dead.length }), { headers });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500, headers });
  }
});
