// ============================================================
//  Aquarium Cafe & Restaurant — Waiter · Print Order (v5.2)
//  ------------------------------------------------------------
//  Builds a clean, authoritative print sheet for one delivery
//  order and sends it to the browser print dialog. Only ever
//  reads values already loaded from Supabase (mapDelivery() in
//  api.js) — no pricing/total is ever recomputed here.
//
//  Google Maps QR: generated ONLY when the order has a saved
//  o.mapsLink (delivery_orders.maps_link — set exclusively by
//  the customer's Google-Maps location picker at checkout).
//  A manually typed address never has this field populated, so
//  it is never geocoded/guessed — we just print the address text.
//
//  QR is produced fully client-side with the tiny, dependency-
//  free `qrcode-generator` library (loaded in waiter/index.html).
//  If it isn't available or throws, printing still proceeds —
//  the QR block is simply omitted (see FEATURE 9 / TEST 15).
// ============================================================
import { esc, money, moneyEgp, exactTime } from './ui.js';
import { t, pickLang, isRTL } from '../shared/i18n.js';

const $ = (id) => document.getElementById(id);
const RESTAURANT_NAME = 'Aquarium Cafe & Restaurant';
const LOGO_SRC = '../customer/images/logo.svg';

/* ---------- QR: exact saved Maps URL only, never generated/guessed ---------- */
function buildMapsQrHTML(mapsLink) {
  if (!mapsLink) return ''; // CASE B — manual address, no QR (see module header)
  try {
    if (typeof window.qrcode !== 'function') return '';
    const qr = window.qrcode(0, 'M'); // type 0 = auto-size, M = medium error correction
    qr.addData(mapsLink);
    qr.make();
    const tag = qr.createSvgTag({ scalable: true });
    return `
      <div class="ps-qr">
        <div class="ps-qr__code">${tag}</div>
        <div class="ps-qr__label">${esc(t('print.scanLocation'))}</div>
      </div>`;
  } catch {
    return ''; // QR generation failed — print continues without it (FEATURE 9)
  }
}

/* ---------- items table (authoritative snapshot stored on the order) ---------- */
function itemsRowsHTML(items) {
  return (Array.isArray(items) ? items : [])
    .map((it) => `
      <tr>
        <td class="ps-it__name">${esc(pickLang(it, 'name'))}</td>
        <td class="ps-it__qty">${esc(it.quantity)}</td>
        <td class="ps-it__price">${money(it.price)}</td>
        <td class="ps-it__line">${money(it.lineTotal)}</td>
      </tr>`)
    .join('');
}

/* ---------- driver block ---------- */
function driverHTML(o) {
  const name = o.driverName || o.tempDriverName || '';
  const phone = o.driverPhone || o.tempDriverPhone || '';
  if (!name) {
    return `<div class="ps-row"><span>${esc(t('print.driver'))}</span><b>${esc(t('print.notAssigned'))}</b></div>`;
  }
  return `
    <div class="ps-row"><span>${esc(t('print.driver'))}</span><b>${esc(name)}</b></div>
    ${phone ? `<div class="ps-row"><span>${esc(t('print.driverPhone'))}</span><b>${esc(phone)}</b></div>` : ''}`;
}

