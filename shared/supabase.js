// ============================================================
// Aquarium Cafe & Restaurant — Supabase client
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const isConfigured =
  /^https:\/\/[\w-]+\.supabase\.co\/?$/i.test(SUPABASE_URL.trim()) &&
  SUPABASE_ANON_KEY.trim().length > 40;

if (!isConfigured) {
  console.error('Aquarium Cafe — Supabase is not configured. Open shared/config.js and add the project URL + client key.');
}

// Customer, Admin and Waiter use separate Auth storage keys because they are
// separate applications on the same origin. Unlike the old v5.1.3 model,
// Admin/Waiter now intentionally authenticate and receive real Supabase
// sessions. Their authorization is enforced by staff_profiles/RLS/RPC guards.
const APPkey = /\/(admin|waiter)\//.test(location.pathname)
  ? (location.pathname.match(/\/(admin|waiter)\//) || [])[1]
  : 'customer';

export const supabase = createClient(
  isConfigured ? SUPABASE_URL.trim().replace(/\/$/, '') : 'https://unconfigured.supabase.co',
  isConfigured ? SUPABASE_ANON_KEY.trim() : 'unconfigured-anon-key-placeholder-000000000000',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: `aquarium-auth-${APPkey}`,
    },
    realtime: { params: { eventsPerSecond: 10 } },
  }
);
