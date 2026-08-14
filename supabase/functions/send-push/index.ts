import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;
const webhookSecret = Deno.env.get("WEBHOOK_SECRET") || "";

webpush.setVapidDetails(
  "mailto:admin@aquarium-cafe.local",
  vapidPublic,
  vapidPrivate
);

const db = createClient(supabaseUrl, serviceKey);

const statusText: Record<string, {en:string; ar:string}> = {
  Received: {en:"We received your order.", ar:"تم استلام طلبك."},
  Accepted: {en:"Your order was accepted.", ar:"تم قبول طلبك."},
  Preparing: {en:"Your order is being prepared.", ar:"طلبك دخل مرحلة التجهيز."},
  Ready: {en:"Your order is ready.", ar:"طلبك جاهز."},
  "Out for Delivery": {en:"Your order is on the way.", ar:"طلبك خرج للتوصيل."},
  Delivered: {en:"Your order was delivered.", ar:"تم توصيل طلبك."},
  Cancelled: {en:"Your order was cancelled.", ar:"تم إلغاء طلبك."}
};

function json(data: unknown, status=200) {
  return new Response(JSON.stringify(data), {status, headers: {"content-type":"application/json"}});
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({error:"POST only"},405);
  if (webhookSecret && req.headers.get("x-webhook-secret") !== webhookSecret) {
    return json({error:"Unauthorized"},401);
  }

  const body = await req.json().catch(() => null);
  if (!body?.record) return json({ok:true, skipped:"no record"});

  const record = body.record;
  const old = body.old_record || {};
  const type = body.type;
  const isInsert = type === "INSERT";
  const isStatusUpdate = type === "UPDATE" && record.status && record.status !== old.status;

  if (!isInsert && !isStatusUpdate) return json({ok:true, skipped:"irrelevant"});

  let query = db.from("notification_subscriptions")
    .select("id,endpoint,p256dh,auth,role,order_id");

  if (isInsert) query = query.eq("role","waiter");
  else query = query.eq("role","customer").eq("order_id",record.id);

  const {data: subs, error} = await query;
  if (error) return json({error:error.message},500);

  const notifications = [];
  for (const s of subs || []) {
    const isWaiter = s.role === "waiter";
    const idLabel = String(record.id).slice(-8).toUpperCase();
    const st = statusText[record.status] || statusText.Received;
    const payload = isWaiter
      ? {
          title: "🔔 New delivery order",
          body: `Order #${idLabel} · ${Number(record.total || 0).toFixed(2)} EGP`,
          url: "../waiter/",
          tag: `waiter-order-${record.id}`
        }
      : {
          title: "Aquarium Cafe",
          body: st.en,
          url: `?track=${record.id}`,
          tag: `customer-order-${record.id}`
        };

    try {
      await webpush.sendNotification(
        {endpoint:s.endpoint, keys:{p256dh:s.p256dh, auth:s.auth}},
        JSON.stringify(payload)
      );
      notifications.push({id:s.id,ok:true});
    } catch (err) {
      const status = err?.statusCode;
      if (status === 404 || status === 410) {
        await db.from("notification_subscriptions").delete().eq("id",s.id);
      }
      notifications.push({id:s.id,ok:false,status});
    }
  }

  return json({ok:true, sent:notifications.length, notifications});
});
