// ============================================================
//  Aquarium Cafe & Resturant — Supabase client (single shared instance)
//  Uses the latest @supabase/supabase-js v2 SDK, loaded as a
//  native ES module from the jsDelivr CDN — no build step.
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const isConfigured =
  /^https:\/\/[\w-]+\.supabase\.co\/?$/i.test(SUPABASE_URL.trim()) &&
  SUPABASE_ANON_KEY.trim().length > 40;

if (!isConfigured) {
  console.error(
    '🌊 Aquarium Cafe & Resturant — Supabase is not configured yet.\n' +
      '   Open shared/config.js and paste your Project URL + anon key\n' +
      '   (Supabase dashboard → Project Settings → API), then reload.'
  );
}

// A placeholder keeps the module importable when unconfigured —
// every query path guards on isConfigured and throws a friendly error.
// v5: customer accounts (Supabase Auth) need the session persisted in
// localStorage with token auto-refresh — so the guest who signed in
// yesterday is still signed in today. One shared client serves all apps.
//
// v5.1.3 · SESSION ISOLATION:
// the three apps run on the same origin and share one Supabase project,
// so by default they would share ONE auth bucket — a customer login in
// the Customer app could otherwise collide with the Admin/Waiter apps'
// own sessions. Each app therefore gets its OWN storage key.
// v5.2 · Admin/Waiter now DO authenticate — via shared/staff-auth.js's
// login-free access-code gate (no email/password, no signup). Their
// requests go out as `authenticated`, with role enforced server-side
// by is_admin()/is_staff() (reading staff_profiles), not by the anon
// role. Per-app storage keys keep that session isolated from Customer.
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
