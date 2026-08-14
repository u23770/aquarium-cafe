# Web Push setup

1. Run `supabase/migrations/20260814_web_push_notifications.sql` in Supabase SQL Editor.
2. Generate VAPID keys on a computer:
   `npx web-push generate-vapid-keys`
3. Put the PUBLIC key in `customer/shared/push.js` and `waiter/shared/push.js` replacing `REPLACE_WITH_VAPID_PUBLIC_KEY`.
4. Deploy `supabase/functions/send-push`.
5. In Supabase Edge Function Secrets add:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `WEBHOOK_SECRET`
6. Create a Database Webhook for `public.delivery_orders`, events INSERT + UPDATE, POSTing to:
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push`
   with header `x-webhook-secret` equal to the secret above.
7. Open the Waiter page over HTTPS and press the bell/notifications button once to grant permission.
8. Open a Customer order tracker over HTTPS and press "Enable order notifications" once. Future status changes for that order will notify that device.
