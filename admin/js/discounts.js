// ============================================================
//  Aquarium Cafe & Resturant — Admin · Discounts & Coupons (v5)
//  Every promotion is a row in public.discounts:
//   · signup   — automatic, first delivered order of members
//   · coupon   — customers type the code at checkout
//   · product  — automatic on one product
//   · category — automatic on one category
//   · global   — automatic on the whole cart
//  Percent or fixed, min-order, max-discount cap, usage limit,
//  expiry — and every one can be edited, paused or deleted.
//  The apply logic itself lives inside Postgres (_price_cart /
//  validate_coupon / place_delivery_order) — no bypass.
// ============================================================
import {
  getDiscounts, createDiscount, updateDiscount, setDiscountActive, deleteDiscount,
  getProducts, getCategories,
} from './api.js';
import { $, esc, toast, confirmDialog } from './ui.js';
import { t } from '../../shared/i18n.js';

let items = [];
let targets = { products: [], categories: [] };
let editingId = null;
let filter = 'all';

const TYPE_ICON = { signup: 'i-gift', coupon: 'i-ticket', product: 'i-cup', category: 'i-tag', global: 'i-globe' };

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(document.documentElement.lang === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const valueText = (d) =>
  d.value_type === 'percent' ? `${+d.value}%` : `EGP ${(+d.value).toFixed(0)}`;

const stateBadge = (d) => {
  const now = Date.now();
  if (!d.active) return `<span class="p-badge is-muted">${esc(t('dc.paused'))}</span>`;
  if (d.expires_at && new Date(d.expires_at).getTime() < now)
    return `<span class="p-badge is-danger">${esc(t('dc.expired'))}</span>`;
  if (d.max_uses != null && d.used_count >= d.max_uses)
    return `<span class="p-badge is-danger">${esc(t('dc.usedUp'))}</span>`;
  return `<span class="p-badge is-live">${esc(t('dc.live'))}</span>`;
};

const targetText = (d) => {
  if (d.type === 'product') {
    const p = targets.products.find((x) => x.id === d.target_id);
    return p ? p.name : `#${d.target_id}`;
  }
  if (d.type === 'category') {
    const c = targets.categories.find((x) => x.id === d.target_id);
    return c ? c.name : `#${d.target_id}`;
  }
  return '';
};

/* ═══════════════════ render ═══════════════════ */
export async function renderDiscounts(view) {
  view.innerHTML = `
    <div class="toolbar">
      <div class="chips" id="dcChips">
        ${['all', 'signup', 'coupon', 'product', 'category', 'global'].map((f) => `
          <button class="chip ${f === filter ? 'is-active' : ''}" data-f="${f}">${esc(t('dc.f.' + f))}</button>`).join('')}
      </div>
      <span class="toolbar__spacer"></span>
      <button class="btn btn--primary" id="dcAdd">
        <svg class="icon"><use href="#i-percent"/></svg> ${esc(t('dc.add'))}
      </button>
    </div>
    <p class="toolbar-note">
      <svg class="icon"><use href="#i-ticket"/></svg>
      <span>${esc(t('dc.note'))}</span>
    </p>
    <div id="dcList"><div class="skel-rows">${'<div class="skel-row"></div>'.repeat(3)}</div></div>

    <!-- editor modal -->
    <div class="modal" id="discountModal" aria-hidden="true" role="dialog" aria-modal="true">
      <div class="modal__backdrop" data-dc-close></div>
      <div class="modal__panel df">
        <button class="modal__close" data-dc-close aria-label="${esc(t('act.close'))}"><svg class="icon"><use href="#i-x"/></svg></button>
        <h3 class="modal__title" id="dfTitle">${esc(t('dc.add'))}</h3>

        <div class="df__grid">
          <label class="field"><span>${esc(t('dc.name'))}</span>
            <input id="dfName" type="text" maxlength="80" placeholder="${esc(t('dc.namePh'))}">
          </label>
          <div class="field-2col">
            <label class="field"><span>${esc(t('dc.type'))}</span>
              <select id="dfType">
                <option value="signup">${esc(t('dc.t.signup'))}</option>
                <option value="coupon">${esc(t('dc.t.coupon'))}</option>
                <option value="product">${esc(t('dc.t.product'))}</option>
                <option value="category">${esc(t('dc.t.category'))}</option>
                <option value="global">${esc(t('dc.t.global'))}</option>
              </select>
            </label>
            <label class="field" id="dfCodeWrap"><span>${esc(t('dc.code'))}</span>
              <input id="dfCode" type="text" maxlength="24" dir="ltr" placeholder="WELCOME10">
            </label>
          </div>
          <p class="form-hint" id="dfTypeHint"></p>

          <div class="field-2col">
            <label class="field"><span>${esc(t('dc.valueType'))}</span>
              <select id="dfValueType">
                <option value="percent">${esc(t('dc.percent'))}</option>
                <option value="fixed">${esc(t('dc.fixed'))}</option>
              </select>
            </label>
            <label class="field"><span id="dfValueLabel">${esc(t('dc.valuePercent'))}</span>
              <input id="dfValue" type="number" min="0" step="1" placeholder="10">
            </label>
          </div>

          <div class="field-2col">
            <label class="field"><span>${esc(t('dc.minOrder'))} <small class="opt">${esc(t('g.optional'))}</small></span>
              <input id="dfMin" type="number" min="0" step="10" placeholder="0">
            </label>
            <label class="field" id="dfCapWrap"><span>${esc(t('dc.maxDiscount'))} <small class="opt">${esc(t('g.optional'))}</small></span>
              <input id="dfCap" type="number" min="0" step="5" placeholder="—">
            </label>
          </div>

          <label class="field" id="dfTargetWrap"><span id="dfTargetLabel">${esc(t('dc.targetProduct'))}</span>
            <select id="dfTarget"></select>
          </label>

          <div class="field-2col">
            <label class="field"><span>${esc(t('dc.maxUses'))} <small class="opt">${esc(t('g.optional'))}</small></span>
              <input id="dfUses" type="number" min="1" step="1" placeholder="∞">
            </label>
            <label class="field"><span>${esc(t('dc.expiry'))} <small class="opt">${esc(t('g.optional'))}</small></span>
              <input id="dfExpiry" type="date">
            </label>
          </div>

          <label class="switch-row">
            <span class="switch"><input type="checkbox" id="dfActive" checked /><i></i></span>
            <span>${esc(t('dc.activeNow'))}</span>
          </label>

          <p class="form-error" id="dfError" role="alert"></p>
          <button class="btn btn--primary btn--block" id="dfSave">${esc(t('dc.save'))}</button>
        </div>
      </div>
    </div>`;

  $('dcAdd').addEventListener('click', () => openForm(null));
  $('dcChips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    filter = c.dataset.f;
    $('dcChips').querySelectorAll('.chip').forEach((x) => x.classList.toggle('is-active', x === c));
    paint();
  });
  $('dcList').addEventListener('click', onAction);
  $('dcList').addEventListener('change', onToggle);
  wireForm();

  try {
    [items, targets.products, targets.categories] = await Promise.all([
      getDiscounts(), getProducts(), getCategories(),
    ]);
    paint();
  } catch (err) {
    $('dcList').innerHTML = `<div class="err-box"><svg class="icon"><use href="#i-warn"/></svg><p>${esc(err.message)}</p></div>`;
  }
}

