// ============================================================
//  Aquarium Cafe & Resturant — Waiter · Delivery Dispatch (v5)
//  Kanban: Received → Accepted → Preparing → Ready →
//          Out for Delivery → (Delivered / Cancelled = "Done")
//  Ready-for-delivery dispatch offers a SAVED driver OR a
//  TEMPORARY one (name + phone stored on this order only —
//  the customer can call him, he's never saved as a driver).
//  Cards show zone/sub-zone, discounts & loyalty-usage chips,
//  member badge, everything in both languages (instant EN⇄AR).
//  All moves run through advance_delivery() in Postgres.
// ============================================================
import { getDeliveryOrders, advanceDelivery, getDrivers } from './api.js';
import { esc, money, moneyEgp, relTime, exactTime, parseDate, toast, ding } from './ui.js';
import { t, pickLang } from '../shared/i18n.js';

const $ = (id) => document.getElementById(id);

const COLS = ['Received', 'Accepted', 'Preparing', 'Ready', 'Out for Delivery', 'Finished'];
const FINISHED_CAP = 20;

const NEXT = {
  Received: 'Accepted',
  Accepted: 'Preparing',
  Preparing: 'Ready',
  'Out for Delivery': 'Delivered',
};
const NEXT_KEY = {
  Received: 'act.Accept',
  Accepted: 'act.Start Preparing',
  Preparing: 'act.Mark Ready',
  'Out for Delivery': 'act.Mark Delivered',
};
const CANCELLABLE = new Set(['Received', 'Accepted', 'Preparing', 'Ready', 'Out for Delivery']);

/* status → css accent key */
const KEY = {
  Received: 'ds-Received',
  Accepted: 'ds-Accepted',
  Preparing: 'ds-Preparing',
  Ready: 'ds-Ready',
  'Out for Delivery': 'ds-Out',
  Delivered: 'ds-Delivered',
  Cancelled: 'ds-Cancelled',
};

let orders = [];
let drivers = [];
let busy = new Set();          // order ids with a pending RPC
let wired = false;
let firstLoad = true;
let lastSignature = '';

const signatureOf = (list) =>
  list
    .map((o) => `${o.id}:${o.status}:${o.driverId ?? ''}:${o.tempDriverName}:${o.estimatedMinutes ?? ''}`)
    .join('|');

