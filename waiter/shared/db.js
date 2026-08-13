// ============================================================
//  Aquarium Cafe & Resturant — shared data helpers
//  Thin wrappers every site uses: consistent errors, count
//  queries, RPC calls, and the not-configured guard.
// ============================================================
import { supabase, isConfigured } from './supabase.js';

export { supabase, isConfigured };

const NOT_CONFIGURED =
  'Supabase is not configured yet — open shared/config.js and paste your Project URL and anon key, then reload this page.';

/** Run a PostgREST query builder, returning `data` or throwing a friendly Error. */
export async function run(query, offlineMsg = 'Cannot reach Supabase right now — check your connection.') {
  if (!isConfigured) throw new Error(NOT_CONFIGURED);
  let res;
  try {
    res = await query;
  } catch {
    throw new Error(offlineMsg); // network-level failure
  }
  if (res?.error) {
    const err = new Error(res.error.message || 'Unexpected database error.');
    err.code = res.error.code;
    throw err;
  }
  return res?.data ?? null;
}

/** Run a query that was built with { count: 'exact', head: true } → integer count. */
export async function runCount(query) {
  if (!isConfigured) throw new Error(NOT_CONFIGURED);
  let res;
  try {
    res = await query;
  } catch {
    throw new Error('Cannot reach Supabase right now — check your connection.');
  }
  if (res?.error) throw new Error(res.error.message || 'Unexpected database error.');
  return res?.count ?? 0;
}

/** Call a SECURITY DEFINER Postgres function (orders, overview, status flow…). */
export async function rpc(name, args = {}) {
  return run(supabase.rpc(name, args));
}
