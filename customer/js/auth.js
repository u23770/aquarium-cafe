// ============================================================
//  Aquarium Cafe & Resturant — Customer accounts (v5)
//  ------------------------------------------------------------
//  Sign in · create account · continue as guest.
//  One modal, two tabs; the session lives in Supabase Auth.
//  The profile modal shows editable name/phone, the points
//  wallet (balance + value) and the full points history,
//  filterable into earned / redeemed.
//
//  Broadcasts 'auth:changed' { user, profile } — delivery.js
//  listens and paints the loyalty row + prefills the form.
// ============================================================
import {
  signUpCustomer, signInCustomer, signOutCustomer,
  getSession, onAuthChange,
  getMyProfile, saveMyProfile,
  getLoyaltyConfig, getMyPoints, getMyLoyaltyHistory,
} from './api.js';
import { toast, money, esc, openLayer, closeLayer } from './ui.js';
import { t } from '../../shared/i18n.js';

const $ = (id) => document.getElementById(id);

let els = null;
let session = null;          // supabase session (null = guest)
let profile = null;          // { name, phone }
let loyaltyCfg = null;       // cached loyalty config
let histFilter = 'all';      // all | earn | redeem
let working = false;

export const getUser = () => session?.user ?? null;
export const getProfile = () => profile;

/* ═══════════════ helpers ═══════════════ */
const userFirstName = (user, prof) => {
  const name = (prof?.name || user?.user_metadata?.full_name || '').trim();
  if (name) return name.split(/\s+/)[0];
  const mail = user?.email || '';
  return mail.split('@')[0] || 'Guest';
};

const mapAuthError = (err) => {
  const msg = String(err?.message || '');
  if (/invalid login credentials/i.test(msg)) return t('auth.err.credentials');
  if (/already registered|already been registered/i.test(msg)) return t('auth.err.exists');
  if (/password.*(at least|should be)/i.test(msg)) return t('auth.err.weak');
  if (/unable to validate email|invalid email/i.test(msg)) return t('val.email');
  return msg && msg.length < 120 ? msg : t('auth.err.generic');
};

function broadcast() {
  document.dispatchEvent(
    new CustomEvent('auth:changed', {
      detail: { user: getUser(), profile, loyalty: loyaltyCfg },
    })
  );
}

/* ═══════════════ session lifecycle ═══════════════ */
async function hydrate(sess) {
  session = sess;
  profile = null;
  loyaltyCfg = null;
  if (sess?.user) {
    try { profile = await getMyProfile(sess.user.id); } catch { profile = null; }
    if (!profile) profile = { name: sess.user.user_metadata?.full_name ?? '', phone: sess.user.user_metadata?.phone ?? '' };
    try { loyaltyCfg = await getLoyaltyConfig(); } catch { loyaltyCfg = null; }
  }
  paintNav();
  broadcast();
}

function paintNav() {
  const btn = els.authBtn;
  const label = els.authLabel;
  const user = getUser();
  if (user) {
    label.textContent = userFirstName(user, profile);
    btn.classList.add('is-member');
    btn.setAttribute('aria-label', t('nav.account'));
  } else {
    label.textContent = t('nav.signin');
    btn.classList.remove('is-member');
    btn.setAttribute('aria-label', t('nav.signin'));
  }
}

/* ═══════════════ auth modal ═══════════════ */
function setTab(which) {
  const isIn = which === 'in';
  els.tabIn.classList.toggle('is-active', isIn);
  els.tabUp.classList.toggle('is-active', !isIn);
  els.formIn.hidden = !isIn;
  els.formUp.hidden = isIn;
  els.errIn.textContent = '';
  els.errUp.textContent = '';
}

export function openAuthModal(tab = 'in') {
  if (getUser()) { openProfileModal(); return; }
  setTab(tab);
  openLayer(els.modal);
  setTimeout(() => (tab === 'in' ? els.inEmail : els.upName).focus(), 420);
}

function setWorking(on, which) {
  working = on;
  const btn = which === 'in' ? els.inSubmit : els.upSubmit;
  btn.disabled = on;
  const key = which === 'in' ? 'auth.signin' : 'auth.signup';
  btn.innerHTML = on
    ? t('auth.working')
    : `<span data-i18n="${key}">${t(key)}</span> <svg class="icon" data-flip-rtl><use href="#i-arrow"/></svg>`;
}