/* ---------- one delivery card ---------- */
function cardHTML(o, i) {
  const k = KEY[o.status] || 'ds-Delivered';
  const items = o.items
    .map(
      (it) => `
      <li>
        <span class="q">${it.quantity}×</span>
        <span class="n">${esc(pickLang(it, 'name'))}</span>
        <span class="p">${money(it.lineTotal)}</span>
      </li>`
    )
    .join('');

  const ageMin = (Date.now() - parseDate(o.createdAt).getTime()) / 60000;
  const early = o.status === 'Received' || o.status === 'Accepted';
  const urgent =
    (early && ageMin >= 20) || (o.status === 'Preparing' && ageMin >= 30) ? ' crit'
    : (early && ageMin >= 10) || (o.status === 'Preparing' && ageMin >= 20) ? ' warn'
    : '';

  const payIcon = o.paymentMethod === 'card_on_delivery' ? 'i-card' : 'i-cash';
  const payText = t('pay.' + o.paymentMethod) === 'pay.' + o.paymentMethod ? o.paymentMethod : t('pay.' + o.paymentMethod);

  /* captain row — permanent driver wins, temporary falls back */
  const captain = o.driverName
    ? { name: o.driverName, phone: o.driverPhone, temp: false }
    : o.tempDriverName
      ? { name: o.tempDriverName, phone: o.tempDriverPhone, temp: true }
      : null;
  const driverRow = captain
    ? `<div class="d-card__driver">
         <svg class="icon"><use href="#i-scooter"/></svg>
         <span class="n">${esc(captain.name)}</span>
         ${captain.temp ? `<span class="d-temp">${esc(t('card.temp'))}</span>` : ''}
         ${captain.phone ? `<a class="d-call" href="tel:${esc(captain.phone.replace(/[^\d+]/g, ''))}" title="${esc(t('card.callDriver'))}"><svg class="icon"><use href="#i-phone"/></svg></a>` : ''}
       </div>`
    : '';

  /* zone chip (bilingual names from the joined zone rows) */
  const zoneChip = o.zone
    ? `<span class="d-chip d-chip--zone"><svg class="icon"><use href="#i-pin"/></svg>
        ${esc(pickLang(o.zone, 'name_en'))}${o.subZone ? ' · ' + esc(pickLang(o.subZone, 'name_en')) : ''}</span>`
    : '';

  const next = NEXT[o.status];
  const isBusy = busy.has(o.id);

  let actions = '';
  if (o.status === 'Ready') {
    // dispatch panel: saved driver ⇆ temporary driver, ETA, customer note
    const opts = drivers
      .map((d) => `<option value="${d.id}" ${d.id === o.driverId ? 'selected' : ''}>${esc(d.name)} · ${esc(d.phone)}</option>`)
      .join('');
    actions = `
      <div class="d-dispatch" data-dispatch="${o.id}" data-tmode="permanent">
        <div class="d-modes" role="tablist">
          <button type="button" class="d-mode is-active" data-tmode-btn="permanent" ${isBusy ? 'disabled' : ''}>
            <svg class="icon"><use href="#i-scooter"/></svg> ${esc(t('dsp.permanent'))}
          </button>
          <button type="button" class="d-mode" data-tmode-btn="temporary" ${isBusy ? 'disabled' : ''}>
            <svg class="icon"><use href="#i-clock"/></svg> ${esc(t('dsp.temp'))}
          </button>
        </div>
        <label class="d-field" data-tpane="permanent">
          <span><svg class="icon"><use href="#i-scooter"/></svg> ${esc(t('dsp.driver'))}</span>
          <select class="d-select" data-driver-for="${o.id}" ${isBusy ? 'disabled' : ''}>
            <option value="">${esc(t('dsp.choose'))}</option>${opts}
          </select>
        </label>
        <div data-tpane="temporary" hidden>
          <div class="d-dispatch__row">
            <label class="d-field">
              <span>${esc(t('dsp.tempName'))}</span>
              <input class="d-input" type="text" maxlength="60" placeholder="${esc(t('dsp.tempNamePh'))}"
                     value="${esc(o.tempDriverName)}" data-tempname-for="${o.id}" ${isBusy ? 'disabled' : ''} />
            </label>
            <label class="d-field">
              <span>${esc(t('dsp.tempPhone'))}</span>
              <input class="d-input" type="tel" maxlength="20" placeholder="${esc(t('dsp.tempPhonePh'))}"
                     value="${esc(o.tempDriverPhone)}" data-tempphone-for="${o.id}" ${isBusy ? 'disabled' : ''} />
            </label>
          </div>
          <p class="d-temphint">${esc(t('dsp.tempHint'))}</p>
        </div>
        <div class="d-dispatch__row">
          <label class="d-field d-field--eta">
            <span><svg class="icon"><use href="#i-clock"/></svg> ${esc(t('dsp.eta'))}</span>
            <input class="d-input" type="number" min="5" max="240" step="5"
                   value="${o.estimatedMinutes ?? 45}" data-eta-for="${o.id}" ${isBusy ? 'disabled' : ''} />
          </label>
          <label class="d-field d-field--note">
            <span><svg class="icon"><use href="#i-note"/></svg> ${esc(t('dsp.note'))}</span>
            <input class="d-input" type="text" maxlength="300" placeholder="${esc(t('dsp.notePh'))}"
                   value="${esc(o.deliveryNote)}" data-note-for="${o.id}" ${isBusy ? 'disabled' : ''} />
          </label>
        </div>
        <button class="d-act d-act--dispatch ds-Out" data-dv="${o.id}" data-next="Out for Delivery" ${isBusy ? 'disabled' : ''}>
          ${isBusy ? t('act.saving') : `${esc(t('act.dispatch'))} <svg class="icon"><use href="#i-scooter"/></svg>`}
        </button>
      </div>`;
  } else if (next) {
    actions = `
      <button class="d-act d-act--next ${KEY[next] || ''}" data-dv="${o.id}" data-next="${esc(next)}" ${isBusy ? 'disabled' : ''}>
        ${isBusy ? t('act.saving') : `${esc(t(NEXT_KEY[o.status]))} <svg class="icon" data-flip-rtl><use href="#i-arrow"/></svg>`}
      </button>`;
  }

  const cancelBtn = CANCELLABLE.has(o.status)
    ? `<button class="d-act d-act--cancel" data-dv="${o.id}" data-next="Cancelled" ${isBusy ? 'disabled' : ''}>
         <svg class="icon"><use href="#i-ban"/></svg> ${esc(t(o.status === 'Received' ? 'act.reject' : 'act.cancel'))}
       </button>`
    : '';

  const done = o.status === 'Delivered'
    ? `<div class="d-card__done"><svg class="icon"><use href="#i-checks"/></svg> ${esc(t('done.Delivered'))}</div>`
    : o.status === 'Cancelled'
    ? `<div class="d-card__done is-cancelled"><svg class="icon"><use href="#i-ban"/></svg> ${esc(t('done.Cancelled'))}</div>`
    : '';

  /* totals block: discount + points rows appear only when used */
  const discRow = o.discountAmount > 0
    ? `<span class="is-off">${esc(t('card.discount'))}${o.discountLabel ? ` · ${esc(o.discountLabel)}` : ''}${o.couponCode ? ` (${esc(o.couponCode)})` : ''}
        <b>−${money(o.discountAmount)}</b></span>`
    : '';
  const ptsRow = o.loyaltyRedeemed > 0
    ? `<span class="is-off">${esc(t('card.ptsUsed', { n: o.loyaltyRedeemed }))}</span>`
    : '';

  return `
  <article class="d-card ${k}${urgent}${o.status === 'Cancelled' ? ' is-off' : ''}"
           data-id="${o.id}" style="--d:${Math.min(i, 8) * 55}ms">
    <div class="d-card__top">
      <span class="d-card__id" title="${esc(o.id)}">${esc(o.short)}</span>
      <span class="d-card__time" data-ts="${esc(o.createdAt)}" title="${esc(exactTime(o.createdAt))}">
        <svg class="icon"><use href="#i-clock"/></svg><span class="t">${esc(relTime(o.createdAt))}</span>
      </span>
    </div>

    <h3 class="d-card__name">${esc(o.customerName)} ${o.member ? `<span class="d-member">${esc(t('card.member'))}</span>` : ''}</h3>
    <div class="d-card__rows">
      <a class="d-row" href="tel:${esc(o.customerPhone.replace(/[^\d+]/g, ''))}">
        <svg class="icon"><use href="#i-phone"/></svg><span>${esc(o.customerPhone)}</span>
      </a>
      <div class="d-row d-row--addr">
        <svg class="icon"><use href="#i-pin"/></svg><span>${esc(o.address)}</span>
        ${o.mapsLink
          ? `<a class="d-map" href="${esc(o.mapsLink)}" target="_blank" rel="noopener" title="${esc(t('card.mapTitle'))}">${esc(t('card.map'))}</a>`
          : ''}
      </div>
    </div>

    <ul class="d-card__items">${items}</ul>

    <div class="d-card__totals">
      <span>${esc(t('card.subtotal'))} <b>${money(o.subtotal)}</b></span>
      ${discRow}
      ${ptsRow}
      <span>${esc(t('card.fee'))} <b>${+o.deliveryFee > 0 ? money(o.deliveryFee) : esc(t('card.free'))}</b></span>
      <span class="t">${esc(t('card.total'))} <b>${moneyEgp(o.total)}</b></span>
    </div>

    <div class="d-card__meta">
      <span class="d-chip"><svg class="icon"><use href="#${payIcon}"/></svg> ${esc(payText)}</span>
      ${o.estimatedMinutes ? `<span class="d-chip"><svg class="icon"><use href="#i-clock"/></svg> ${esc(t('card.eta', { n: o.estimatedMinutes }))}</span>` : ''}
      ${zoneChip}
    </div>

    ${o.notes ? `<p class="d-card__note"><svg class="icon"><use href="#i-note"/></svg> “${esc(o.notes)}”</p>` : ''}
    ${driverRow}
    ${actions}
    ${cancelBtn}
    ${done}
  </article>`;
}

