// ============================================================
//  Aquarium Cafe & Resturant — SUPABASE CONFIGURATION  ★ EDIT THIS FILE ★
// ------------------------------------------------------------
//  1. Open your project at https://supabase.com/dashboard
//  2. Go to  Project Settings → API
//  3. Copy "Project URL" and the "anon / public" key below
//
//  The anon key is safe to ship in the browser — access is
//  governed by the Row-Level-Security policies in supabase/schema.sql
// ============================================================

export const SUPABASE_URL = 'https://nvchkcexrhhhkkxuoyzp.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_9Z4EOWrdMt6uoI60FLQRXw_B2XJNReW';

// Where the customer site lives, as seen from the waiter & admin apps.
// Used to resolve the bundled menu images (images/…) stored in the database.
//   · Same domain / one static host  → keep the relative default.
//   · Apps split across domains      → full URL, e.g. 'https://cafe.example.com'
export const CUSTOMER_BASE = '../customer';

// Supabase Storage bucket that powers the Media Library
// (product photos, logo, favicon, hero & about images —
// created automatically by supabase/schema.sql).
export const STORAGE_BUCKET = 'media';

// Web Push public key (safe to expose in the browser). Set this after generating the VAPID pair.
export const PUSH_VAPID_PUBLIC_KEY = 'REPLACE_ME_WITH_VAPID_PUBLIC_KEY';