async function submitSignIn(e) {
  e.preventDefault();
  if (working) return;
  const email = els.inEmail.value.trim();
  const password = els.inPass.value;
  const v = !/^\S+@\S+\.\S+$/.test(email) ? t('val.email') : password.length < 6 ? t('val.password') : '';
  els.errIn.textContent = v;
  if (v) return;
  setWorking(true, 'in');
  try {
    await signInCustomer({ email, password });
    closeLayer(els.modal);
    els.inPass.value = '';
    toast(t('auth.welcome', { name: userFirstName(getUser(), profile) }));
  } catch (err) {
    els.errIn.textContent = mapAuthError(err);
  } finally {
    setWorking(false, 'in');
  }
}

async function submitSignUp(e) {
  e.preventDefault();
  if (working) return;
  const name = els.upName.value.trim().replace(/\s+/g, ' ');
  const phone = els.upPhone.value.trim();
  const email = els.upEmail.value.trim();
  const password = els.upPass.value;
  let v = '';
  if (name.length < 2) v = t('val.name');
  else if (phone.replace(/\D/g, '').length < 9) v = t('val.phone');
  else if (!/^\S+@\S+\.\S+$/.test(email)) v = t('val.email');
  else if (password.length < 6) v = t('val.password');
  els.errUp.textContent = v;
  if (v) return;
  setWorking(true, 'up');
  try {
    const res = await signUpCustomer({ name, phone, email, password });
    if (!res.session) {
      // email confirmation is ON in the Supabase project
      els.errUp.textContent = t('auth.confirmEmail');
      return;
    }
    closeLayer(els.modal);
    els.upPass.value = '';
    toast(t('auth.signedUp'));
    const bonus = +(loyaltyCfg?.signupBonus ?? 0);
    if (bonus > 0) setTimeout(() => toast(t('auth.bonus', { n: bonus })), 3000);
  } catch (err) {
    els.errUp.textContent = mapAuthError(err);
  } finally {
    setWorking(false, 'up');
  }
}

/* ═══════════════ profile modal ═══════════════ */
async function openProfileModal() {
  const user = getUser();
  if (!user) { openAuthModal('in'); return; }
  els.pfMsg.textContent = '';
  els.pfName.value = profile?.name ?? user.user_metadata?.full_name ?? '';
  els.pfPhone.value = profile?.phone ?? user.user_metadata?.phone ?? '';
  els.pfEmail.textContent = user.email ?? '';
  els.pfAvatar.textContent = (profile?.name || user.email || 'A').trim().charAt(0).toUpperCase();
  histFilter = 'all';
  els.pfFilter.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.filter === 'all'));
  openLayer(els.modalPf);
  await loadWallet();
}

async function loadWallet() {
  const user = getUser();
  if (!user) return;
  els.pfList.innerHTML = `<li class="pf__empty">${esc(t('tk.connecting'))}</li>`;
  try {
    if (!loyaltyCfg) loyaltyCfg = await getLoyaltyConfig();
    const [points, rows] = await Promise.all([getMyPoints(user.id), getMyLoyaltyHistory(user.id)]);
    paintWallet(points, loyaltyCfg);
    paintHistory(rows);
  } catch (err) {
    els.pfList.innerHTML = `<li class="pf__empty">${esc(err.message)}</li>`;
  }
}

function paintWallet(points, cfg) {
  els.pfBalance.textContent = points;
  const worth = cfg?.pointValue ? points * cfg.pointValue : 0;
  els.pfWorth.textContent = worth > 0 ? t('pf.worth', { x: money(worth) }) : '';
  els.pfRate.textContent =
    cfg?.enabled && cfg.pointsPerOrder > 0
      ? t('pf.earnRate', { n: cfg.pointsPerOrder })
      : '';
}

function paintHistory(rows) {
  const filtered = rows.filter((r) => {
    if (histFilter === 'earn') return r.delta > 0;
    if (histFilter === 'redeem') return r.delta < 0;
    return true;
  });
  els.pfEmpty.hidden = filtered.length > 0;
  const lang = document.documentElement.lang === 'ar' ? 'ar-EG' : 'en-EG';
  els.pfList.innerHTML = filtered
    .map((r) => {
      const d = new Date(r.created_at);
      const when = isNaN(d)
        ? ''
        : d.toLocaleDateString(lang, { day: 'numeric', month: 'short' }) +
          ' · ' +
          d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
      const cls = r.delta >= 0 ? 'is-plus' : 'is-minus';
      return `
      <li class="pf__tx">
        <span class="pf__tx-ico ${cls}"><svg class="icon"><use href="#${r.delta >= 0 ? 'i-plus' : 'i-minus'}"/></svg></span>
        <div>
          <b>${esc(t('reason.' + r.reason) === 'reason.' + r.reason ? (r.reason || '') : t('reason.' + r.reason))}</b>
          <small>${esc(when)}</small>
        </div>
        <strong class="${cls}">${r.delta >= 0 ? '+' : ''}${r.delta}</strong>
      </li>`;
    })
    .join('');
}