function skeletonHTML() {
  return Array.from({ length: 2 }, () => `
    <div class="skel-card">
      <div class="skel-line w30"></div>
      <div class="skel-line w55"></div>
      <div class="skel-line w80"></div>
      <div class="skel-line w55"></div>
    </div>`).join('');
}

const emptyHTML = (status) => `
  <div class="col-empty">
    <svg class="icon"><use href="#i-scooter"/></svg>
    <strong>${esc(t('empty.title'))}</strong>
    <small>${esc(t('empty.' + status))}</small>
  </div>`;

/* ---------- render the six columns ---------- */
function render() {
  const byCol = Object.fromEntries(COLS.map((c) => [c, []]));
  for (const o of orders) {
    if (o.status === 'Delivered' || o.status === 'Cancelled') byCol.Finished.push(o);
    else (byCol[o.status] || byCol.Received).push(o);
  }

  for (const col of COLS) {
    let list = byCol[col];
    if (col === 'Finished') {
      list = [...list].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, FINISHED_CAP);
    } else {
      // FIFO — the oldest waiting order sits on top
      list = [...list].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    }
    $(`delcount-${col}`).textContent = list.length;
    $(`dellist-${col}`).innerHTML = list.length ? list.map(cardHTML).join('') : emptyHTML(col);
  }

  const active = orders.filter((o) => !['Delivered', 'Cancelled'].includes(o.status)).length;
  const receivedToday = orders.filter(
    (o) => parseDate(o.createdAt).toDateString() === new Date().toDateString()
  ).length;
  const updated = new Date().toLocaleTimeString(document.documentElement.lang === 'ar' ? 'ar-EG' : 'en-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  $('delvMeta').textContent = t('meta.line', { active, today: receivedToday, t: updated });
}

