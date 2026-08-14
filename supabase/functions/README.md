# Aquarium Web Push

The project now contains a Supabase Edge Function at `send-push` for waiter/customer Web Push notifications.

## Required Supabase secrets

Set these in **Supabase → Edge Functions → Secrets**:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUSH_VAPID_PUBLIC_KEY`
- `PUSH_VAPID_PRIVATE_KEY`
- `PUSH_VAPID_SUBJECT` (for example `mailto:owner@example.com`)

Put the same **public** VAPID key in `shared/config.js` as `PUSH_VAPID_PUBLIC_KEY`.
Never put the private key in frontend files.

## Deploy

Deploy the function with the Supabase CLI from the project root:

```bash
supabase functions deploy send-push --no-verify-jwt
```

## Database Webhook

Create a Supabase Database Webhook:

- Table: `public.push_events`
- Event: `INSERT`
- Target: Edge Function
- Function: `send-push`

This keeps the whole flow inside Supabase: a delivery order/status change creates a queue row, the webhook invokes the Edge Function, and the function sends Web Push to the waiter/customer subscriptions.
