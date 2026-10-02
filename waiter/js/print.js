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
      <div class="ps-location-qr">
        <div class="ps-location-qr__code">${tag}</div>
        <div class="ps-location-qr__label">Scan for exact location · امسح للموقع بالضبط</div>
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

function bilingualRow(enLabel, value, arLabel, options = {}) {
  if (value == null || String(value).trim() === '') return '';
  const cls = options.block ? ' ps-row--block' : '';
  return `
    <div class="ps-bilingual-row${cls}">
      <div class="ps-label ps-label-en" lang="en" dir="ltr">${esc(enLabel)}</div>
      <div class="ps-value">${options.html ? value : esc(value)}</div>
      <div class="ps-label ps-label-ar" lang="ar" dir="rtl">${esc(arLabel)}</div>
    </div>`;
}

function sectionHTML(enTitle, arTitle, body, extra = '') {
  return `
    <section class="ps-section ${extra}">
      <div class="ps-section-title">
        <span lang="en" dir="ltr">${esc(enTitle)}</span>
        <span class="ps-section-title-center"></span>
        <span lang="ar" dir="rtl">${esc(arTitle)}</span>
      </div>
      ${body}
    </section>`;
}

function itemRows(items) {
  return (Array.isArray(items) ? items : []).map((it) => {
    const nameEn = it.name || it.name_ar || '—';
    const nameAr = it.name_ar || it.name || '—';
    const qty = it.quantity ?? '';
    const unit = money(it.price);
    const line = money(it.lineTotal);
    return `
      <div class="ps-item-row">
        <div class="ps-item-name ps-item-name-en" lang="en" dir="ltr">${esc(nameEn)}</div>
        <div class="ps-item-content" dir="ltr">
          <span>${esc(qty)} × ${esc(unit)}</span>
          <strong>= ${esc(line)}</strong>
        </div>
        <div class="ps-item-name ps-item-name-ar" lang="ar" dir="rtl">${esc(nameAr)}</div>
      </div>`;
  }).join('');
}

