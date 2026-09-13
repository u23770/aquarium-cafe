// ============================================================
//  Aquarium Cafe & Restaurant — Waiter · Print Order
//  ------------------------------------------------------------
//  Bilingual A4 delivery-order print sheet:
//    · English on the left
//    · Arabic on the right
//    · Google Maps QR centered horizontally
//  Values are read only from the authoritative order snapshot.
// ============================================================
import { esc, money, moneyEgp, exactTime } from './ui.js';

const $ = (id) => document.getElementById(id);
const RESTAURANT_NAME = 'Aquarium Cafe & Restaurant';
const LOGO_SRC = '../customer/images/logo.svg';

const LABELS = {
  en: {
    receipt: 'Order Receipt', orderNo: 'Order #', orderId: 'Order ID', date: 'Date & time', status: 'Status',
    customer: 'Customer', name: 'Name', phone: 'Phone', delivery: 'Delivery', zone: 'Zone', address: 'Address',
    addressDetail: 'Address details', instructions: 'Delivery instructions', customerNotes: 'Customer notes',
    items: 'Order Items', item: 'Item', qty: 'Qty', unitPrice: 'Unit price', lineTotal: 'Line total',
    subtotal: 'Subtotal', discount: 'Discount', pointsUsed: 'Points redeemed', deliveryFee: 'Delivery fee',
    vat: 'VAT', total: 'Total', payment: 'Payment', method: 'Method', driver: 'Driver', driverPhone: 'Driver phone',
    notAssigned: 'Not assigned', cash: 'Cash on delivery', card: 'Card on delivery', preparing: 'Preparing',
    ready: 'Ready for Delivery', out: 'Out for Delivery', delivered: 'Delivered', cancelled: 'Cancelled',
    free: 'Free'
  },
  ar: {
    receipt: 'إيصال الطلب', orderNo: 'رقم الطلب', orderId: 'معرّف الطلب', date: 'التاريخ والوقت', status: 'الحالة',
    customer: 'العميل', name: 'الاسم', phone: 'الهاتف', delivery: 'التوصيل', zone: 'المنطقة', address: 'العنوان',
    addressDetail: 'تفاصيل العنوان', instructions: 'تعليمات التوصيل', customerNotes: 'ملاحظات العميل',
    items: 'أصناف الطلب', item: 'الصنف', qty: 'الكمية', unitPrice: 'سعر الوحدة', lineTotal: 'إجمالي الصنف',
    subtotal: 'المجموع الفرعي', discount: 'الخصم', pointsUsed: 'النقاط المستخدمة', deliveryFee: 'رسوم التوصيل',
    vat: 'ضريبة القيمة المضافة', total: 'الإجمالي الكلي', payment: 'الدفع', method: 'طريقة الدفع', driver: 'الكابتن',
    driverPhone: 'هاتف الكابتن', notAssigned: 'لسه ما اتحددش', cash: 'الدفع عند الاستلام نقدًا',
    card: 'الدفع عند الاستلام بالبطاقة', preparing: 'قيد التجهيز', ready: 'جاهز للتوصيل', out: 'في الطريق',
    delivered: 'تم التسليم', cancelled: 'ملغي', free: 'مجاني'
  }
};

function statusLabels(status) {
  const map = {
    Preparing: ['Preparing', 'قيد التجهيز'],
    Ready: ['Ready for Delivery', 'جاهز للتوصيل'],
    'Out for Delivery': ['Out for Delivery', 'في الطريق'],
    Delivered: ['Delivered', 'تم التسليم'],
    Cancelled: ['Cancelled', 'ملغي']
  };
  return map[status] || [status || '—', status || '—'];
}

function paymentLabels(method) {
  if (method === 'cash') return [LABELS.en.cash, LABELS.ar.cash];
  if (method === 'card_on_delivery') return [LABELS.en.card, LABELS.ar.card];
  return [method || '—', method || '—'];
}