/* ═══════════════════ list ═══════════════════ */
function paint() {
  const list = $('dcList');
  if (!list) return;
  const rows = filter === 'all' ? items : items.filter((d) => d.type === filter);

  if (!items.length) {
    list.innerHTML = `
      <div class="err-box">
        <svg class="icon"><use href="#i-ticket"/></svg>
        <p>${esc(t('dc.empty'))}</p>
      </div>`;
    return;
  }
  if (!rows.length) {
    list.innerHTML = `<p class="empty-mini">${esc(t('dc.emptyFilter'))}</p>`;
    return;
  }

  list.innerHTML = rows.map((d, i) => `
    <div class="dcc ${d.active ? '' : 'is-off'}" data-id="${d.id}" style="--d:${Math.min(i, 10) * 40}ms">
      <span class="dcc__icon"><svg class="icon"><use href="#${TYPE_ICON[d.type] || 'i-ticket'}"/></svg></span>
      <div class="dcc__body">
        <b>${esc(d.name)}</b>
        <small>
          <span class="p-badge">${esc(t('dc.t.' + d.type))}</span>
          ${d.code ? `<code class="dcc__code" dir="ltr">${esc(d.code)}</code>` : ''}
          ${targetText(d) ? `<span class="dcc__target">→ ${esc(targetText(d))}</span>` : ''}
        </small>
        <small class="dcc__meta">
          ${esc(valueText(d))}
          ${+d.min_order > 0 ? ` · ${esc(t('dc.minShort', { v: +d.min_order }))}` : ''}
          ${d.max_discount != null ? ` · ${esc(t('dc.capShort', { v: +d.max_discount }))}` : ''}
          ${d.max_uses != null ? ` · ${esc(t('dc.usesShort', { u: d.used_count, m: d.max_uses }))}` : (d.used_count > 0 ? ` · ${esc(t('dc.usedN', { n: d.used_count }))}` : '')}
          ${d.expires_at ? ` · ${esc(t('dc.until', { d: fmtDate(d.expires_at) }))}` : ''}
        </small>
      </div>
      ${stateBadge(d)}
      <label class="switch" title="${esc(t('dc.activeNow'))}">
        <input type="checkbox" data-tgl="${d.id}" ${d.active ? 'checked' : ''}><i></i>
      </label>
      <span class="dcc__acts">
        <button class="icon-btn" data-act="edit" aria-label="${esc(t('act.edit'))}"><svg class="icon"><use href="#i-pen"/></svg></button>
        <button class="icon-btn danger" data-act="del" aria-label="${esc(t('act.del'))}"><svg class="icon"><use href="#i-trash"/></svg></button>
      </span>
    </div>`).join('');
}

