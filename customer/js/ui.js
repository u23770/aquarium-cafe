// ============================================================
//  Aquarium Cafe & Restaurant — shared UI utilities
//  (money formatting, toasts, modal/layer manager, reveal-on-scroll)
// ============================================================
import { isRTL } from '../shared/i18n.js';

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

function focusableIn(el) {
  return [...el.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((node) => !node.hidden && node.getAttribute('aria-hidden') !== 'true' && node.offsetParent !== null);
}

function trapLayerKeydown(e) {
  if (e.key !== 'Tab') return;
  const top = stack[stack.length - 1];
  if (!top) return;
  const items = focusableIn(top.el);
  if (!items.length) {
    e.preventDefault();
    top.el.focus({ preventScroll: true });
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus({ preventScroll: true });
  }
}

document.addEventListener('keydown', trapLayerKeydown);
document.querySelectorAll('.modal[aria-hidden="true"], .drawer[aria-hidden="true"], .overlay[aria-hidden="true"]').forEach((el) => { el.inert = true; });

export function lockScroll(on) {
  locks = Math.max(0, locks + (on ? 1 : -1));
  document.body.classList.toggle('locked', locks > 0);
}

export function openLayer(el, cls = 'open') {
  if (!el) return;
  if (!stack.some((x) => x.el === el)) stack.push({ el, cls, previousFocus: document.activeElement });
  el.classList.add(cls);
  el.inert = false;
  el.setAttribute('aria-hidden', 'false');
  lockScroll(true);
  requestAnimationFrame(() => {
    const items = focusableIn(el);
    (items[0] || el).focus({ preventScroll: true });
  });
}

export function closeLayer(el, cls = 'open') {
  if (!el) return;
  const i = stack.findIndex((x) => x.el === el);
  if (i > -1) stack.splice(i, 1);
  const entry = i > -1 ? stack[i] : null;
  el.classList.remove(cls);
  el.setAttribute('aria-hidden', 'true');
  el.inert = true;
  el.dispatchEvent(new CustomEvent('layer:close'));
  lockScroll(false);
  requestAnimationFrame(() => {
    const target = entry?.previousFocus;
    if (target && typeof target.focus === 'function' && document.contains(target)) {
      target.focus({ preventScroll: true });
    }
  });
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