function buildMapsQrHTML(mapsLink) {
  if (!mapsLink) return '';
  try {
    if (typeof window.qrcode !== 'function') return '';
    const qr = window.qrcode(0, 'M');
    qr.addData(mapsLink);
    qr.make();
    const tag = qr.createSvgTag({ scalable: true });
    return `
      <div class="ps-qr">
        <div class="ps-qr__code">${tag}</div>
        <div class="ps-qr__label">Scan for exact location · امسح للموقع بالضبط</div>
      </div>`;
  } catch {
    return '';
  }
}

function itemRows(items, lang) {
  return (Array.isArray(items) ? items : []).map((it) => {
    const name = lang === 'ar' ? (it.name_ar || it.name || '—') : (it.name || it.name_ar || '—');
    return `
      <tr>
        <td class="ps-item-name">${esc(name)}</td>
        <td class="ps-item-qty">${esc(it.quantity ?? '')}</td>
        <td class="ps-item-price">${money(it.price)}</td>
        <td class="ps-item-line">${money(it.lineTotal)}</td>
      </tr>`;
  }).join('');
}

function driverRows(o, lang) {
  const l = LABELS[lang];
  const name = o.driverName || o.tempDriverName || '';
  const phone = o.driverPhone || o.tempDriverPhone || '';
  if (!name) return `<div class="ps-row"><span>${esc(l.driver)}</span><b>${esc(l.notAssigned)}</b></div>`;
  return `
    <div class="ps-row"><span>${esc(l.driver)}</span><b>${esc(name)}</b></div>
    ${phone ? `<div class="ps-row"><span>${esc(l.driverPhone)}</span><b>${esc(phone)}</b></div>` : ''}`;
}

function sectionHTML(title, body, extra = '') {
  return `<section class="ps-section ${extra}"><h4>${esc(title)}</h4>${body}</section>`;
}

