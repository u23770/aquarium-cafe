// ============================================================
//  Aquarium Cafe & Resturant — Waiter dashboard main (v5)
//  Delivery-only dispatch board: instant EN⇄AR (RTL), clock,
//  sound, refresh, realtime pushes + a gentle polling safety
//  net. Status moves live in waiter/js/delivery.js.
// ============================================================
import { initI18n, toggleLang, langSwitchLabel, t, isRTL, applyI18n } from '../shared/i18n.js';
import { requireStaffSession } from '../shared/staff-auth.js';
import { dictionary } from './lang.js';
import { subscribeDeliveryOrders } from './api.js';
import { initDelivery, refreshDelivery } from './delivery.js';
import { toast, soundOn, toggleSound } from './ui.js';
import { registerPush, autoRegisterGrantedPush } from '../shared/push.js';

const POLL_MS = 15000; // safety net only — Realtime drives instant updates

/* PWA shell + Web Push: register explicitly and keep the registration promise. */
let waiterSWRegistration = null;
let waiterSWError = null;
const waiterSWReady = ('serviceWorker' in navigator)
  ? navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => { waiterSWRegistration = reg; return reg; })
      .catch(err => { waiterSWError = err; console.error('[push] Service Worker registration failed:', err); throw err; })
  : Promise.reject(new Error('Service workers are not supported by this browser.'));
const $ = (id) => document.getElementById(id);

/* Browser notification permission is requested only after a staff gesture. */
$('notifyBtn')?.addEventListener('click', async () => {
  try {
    if (waiterSWError) throw new Error('The notification background service could not start. Refresh the page and try again.');
    const reg = waiterSWRegistration || await waiterSWReady;
    await reg.update().catch(() => {});
    await registerPush('waiter', null, reg);
    toast(t('toast.notificationsOn'));
  } catch (err) {
    toast(err.message || t('toast.notificationsOn'), 'error');
  }
});
waiterSWReady.then(reg => autoRegisterGrantedPush('waiter', null, reg)).catch(() => {});

/* ---------- language: boot FIRST ---------- */
initI18n({ dictionary, defaultLang: 'en' });

const paintLangBtn = () => {
  const btn = $('langBtn');
  const label = $('langBtnLabel');
  if (!btn || !label) return;
  label.textContent = langSwitchLabel();
  btn.setAttribute('aria-label', t('top.lang'));
  btn.setAttribute('title', t('top.lang'));
};
$('langBtn')?.addEventListener('click', toggleLang);
document.addEventListener('lang:changed', () => {
  paintLangBtn();
  applyI18n(document);
  tickClock(); // dates/times re-localize instantly
});
paintLangBtn();

/* ---------- live indicator (realtime channel health) ---------- */
const channelHealth = { delivery: true };
function setLive(ok) {
  $('livePill').classList.toggle('off', !ok);
  $('liveText').textContent = ok ? t('top.live') : t('top.offline');
}
const paintLive = () => setLive(channelHealth.delivery);
document.addEventListener('lang:changed', paintLive);
paintLive();

/* ---------- header: clock, sound, refresh ---------- */
function tickClock() {
  const now = new Date();
  const loc = isRTL() ? 'ar-EG' : 'en-EG';
  $('clockTime').textContent = now.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  $('clockDate').textContent = now.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'short' });
}
setInterval(tickClock, 1000);
tickClock();

const soundBtn = $('soundBtn');
function paintSound() {
  soundBtn.querySelector('.icon-sound').hidden = !soundOn;
  soundBtn.querySelector('.icon-mute').hidden = soundOn;
  soundBtn.style.color = soundOn ? '' : 'var(--danger)';
}
soundBtn.addEventListener('click', () => {
  const on = toggleSound();
  paintSound();
  toast(t(on ? 'toast.soundOn' : 'toast.soundOff'));
});
paintSound();

$('refreshBtn').addEventListener('click', () => {
  const b = $('refreshBtn');
  b.classList.remove('spin');
  void b.offsetWidth;
  b.classList.add('spin');
  refreshDelivery('force');
});

// browsers unlock audio after the first user gesture
document.addEventListener('pointerdown', () => {}, { once: true });

/* ---------- notification click targeting: ?order=<id> highlights the card
   (never changes its status — just scrolls to it and flashes an outline) ---------- */
function highlightOrderFromURL() {
  const id = new URL(window.location.href).searchParams.get('order');
  if (!id) return;
  // strip the param immediately so a manual refresh doesn't re-highlight
  const clean = new URL(window.location.href);
  clean.searchParams.delete('order');
  history.replaceState(null, '', clean.pathname + clean.search + clean.hash);

  let tries = 0;
  const tryHighlight = () => {
    const card = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('d-card--pulse');
      setTimeout(() => card.classList.remove('d-card--pulse'), 2600);
      return;
    }
    if (++tries < 20) setTimeout(tryHighlight, 250); // board renders asynchronously
  };
  tryHighlight();
}

/* ---------- print action availability ----------
   delivery.js already handles [data-print] clicks and uses the authoritative
   in-memory order. Its normal print button starts at Preparing; this small
   UI bridge adds the same action to Received/Accepted cards immediately,
   without duplicating print logic or bypassing delivery.js. */
function ensureEarlyPrintButtons() {
  const board = $('delvBoard');
  if (!board) return;
  board.querySelectorAll('.d-card.ds-Received, .d-card.ds-Accepted').forEach((card) => {
    if (card.querySelector('[data-print]')) return;
    const id = card.dataset.id;
    if (!id) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'd-act d-act--print';
    btn.dataset.print = id;
    btn.title = t('act.print');
    btn.innerHTML = `<svg class="icon"><use href="#i-print"/></svg> ${t('act.print')}`;
    card.appendChild(btn);
  });
}

/* ---------- boot: gated on staff authentication ----------
   The delivery board must not initialize — no realtime
   subscription, no polling, no order fetch — until an active
   waiter session is verified, either from an existing session
   or via the access code gate. */
requireStaffSession('waiter').then(() => {
  /* ---------- realtime: delivery orders & status changes ---------- */
  let rtDelvTimer = null;
  subscribeDeliveryOrders(
    () => {
      clearTimeout(rtDelvTimer);
      rtDelvTimer = setTimeout(() => refreshDelivery('realtime'), 250);
    },
    (status) => {
      channelHealth.delivery = !(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT');
      paintLive();
    }
  );

  /* ---------- gentle polling safety net ---------- */
  setInterval(refreshDelivery, POLL_MS);

  /* ---------- boot ---------- */
  initDelivery();
  const board = $('delvBoard');
  if (board) {
    const printObserver = new MutationObserver(() => ensureEarlyPrintButtons());
    printObserver.observe(board, { childList: true, subtree: true });
  }
  refreshDelivery('force').then(() => {
    ensureEarlyPrintButtons();
    highlightOrderFromURL();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      ensureEarlyPrintButtons();
      highlightOrderFromURL();
    }
  });
});