async function submitProfile(e) {
  e.preventDefault();
  const user = getUser();
  if (!user || working) return;
  const name = els.pfName.value.trim().replace(/\s+/g, ' ');
  const phone = els.pfPhone.value.trim();
  let v = '';
  if (name.length < 2) v = t('val.name');
  else if (phone.replace(/\D/g, '').length < 9) v = t('val.phone');
  if (v) { els.pfMsg.textContent = v; return; }
  working = true;
  els.pfSave.disabled = true;
  try {
    await saveMyProfile(user.id, { name, phone });
    profile = { name, phone };
    els.pfAvatar.textContent = name.charAt(0).toUpperCase();
    paintNav();
    broadcast();
    els.pfMsg.textContent = t('pf.saved');
  } catch (err) {
    els.pfMsg.textContent = err.message;
  } finally {
    working = false;
    els.pfSave.disabled = false;
  }
}

async function doSignOut() {
  try {
    await signOutCustomer();
    closeLayer(els.modalPf);
    toast(t('auth.signedOut'));
  } catch (err) {
    toast(err.message);
  }
}

/* ═══════════════ init ═══════════════ */
export function initAuth() {
  els = {
    authBtn: $('authBtn'),
    authLabel: $('authBtnLabel'),
    modal: $('authModal'),
    tabIn: $('auTabIn'),
    tabUp: $('auTabUp'),
    formIn: $('auInForm'),
    formUp: $('auUpForm'),
    inEmail: $('auInEmail'),
    inPass: $('auInPass'),
    errIn: $('auInError'),
    inSubmit: $('auInSubmit'),
    upName: $('auUpName'),
    upPhone: $('auUpPhone'),
    upEmail: $('auUpEmail'),
    upPass: $('auUpPass'),
    errUp: $('auUpError'),
    upSubmit: $('auUpSubmit'),
    guest: $('auGuest'),
    modalPf: $('profileModal'),
    pfForm: $('pfForm'),
    pfName: $('pfName'),
    pfPhone: $('pfPhone'),
    pfEmail: $('pfEmail'),
    pfAvatar: $('pfAvatar'),
    pfMsg: $('pfMsg'),
    pfSave: $('pfSave'),
    pfBalance: $('pfBalance'),
    pfWorth: $('pfWorth'),
    pfRate: $('pfRate'),
    pfFilter: $('pfFilter'),
    pfList: $('pfHistory'),
    pfEmpty: $('pfEmpty'),
    pfLogout: $('pfLogout'),
  };
  if (!els.modal) return;

  els.authBtn.addEventListener('click', () =>
    getUser() ? openProfileModal() : openAuthModal('in')
  );
  els.tabIn.addEventListener('click', () => setTab('in'));
  els.tabUp.addEventListener('click', () => setTab('up'));
  els.formIn.addEventListener('submit', submitSignIn);
  els.formUp.addEventListener('submit', submitSignUp);
  els.guest.addEventListener('click', () => closeLayer(els.modal));

  els.pfForm.addEventListener('submit', submitProfile);
  els.pfLogout.addEventListener('click', doSignOut);
  els.pfFilter.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-filter]');
    if (!b) return;
    histFilter = b.dataset.filter;
    els.pfFilter.querySelectorAll('button').forEach((x) => x.classList.toggle('is-active', x === b));
    loadWallet();
  });

  /* any [data-open-auth] element (e.g. the checkout nudge) opens the modal */
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open-auth]');
    if (opener) openAuthModal(opener.dataset.openAuth === 'up' ? 'up' : 'in');
  });

  /* keep the nav chip + dependents in sync with every auth transition */
  onAuthChange((sess) => { hydrate(sess); });
  getSession().then((sess) => { hydrate(sess); });

  /* language switch → re-paint dynamic strings */
  document.addEventListener('lang:changed', () => {
    paintNav();
    if (els.modalPf.classList.contains('open')) loadWallet();
  });
}
