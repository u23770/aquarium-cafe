// ============================================================
//  Aquarium Cafe & Resturant — Admin · Reviews Moderation
//  Website reviews arrive UNPUBLISHED (approved = false) —
//  approve the good ones, delete the noise. Only approved
//  reviews show on the customer website.
// ============================================================
import { getReviews, setReviewApproved, deleteReview } from './api.js';
import { esc, toast, confirmDialog } from './ui.js';
import { t, getLang } from '../shared/i18n.js';

let reviews = [];

const fmtDate = (s) =>
  new Date(String(s)).toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const stars = (n) => Array.from({ length: 5 }, (_, i) =>
  `<svg class="icon star ${i < n ? 'on' : ''}"><use href="#i-star-o"/></svg>`).join('');

const sourceLabel = (s) =>
  ({ website: t('rv2.srcWebsite'), demo: t('rv2.srcDemo'), google: t('rv2.srcGoogle'), manual: t('rv2.srcManual') })[s] || s;

function card(r, i) {
  const pendingBar = !r.approved
    ? `<button class="btn btn--primary btn--sm" data-approve="${r.id}">
         <svg class="icon"><use href="#i-check"/></svg> ${esc(t('rv2.approve'))}
       </button>`
    : `<button class="btn btn--ghost btn--sm" data-unapprove="${r.id}">
         <svg class="icon"><use href="#i-x"/></svg> ${esc(t('rv2.unpublish'))}
       </button>`;
  return `
    <article class="rev-card ${r.approved ? '' : 'is-pending'}" style="--d:${Math.min(i, 10) * 40}ms">
      <div class="rev-card__head">
        <span class="rev-card__ava">${esc(r.customer_name.trim().charAt(0).toUpperCase() || '؟')}</span>
        <div class="rev-card__who">
          <b>${esc(r.customer_name)}</b>
          <span class="rev-card__meta">${esc(sourceLabel(r.source))} · ${fmtDate(r.created_at)}</span>
        </div>
        <span class="rev-card__stars" title="${r.rating}/5">${stars(r.rating)}</span>
      </div>
      <p class="rev-card__text">“${esc(r.text)}”</p>
      <div class="rev-card__acts">
        ${pendingBar}
        <button class="btn btn--ghost btn--sm rev-del" data-del="${r.id}">
          <svg class="icon"><use href="#i-trash"/></svg> ${esc(t('rv2.delete'))}
        </button>
      </div>
    </article>`;
}

function paint() {
  const pending = reviews.filter((r) => !r.approved);
  const live = reviews.filter((r) => r.approved);
  const avg = live.length ? (live.reduce((s, r) => s + r.rating, 0) / live.length).toFixed(1) : '—';

  document.getElementById('revStats').innerHTML = `
    <div class="stat-card" style="--sc:#d98e2b"><span class="stat-card__icon"><svg class="icon"><use href="#i-warn"/></svg></span>
      <strong>${pending.length}</strong><span>${esc(t('rv2.stPending'))}</span><small>${esc(t('rv2.stPendingSub'))}</small></div>
    <div class="stat-card" style="--sc:#2e9c6f"><span class="stat-card__icon"><svg class="icon"><use href="#i-check"/></svg></span>
      <strong>${live.length}</strong><span>${esc(t('rv2.stLive'))}</span><small>${esc(t('rv2.stLiveSub'))}</small></div>
    <div class="stat-card" style="--sc:#0d7d9e"><span class="stat-card__icon"><svg class="icon"><use href="#i-star-o"/></svg></span>
      <strong>${avg}</strong><span>${esc(t('rv2.stAvg'))}</span><small>${esc(t('rv2.stAvgSub'))}</small></div>`;

  document.getElementById('revPending').innerHTML = pending.length
    ? pending.map(card).join('')
    : `<p class="empty-mini">${esc(t('rv2.inboxZero'))}</p>`;
  document.getElementById('revLive').innerHTML = live.length
    ? live.map(card).join('')
    : `<p class="empty-mini">${esc(t('rv2.noLive'))}</p>`;
}

/* ---------- main ---------- */
export async function renderReviews(view) {
  view.innerHTML = `<div class="skel-rows">${'<div class="skel-row"></div>'.repeat(3)}</div>`;
  reviews = await getReviews();

  const shell = document.createElement('div');
  shell.innerHTML = `
    <div class="stat-grid stat-grid--3" id="revStats"></div>

    <div class="panel">
      <div class="panel__head"><h2>${esc(t('rv2.pendingHd'))}</h2><small>${esc(t('rv2.pendingSub'))}</small></div>
      <div class="rev-list" id="revPending"></div>
    </div>

    <div class="panel">
      <div class="panel__head"><h2>${esc(t('rv2.liveHd'))}</h2><small>${esc(t('rv2.liveSub'))}</small></div>
      <div class="rev-list" id="revLive"></div>
    </div>

    <p class="toolbar-note">
      <svg class="icon"><use href="#i-star-o"/></svg>
      <span>${esc(t('rv2.note'))}</span>
    </p>`;
  view.innerHTML = '';
  view.appendChild(shell);
  paint();

  view.addEventListener('click', async (e) => {
    const approve = e.target.closest('[data-approve]');
    const unapprove = e.target.closest('[data-unapprove]');
    const del = e.target.closest('[data-del]');

    if (approve || unapprove) {
      const btn = approve || unapprove;
      const id = Number(approve ? btn.dataset.approve : btn.dataset.unapprove);
      const r = reviews.find((x) => x.id === id);
      try {
        await setReviewApproved(id, !!approve);
        if (r) r.approved = !!approve;
        paint();
        toast(approve ? t('rv2.live', { name: r?.customer_name ?? t('rv2.guest') }) : t('rv2.unpublished'));
      } catch (err) { toast(err.message, 'error'); }
    }

    if (del) {
      const r = reviews.find((x) => x.id === Number(del.dataset.del));
      const snippet = `“${(r?.text ?? '').slice(0, 80)}${(r?.text ?? '').length > 80 ? '…' : ''}”`;
      const ok = await confirmDialog({
        title: t('rv2.delTitle'),
        text: `${snippet} ${t('rv2.cannotUndo')}`,
        yes: t('rv2.delYes'),
      });
      if (!ok) return;
      try {
        await deleteReview(r.id);
        reviews = reviews.filter((x) => x.id !== r.id);
        paint();
        toast(t('rv2.deleted'));
      } catch (err) { toast(err.message, 'error'); }
    }
  });
}
