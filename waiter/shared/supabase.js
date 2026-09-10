// Aquarium Cafe & Resturant — Waiter Supabase client
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const isConfigured = /^https:\/\/[\w-]+\.supabase\.co\/?$/i.test(SUPABASE_URL.trim()) && SUPABASE_ANON_KEY.trim().length > 40;
if (!isConfigured) console.error('Aquarium Cafe — Supabase is not configured. Check shared/config.js.');

// Waiter authenticates with a staff Supabase session. A separate storage key
// prevents a customer session from being reused by this app.
export const supabase = createClient(
  isConfigured ? SUPABASE_URL.trim().replace(/\/$/, '') : 'https://unconfigured.supabase.co',
  isConfigured ? SUPABASE_ANON_KEY.trim() : 'unconfigured-anon-key-placeholder-000000000000',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'aquarium-auth-waiter' }, realtime: { params: { eventsPerSecond: 10 } } }
);
