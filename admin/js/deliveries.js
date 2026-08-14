// ============================================================
//  Aquarium Cafe & Resturant — Admin · Deliveries Monitor (v5)
//  Read-only live monitor of every delivery order: zone &
//  sub zone, captain (permanent or temporary), payment,
//  discounts & loyalty movement, totals, status & age.
//  Statuses themselves advance on the Waiter dispatch board.
// ============================================================
import { getDeliveries, subscribeDeliveries } from './api.js';
import { $, esc, toast, money } from './ui.js';
import { t, pickLang } from '../../shared/i18n.js';

const ORDER = ['Received', 'Accepted', 'Preparing', 'Ready', 'Out for Delivery'];
const isDone = (s) => s === 'Delivered' || s === 'Cancelled';

let orders = [];
let filter = 'all';
let query = '';
let channel = null;
let reloadTimer = null;

const shortRef = (id) => '#' + String(id).slice(0, 4).toUpperCase();

const ago = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return t('dm.now');
  if (mins < 60) return t('dm.mins', { n: mins });
  const h = Math.floor(mins / 60);
  return t('dm.hours', { n: h });
};

const statusLabel = (s) => { const k = 'status.' + s; const v = t(k); return v === k ? s : v; };
const payLabel = (m) => t(m === 'card_on_delivery' ? 'dm.card' : 'dm.cash');

const zoneName = (o) => {
  const z = o.delivery_zones, s = o.delivery_subzones;
  const zp = z ? pickLang({ name_en: z.name_en, name: z.name_en, name_ar: z.name_ar }, 'name') : null;
  const sp = s ? pickLang({ name_en: s.name_en, name: s.name_en, name_ar: s.name_ar }, 'name') : null;
  if (zp && sp) return `${zp} · ${sp}`;
  return zp || null;
};

const driverInfo = (o) => {
  if (o.temp_driver_name) return { name: o.temp_driver_name, phone: o.temp_driver_phone, temp: true };
  if (o.drivers?.name) return { name: o.drivers.name, phone: o.drivers.phone, temp: false };
  return null;
};

/* ═══════════════════ render ═══════════════════ */
export async function renderDeliveries(view) {
  view.innerHTML = `
    <div class="stat-grid stat-grid--4" id="dStats"></div>

    <div class="panel">
      <div class="panel__head">
        <h2><svg class="icon"><use href="#i-scooter"/></svg> ${esc(t('dm.monitor'))}</h2>
        <small>${esc(t('dm.monitorSub'))}</small>
      </div>
      <div class="toolbar toolbar--inpanel">
        <label class="searchbox searchbox--sm">
          <svg class="icon"><use href="#i-search"/></svg>
          <input id="dSearch" type="search" placeholder="${esc(t('dm.searchPh'))}" autocomplete="off">
        </label>
        <div class="chips" id="dChips">
          <button class="chip is-active" data-f="all">${esc(t('dm.f.all'))}</button>
          <button class="chip" data-f="active">${esc(t('dm.f.active'))}</button>
          <button class="chip" data-f="done">${esc(t('dm.f.done'))}</button>
        </div>
        <span class="toolbar__spacer"></span>
        <button class="icon-btn" id="dReload" title="${esc(t('dm.reload'))}" aria-label="${esc(t('dm.reload'))}">
          <svg class="icon"><use href="#i-refresh"/></svg>
        </button>
      </div>
      <div class="dmon-wrap">
        <table class="dmon">
          <thead>
            <tr>
              <th>${esc(t('dm.th.order'))}</th>
              <th>${esc(t('dm.th.customer'))}</th>
              <th>${esc(t('dm.th.destination'))}</th>
              <th>${esc(t('dm.th.captain'))}</th>
              <th>${esc(t('dm.th.pay'))}</th>
              <th>${esc(t('dm.th.total'))}</th>
              <th>${esc(t('dm.th.status'))}</th>
              <th>${esc(t('dm.th.age'))}</th>
            </tr>
          </thead>
          <tbody id="dBody">
            <tr><td colspan="8"><div class="skel-rows">${'<div class="skel-row"></div>'.repeat(3)}</div></td></tr>
          </tbody>
        </table>
      </div>
    </div>`;

  $('dSearch').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); paint(); });
  $('dChips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    filter = c.dataset.f;
    $('dChips').querySelectorAll('.chip').forEach((x) => x.classList.toggle('is-active', x === c));
    paint();
  });
  $('dReload').addEventListener('click', () => load(true));

  // live refresh (debounced to avoid paint storms)
  if (channel) { try { channel.unsubscribe(); } catch {} channel = null; }
  if (typeof subscribeDeliveries === 'function') {
    channel = subscribeDeliveries(() => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => load(false), 800);
    });
  }

  await load(false);
  view.addEventListener('click', onOrderClick);
}

