// ============================================================
//  Aquarium Cafe & Resturant — main entry (v5)
//  i18n boot (instant EN⇄AR + RTL), preloader, appearance
//  engine, nav, smooth scroll, scroll-spy, accounts, cart,
//  delivery checkout & live tracking bootstrap.
// ============================================================
import { initI18n, toggleLang, langSwitchLabel, t, applyI18n } from '../shared/i18n.js';
import { dictionary } from './lang.js';
import { initAppearance, PREVIEW, applyNavLang } from './theme.js';
import { initAuth } from './auth.js';
import { initMenu } from './menu.js';
import { initCart } from './cart.js';
import { initDelivery } from './delivery.js';
import { initGallery } from './gallery.js';
import { initReviews } from './reviews.js';
import { initReveals, closeLayer, closeTop } from './ui.js';

const $ = (id) => document.getElementById(id);

/* ---------- PWA install + offline shell ---------- */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const b = $('installBtn');
  if (b) b.hidden = false;
});
$('installBtn')?.addEventListener('click', async () => {
  const b = $('installBtn');
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => {});
    deferredInstallPrompt = null;
    if (b) b.hidden = true;
    return;
  }
  // iOS/Safari and some browsers do not expose beforeinstallprompt.
  // Give the user a useful manual-install instruction instead of a dead button.
  const ar = document.documentElement.lang === 'ar';
  alert(ar
    ? 'لإضافة الموقع للشاشة الرئيسية: من قائمة المتصفح اختر «إضافة إلى الشاشة الرئيسية» أو «Add to Home Screen». إذا لم يظهر الخيار، افتح الموقع من Chrome أو Safari.'
    : 'To add the website to your home screen, open the browser menu and choose “Add to Home Screen” or “Install app”. If the option is missing, open the site in Chrome or Safari.');
});
window.addEventListener('appinstalled', () => { const b = $('installBtn'); if (b) b.hidden = true; });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
const NAV_OFFSET = 66;

/* ---------- language: boot BEFORE anything renders ---------- */
initI18n({ dictionary, defaultLang: 'en' });

const paintLangBtn = () => {
  const btn = $('langBtn');
  const label = $('langBtnLabel');
  if (!btn || !label) return;
  label.textContent = langSwitchLabel();
  btn.setAttribute('aria-label', t('nav.lang'));
  btn.setAttribute('title', t('nav.lang'));
};
$('langBtn')?.addEventListener('click', toggleLang);
document.addEventListener('lang:changed', () => {
  paintLangBtn();
  applyNavLang();   // DB-driven nav labels restore / translate
  applyI18n(document); // static data-i18n attributes
});
paintLangBtn();

/* ---------- preloader ---------- */
{
  const pre = $('preloader');
  const hide = () => {
    if (pre.classList.contains('done')) return;
    pre.classList.add('done');
    document.body.classList.add('loaded');
  };
  const minDelay = new Promise((r) => setTimeout(r, PREVIEW ? 350 : 900));
  const loaded = new Promise((r) =>
    document.readyState === 'complete' ? r() : window.addEventListener('load', r, { once: true })
  );
  Promise.all([loaded, minDelay]).then(hide);
  setTimeout(hide, 3600); // hard fallback
}

/* ---------- nav: shrink on scroll ---------- */
const nav = $('nav');
const toTop = $('toTop');
const onScroll = () => {
  nav.classList.toggle('scrolled', window.scrollY > 24);
  toTop.classList.toggle('show', window.scrollY > 640);
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ---------- burger / mobile menu ---------- */
$('burger').addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  $('burger').setAttribute('aria-expanded', String(open));
});

/* ---------- smooth scroll with nav offset ---------- */
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-scroll]');
  if (!link) return;
  const hash = link.getAttribute('href');
  const target = hash && hash.startsWith('#') && document.querySelector(hash);
  if (!target) return;
  e.preventDefault();
  nav.classList.remove('open');
  $('burger').setAttribute('aria-expanded', 'false');
  const off = document.body.dataset.navSticky === 'off' ? 0 : NAV_OFFSET;
  const top = target.getBoundingClientRect().top + window.scrollY - off;
  window.scrollTo({ top, behavior: 'smooth' });
});

toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

/* ---------- scroll-spy (rebuilt whenever the theme re-renders the nav) ---------- */
let spy = null;
function initSpy() {
  const links = [...document.querySelectorAll('[data-link]')];
  if (!links.length) return;
  spy?.disconnect();
  spy = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        links.forEach((a) => {
          const on = a.dataset.link === en.target.id;
          a.classList.toggle('is-active', on);
          if (on) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      }
    },
    { rootMargin: '-40% 0px -55% 0px' }
  );
  links.forEach((a) => {
    const el = document.getElementById(a.dataset.link);
    if (el && !el.hidden) spy.observe(el);
  });
}
document.addEventListener('theme:applied', initSpy);

/* ---------- global close interactions ---------- */
document.addEventListener('click', (e) => {
  const closer = e.target.closest('[data-close]');
  if (closer) closeLayer($(closer.dataset.close));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!closeTop() && nav.classList.contains('open')) {
      nav.classList.remove('open');
      $('burger').setAttribute('aria-expanded', 'false');
    }
  }
});

/* ---------- footer year ---------- */
$('year').textContent = new Date().getFullYear();

/* ---------- boot ---------- */
initAppearance();   // theme / content / sections / identity (async, safe)
initSpy();
initAuth();         // accounts: session, nav chip, profile modal
initCart();
initDelivery();     // zones checkout + loyalty + coupons + live tracking
initMenu();
initGallery();      // promo banner + gallery grid + lightbox
initReviews();      // guest reviews + submit modal
initReveals();