/* ═══════════════════ actions ═══════════════════ */
async function onAction(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = Number(btn.closest('[data-id]').dataset.id);
  const d = items.find((x) => x.id === id);
  if (!d) return;

  if (btn.dataset.act === 'edit') return openForm(d);

  if (btn.dataset.act === 'del') {
    const ok = await confirmDialog({
      title: t('dc.delTitle', { name: d.name }),
      text: t('dc.delText'),
      yes: t('act.del'),
    });
    if (!ok) return;
    try {
      await deleteDiscount(id);
      items = items.filter((x) => x.id !== id);
      paint();
      toast(t('dc.deleted', { name: d.name }));
    } catch (err) {
      toast(err.message, 'error');
    }
  }
}

async function onToggle(e) {
  const tgl = e.target.closest('[data-tgl]');
  if (!tgl) return;
  const id = Number(tgl.dataset.tgl);
  const d = items.find((x) => x.id === id);
  try {
    await setDiscountActive(id, tgl.checked);
    d.active = tgl.checked;
    paint();
    toast(tgl.checked ? t('dc.on', { name: d.name }) : t('dc.off', { name: d.name }));
  } catch (err) {
    tgl.checked = !tgl.checked;
    toast(err.message, 'error');
  }
}

/* ═══════════════════ editor form ═══════════════════ */
const TYPE_HINT = {
  signup: 'dc.h.signup',
  coupon: 'dc.h.coupon',
  product: 'dc.h.product',
  category: 'dc.h.category',
  global: 'dc.h.global',
};