function sheetHTML(o) {
  const [statusEn] = statusLabels(o.status);
  const [payEn] = paymentLabels(o.paymentMethod);
  const qr = buildMapsQrHTML(o.mapsLink);

  const zoneEn = o.zone ? (o.zone.name_en || o.zone.name_ar || '') : '';
  const zoneAr = o.zone ? (o.zone.name_ar || o.zone.name_en || '') : '';
  const subZoneEn = o.subZone ? (o.subZone.name_en || o.subZone.name_ar || '') : '';
  const subZoneAr = o.subZone ? (o.subZone.name_ar || o.subZone.name_en || '') : '';

  const orderInfo = [
    bilingualRow(LABELS.en.orderNo, o.short, LABELS.ar.orderNo),
    bilingualRow(LABELS.en.orderId, o.id, LABELS.ar.orderId),
    bilingualRow(LABELS.en.date, exactTime(o.createdAt), LABELS.ar.date),
    bilingualRow(LABELS.en.status, statusEn, LABELS.ar.status)
  ].join('');

  const customer = [
    bilingualRow(LABELS.en.name, o.customerName, LABELS.ar.name),
    bilingualRow(LABELS.en.phone, o.customerPhone, LABELS.ar.phone)
  ].join('');

  const zoneValue = zoneEn || zoneAr
    ? `${zoneEn || zoneAr}${subZoneEn || subZoneAr ? ' · ' + (subZoneEn || subZoneAr) : ''}`
    : '';

  const delivery = [
    bilingualRow(LABELS.en.zone, zoneValue, LABELS.ar.zone),
    bilingualRow(LABELS.en.address, o.address, LABELS.ar.address, { block: true }),
    bilingualRow(LABELS.en.addressDetail, o.addressDetail, LABELS.ar.addressDetail, { block: true }),
    bilingualRow(LABELS.en.instructions, o.deliveryNote, LABELS.ar.instructions, { block: true }),
    bilingualRow(LABELS.en.customerNotes, o.notes, LABELS.ar.customerNotes, { block: true }),
    qr
  ].join('');

  const discount = o.discountAmount > 0
    ? bilingualRow(
        LABELS.en.discount + (o.discountLabel ? ' · ' + o.discountLabel : '') + (o.couponCode ? ' (' + o.couponCode + ')' : ''),
        '−' + money(o.discountAmount),
        LABELS.ar.discount
      )
    : '';

  const points = o.loyaltyRedeemed > 0
    ? bilingualRow(LABELS.en.pointsUsed, o.loyaltyRedeemed, LABELS.ar.pointsUsed)
    : '';

  const totals = [
    bilingualRow(LABELS.en.subtotal, money(o.subtotal), LABELS.ar.subtotal),
    discount,
    points,
    bilingualRow(LABELS.en.deliveryFee, +o.deliveryFee > 0 ? money(o.deliveryFee) : LABELS.en.free, LABELS.ar.deliveryFee),
    bilingualRow(LABELS.en.vat, money(o.vatAmount), LABELS.ar.vat),
    bilingualRow(LABELS.en.total, moneyEgp(o.total), LABELS.ar.total)
  ].join('');

  const payment = bilingualRow(LABELS.en.method, payEn, LABELS.ar.method);

  const driverName = o.driverName || o.tempDriverName || '';
  const driverPhone = o.driverPhone || o.tempDriverPhone || '';
  const driver = [
    bilingualRow(LABELS.en.driver, driverName || LABELS.en.notAssigned, LABELS.ar.driver),
    driverPhone ? bilingualRow(LABELS.en.driverPhone, driverPhone, LABELS.ar.driverPhone) : ''
  ].join('');

  const items = itemRows(o.items);

  return `
    <div class="ps-page">
      <header class="ps-header">
        <img class="ps-logo" src="${LOGO_SRC}" alt="${esc(RESTAURANT_NAME)}" />
        <div class="ps-header-name">
          <strong>${esc(RESTAURANT_NAME)}</strong>
          <span>أكواريوم كافيه ومطعم</span>
        </div>
        <div class="ps-header-title">
          <strong>Order Receipt</strong>
          <span>إيصال الطلب</span>
        </div>
      </header>

      ${sectionHTML(LABELS.en.receipt, LABELS.ar.receipt, orderInfo, 'ps-info-section')}
      ${sectionHTML(LABELS.en.customer, LABELS.ar.customer, customer)}
      ${sectionHTML(LABELS.en.delivery, LABELS.ar.delivery, delivery, 'ps-delivery-section')}

      <section class="ps-section ps-items-section">
        <div class="ps-section-title">
          <span lang="en" dir="ltr">${esc(LABELS.en.items)}</span>
          <span class="ps-section-title-center">Item content / محتوى الصنف</span>
          <span lang="ar" dir="rtl">${esc(LABELS.ar.items)}</span>
        </div>
        ${items || '<div class="ps-empty">—</div>'}
      </section>

      ${sectionHTML(LABELS.en.total, LABELS.ar.total, totals, 'ps-totals')}
      ${sectionHTML(LABELS.en.payment, LABELS.ar.payment, payment)}
      ${sectionHTML(LABELS.en.driver, LABELS.ar.driver, driver)}

      <footer class="ps-foot">Thank you for your order! · شكرًا لطلبك!</footer>
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
      #printSheet .ps-page { width: 100%; font-family: Arial, "Noto Sans Arabic", Tahoma, sans-serif; font-size: 9.5px; line-height: 1.3; }

      #printSheet .ps-header {
        display: flex; align-items: center; justify-content: center; gap: 14px;
        border-bottom: 1.5px solid #111; padding-bottom: 6px; margin-bottom: 7px;
      }
      #printSheet .ps-logo { width: 72px; height: 72px; object-fit: contain; flex: 0 0 72px; }
      #printSheet .ps-header-name, #printSheet .ps-header-title { display: flex; flex-direction: column; gap: 1px; }
      #printSheet .ps-header-name strong, #printSheet .ps-header-title strong { font-size: 12px; }
      #printSheet .ps-header-name span, #printSheet .ps-header-title span { font-size: 9px; }
      #printSheet .ps-header-title { text-align: right; }

      #printSheet .ps-section { margin: 3px 0 6px; break-inside: avoid; }
      #printSheet .ps-section-title {
        display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
        gap: 8px; margin-bottom: 2px; padding-bottom: 2px;
        border-bottom: 1px solid #bbb; font-weight: 800;
      }
      #printSheet .ps-section-title > span:first-child { text-align: left; }
      #printSheet .ps-section-title > span:last-child { text-align: right; }
      #printSheet .ps-section-title-center { font-size: 7.5px; color: #555; font-weight: 700; text-align: center; }

      #printSheet .ps-bilingual-row {
        display: grid; grid-template-columns: 1fr minmax(100px, 1.6fr) 1fr;
        align-items: center; gap: 8px; min-height: 19px; padding: 2.5px 0;
        border-bottom: 1px dotted #ddd;
      }
      #printSheet .ps-label-en { text-align: left; }
      #printSheet .ps-label-ar { text-align: right; }
      #printSheet .ps-value {
        text-align: center; font-weight: 600; overflow-wrap: anywhere;
        direction: ltr; unicode-bidi: plaintext;
      }
      #printSheet .ps-row--block { align-items: start; }
      #printSheet .ps-row--block .ps-value { white-space: pre-wrap; }

      #printSheet .ps-totals .ps-bilingual-row:last-child {
        border-top: 1.5px solid #111; border-bottom: 0; margin-top: 2px;
        padding-top: 4px; font-size: 10.5px; font-weight: 800;
      }

      #printSheet .ps-items-section { margin-top: 7px; }
      #printSheet .ps-item-row {
        display: grid; grid-template-columns: 1fr minmax(130px, 1.4fr) 1fr;
        align-items: center; gap: 8px; padding: 3.5px 0;
        border-bottom: 1px solid #ddd; break-inside: avoid;
      }
      #printSheet .ps-item-name-en { text-align: left; }
      #printSheet .ps-item-name-ar { text-align: right; }
      #printSheet .ps-item-content {
        text-align: center; display: flex; justify-content: center; gap: 5px;
        font-weight: 600; direction: ltr; unicode-bidi: plaintext;
      }
      #printSheet .ps-item-content strong { font-weight: 800; }
      #printSheet .ps-empty { text-align: center; padding: 4px; }

      #printSheet .ps-location-qr {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        margin: 5px auto 2px; padding: 5px 0; border-top: 1px dashed #bbb;
      }
      #printSheet .ps-location-qr__code svg { width: 62px; height: 62px; display: block; }
      #printSheet .ps-location-qr__text { display: flex; flex-direction: column; gap: 1px; text-align: center; }
      #printSheet .ps-location-qr__text b { font-size: 8px; }
      #printSheet .ps-location-qr__text span { font-size: 7.5px; }
      #printSheet .ps-location-qr__text small { font-size: 6.5px; color: #555; }

      #printSheet .ps-foot {
        margin-top: 6px; padding-top: 4px; border-top: 1px solid #ccc;
        text-align: center; font-size: 7.5px; color: #555;
      }
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
