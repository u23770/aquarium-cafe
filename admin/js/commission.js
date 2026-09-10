// ============================================================
// Aquarium Cafe & Restaurant — Admin Commission Statement
// The final commission amount is taken from the protected
// calculate_commission_statement() Postgres RPC.
// ============================================================
import { supabase, run, rpc } from '../shared/db.js';
import { esc, money } from './ui.js';

const OFFLINE = 'Cannot reach Supabase right now — check your connection.';
const RATE = 0.05;

const isArabic = () => document.documentElement.lang === 'ar';

const copy = () => isArabic() ? {
  title: 'كشف حساب العمولة',
  subtitle: 'تقرير تفصيلي لعمولة المطعم عن الفترة المحددة',
  from: 'من', to: 'إلى', generate: 'إنشاء الكشف', print: 'طباعة الكشف',
  period: 'الفترة', rate: 'نسبة العمولة',
  summary: 'ملخص الكشف', orders: 'إجمالي الطلبات', eligible: 'الطلبات المحتسبة',
  cancelled: 'الطلبات الملغاة', gross: 'إجمالي قيمة الطلبات',
  discounts: 'إجمالي الخصومات', base: 'المبيعات الخاضعة للعمولة',
  delivery: 'رسوم التوصيل', vat: 'ضريبة القيمة المضافة', due: 'العمولة المستحقة',
  details: 'تفاصيل الطلبات', order: 'الطلب', date: 'التاريخ', status: 'الحالة',
  subtotal: 'المجموع الفرعي', discount: 'الخصم', commissionBase: 'أساس العمولة',
  commission: 'عمولة 5%', excluded: 'مستبعد', included: 'محتسب',
  noOrders: 'لا توجد طلبات خلال هذه الفترة.',
  invalid: 'اختر فترة صحيحة لا تتجاوز 32 يومًا.',
  loading: 'جارٍ إنشاء الكشف…', error: 'تعذر إنشاء الكشف.',
  refresh: 'تحديث', generatedAt: 'تاريخ الإصدار', statementNo: 'رقم الكشف',
  note: 'يتم احتساب العمولة على المجموع الفرعي بعد الخصم فقط. رسوم التوصيل والضريبة لا تدخل في العمولة، والطلبات الملغاة مستبعدة.'
} : {
  title: 'Commission Statement',
  subtitle: 'Detailed commission report for the selected period',
  from: 'From', to: 'To', generate: 'Generate Statement', print: 'Print Statement',
  period: 'Period', rate: 'Commission Rate',
  summary: 'Statement Summary', orders: 'Total Orders', eligible: 'Eligible Orders',
  cancelled: 'Cancelled Orders', gross: 'Gross Subtotal',
  discounts: 'Total Discounts', base: 'Commission Sales',
  delivery: 'Delivery Fees', vat: 'VAT', due: 'Commission Due',
  details: 'Order Details', order: 'Order', date: 'Date', status: 'Status',
  subtotal: 'Subtotal', discount: 'Discount', commissionBase: 'Commission Base',
  commission: '5% Commission', excluded: 'Excluded', included: 'Included',
  noOrders: 'No orders found for this period.',
  invalid: 'Choose a valid period of 32 days or less.',
  loading: 'Generating statement…', error: 'Could not generate the statement.',
  refresh: 'Refresh', generatedAt: 'Generated', statementNo: 'Statement No.',
  note: 'Commission is calculated on subtotal after discount only. Delivery fees and VAT are excluded, and cancelled orders are not counted.'
};

const pad = (n) => String(n).padStart(2, '0');

const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const monthStartInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
};