function refreshFormBits() {
  const type = $('dfType').value;
  $('dfTypeHint').textContent = t(TYPE_HINT[type]);
  $('dfCodeWrap').style.display = type === 'coupon' ? '' : 'none';
  $('dfCapWrap').style.display = $('dfValueType').value === 'percent' ? '' : 'none';
  $('dfValueLabel').textContent = t($('dfValueType').value === 'percent' ? 'dc.valuePercent' : 'dc.valueFixed');

  const targetWrap = $('dfTargetWrap');
  if (type === 'product' || type === 'category') {
    targetWrap.style.display = '';
    $('dfTargetLabel').textContent = t(type === 'product' ? 'dc.targetProduct' : 'dc.targetCategory');
    const opts = (type === 'product' ? targets.products : targets.categories)
      .map((x) => `<option value="${x.id}">${esc(x.name)}${x.name_ar ? ` · ${esc(x.name_ar)}` : ''}</option>`)
      .join('');
    $('dfTarget').innerHTML = opts || `<option value="">${esc(t('dc.noTargets'))}</option>`;
  } else {
    targetWrap.style.display = 'none';
  }
}

function wireForm() {
  $('dfType').addEventListener('change', refreshFormBits);
  $('dfValueType').addEventListener('change', refreshFormBits);
  $('discountModal').addEventListener('click', (e) => {
    if (e.target.closest('[data-dc-close]')) closeForm();
  });
  $('dfSave').addEventListener('click', saveForm);
  $('dfName').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveForm(); });
}

function openForm(d) {
  editingId = d ? d.id : null;
  $('dfTitle').textContent = d ? t('dc.edit') : t('dc.add');
  $('dfName').value = d?.name ?? '';
  $('dfType').value = d?.type ?? 'coupon';
  $('dfCode').value = d?.code ?? '';
  $('dfValueType').value = d?.value_type ?? 'percent';
  $('dfValue').value = d ? String(+d.value) : '';
  $('dfMin').value = d && +d.min_order > 0 ? String(+d.min_order) : '';
  $('dfCap').value = d?.max_discount != null ? String(+d.max_discount) : '';
  $('dfUses').value = d?.max_uses != null ? String(d.max_uses) : '';
  $('dfExpiry').value = d?.expires_at ? new Date(d.expires_at).toISOString().slice(0, 10) : '';
  $('dfActive').checked = d ? !!d.active : true;
  $('dfError').textContent = '';
  refreshFormBits();
  if (d?.target_id) $('dfTarget').value = String(d.target_id);
  $('discountModal').classList.add('open');
  $('discountModal').setAttribute('aria-hidden', 'false');
  document.body.classList.add('locked');
  setTimeout(() => $('dfName').focus(), 60);
}

function closeForm() {
  $('discountModal').classList.remove('open');
  $('discountModal').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('locked');
}

async function saveForm() {
  const err = $('dfError');
  err.textContent = '';
  const type = $('dfType').value;
  const body = {
    name: $('dfName').value,
    type,
    code: type === 'coupon' ? $('dfCode').value : null,
    value_type: $('dfValueType').value,
    value: $('dfValue').value,
    min_order: $('dfMin').value === '' ? 0 : $('dfMin').value,
    max_discount: $('dfCap').value === '' ? null : $('dfCap').value,
    max_uses: $('dfUses').value === '' ? null : $('dfUses').value,
    expires_at: $('dfExpiry').value ? new Date($('dfExpiry').value + 'T23:59:59').toISOString() : null,
    target_id: (type === 'product' || type === 'category') ? $('dfTarget').value : null,
    active: $('dfActive').checked,
  };
  const btn = $('dfSave');
  btn.disabled = true;
  try {
    if (editingId) {
      const updated = await updateDiscount(editingId, body);
      const i = items.findIndex((x) => x.id === editingId);
      if (i > -1) items[i] = updated;
      toast(t('dc.saved', { name: updated.name }));
    } else {
      const created = await createDiscount(body);
      items.push(created);
      toast(t('dc.added', { name: created.name }));
    }
    closeForm();
    paint();
  } catch (e2) {
    err.textContent = e2.message;
  } finally {
    btn.disabled = false;
  }
}
