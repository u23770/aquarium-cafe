// ============================================================
//  Aquarium Cafe & Resturant — Guest reviews (v5, bilingual)
//  Shows approved reviews; guests submit new ones through the
//  star modal — they always land unapproved (moderation first).
//  Validation, labels and toasts follow the active language.
// ============================================================
import { getReviews, submitReview } from './api.js';
import { esc, toast, openLayer, closeLayer } from './ui.js';
import { t, isRTL } from '../../shared/i18n.js';

const $ = (id) => document.getElementById(id);
let els = null;
let rating = 0;
let sending = false;

const prettyDate = (iso) => {
  const d = new Date(iso);
  return isNaN(d)
    ? ''
    : d.toLocaleDateString(isRTL() ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

function starsHTML(n) {
  return Array.from({ length: 5 }, (_, i) =>
    `<svg class="icon ${i < n ? 'on' : ''}"><use href="#i-star"/></svg>`).join('');
}

function cardHTML(r, i) {
  const initial = esc((r.customer_name || '·').trim().charAt(0).toUpperCase() || '·');
  return `
  <article class="rev-card reveal" style="--d:${(i % 6) * 70}ms">
    <div class="rev-card__head">
      <span class="rev-card__avatar">${initial}</span>
      <div>
        <b>${esc(r.customer_name)}</b>
        <span class="rev-card__stars" aria-label="${esc(t('rv.stars', { n: r.rating }))}">${starsHTML(r.rating)}</span>
      </div>
      <time>${esc(prettyDate(r.created_at))}</time>
    </div>
    <p class="rev-card__text">“${esc(r.text)}”</p>
  </article>`;
}

async function render() {
  const grid = els.grid;
  try {
    const rows = await getReviews(9);
    grid.innerHTML = rows.length
      ? rows.map(cardHTML).join('')
      : `<div class="menu__empty">
           <svg class="icon"><use href="#i-star-o"/></svg>
           <p>${esc(t('rv.empty'))}</p>
         </div>`;
  } catch {
    grid.innerHTML = '';
  }
}

/* ---------- rating picker ---------- */
function paintStars() {
  els.stars.querySelectorAll('button').forEach((b) => {
    const on = Number(b.dataset.val) <= rating;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(Number(b.dataset.val) === rating));
  });
}

/* ---------- submit ---------- */
function setLoading(on) {
  sending = on;
  els.submit.disabled = on;
  els.submit.innerHTML = on
    ? t('rv.publishing')
    : `<span data-i18n="rv.submit">${t('rv.submit')}</span> <svg class="icon"><use href="#i-star"/></svg>`;
}

function validateReview() {
  const name = els.name.value.trim().replace(/\s+/g, ' ');
  const text = els.text.value.trim();
  if (name.length < 2) return t('val.rvName');
  if (!(rating >= 1 && rating <= 5)) return t('val.rvRating');
  if (text.length < 4) return t('val.rvText');
  return '';
}

async function submit(e) {
  e.preventDefault();
  if (sending) return;

  const problem = validateReview();
  els.error.textContent = problem;
  if (problem) return;

  setLoading(true);
  try {
    await submitReview({
      name: els.name.value,
      rating,
      text: els.text.value,
    });
    closeLayer(els.modal);
    toast(t('rv.success'));
    els.name.value = '';
    els.text.value = '';
    rating = 0;
    paintStars();
  } catch (err) {
    els.error.textContent = err.message || t('rv.failed');
  } finally {
    setLoading(false);
  }
}

export function initReviews() {
  els = {
    grid: $('reviewsGrid'),
    modal: $('reviewModal'),
    stars: $('rwStars'),
    form: $('rwForm'),
    name: $('rwName'),
    text: $('rwText'),
    error: $('rwError'),
    submit: $('rwSubmit'),
  };
  if (!els.grid) return;

  render();

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-review]')) {
      e.preventDefault();
      els.error.textContent = '';
      openLayer(els.modal);
      setTimeout(() => els.name.focus(), 420);
    }
  });

  els.stars.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-val]');
    if (!b) return;
    rating = Number(b.dataset.val);
    paintStars();
  });

  els.form.addEventListener('submit', submit);

  document.addEventListener('lang:changed', render);
}