const addDays = (dateString, days) => {
  const d = new Date(`${dateString}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d;
};

const isoLocal = (d) => {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};

const moneyValue = (v) => Number(v || 0);
const shortId = (id) => `#${String(id).slice(0, 8).toUpperCase()}`;

const statusLabel = (status) => {
  if (!isArabic()) return status;
  return ({
    Received: 'مستلم',
    Accepted: 'مقبول',
    Preparing: 'قيد التحضير',
    Ready: 'جاهز',
    'Out for Delivery': 'في التوصيل',
    Delivered: 'تم التسليم',
    Cancelled: 'ملغى'
  })[status] || status;
};

const formatDate = (value) => {
  const d = new Date(value);
  return new Intl.DateTimeFormat(isArabic() ? 'ar-EG' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(d);
};

function ensureStyles() {
  if (document.getElementById('commission-styles')) return;

  const style = document.createElement('style');
  style.id = 'commission-styles';
  style.textContent = `
    .commission-page{display:grid;gap:18px}
    .commission-toolbar{display:flex;align-items:end;gap:12px;flex-wrap:wrap;padding:18px;background:var(--panel,#fff);border:1px solid var(--line,#dbe6ea);border-radius:16px;box-shadow:0 8px 24px rgba(5,42,58,.05)}
    .commission-toolbar .field{min-width:180px;flex:1}
    .commission-toolbar .field>span{display:block;margin-bottom:7px;font-size:.78rem;font-weight:700;color:var(--muted,#66808c)}
    .commission-toolbar input{width:100%;min-height:42px;padding:9px 11px;border:1px solid var(--line,#dbe6ea);border-radius:10px;background:var(--surface,#fff);color:inherit;font:inherit}
    .commission-actions{display:flex;gap:8px;flex-wrap:wrap}
    .commission-actions .btn{min-height:42px}
    .commission-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding:24px;background:linear-gradient(135deg,var(--panel,#fff),rgba(13,125,158,.06));border:1px solid var(--line,#dbe6ea);border-radius:18px}
    .commission-brand h1{margin:0 0 6px;font-size:1.55rem}
    .commission-brand p{margin:0;color:var(--muted,#66808c)}
    .commission-meta{display:grid;grid-template-columns:repeat(2,minmax(120px,1fr));gap:10px;min-width:280px}
    .commission-meta div{padding:10px 12px;border:1px solid var(--line,#dbe6ea);border-radius:11px;background:rgba(255,255,255,.65)}
    .commission-meta small{display:block;color:var(--muted,#66808c);font-size:.72rem;margin-bottom:3px}
    .commission-meta strong{font-size:.9rem}
    .commission-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .commission-card{padding:17px;border:1px solid var(--line,#dbe6ea);border-radius:14px;background:var(--panel,#fff)}
    .commission-card small{display:block;color:var(--muted,#66808c);font-size:.75rem;margin-bottom:7px}
    .commission-card strong{display:block;font-size:1.18rem}
    .commission-card--due{border-color:rgba(13,125,158,.3);background:rgba(13,125,158,.07)}
    .commission-card--due strong{font-size:1.45rem}
    .commission-breakdown{display:grid;grid-template-columns:1fr 1fr;gap:18px}
    .commission-box{background:var(--panel,#fff);border:1px solid var(--line,#dbe6ea);border-radius:16px;overflow:hidden}
    .commission-box__head{padding:15px 17px;border-bottom:1px solid var(--line,#dbe6ea);font-weight:800}
    .commission-lines{padding:7px 17px 13px}
    .commission-line{display:flex;justify-content:space-between;gap:20px;padding:10px 0;border-bottom:1px dashed var(--line,#dbe6ea)}
    .commission-line:last-child{border-bottom:0}
    .commission-line span:first-child{color:var(--muted,#66808c)}
    .commission-line strong{font-variant-numeric:tabular-nums}
    .commission-note{padding:12px 15px;margin:0 17px 17px;border-radius:10px;background:rgba(98,128,140,.08);font-size:.78rem;color:var(--muted,#66808c);line-height:1.55}
    .commission-table-wrap{overflow:auto}
    .commission-table{width:100%;border-collapse:collapse;min-width:820px}
    .commission-table th,.commission-table td{padding:11px 13px;text-align:start;border-bottom:1px solid var(--line,#dbe6ea);font-size:.82rem;white-space:nowrap}
    .commission-table th{font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#66808c);background:rgba(98,128,140,.05)}
    .commission-table tfoot td{font-weight:800}
    .commission-status{display:inline-flex;padding:4px 8px;border-radius:999px;background:rgba(46,156,111,.1);font-size:.7rem;font-weight:700}
    .commission-status--excluded{background:rgba(194,84,74,.1)}
    .commission-empty{padding:32px;text-align:center;color:var(--muted,#66808c)}
    .commission-print-only{display:none}

    @media(max-width:900px){
      .commission-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
      .commission-breakdown{grid-template-columns:1fr}
      .commission-head{flex-direction:column}
      .commission-meta{width:100%;min-width:0}
    }

    @media(max-width:560px){
      .commission-summary{grid-template-columns:1fr}
      .commission-toolbar{align-items:stretch}
      .commission-toolbar .field{min-width:100%}
      .commission-actions{width:100%}
      .commission-actions .btn{flex:1}
      .commission-head{padding:18px}
      .commission-meta{grid-template-columns:1fr 1fr}
    }

    @media print{
      @page{size:A4;margin:12mm}
      .sidebar,.topbar,.commission-toolbar,.page-head,.atoast,.commission-actions,.commission-print-hide{display:none!important}
      .main,.content,.page{margin:0!important;padding:0!important;width:auto!important}
      .commission-page{display:block}
      .commission-head,.commission-box,.commission-card{box-shadow:none;border:1px solid #bbb}
      .commission-head{margin-bottom:10px}
      .commission-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
      .commission-card{padding:8px}
      .commission-card strong{font-size:10pt}
      .commission-card small{font-size:7pt}
      .commission-breakdown{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
      .commission-table th,.commission-table td{padding:5px 6px;font-size:7.5pt}
      .commission-print-only{display:block}
      .commission-note{font-size:7.5pt}
      .commission-table-wrap{overflow:visible}
    }
  `;
  document.head.appendChild(style);
}

function validateDates(from, to) {
  if (!from || !to) return false;
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const days = Math.round((end - start) / 86400000) + 1;
  return Number.isFinite(days) && days >= 1 && days <= 32;
}

async function buildStatement(from, to) {
  const start = new Date(`${from}T00:00:00`);
  const endExclusive = addDays(to, 1);
  const pStart = isoLocal(start);
  const pEnd = isoLocal(endExclusive);

  const summary = await rpc('calculate_commission_statement', {
    p_period_start: pStart,
    p_period_end: pEnd
  });

  const orders = await run(
    supabase.from('delivery_orders')
      .select('id, created_at, subtotal, discount_amount, delivery_fee, vat_amount, status')
      .gte('created_at', pStart)
      .lt('created_at', pEnd)
      .order('created_at', { ascending: true }),
    OFFLINE
  );

  const rows = Array.isArray(orders) ? orders : [];
  const eligible = rows.filter((o) => o.status !== 'Cancelled');
  const gross = rows.reduce((s, o) => s + moneyValue(o.subtotal), 0);
  const discounts = rows.reduce((s, o) => s + moneyValue(o.discount_amount), 0);
  const delivery = rows.reduce((s, o) => s + moneyValue(o.delivery_fee), 0);
  const vat = rows.reduce((s, o) => s + moneyValue(o.vat_amount), 0);

  return {
    summary,
    rows,
    eligible,
    gross,
    discounts,
    delivery,
    vat,
    cancelled: rows.length - eligible.length,
    from,
    to
  };
}

function renderCard(label, value, cls = '') {
  return `<div class="commission-card ${cls}"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`;
}

function renderStatement(view, data) {
  const c = copy();
  const summary = data.summary || {};
  const base = moneyValue(summary.sales_amount);
  const due = moneyValue(summary.commission_amount);
  const orderCount = Number(summary.order_count || data.eligible.length || 0);

  const tableRows = data.rows.length
    ? data.rows.map((o) => {
        const excluded = o.status === 'Cancelled';
        const subtotal = moneyValue(o.subtotal);
        const discount = moneyValue(o.discount_amount);
        const commissionBase = excluded ? 0 : Math.max(subtotal - discount, 0);
        const commission = excluded ? 0 : commissionBase * RATE;

        return `<tr>
          <td><strong>${esc(shortId(o.id))}</strong></td>
          <td>${esc(formatDate(o.created_at))}</td>
          <td><span class="commission-status ${excluded ? 'commission-status--excluded' : ''}">${esc(excluded ? c.excluded : c.included)}</span> ${esc(statusLabel(o.status))}</td>
          <td>${esc(money(subtotal))}</td>
          <td>${esc(money(discount))}</td>
          <td>${esc(money(commissionBase))}</td>
          <td>${esc(money(commission))}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="7" class="commission-empty">${esc(c.noOrders)}</td></tr>`;

  const statementId = `CS-${data.from.replaceAll('-', '')}-${data.to.replaceAll('-', '')}`;

  view.innerHTML = `
    <div class="commission-page">
      <div class="commission-toolbar commission-print-hide">
        <label class="field"><span>${esc(c.from)}</span><input id="commissionFrom" type="date" value="${esc(data.from)}"></label>
        <label class="field"><span>${esc(c.to)}</span><input id="commissionTo" type="date" value="${esc(data.to)}"></label>
        <div class="commission-actions">
          <button class="btn btn--primary" id="commissionGenerate"><svg class="icon"><use href="#i-refresh"/></svg>${esc(c.generate)}</button>
          <button class="btn btn--ghost" id="commissionPrint"><svg class="icon"><use href="#i-receipt"/></svg>${esc(c.print)}</button>
        </div>
      </div>

      <section class="commission-head">
        <div class="commission-brand">
          <h1>${esc(c.title)}</h1>
          <p>${esc(c.subtitle)}</p>
          <div class="commission-print-only" style="margin-top:10px;font-size:9pt">${esc(c.generatedAt)}: ${esc(formatDate(new Date().toISOString()))}</div>
        </div>

        <div class="commission-meta">
          <div><small>${esc(c.period)}</small><strong>${esc(data.from)} → ${esc(data.to)}</strong></div>
          <div><small>${esc(c.rate)}</small><strong>5%</strong></div>
          <div><small>${esc(c.statementNo)}</small><strong>${esc(statementId)}</strong></div>
          <div><small>${esc(c.generatedAt)}</small><strong>${esc(new Intl.DateTimeFormat(isArabic() ? 'ar-EG' : 'en-GB', { dateStyle: 'medium' }).format(new Date()))}</strong></div>
        </div>
      </section>

      <section class="commission-summary">
        ${renderCard(c.orders, String(data.rows.length))}
        ${renderCard(c.eligible, String(orderCount))}
        ${renderCard(c.cancelled, String(data.cancelled))}
        ${renderCard(c.due, money(due), 'commission-card--due')}
      </section>

      <section class="commission-breakdown">
        <div class="commission-box">
          <div class="commission-box__head">${esc(c.summary)}</div>
          <div class="commission-lines">
            <div class="commission-line"><span>${esc(c.gross)}</span><strong>${esc(money(data.gross))}</strong></div>
            <div class="commission-line"><span>${esc(c.discounts)}</span><strong>− ${esc(money(data.discounts))}</strong></div>
            <div class="commission-line"><span>${esc(c.base)}</span><strong>${esc(money(base))}</strong></div>
            <div class="commission-line"><span>${esc(c.rate)}</span><strong>5%</strong></div>
            <div class="commission-line"><span>${esc(c.due)}</span><strong>${esc(money(due))}</strong></div>
          </div>
        </div>

        <div class="commission-box">
          <div class="commission-box__head">${esc(c.details)}</div>
          <div class="commission-lines">
            <div class="commission-line"><span>${esc(c.delivery)}</span><strong>${esc(money(data.delivery))}</strong></div>
            <div class="commission-line"><span>${esc(c.vat)}</span><strong>${esc(money(data.vat))}</strong></div>
            <div class="commission-line"><span>${esc(c.eligible)}</span><strong>${esc(String(orderCount))}</strong></div>
            <div class="commission-line"><span>${esc(c.cancelled)}</span><strong>${esc(String(data.cancelled))}</strong></div>
          </div>
          <p class="commission-note">${esc(c.note)}</p>
        </div>
      </section>

      <section class="commission-box">
        <div class="commission-box__head">${esc(c.details)}</div>
        <div class="commission-table-wrap">
          <table class="commission-table">
            <thead>
              <tr>
                <th>${esc(c.order)}</th>
                <th>${esc(c.date)}</th>
                <th>${esc(c.status)}</th>
                <th>${esc(c.subtotal)}</th>
                <th>${esc(c.discount)}</th>
                <th>${esc(c.commissionBase)}</th>
                <th>${esc(c.commission)}</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
            <tfoot>
              <tr>
                <td colspan="5"></td>
                <td>${esc(c.due)}</td>
                <td>${esc(money(due))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  `;

  view.querySelector('#commissionGenerate')?.addEventListener('click', async () => {
    const nextFrom = view.querySelector('#commissionFrom').value;
    const nextTo = view.querySelector('#commissionTo').value;

    if (!validateDates(nextFrom, nextTo)) {
      window.alert(c.invalid);
      return;
    }

    const button = view.querySelector('#commissionGenerate');
    button.disabled = true;
    button.textContent = c.loading;

    try {
      renderStatement(view, await buildStatement(nextFrom, nextTo));
    } catch (err) {
      window.alert(err?.message || c.error);
      button.disabled = false;
      button.innerHTML = `<svg class="icon"><use href="#i-refresh"/></svg>${esc(c.generate)}`;
    }
  });

  view.querySelector('#commissionPrint')?.addEventListener('click', () => window.print());
}

export async function renderCommission(view) {
  ensureStyles();

  const c = copy();
  const from = monthStartInput();
  const to = todayInput();

  view.innerHTML = '<div class="skel-rows"><div class="skel-row"></div><div class="skel-row"></div><div class="skel-row"></div></div>';

  try {
    renderStatement(view, await buildStatement(from, to));
  } catch (err) {
    view.innerHTML = `
      <div class="err-box">
        <svg class="icon"><use href="#i-warn"/></svg>
        <p>${esc(err?.message || c.error)}</p>
        <button class="btn btn--ghost" id="commissionRetry">${esc(c.refresh)}</button>
      </div>`;
    view.querySelector('#commissionRetry')?.addEventListener('click', () => renderCommission(view));
  }
}