/* ---------- data ---------- */
export async function refreshDelivery(reason = 'poll') {
  try {
    const needsDrivers = reason !== 'poll' || drivers.length === 0;
    const [{ orders: list }, driversRes] = await Promise.all([
      getDeliveryOrders(),
      needsDrivers ? getDrivers(true) : Promise.resolve(null),
    ]);
    if (driversRes) drivers = driversRes.drivers;

    const sig = signatureOf(list);

    // brand-new arrival → toast + ding
    if (!firstLoad && sig !== lastSignature) {
      const seen = new Set(orders.map((o) => o.id));
      for (const o of list) {
        if (!seen.has(o.id) && o.status === 'Received') {
          toast(t('toast.new', { id: o.short, name: o.customerName, total: moneyEgp(o.total) }));
          ding();
        }
      }
    }

    if (sig !== lastSignature || reason === 'force' || reason === 'realtime') {
      orders = list;
      lastSignature = sig;
      render();
    }
    firstLoad = false;
    return true;
  } catch {
    return false;
  }
}

/* ---------- actions (accept / advance / dispatch / cancel) ---------- */
async function onAction(btn) {
  const id = btn.dataset.dv;
  const next = btn.dataset.next;
  const order = orders.find((o) => o.id === id);
  if (!order || busy.has(id)) return;

  let payload = {};
  if (next === 'Out for Delivery') {
    const panel = document.querySelector(`[data-dispatch="${id}"]`);
    const mode = panel?.dataset.tmode || 'permanent';
    const eta = document.querySelector(`[data-eta-for="${id}"]`);
    const note = document.querySelector(`[data-note-for="${id}"]`);
    const etaVal = Number(eta?.value) || null;
    const noteVal = note?.value?.trim() || '';

    if (mode === 'temporary') {
      const tName = document.querySelector(`[data-tempname-for="${id}"]`)?.value?.trim() || '';
      const tPhone = document.querySelector(`[data-tempphone-for="${id}"]`)?.value?.trim() || '';
      if (tName.length < 2) {
        toast(t('dsp.needTempName'), 'error');
        document.querySelector(`[data-tempname-for="${id}"]`)?.focus();
        return;
      }
      const digits = tPhone.replace(/\D/g, '');
      if (digits.length < 8 || tPhone.length > 20) {
        toast(t('dsp.needTempPhone'), 'error');
        document.querySelector(`[data-tempphone-for="${id}"]`)?.focus();
        return;
      }
      payload = { driverId: null, eta: etaVal, note: noteVal, tempName: tName, tempPhone: tPhone };
    } else {
      const sel = document.querySelector(`[data-driver-for="${id}"]`);
      const driverId = Number(sel?.value) || null;
      if (!driverId) {
        toast(t('dsp.needDriver'), 'error');
        sel?.focus();
        return;
      }
      payload = { driverId, eta: etaVal, note: noteVal, tempName: '', tempPhone: '' };
    }
  }

  if (next === 'Cancelled') {
    const key = order.status === 'Received' ? 'cf.reject' : 'cf.cancel';
    if (!window.confirm(t(key, { id: order.short, name: order.customerName }))) return;
  }

  busy.add(id);
  render();
  try {
    await advanceDelivery(id, next, payload);

    // optimistic local update → the card jumps columns instantly
    const o = orders.find((x) => x.id === id);
    if (o) {
      o.status = next;
      if (payload.driverId) {
        o.driverId = payload.driverId;
        const d = drivers.find((x) => x.id === payload.driverId);
        o.driverName = d?.name ?? o.driverName;
        o.driverPhone = d?.phone ?? o.driverPhone;
        o.tempDriverName = '';
        o.tempDriverPhone = '';
      } else if (payload.tempName) {
        o.driverId = null;
        o.driverName = '';
        o.driverPhone = '';
        o.tempDriverName = payload.tempName;
        o.tempDriverPhone = payload.tempPhone;
      }
      if (payload.eta) o.estimatedMinutes = payload.eta;
      if (payload.note !== undefined && payload.note !== '') o.deliveryNote = payload.note;
    }
    lastSignature = signatureOf(orders);
    render();

    const nice = {
      Accepted: t('toast.accepted', { id: order.short }),
      Preparing: t('toast.preparing', { id: order.short }),
      Ready: t('toast.ready', { id: order.short }),
      'Out for Delivery': t('toast.out', { id: order.short }),
      Delivered: t('toast.delivered', { id: order.short }),
      Cancelled: t('toast.cancelled', { id: order.short }),
    };
    toast(nice[next] || t('toast.moved', { id: order.short, status: next }));
    if (next === 'Out for Delivery') ding();
  } catch (err) {
    toast(err.message, 'error');
    await refreshDelivery('force');  // resync with the truth
  } finally {
    busy.delete(id);
    render();
  }
}

/* ---------- dispatch mode segmented control ---------- */
function onModeSwitch(btn) {
  const panel = btn.closest('[data-dispatch]');
  if (!panel) return;
  const mode = btn.dataset.tmodeBtn;
  panel.dataset.tmode = mode;
  panel.querySelectorAll('[data-tmode-btn]').forEach((b) =>
    b.classList.toggle('is-active', b === btn)
  );
  panel.querySelectorAll('[data-tpane]').forEach((pane) => {
    pane.hidden = pane.dataset.tpane !== mode;
  });
}

/* ---------- wire once ---------- */
export function initDelivery() {
  if (wired) return;
  wired = true;

  $('delvBoard').addEventListener('click', (e) => {
    const modeBtn = e.target.closest('[data-tmode-btn]');
    if (modeBtn) { onModeSwitch(modeBtn); return; }
    const btn = e.target.closest('[data-dv]');
    if (btn) onAction(btn);
  });

  for (const col of COLS) $(`dellist-${col}`).innerHTML = skeletonHTML();

  /* instant language switch → all cards re-render */
  document.addEventListener('lang:changed', render);
}