function row(label, value, block = false) {
  if (value == null || String(value).trim() === '') return '';
  return `<div class="ps-row${block ? ' ps-row--block' : ''}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

function languageColumn(o, lang) {
  const l = LABELS[lang];
  const [statusEn, statusAr] = statusLabels(o.status);
  const [payEn, payAr] = paymentLabels(o.paymentMethod);
  const status = lang === 'en' ? statusEn : statusAr;
  const payment = lang === 'en' ? payEn : payAr;
  const zone = o.zone ? (lang === 'ar' ? (o.zone.name_ar || o.zone.name_en || '') : (o.zone.name_en || o.zone.name_ar || '')) : '';
  const subZone = o.subZone ? (lang === 'ar' ? (o.subZone.name_ar || o.subZone.name_en || '') : (o.subZone.name_en || o.subZone.name_ar || '')) : '';
  const discount = o.discountAmount > 0
    ? `<div class="ps-row"><span>${esc(l.discount)}${o.discountLabel ? ' · ' + esc(o.discountLabel) : ''}${o.couponCode ? ` (${esc(o.couponCode)})` : ''}</span><b>−${money(o.discountAmount)}</b></div>`
    : '';
  const points = o.loyaltyRedeemed > 0
    ? `<div class="ps-row"><span>${esc(l.pointsUsed)}</span><b>${esc(o.loyaltyRedeemed)}</b></div>`
    : '';

  const customer = [
    row(l.name, o.customerName),
    row(l.phone, o.customerPhone)
  ].join('');

  const delivery = [
    zone ? row(l.zone, `${zone}${subZone ? ' · ' + subZone : ''}`) : '',
    row(l.address, o.address, true),
    row(l.addressDetail, o.addressDetail, true),
    row(l.instructions, o.deliveryNote, true),
    row(l.customerNotes, o.notes, true)
  ].join('');

  const totals = [
    row(l.subtotal, money(o.subtotal)),
    discount,
    points,
    `<div class="ps-row"><span>${esc(l.deliveryFee)}</span><b>${+o.deliveryFee > 0 ? money(o.deliveryFee) : esc(l.free)}</b></div>`,
    row(l.vat, money(o.vatAmount)),
    `<div class="ps-row ps-row--total"><span>${esc(l.total)}</span><b>${moneyEgp(o.total)}</b></div>`
  ].join('');

  const meta = [
    row(l.orderNo, o.short),
    row(l.orderId, o.id),
    row(l.date, exactTime(o.createdAt)),
    row(l.status, status)
  ].join('');

  const items = `
    <table class="ps-items">
      <thead><tr>
        <th>${esc(l.item)}</th><th>${esc(l.qty)}</th><th>${esc(l.unitPrice)}</th><th>${esc(l.lineTotal)}</th>
      </tr></thead>
      <tbody>${itemRows(o.items, lang)}</tbody>
    </table>`;

  return `
    <div class="ps-lang-col ps-lang-${lang}" lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
      ${sectionHTML(l.receipt, meta, 'ps-meta-section')}
      ${sectionHTML(l.customer, customer)}
      ${sectionHTML(l.delivery, delivery)}
      ${sectionHTML(l.items, items, 'ps-items-section')}
      ${sectionHTML(l.total, totals, 'ps-totals')}
      ${sectionHTML(l.payment, row(l.method, payment))}
      ${sectionHTML(l.driver, driverRows(o, lang))}
    </div>`;
}

function sheetHTML(o) {
  return `
    <div class="ps-page" dir="ltr">
      <div class="ps-header">
        <div class="ps-header-side ps-header-en">${esc(RESTAURANT_NAME)}<small>Order Receipt</small></div>
        <img class="ps-logo" src="${LOGO_SRC}" alt="Aquarium Cafe & Restaurant" onerror="this.remove()" />
        <div class="ps-header-side ps-header-ar" lang="ar" dir="rtl">أكواريوم كافيه ومطعم<small>إيصال الطلب</small></div>
      </div>
      ${buildMapsQrHTML(o.mapsLink)}
      <div class="ps-columns">
        ${languageColumn(o, 'en')}
        ${languageColumn(o, 'ar')}
      </div>
      <div class="ps-foot">Thank you for your order! · شكرًا لطلبك!</div>
    </div>`;
}

function installPrintStyles() {
  let style = document.getElementById('aquariumPrintRuntimeStyles');
  if (style) return style;
  style = document.createElement('style');
  style.id = 'aquariumPrintRuntimeStyles';
  style.textContent = `
    @media print {
      @page { size: A4 portrait; margin: 7mm; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      body > *:not(#printSheet) { display: none !important; }
      #printSheet { display: block !important; position: static !important; width: 100% !important; background: #fff !important; color: #111 !important; }
      #printSheet .ps-page { width: 100%; font-family: Arial, "Noto Sans Arabic", sans-serif; font-size: 9.5px; line-height: 1.3; }
      #printSheet .ps-header { display: grid; grid-template-columns: 1fr 58px 1fr; align-items: center; gap: 8px; border-bottom: 1.5px solid #111; padding-bottom: 4px; }
      #printSheet .ps-logo { width: 52px; height: 52px; object-fit: contain; justify-self: center; }
      #printSheet .ps-header-side { font-weight: 800; font-size: 13px; }
      #printSheet .ps-header-side small { display: block; font-size: 8px; font-weight: 600; color: #555; margin-top: 1px; }
      #printSheet .ps-header-ar { text-align: right; }
      #printSheet .ps-qr { display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 5px auto 6px; gap: 1px; text-align: center; }
      #printSheet .ps-qr__code svg { width: 70px; height: 70px; display: block; }
      #printSheet .ps-qr__label { font-size: 7.5px; color: #444; }
      #printSheet .ps-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; align-items: start; }
      #printSheet .ps-lang-col { min-width: 0; border: 1px solid #ccc; padding: 5px; }
      #printSheet .ps-lang-en { border-right: 1px solid #bbb; }
      #printSheet .ps-lang-ar { border-left: 1px solid #bbb; }
      #printSheet .ps-section { margin: 3px 0 5px; break-inside: avoid; }
      #printSheet .ps-section h4 { font-size: 8px; margin: 0 0 2px; padding-bottom: 1px; border-bottom: 1px solid #ccc; color: #444; font-weight: 800; }
      #printSheet .ps-meta-section h4 { font-size: 9px; color: #111; }
      #printSheet .ps-row { display: flex; justify-content: space-between; align-items: baseline; gap: 5px; padding: 0.8px 0; }
      #printSheet .ps-row span { color: #555; flex: 0 0 auto; }
      #printSheet .ps-row b { font-weight: 600; text-align: end; overflow-wrap: anywhere; }
      #printSheet .ps-row--block { display: block; }
      #printSheet .ps-row--block b { display: block; margin-top: 1px; }
      #printSheet .ps-mono { font-family: Consolas, monospace; font-size: 7px; }
      #printSheet .ps-items { width: 100%; border-collapse: collapse; table-layout: fixed; }
      #printSheet .ps-items th, #printSheet .ps-items td { padding: 1.5px 1px; border-bottom: 1px solid #ddd; vertical-align: top; overflow-wrap: anywhere; }
      #printSheet .ps-items th { font-size: 7px; color: #555; font-weight: 800; }
      #printSheet .ps-items th:first-child, #printSheet .ps-items td:first-child { width: 42%; }
      #printSheet .ps-items th:nth-child(2), #printSheet .ps-items td:nth-child(2) { width: 12%; text-align: center; }
      #printSheet .ps-items th:nth-child(3), #printSheet .ps-items td:nth-child(3), #printSheet .ps-items th:nth-child(4), #printSheet .ps-items td:nth-child(4) { width: 23%; text-align: end; }
      #printSheet .ps-totals { border-top: 1px solid #bbb; padding-top: 2px; }
      #printSheet .ps-row--total { border-top: 1.5px solid #111; margin-top: 2px; padding-top: 2px; font-size: 10px; font-weight: 800; }
      #printSheet .ps-foot { margin-top: 5px; padding-top: 3px; border-top: 1px solid #ccc; text-align: center; font-size: 7.5px; color: #555; }
      #printSheet .ps-lang-ar { font-family: Arial, "Noto Sans Arabic", Tahoma, sans-serif; }
      #printSheet .ps-lang-ar .ps-row b { text-align: left; }
      #printSheet .ps-lang-ar .ps-items th, #printSheet .ps-lang-ar .ps-items td { text-align: right; }
      #printSheet .ps-lang-ar .ps-items th:nth-child(2), #printSheet .ps-lang-ar .ps-items td:nth-child(2) { text-align: center; }
      #printSheet .ps-lang-ar .ps-items th:nth-child(3), #printSheet .ps-lang-ar .ps-items td:nth-child(3), #printSheet .ps-lang-ar .ps-items th:nth-child(4), #printSheet .ps-lang-ar .ps-items td:nth-child(4) { text-align: left; }
      #printSheet .ps-lang-ar .ps-row--block b { text-align: right; }
      #printSheet .ps-columns, #printSheet .ps-section, #printSheet .ps-items { break-inside: avoid; }
    }
  `;
  document.head.appendChild(style);
  return style;
}

export function printDeliveryOrder(o) {
  if (!o) return false;
  let sheet = $('printSheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'printSheet';
    document.body.appendChild(sheet);
  }
  installPrintStyles();
  sheet.innerHTML = sheetHTML(o);
  const cleanup = () => {
    document.getElementById('aquariumPrintRuntimeStyles')?.remove();
    sheet.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  requestAnimationFrame(() => window.print());
  return true;
}
