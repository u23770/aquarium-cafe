// ============================================================
//  Aquarium Cafe & Resturant — Waiter UI utilities
//  (formatting, toast, notification sound, time helpers —
//   all locale-aware for the instant EN⇄AR switch)
// ============================================================
import { t, isRTL } from '../shared/i18n.js';

/* ---------- formatting ---------- */
export const money = (n) => `${+(+n).toFixed(2)}`;
export const currency = () => (isRTL() ? 'ج.م' : 'EGP');
export const moneyEgp = (n) => `${currency()} ${money(n)}`;

export const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const padId = (id) => '#' + String(id).padStart(3, '0');

/* ISO 8601 from Supabase; also tolerates legacy "YYYY-MM-DD HH:MM:SS" UTC */
export const parseDate = (s) => {
  const raw = String(s);
  const d = raw.includes('T') ? new Date(raw) : new Date(raw.replace(' ', 'T') + 'Z');
  return d;
};

const locale = () => (isRTL() ? 'ar-EG' : 'en-GB');

export function relTime(ts) {
  const d = parseDate(ts);
  if (isNaN(d)) return '';
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 45) return t('time.justnow');
  const m = Math.floor(s / 60);
  if (m < 60) return t('time.min', { m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('time.hm', { h, m: m % 60 });
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
}

export function exactTime(ts) {
  const d = parseDate(ts);
  if (isNaN(d)) return ts;
  return d.toLocaleString(isRTL() ? 'ar-EG' : 'en-EG', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

export const timeNow = () =>
  new Date().toLocaleTimeString(isRTL() ? 'ar-EG' : 'en-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/* ---------- toast ---------- */
let toastTimer;
export function toast(message, type = 'ok') {
  const el = document.getElementById('wtoast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', type === 'error');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

/* ---------- notification sound (WebAudio, no assets) ---------- */
const SOUND_KEY = 'aquarium_waiter_sound_v1';
let audioCtx = null;

export let soundOn = localStorage.getItem(SOUND_KEY) !== 'off';

export function toggleSound() {
  soundOn = !soundOn;
  localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off');
  return soundOn;
}

export function ding() {
  if (!soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    [987.77, 1318.51].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t + i * 0.14;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.6);
    });
  } catch {
    /* audio unavailable — stay silent */
  }
}
