// ============================================================
//  Aquarium Cafe & Resturant — Admin UI utilities
//  (toast, modal manager, confirm dialog, save pill, misc —
//   everything follows the active language instantly)
// ============================================================
import { t } from '../../shared/i18n.js';

export const $ = (id) => document.getElementById(id);

export const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const money = (n) => `EGP ${+(+n).toFixed(2)}`;

export function debounce(fn, ms = 700) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ---------- toast ---------- */
let toastTimer;
export function toast(message, type = 'ok') {
  const el = $('atoast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', type === 'error');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ---------- save pill (topbar) ---------- */
export function setSaveState(state, text) {
  const pill = $('savePill');
  if (!pill) return;
  pill.classList.toggle('busy', state === 'busy');
  pill.classList.toggle('error', state === 'error');
  $('savePillText').textContent =
    text ?? t(state === 'busy' ? 'top.saving' : state === 'error' ? 'top.saveFailed' : 'top.saved');
}

/* keep the pill truthful when the language flips */
document.addEventListener('lang:changed', () => {
  const pill = $('savePill');
  if (!pill) return;
  const state = pill.classList.contains('busy') ? 'busy' : pill.classList.contains('error') ? 'error' : 'ok';
  setSaveState(state);
});

/* ---------- modal layer manager ---------- */
const stack = [];
let locks = 0;

export function lockScroll(on) {
  locks = Math.max(0, locks + (on ? 1 : -1));
  document.body.classList.toggle('locked', locks > 0);
}

export function openLayer(el) {
  if (!el) return;
  if (!stack.includes(el)) stack.push(el);
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  lockScroll(true);
}

export function closeLayer(el) {
  if (!el) return;
  const i = stack.indexOf(el);
  if (i > -1) stack.splice(i, 1);
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
  lockScroll(false);
}

export function closeTop() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  if (top.id === 'confirmModal') _resolveConfirm(false);
  closeLayer(top);
  return true;
}

/* ---------- confirm dialog (promise) ---------- */
let confirmResolve = null;
function _resolveConfirm(v) {
  confirmResolve?.(v);
  confirmResolve = null;
}

export function confirmDialog({ title = null, text = '', yes = null } = {}) {
  $('cmTitle').textContent = title ?? t('cf.title');
  $('cmText').textContent = text;
  $('cmYes').textContent = yes ?? t('cf.yes');
  $('cmNo').textContent = t('cf.no');
  openLayer($('confirmModal'));
  return new Promise((res) => (confirmResolve = res));
}

/* ---------- global wiring ---------- */
export function initUI() {
  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close]');
    if (closer) closeLayer($(closer.dataset.close));
    if (e.target.closest('[data-confirm-no]')) {
      _resolveConfirm(false);
      closeLayer($('confirmModal'));
    }
  });
  $('cmYes').addEventListener('click', () => { _resolveConfirm(true); closeLayer($('confirmModal')); });
  $('cmNo').addEventListener('click', () => { _resolveConfirm(false); closeLayer($('confirmModal')); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTop(); });
  // body scroll lock class
  const style = document.createElement('style');
  style.textContent = 'body.locked{overflow:hidden}';
  document.head.appendChild(style);
}
