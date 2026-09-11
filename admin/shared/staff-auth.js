// ============================================================
//  Aquarium Cafe & Restaurant — Staff access-code authentication
//  Shared by the Admin and Waiter applications only.
//
//  There is no email/password UI here. Each app calls
//  requireStaffSession(role) with role = 'admin' | 'waiter'.
//  This module:
//    1. Checks for an existing Supabase session that already
//       belongs to an ACTIVE staff_profiles row with the
//       matching role (verified server-side via the
//       current_staff_role() RPC — never trusted from the client).
//    2. If none exists, renders a minimal "Staff Access" gate
//       and posts the entered code to the existing `staff-session`
//       Edge Function, which is the only place the access code
//       is ever validated.
//    3. On success, exchanges the one-time token the Edge
//       Function returns for a real Supabase session via
//       supabase.auth.verifyOtp(), then re-verifies the role
//       before resolving.
//
//  The access code itself never touches localStorage,
//  sessionStorage, cookies, the URL, or the console — it is read
//  from the input, sent straight to the Edge Function, and the
//  input is cleared immediately after submission.
// ============================================================
import { supabase } from './supabase.js';

const ROLE_LABEL = {
  admin: 'Admin Console',
  waiter: 'Waiter Dashboard',
};

/** Resolve the current session + its server-verified staff role (or nulls). */
async function getVerifiedSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { session: null, role: null };

  const { data: role, error } = await supabase.rpc('current_staff_role');
  if (error) return { session, role: null };
  return { session, role: role || null };
}

function buildGate(role) {
  const label = ROLE_LABEL[role] || 'Staff Access';

  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Staff access');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;' +
    'justify-content:center;background:#062a3a;padding:24px;' +
    'font-family:Inter,system-ui,-apple-system,sans-serif;';

  overlay.innerHTML = `
    <form autocomplete="off" style="width:100%;max-width:360px;background:#0b3b50;
      border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:32px 28px;
      box-shadow:0 20px 60px rgba(0,0,0,.35);color:#eef7fa;">
      <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;">Staff Access</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#9fc4d2;">${label} &middot; enter your access code</p>
      <label style="display:block;font-size:13px;color:#9fc4d2;margin-bottom:6px;">Access Code</label>
      <input type="password" name="staffAccessCode" autocomplete="off" autocorrect="off"
        autocapitalize="off" spellcheck="false" placeholder="Access code"
        style="width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;
          border:1px solid rgba(255,255,255,.15);background:#062a3a;color:#eef7fa;
          font-size:15px;outline:none;" />
      <p role="alert" data-role="error" style="min-height:18px;margin:10px 0 0;
        font-size:13px;color:#ff8a8a;"></p>
      <button type="submit" style="margin-top:14px;width:100%;padding:12px;border:none;
        border-radius:10px;background:#1f8fb0;color:#fff;font-size:15px;font-weight:600;
        cursor:pointer;">Continue</button>
    </form>`;

  const form = overlay.querySelector('form');
  const input = overlay.querySelector('input');
  const errorEl = overlay.querySelector('[data-role="error"]');
  const button = overlay.querySelector('button');

  const setBusy = (busy) => {
    button.disabled = busy;
    input.disabled = busy;
    button.textContent = busy ? 'Checking…' : 'Continue';
  };
  const showError = (msg) => { errorEl.textContent = msg; };

  queueMicrotask(() => input.focus());

  return { overlay, form, input, errorEl, setBusy, showError };
}

/**
 * Resolves once a valid Supabase session exists for `role`
 * ('admin' | 'waiter'). Never resolves early on a wrong code —
 * the gate simply stays up and lets the user retry.
 */
export function requireStaffSession(role) {
  return new Promise((resolve) => {
    (async () => {
      const { session, role: currentRole } = await getVerifiedSession();
      if (session && currentRole === role) {
        resolve(session);
        return;
      }
      if (session && currentRole !== role) {
        // Session exists but doesn't belong to an active profile with this
        // role (wrong role, inactive, or removed) — drop it and re-gate.
        await supabase.auth.signOut().catch(() => {});
      }

      const ui = buildGate(role);
      document.documentElement.appendChild(ui.overlay);

      ui.form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const code = ui.input.value;
        ui.input.value = ''; // never retained beyond this point

        if (!code) {
          ui.showError('Enter your access code.');
          return;
        }

        ui.setBusy(true);
        try {
          const { data, error } = await supabase.functions.invoke('staff-session', {
            body: { role, access_code: code },
          });

          if (error) {
            const status = error?.context?.status;
            if (status === 401) ui.showError('Incorrect access code.');
            else if (status === 429) ui.showError('Too many attempts. Try again in a few minutes.');
            else if (status === 503) ui.showError('Staff sign-in is temporarily unavailable. Try again shortly.');
            else ui.showError('Could not sign in. Check your connection and try again.');
            ui.setBusy(false);
            return;
          }

          if (!data?.token_hash) {
            ui.showError('Could not sign in. Try again.');
            ui.setBusy(false);
            return;
          }

          const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: data.token_hash,
            type: 'magiclink',
          });

          if (verifyError || !verified?.session) {
            ui.showError('Sign-in failed. Try again.');
            ui.setBusy(false);
            return;
          }

          const { data: confirmedRole, error: roleError } = await supabase.rpc('current_staff_role');
          if (roleError || confirmedRole !== role) {
            await supabase.auth.signOut().catch(() => {});
            ui.showError('This account is not authorized for this application.');
            ui.setBusy(false);
            return;
          }

          ui.overlay.remove();
          resolve(verified.session);
        } catch {
          ui.showError('Network error. Check your connection and try again.');
          ui.setBusy(false);
        }
      });
    })();
  });
}
