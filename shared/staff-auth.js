// shared/staff-auth.js
// ============================================================
// Login-free staff gate for Admin/Waiter.
//
// One access code, entered once per device — not an email/
// password account, no signup screen. The code is sent ONLY to
// the staff-session Edge Function over HTTPS and is never
// written to localStorage, sessionStorage, cookies, or the
// console. What gets cached afterward is a normal Supabase
// session (access/refresh tokens), via supabase-js's own
// persistSession — exactly like the Customer app already does,
// just under its own per-app storage key (see shared/supabase.js).
//
// After the Edge Function returns a session, this module makes
// the caller PROVE the role server-side (via is_admin()/is_staff(),
// which read staff_profiles — never client input) before treating
// the gate as passed. A waiter session can never be accepted as
// admin, even if something upstream misbehaves.
// ============================================================
import { supabase, rpc } from './db.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const ROLE_CHECK = { admin: 'is_admin', waiter: 'is_staff' };

function overlayMarkup(label, sub) {
  return `
    <form class="aq-staff-gate__form" role="dialog" aria-label="${label}">
      <div class="aq-staff-gate__title">${label}</div>
      <div class="aq-staff-gate__sub">${sub}</div>
      <input class="aq-staff-gate__input" type="password" inputmode="text"
             autocomplete="off" autocapitalize="off" spellcheck="false" required />
      <div class="aq-staff-gate__err" aria-live="polite"></div>
      <button class="aq-staff-gate__btn" type="submit">Unlock</button>
    </form>`;
}

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .aq-staff-gate{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;
      background:rgba(20,14,10,.92);font-family:system-ui,-apple-system,sans-serif;padding:1rem;}
    .aq-staff-gate__form{background:#fff;border-radius:14px;padding:2rem;max-width:320px;width:100%;
      box-shadow:0 20px 60px rgba(0,0,0,.4);}
    .aq-staff-gate__title{font-weight:700;font-size:1.1rem;margin-bottom:.35rem;}
    .aq-staff-gate__sub{color:#666;font-size:.85rem;margin-bottom:1rem;}
    .aq-staff-gate__input{width:100%;padding:.7rem;border:1px solid #ccc;border-radius:8px;font-size:1rem;
      margin-bottom:.4rem;box-sizing:border-box;}
    .aq-staff-gate__err{color:#c0392b;font-size:.8rem;min-height:1.1em;margin-bottom:.6rem;}
    .aq-staff-gate__btn{width:100%;padding:.7rem;border:0;border-radius:8px;background:#8a5a2b;color:#fff;
      font-weight:600;font-size:1rem;cursor:pointer;}
    .aq-staff-gate__btn:disabled{opacity:.6;cursor:default;}
  `;
  document.head.appendChild(style);
}

function mountOverlay(label, sub) {
  injectStyles();
  const overlay = document.createElement('div');
  overlay.className = 'aq-staff-gate';
  overlay.innerHTML = overlayMarkup(label, sub);
  document.body.appendChild(overlay);
  return overlay;
}

async function requestSession(appName, code) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/staff-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ app: appName, code }),
    });
  } catch {
    throw new Error('NETWORK'); // offline / edge function unreachable
  }
  if (res.status === 401) throw new Error('INVALID_CODE');
  if (!res.ok) throw new Error('SERVER'); // edge function failure
  const session = await res.json();
  if (!session?.access_token || !session?.refresh_token) throw new Error('SERVER');
  return session;
}

async function verifyRoleServerSide(appName) {
  try {
    const ok = await rpc(ROLE_CHECK[appName]);
    return ok === true;
  } catch {
    return false;
  }
}

function promptForCode(appName, label) {
  return new Promise((resolve) => {
    const overlay = mountOverlay(label, 'Enter the staff access code for this device.');
    const input = overlay.querySelector('.aq-staff-gate__input');
    const err = overlay.querySelector('.aq-staff-gate__err');
    const btn = overlay.querySelector('.aq-staff-gate__btn');
    const form = overlay.querySelector('form');
    input.focus();

    const ERR_TEXT = {
      INVALID_CODE: 'Incorrect code. Try again.',
      NETWORK: 'Can’t reach the server — check your connection and try again.',
      SERVER: 'Something went wrong on our end. Please try again.',
      ROLE_MISMATCH: 'That code did not grant the right access. Contact the owner.',
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = input.value; // never persisted anywhere — held only in this local var
      if (!code) return;
      err.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Checking…';
      input.value = ''; // clear from the field immediately once read

      try {
        const session = await requestSession(appName, code);
        const { error: setErr } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        if (setErr) throw new Error('SERVER');

        // Defense in depth: don't trust that the Edge Function gave the
        // right role — ask the database, which reads staff_profiles.
        const roleOk = await verifyRoleServerSide(appName);
        if (!roleOk) {
          await supabase.auth.signOut();
          throw new Error('ROLE_MISMATCH');
        }

        overlay.remove();
        resolve();
      } catch (ex) {
        err.textContent = ERR_TEXT[ex.message] || ERR_TEXT.SERVER;
        btn.disabled = false;
        btn.textContent = 'Unlock';
        input.focus();
      }
    });
  });
}

/**
 * Call once at app boot, before any privileged Supabase call, and again
 * whenever a privileged call comes back unauthorized (expired/rotated
 * session). Resolves only once a session confirmed as the right role
 * (server-side) is in place.
 */
export async function ensureStaffSession(appName, label) {
  const { data } = await supabase.auth.getSession();
  if (data?.session) {
    // Reload/refresh case: session exists (auto-refreshed by supabase-js
    // if needed) — still confirm the role server-side before trusting it.
    if (await verifyRoleServerSide(appName)) return;
    await supabase.auth.signOut(); // stale/invalid — fall through to re-prompt
  }
  await promptForCode(appName, label);
}

/** Explicit logout — clears the cached session; next load re-prompts. */
export async function staffLogout() {
  await supabase.auth.signOut();
}