/* ---------- build the full sheet markup for one order ---------- */
function sheetHTML(o) {
  const zoneName = o.zone ? pickLang(o.zone, 'name_en') : '';
  const subZoneName = o.subZone ? pickLang(o.subZone, 'name_en') : '';
  const discountRow = o.discountAmount > 0
    ? `<div class="ps-row"><span>${esc(t('print.discount'))}${o.discountLabel ? ' · ' + esc(o.discountLabel) : ''}${o.couponCode ? ` (${esc(o.couponCode)})` : ''}</span><b>−${money(o.discountAmount)}</b></div>`
    : '';
  const loyaltyRow = o.loyaltyRedeemed > 0
    ? `<div class="ps-row"><span>${esc(t('print.pointsUsed'))}</span><b>${esc(o.loyaltyRedeemed)}</b></div>`
    : '';

  return `
    <div class="ps-head">
      <img class="ps-logo" src="${LOGO_SRC}" alt="" onerror="this.remove()" />
      <div class="ps-head__text">
        <div class="ps-brand">${esc(RESTAURANT_NAME)}</div>
        <div class="ps-sub">${esc(t('print.title'))}</div>
      </div>
    </div>

    <div class="ps-meta">
      <div class="ps-row"><span>${esc(t('print.orderNo'))}</span><b>${esc(o.short)}</b></div>
      <div class="ps-row"><span>${esc(t('print.orderId'))}</span><b class="ps-mono">${esc(o.id)}</b></div>
      <div class="ps-row"><span>${esc(t('print.date'))}</span><b>${esc(exactTime(o.createdAt))}</b></div>
      <div class="ps-row"><span>${esc(t('print.status'))}</span><b>${esc(t('print.status.' + o.status) === 'print.status.' + o.status ? o.status : t('print.status.' + o.status))}</b></div>
    </div>

    <div class="ps-section">
      <h4>${esc(t('print.customer'))}</h4>
      <div class="ps-row"><span>${esc(t('print.name'))}</span><b>${esc(o.customerName)}</b></div>
      <div class="ps-row"><span>${esc(t('print.phone'))}</span><b>${esc(o.customerPhone)}</b></div>
    </div>

    <div class="ps-section">
      <h4>${esc(t('print.delivery'))}</h4>
      ${zoneName ? `<div class="ps-row"><span>${esc(t('print.zone'))}</span><b>${esc(zoneName)}${subZoneName ? ' · ' + esc(subZoneName) : ''}</b></div>` : ''}
      <div class="ps-row ps-row--block"><span>${esc(t('print.address'))}</span><b>${esc(o.address)}</b></div>
      ${o.addressDetail ? `<div class="ps-row ps-row--block"><span>${esc(t('print.addressDetail'))}</span><b>${esc(o.addressDetail)}</b></div>` : ''}
      ${o.deliveryNote ? `<div class="ps-row ps-row--block"><span>${esc(t('print.instructions'))}</span><b>${esc(o.deliveryNote)}</b></div>` : ''}
      ${o.notes ? `<div class="ps-row ps-row--block"><span>${esc(t('print.customerNotes'))}</span><b>${esc(o.notes)}</b></div>` : ''}
      ${buildMapsQrHTML(o.mapsLink)}
    </div>

    <div class="ps-section">
      <h4>${esc(t('print.items'))}</h4>
      <table class="ps-items">
        <thead>
          <tr>
            <th>${esc(t('print.item'))}</th>
            <th>${esc(t('print.qty'))}</th>
            <th>${esc(t('print.unitPrice'))}</th>
            <th>${esc(t('print.lineTotal'))}</th>
          </tr>
        </thead>
        <tbody>${itemsRowsHTML(o.items)}</tbody>
      </table>
    </div>

    <div class="ps-section ps-totals">
      <div class="ps-row"><span>${esc(t('print.subtotal'))}</span><b>${money(o.subtotal)}</b></div>
      ${discountRow}
      ${loyaltyRow}
      <div class="ps-row"><span>${esc(t('print.deliveryFee'))}</span><b>${+o.deliveryFee > 0 ? money(o.deliveryFee) : esc(t('card.free'))}</b></div>
      <div class="ps-row"><span>${esc(t('print.vat'))}</span><b>${money(o.vatAmount)}</b></div>
      <div class="ps-row ps-row--total"><span>${esc(t('print.total'))}</span><b>${moneyEgp(o.total)}</b></div>
    </div>

    <div class="ps-section">
      <h4>${esc(t('print.payment'))}</h4>
      <div class="ps-row"><span>${esc(t('print.method'))}</span><b>${esc(t('pay.' + o.paymentMethod) === 'pay.' + o.paymentMethod ? o.paymentMethod : t('pay.' + o.paymentMethod))}</b></div>
    </div>

    <div class="ps-section">
      <h4>${esc(t('print.driverSection'))}</h4>
      ${driverHTML(o)}
    </div>

    <div class="ps-foot">${esc(t('print.footer'))}</div>`;
}

/* ---------- print one order — the only exported entry point ---------- */
export function printDeliveryOrder(o) {
  if (!o) return false;
  let sheet = $('printSheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'printSheet';
    document.body.appendChild(sheet);
  }
  sheet.setAttribute('dir', isRTL() ? 'rtl' : 'ltr');
  sheet.innerHTML = sheetHTML(o);
  requestAnimationFrame(() => window.print());
  return true;
}