async function load(notify) {
  try {
    orders = await getDeliveries(200);
    paintStats();
    paint();
    if (notify) toast(t('dm.reloaded'));
  } catch (err) {
    $('dBody').innerHTML = `<tr><td colspan="8"><div class="err-box"><svg class="icon"><use href="#i-warn"/></svg><p>${esc(err.message)}</p></div></td></tr>`;
  }
}

/* ═══════════════════ stats ═══════════════════ */
function paintStats() {
  const today = new Date();
  const isToday = (iso) => {
    const d = new Date(iso);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  };
  const act = orders.filter((o) => !isDone(o.status)).length;
  const doneToday = orders.filter((o) => o.status === 'Delivered' && isToday(o.created_at)).length;
  const revenue = orders
    .filter((o) => o.status === 'Delivered' && isToday(o.created_at))
    .reduce((s, o) => s + (+o.total || 0), 0);
  const members = orders.filter((o) => o.user_id).length;

  $('dStats').innerHTML = `
    <div class="stat-card" style="--sc:#0d7d9e"><span class="stat-card__icon"><svg class="icon"><use href="#i-scooter"/></svg></span>
      <strong>${orders.length}</strong><span>${esc(t('dm.loaded'))}</span><small>${esc(t('dm.loadedSub'))}</small></div>
    <div class="stat-card" style="--sc:${act ? '#c2544a' : '#7d93a0'}"><span class="stat-card__icon"><svg class="icon"><use href="#i-bell"/></svg></span>
      <strong>${act}</strong><span>${esc(t('dm.active'))}</span><small>${esc(t('dm.activeSub'))}</small></div>
    <div class="stat-card" style="--sc:#2e9c6f"><span class="stat-card__icon"><svg class="icon"><use href="#i-check"/></svg></span>
      <strong>${doneToday}</strong><span>${esc(t('dm.doneToday'))}</span><small>${esc(t('dm.doneTodaySub'))}</small></div>
    <div class="stat-card" style="--sc:#8a6244"><span class="stat-card__icon"><svg class="icon"><use href="#i-cash"/></svg></span>
      <strong>${money(revenue)}</strong><span>${esc(t('dm.revenueToday'))}</span><small>${esc(t('dm.revenueTodaySub'))}</small></div>`;
}

/* ═══════════════════ table ═══════════════════ */
const match = (o) => {
  if (filter === 'active' && isDone(o.status)) return false;
  if (filter === 'done' && !isDone(o.status)) return false;
  if (!query) return true;
  const hay = [o.customer_name, o.customer_phone, o.address, zoneName(o), o.delivery_note, o.status, o.coupon_code]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.includes(query);
};

function paint() {
  const body = $('dBody');
  if (!body) return;
  const rows = orders.filter(match);
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8"><p class="empty-mini">${esc(t('dm.noResults'))}</p></td></tr>`;
    return;
  }
  body.innerHTML = rows.map((o) => {
    const drv = driverInfo(o);
    const zone = zoneName(o);
    const bits = [];
    if (+o.discount_amount > 0)
      bits.push(`<small class="dmon-discount">${esc(t('dm.discountLine', { v: money(o.discount_amount) }))}${o.discount_label ? ` · ${esc(o.discount_label)}` : ''}</small>`);
    if (+o.loyalty_redeemed > 0)
      bits.push(`<small class="dmon-points">${esc(t('dm.pointsLine', { n: o.loyalty_redeemed }))}</small>`);
    return `
    <tr data-oid="${o.id}" class="dmon-row">
      <td><span class="rid">${shortRef(o.id)}</span>${o.user_id ? `<span class="dmon-member" title="${esc(t('dm.member'))}"><svg class="icon"><use href="#i-users"/></svg></span>` : ''}</td>
      <td>
        <b>${esc(o.customer_name)}</b>
        <small class="dmon-phone">${esc(o.customer_phone)}</small>
        ${o.delivery_note ? `<small class="dmon-note">“${esc(o.delivery_note)}”</small>` : ''}
      </td>
      <td>
        ${zone ? `<span class="dmon-zone"><svg class="icon"><use href="#i-pin"/></svg>${esc(zone)}</span>` : ''}
        <small class="dmon-addr">${esc(o.address || '—')}</small>
      </td>
      <td>
        ${drv
          ? `<b>${esc(drv.name)}</b>${drv.temp ? `<span class="p-badge is-temp">${esc(t('dm.temp'))}</span>` : ''}<small class="dmon-phone">${esc(drv.phone || '')}</small>`
          : `<span class="dmon-none">—</span>`}
      </td>
      <td><span class="dmon-pay"><svg class="icon"><use href="#i-cash"/></svg>${esc(payLabel(o.payment_method))}</span></td>
      <td>
        <b>${money(o.total)}</b>
        <small class="dmon-fee">${esc(t('dm.feeLine', { v: money(o.delivery_fee) }))}</small>
        ${bits.join('')}
      </td>
      <td><span class="ro-status ${esc(o.status)}">${esc(statusLabel(o.status))}</span></td>
      <td><small class="dmon-age">${ago(o.created_at)}</small></td>
    </tr>`;
  }).join('');
}

