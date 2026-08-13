// ============================================================
//  Aquarium Cafe & Resturant — shared UI utilities
//  (money formatting, toasts, modal/layer manager, reveal-on-scroll)
// ============================================================
import { isRTL } from '../../shared/i18n.js';

/* ---------- money (currency is theme-driven, set by theme.js) ---------- */
let CURRENCY = 'EGP';
export function setCurrency(code) {
  if (code) CURRENCY = String(code).trim().toUpperCase();
}
/* EGP shows as ج.م in Arabic — the code stays EGP in English. */
export const money = (n) => {
  const cur = CURRENCY === 'EGP' && isRTL() ? 'ج.م' : CURRENCY;
  return `${cur} ${+(+n).toFixed(2)}`;
};

/* ---------- escape html ---------- */
export const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- toast ---------- */
let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- layer (modal / drawer) manager ---------- */
const stack = [];
let locks = 0;

export function lockScroll(on) {
  locks = Math.max(0, locks + (on ? 1 : -1));
  document.body.classList.toggle('locked', locks > 0);
}

export function openLayer(el, cls = 'open') {
  if (!el) return;
  if (!stack.some((x) => x.el === el)) stack.push({ el, cls });
  el.classList.add(cls);
  el.setAttribute('aria-hidden', 'false');
  lockScroll(true);
}

export function closeLayer(el, cls = 'open') {
  if (!el) return;
  const i = stack.findIndex((x) => x.el === el);
  if (i > -1) stack.splice(i, 1);
  el.classList.remove(cls);
  el.setAttribute('aria-hidden', 'true');
  el.dispatchEvent(new CustomEvent('layer:close'));
  lockScroll(false);
}

export function closeTop() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  closeLayer(top.el, top.cls);
  return true;
}

export const anyLayerOpen = () => stack.length > 0;

/* ---------- reveal on scroll ---------- */
const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const en of entries) {
      if (en.isIntersecting) {
        en.target.classList.add('in-view');
        revealObserver.unobserve(en.target);
      }
    }
  },
  { threshold: 0.12, rootMargin: '0px 0px -7% 0px' }
);

export function observeReveals(nodes) {
  const list = nodes instanceof NodeList || Array.isArray(nodes) ? [...nodes] : [nodes];
  list.forEach((n) => n && revealObserver.observe(n));
}

export function initReveals() {
  observeReveals(document.querySelectorAll('.reveal:not(.in-view)'));
}
