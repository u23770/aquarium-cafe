// ============================================================
//  Aquarium Cafe & Resturant — Waiter dashboard main (v5)
//  Delivery-only dispatch board: instant EN⇄AR (RTL), clock,
//  sound, refresh, realtime pushes + a gentle polling safety
//  net. Status moves live in waiter/js/delivery.js.
// ============================================================
import { initI18n, toggleLang, langSwitchLabel, t, isRTL, applyI18n } from '../shared/i18n.js';
import { dictionary } from './lang.js';
import { subscribeDeliveryOrders } from './api.js';
import { initDelivery, refreshDelivery } from './delivery.js';
import { toast, soundOn, toggleSound } from './ui.js';
import { registerPush, autoRegisterGrantedPush } from '../shared/push.js';

const POLL_MS = 15000; // safety net only — Realtime drives instant updates

/* PWA shell: waiter can be installed as a standalone app. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
const $ = (id) => document.getElementById(id);

/* Browser notification permission is requested only after a staff gesture. */
$('notifyBtn')?.addEventListener('click', async () => {
  try {
    await registerPush('waiter');
    toast(t('toast.notificationsOn'));
  } catch (err) {
    toast(err.message || t('toast.notificationsOn'), 'error');
  }
});
autoRegisterGrantedPush('waiter').then(() => {}).catch(() => {});


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

/* ---------- boot ---------- */
initDelivery();
refreshDelivery('force');