/* ═══════════════════ detail sheet (items etc.) ═══════════════════ */
function onOrderClick(e) {
  const tr = e.target.closest('.dmon-row');
  if (!tr) return;
  const next = tr.nextElementSibling;
  if (next?.classList.contains('dmon-detail')) {
    next.remove();
    tr.classList.remove('is-open');
    return;
  }
  document.querySelectorAll('.dmon-detail').forEach((x) => x.remove());
  document.querySelectorAll('.dmon-row.is-open').forEach((x) => x.classList.remove('is-open'));

  const o = orders.find((x) => String(x.id) === tr.dataset.oid);
  if (!o) return;
  tr.classList.add('is-open');

  const items = Array.isArray(o.items) ? o.items : [];
  const detail = document.createElement('tr');
  detail.className = 'dmon-detail';
  detail.innerHTML = `
    <td colspan="8">
      <div class="dmon-detail__grid">
        <div>
          <h4>${esc(t('dm.items'))}</h4>
          <ul class="dmon-items">
            ${items.map((it) => `
              <li>
                <span class="dmon-items__qty">×${it.quantity}</span>
                <span>${esc(it.name)}${it.name_ar ? ` <i dir="rtl">${esc(it.name_ar)}</i>` : ''}</span>
                <b>${money(it.lineTotal)}</b>
              </li>`).join('') || `<li>${esc(t('dm.noItems'))}</li>`}
          </ul>
        </div>
        <div>
          <h4>${esc(t('dm.summary'))}</h4>
          <p class="dmon-sum"><span>${esc(t('dm.subtotal'))}</span><b>${money(o.subtotal)}</b></p>
          ${+o.discount_amount > 0 ? `<p class="dmon-sum is-discount"><span>${esc(o.discount_label || t('dm.discount'))}${o.coupon_code ? ` (${esc(o.coupon_code)})` : ''}</span><b>− ${money(o.discount_amount)}</b></p>` : ''}
          ${+o.loyalty_redeemed > 0 ? `<p class="dmon-sum is-discount"><span>${esc(t('dm.pointsRedeemed', { n: o.loyalty_redeemed }))}</span></p>` : ''}
          <p class="dmon-sum"><span>${esc(t('dm.fee'))}</span><b>${money(o.delivery_fee)}</b></p>
          <p class="dmon-sum dmon-sum--total"><span>${esc(t('dm.total'))}</span><b>${money(o.total)}</b></p>
          <p class="dmon-sum"><span>${esc(t('dm.eta'))}</span><b>${o.estimated_minutes ?? 45} ${esc(t('dm.minUnit'))}</b></p>
          ${+o.loyalty_earned > 0 ? `<p class="dmon-sum"><span>${esc(t('dm.earnedOnDelivery'))}</span><b>+${o.loyalty_earned}</b></p>` : ''}
          ${o.notes ? `<p class="dmon-custnote">“${esc(o.notes)}”</p>` : ''}
          ${o.maps_link ? `<a class="btn btn--ghost btn--sm" href="${esc(o.maps_link)}" target="_blank" rel="noopener"><svg class="icon"><use href="#i-pin"/></svg> ${esc(t('dm.maps'))}</a>` : ''}
        </div>
      </div>
    </td>`;
  tr.after(detail);
}
