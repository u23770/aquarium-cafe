// shared/staff-auth.js
// ============================================================
// Login-free staff gate for Admin/Waiter.
// One access code, entered once per device (cached in
// localStorage as a real Supabase session, not the code itself).
// No account, no signup, no password field — the code is only
// ever sent to the staff-session Edge Function, which verifies
// it against Vault and returns a genuine Supabase session.
// ============================================================
import { supabase } from './db.js';

const SESSION_KEY = 'aq_staff_session_set';

function promptForCode(appName, label) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(20,14,10,.92);font-family:system-ui,sans-serif;';
    overlay.innerHTML = `
      <form style="background:#fff;border-radius:14px;padding:2rem;max-width:320px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.4);">
        <div style="font-weight:700;font-size:1.1rem;margin-bottom:.4rem;">${label}</div>
        <div style="color:#666;font-size:.85rem;margin-bottom:1rem;">Enter the staff access code for this device.</div>
        <input type="password" inputmode="text" autocomplete="off" required
               style="width:100%;padding:.7rem;border:1px solid #ccc;border-radius:8px;font-size:1rem;margin-bottom:.4rem;" />
        <div class="aq-staff-err" style="color:#c0392b;font-size:.8rem;min-height:1.1em;margin-bottom:.6rem;"></div>
        <button type="submit" style="width:100%;padding:.7rem;border:0;border-radius:8px;background:#8a5a2b;color:#fff;font-weight:600;">Unlock</button>
      </form>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('input');
    const err = overlay.querySelector('.aq-staff-err');
    const form = overlay.querySelector('form');
    input.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = input.value.trim();
      if (!code) return;
      err.textContent = '';
      const btn = form.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Checking…';
      try {
        const res = await fetch(`${supabase.supabaseUrl}/functions/v1/staff-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: supabase.supabaseKey },
          body: JSON.stringify({ app: appName, code }),
        });
        if (!res.ok) throw new Error('bad code');
        const session = await res.json();
        await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
        overlay.remove();
        resolve();
      } catch {
        err.textContent = 'Incorrect code. Try again.';
        btn.disabled = false;
        btn.textContent = 'Unlock';
        input.value = '';
        input.focus();
      }
    });
  });
}

/** Call once at app boot, before any privileged Supabase call. */
export async function ensureStaffSession(appName, label) {
  const { data } = await supabase.auth.getSession();
  if (data?.session) return; // cached session (localStorage-backed by supabase-js) is still valid
  await promptForCode(appName, label);
}
