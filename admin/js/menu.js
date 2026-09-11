// ============================================================
//  Aquarium Cafe & Resturant — Admin · Menu Manager (v5)
//  ONE page rules the whole menu:
//   · categories — add, rename (EN + AR), reorder, show/hide,
//     delete (only when empty)
//   · products — add under any category, edit, reorder inside
//     the category, ENABLE / DISABLE, move between categories,
//     feature/unfeature, delete (archive-safe)
//  Product & category forms live in index.html modals and are
//  wired here. Saves go straight to Supabase.
// ============================================================
import {
  getCategories, getProducts,
  createCategory, updateCategory, deleteCategory, saveCategoryOrder,
  createProduct, updateProduct, deleteProduct, saveProductOrder,
  uploadMedia,
} from './api.js';
import { $, esc, toast, openLayer, closeLayer, confirmDialog, setSaveState } from './ui.js';
import { t, pickLang } from '../shared/i18n.js';
import { resolveImage } from '../shared/media.js';
import { openMediaPicker } from './media.js';

let categories = [];
let products = [];
let query = '';

/* modal state */
let editingProduct = null;   // product id or null
let editingCategory = null;  // category id or null
let formImage = '';          // current image in the product form
let modalWired = false;

const catById = (id) => categories.find((c) => c.id === id);

const catName = (c) =>
  c.name_ar ? (document.documentElement.lang === 'ar' ? c.name_ar : `${c.name} · ${c.name_ar}`) : c.name;

const prodTitle = (p) => (p.name_ar ? `${p.name} · ${p.name_ar}` : p.name);

/* ═══════════════════ load ═══════════════════ */
async function reload() {
  [categories, products] = await Promise.all([getCategories(), getProducts()]);
}

/* ═══════════════════ page render ═══════════════════ */
export async function renderMenu(view) {
  view.innerHTML = `
    <div class="toolbar">
      <label class="searchbox">
        <svg class="icon"><use href="#i-search"/></svg>
        <input id="mnSearch" type="search" placeholder="${esc(t('mn.searchPh'))}" autocomplete="off" />
      </label>
      <span class="count-note" id="mnCount"></span>
      <span class="toolbar__spacer"></span>
      <button class="btn btn--ghost" id="mnAddCat">
        <svg class="icon"><use href="#i-plus"/></svg> ${esc(t('mn.addCategory'))}
      </button>
      <button class="btn btn--primary" id="mnAddProduct">
        <svg class="icon"><use href="#i-cup"/></svg> ${esc(t('mn.addProduct'))}
      </button>
    </div>
    <p class="toolbar-note">
      <svg class="icon"><use href="#i-check"/></svg>
      <span>${esc(t('mn.note'))}</span>
    </p>
    <div id="mnList"><div class="skel-rows">${'<div class="skel-row"></div>'.repeat(3)}</div></div>`;

  $('mnSearch').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); paint(); });
  $('mnAddCat').addEventListener('click', () => openCategoryForm(null));
  $('mnAddProduct').addEventListener('click', () => openProductForm(null, null));
  wireModals();

  view.addEventListener('click', onAction);
  view.addEventListener('change', onChange);

  try {
    await reload();
    paint();
  } catch (err) {
    $('mnList').innerHTML = `<div class="err-box"><svg class="icon"><use href="#i-warn"/></svg><p>${esc(err.message)}</p></div>`;
  }
}

/* ═══════════════════ painting ═══════════════════ */
function visibleProducts(catId) {
  const inCat = products.filter((p) => p.category_id === catId);
  if (!query) return inCat;
  return inCat.filter((p) =>
    p.name.toLowerCase().includes(query) ||
    (p.name_ar || '').includes(query) ||
    (p.badge || '').toLowerCase().includes(query)
  );
}

const matchCategory = (c) =>
  !query || c.name.toLowerCase().includes(query) || (c.name_ar || '').includes(query) ||
  products.some((p) => p.category_id === c.id &&
    (p.name.toLowerCase().includes(query) || (p.name_ar || '').includes(query)));

function productRow(p, catId, idx, total) {
  return `
    <div class="mnp ${p.available ? '' : 'is-off'}" data-pid="${p.id}" data-cat="${catId}">
      <span class="mnp__grip">
        <button class="icon-btn" data-act="p-up" aria-label="${esc(t('g.moveUp'))}" ${idx === 0 ? 'disabled' : ''}><svg class="icon"><use href="#i-chev-up"/></svg></button>
        <button class="icon-btn" data-act="p-down" aria-label="${esc(t('g.moveDown'))}" ${idx === total - 1 ? 'disabled' : ''}><svg class="icon"><use href="#i-chev-dn"/></svg></button>
      </span>
      <span class="mnp__img">${p.image
        ? `<img src="${esc(resolveImage(p.image))}" alt="" loading="lazy">`
        : `<svg class="icon"><use href="#i-cup"/></svg>`}</span>
      <div class="mnp__body">
        <b>${esc(prodTitle(p))}</b>
        <small>${esc(p.badge || pickLang(p, 'description')?.slice(0, 60) || '')}</small>
      </div>
      <span class="mnp__price">EGP ${(+p.price).toFixed(2)}</span>
      <button class="icon-btn mnp__star ${p.featured ? 'on' : ''}" data-act="p-feature"
              title="${esc(t('mn.featured'))}" aria-label="${esc(t('mn.featured'))}">
        <svg class="icon"><use href="#i-star-o"/></svg>
      </button>
      <select class="select select--mini mnp__move" data-act="p-move" title="${esc(t('mn.moveTo'))}" aria-label="${esc(t('mn.moveTo'))}">
        ${categories.map((c) => `<option value="${c.id}" ${c.id === catId ? 'selected' : ''}>${esc(catName(c))}</option>`).join('')}
      </select>
      <label class="switch" title="${esc(t('mn.availability'))}">
        <input type="checkbox" data-act="p-visible" ${p.available ? 'checked' : ''} /><i></i>
      </label>
      <span class="mnp__acts">
        <button class="icon-btn" data-act="p-edit" aria-label="${esc(t('act.edit'))}"><svg class="icon"><use href="#i-pen"/></svg></button>
        <button class="icon-btn danger" data-act="p-del" aria-label="${esc(t('act.del'))}"><svg class="icon"><use href="#i-trash"/></svg></button>
      </span>
    </div>`;
}

function paint() {
  const list = $('mnList');
  if (!list) return;

  const cats = categories.filter(matchCategory);
  const shown = cats.reduce((n, c) => n + visibleProducts(c.id).length, 0);
  $('mnCount').textContent = t('mn.count', { c: categories.length, p: query ? shown : products.length });

  if (!categories.length) {
    list.innerHTML = `
      <div class="err-box">
        <svg class="icon"><use href="#i-tag"/></svg>
        <p>${esc(t('mn.emptyAll'))}</p>
      </div>`;
    return;
  }

  list.innerHTML = cats.map((c, ci) => {
    const rows = visibleProducts(c.id);
    return `
    <section class="mnc ${c.visible ? '' : 'is-off'}" data-cat="${c.id}">
      <header class="mnc__head">
        <span class="mnc__grip">
          <button class="icon-btn" data-act="c-up" aria-label="${esc(t('g.moveUp'))}" ${ci === 0 ? 'disabled' : ''}><svg class="icon"><use href="#i-chev-up"/></svg></button>
          <button class="icon-btn" data-act="c-down" aria-label="${esc(t('g.moveDown'))}" ${ci === cats.length - 1 ? 'disabled' : ''}><svg class="icon"><use href="#i-chev-dn"/></svg></button>
        </span>
        <span class="mnc__title">
          <b>${esc(c.name)}</b>
          ${c.name_ar ? `<span class="mnc__ar" dir="rtl">${esc(c.name_ar)}</span>` : ''}
          <small class="mnc__count">${esc(t('mn.products', { n: c.product_count }))}</small>
        </span>
        <label class="switch" title="${esc(t('mn.catVisible'))}">
          <input type="checkbox" data-act="c-visible" ${c.visible ? 'checked' : ''} /><i></i>
        </label>
        <span class="mnc__acts">
          <button class="icon-btn" data-act="c-add" title="${esc(t('mn.addHere'))}" aria-label="${esc(t('mn.addHere'))}"><svg class="icon"><use href="#i-plus"/></svg></button>
          <button class="icon-btn" data-act="c-edit" aria-label="${esc(t('act.edit'))}"><svg class="icon"><use href="#i-pen"/></svg></button>
          <button class="icon-btn danger" data-act="c-del" aria-label="${esc(t('act.del'))}"><svg class="icon"><use href="#i-trash"/></svg></button>
        </span>
      </header>
      <div class="mnc__body">
        ${rows.length
          ? rows.map((p, i) => productRow(p, c.id, i, rows.length)).join('')
          : `<p class="empty-mini">${esc(query ? t('mn.noMatch') : t('mn.emptyCat'))}</p>`}
      </div>
    </section>`;
  }).join('');
}

/* ═══════════════════ category actions ═══════════════════ */
async function reorderCategories(id, dir) {
  const i = categories.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= categories.length) return;
  [categories[i], categories[j]] = [categories[j], categories[i]];
  paint();
  setSaveState('busy');
  try {
    await saveCategoryOrder(categories.map((c) => c.id));
    setSaveState('ok');
  } catch (err) {
    setSaveState('error');
    toast(err.message, 'error');
    await reload(); paint();
  }
}

async function reorderProducts(catId, pid, dir) {
  const rows = products.filter((p) => p.category_id === catId);
  const i = rows.findIndex((p) => p.id === pid);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  // re-sequence the global products array to match the new in-category order
  let k = 0;
  products = products.map((p) => (p.category_id === catId ? rows[k++] : p));
  paint();
  setSaveState('busy');
  try {
    await saveProductOrder(products.map((p) => p.id));
    setSaveState('ok');
  } catch (err) {
    setSaveState('error');
    toast(err.message, 'error');
    await reload(); paint();
  }
}

async function onAction(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  const act = btn.dataset.act;
  const row = btn.closest('[data-pid]');
  const catEl = btn.closest('[data-cat]');
  const pid = row ? Number(row.dataset.pid) : null;
  const catIdInput = catEl ? Number(catEl.dataset.cat) : null;

  try {
    if (act === 'c-up' || act === 'c-down') return reorderCategories(catIdInput, act === 'c-up' ? -1 : 1);
    if (act === 'p-up' || act === 'p-down') return reorderProducts(catIdInput, pid, act === 'p-up' ? -1 : 1);
    if (act === 'c-edit') return openCategoryForm(catById(catIdInput));
    if (act === 'c-add') return openProductForm(null, catIdInput);
    if (act === 'p-edit') return openProductForm(products.find((p) => p.id === pid), null);

    if (act === 'p-feature') {
      const p = products.find((x) => x.id === pid);
      await updateProduct(pid, { featured: !p.featured });
      p.featured = !p.featured;
      paint();
      toast(p.featured ? t('mn.featuredOn', { name: p.name }) : t('mn.featuredOff', { name: p.name }));
      return;
    }

    if (act === 'c-del') {
      const c = catById(catIdInput);
      const ok = await confirmDialog({
        title: t('mn.delCatTitle', { name: c.name }),
        text: t('mn.delCatText'),
        yes: t('mn.delCatYes'),
      });
      if (!ok) return;
      await deleteCategory(catIdInput);
      categories = categories.filter((x) => x.id !== catIdInput);
      paint();
      toast(t('mn.catDeleted', { name: c.name }));
      return;
    }

    if (act === 'p-del') {
      const p = products.find((x) => x.id === pid);
      const ok = await confirmDialog({
        title: t('mn.delProdTitle', { name: p.name }),
        text: t('mn.delProdText'),
        yes: t('mn.delProdYes'),
      });
      if (!ok) return;
      const res = await deleteProduct(pid);
      if (res.archived) {
        p.available = 0;
        toast(res.message, 'error');
      } else {
        products = products.filter((x) => x.id !== pid);
        const c = catById(p.category_id);
        if (c) c.product_count = Math.max(0, c.product_count - 1);
        toast(t('mn.prodDeleted', { name: p.name }));
      }
      paint();
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function onChange(e) {
  const ctl = e.target.closest('[data-act]');
  if (!ctl) return;
  const act = ctl.dataset.act;
  const scope = ctl.closest('[data-pid],[data-cat]');
  const pid = ctl.closest('[data-pid]') ? Number(ctl.closest('[data-pid]').dataset.pid) : null;
  const catId = scope ? Number(scope.dataset.cat) : null;

  try {
    if (act === 'c-visible') {
      await updateCategory(catId, undefined, { visible: ctl.checked });
      catById(catId).visible = ctl.checked;
      ctl.closest('.mnc')?.classList.toggle('is-off', !ctl.checked);
      toast(ctl.checked ? t('mn.catShown', { name: catById(catId).name }) : t('mn.catHidden', { name: catById(catId).name }));
      return;
    }
    if (act === 'p-visible') {
      const p = products.find((x) => x.id === pid);
      await updateProduct(pid, { available: ctl.checked });
      p.available = ctl.checked ? 1 : 0;
      ctl.closest('.mnp')?.classList.toggle('is-off', !ctl.checked);
      toast(ctl.checked ? t('mn.shown', { name: p.name }) : t('mn.hidden', { name: p.name }));
      return;
    }
    if (act === 'p-move') {
      const target = Number(ctl.value);
      if (target === catId) return;
      const p = products.find((x) => x.id === pid);
      await updateProduct(pid, { category_id: target });
      // last in the target category
      products = products.filter((x) => x.id !== pid);
      const after = products.reduce((idx, x, i) => (x.category_id === target ? i : idx), -1);
      p.category_id = target;
      p.category = catById(target)?.name ?? '';
      p.category_ar = catById(target)?.name_ar ?? '';
      if (after === -1) products.push(p); else products.splice(after + 1, 0, p);
      await saveProductOrder(products.map((x) => x.id));
      await reload(); // refresh counts
      paint();
      toast(t('mn.moved', { name: p.name, cat: catName(catById(target)) }));
    }
  } catch (err) {
    toast(err.message, 'error');
    await reload(); paint();
  }
}

/* ═══════════════════ modals (index.html shell) ═══════════════════ */
function wireModals() {
  if (modalWired) return;
  modalWired = true;

  /* --- image dropzone / picker --- */
  const drop = $('pfDrop');
  const file = $('pfFile');
  const preview = $('pfPreview');

  const paintImage = () => {
    const has = !!formImage;
    preview.hidden = !has;
    if (has) preview.src = resolveImage(formImage);
    $('pfDropHint').hidden = has;
    $('pfClear').hidden = !has;
  };

  const doUpload = async (f) => {
    $('pfUploading').hidden = false;
    drop.classList.add('is-busy');
    try {
      const row = await uploadMedia(f, 'products');
      formImage = row.public_url;
      paintImage();
      toast(t('g.uploadedLib'));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      $('pfUploading').hidden = true;
      drop.classList.remove('is-busy');
      file.value = '';
    }
  };

  drop.addEventListener('click', () => file.click());
  drop.addEventListener('keydown', (e2) => { if (e2.key === 'Enter' || e2.key === ' ') { e2.preventDefault(); file.click(); } });
  file.addEventListener('change', () => { if (file.files?.[0]) doUpload(file.files[0]); });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e2) => { e2.preventDefault(); drop.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e2) => { e2.preventDefault(); drop.classList.remove('dragover'); }));
  drop.addEventListener('drop', (e2) => { const f = e2.dataTransfer?.files?.[0]; if (f) doUpload(f); });
  $('pfClear').addEventListener('click', (e2) => { e2.stopPropagation(); formImage = ''; paintImage(); });
  $('pfLibrary').addEventListener('click', (e2) => {
    e2.stopPropagation();
    openMediaPicker((url) => { formImage = url; paintImage(); });
  });

  /* --- product form save --- */
  $('pfSave').addEventListener('click', saveProductForm);
  $('pfName').addEventListener('keydown', (e2) => { if (e2.key === 'Enter') saveProductForm(); });

  /* --- category form save --- */
  $('cfSave').addEventListener('click', saveCategoryForm);
  $('cfName').addEventListener('keydown', (e2) => { if (e2.key === 'Enter') saveCategoryForm(); });
  $('cfNameAr').addEventListener('keydown', (e2) => { if (e2.key === 'Enter') saveCategoryForm(); });
}

function fillCategorySelect(selectedId) {
  $('pfCategory').innerHTML = categories
    .map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(catName(c))}</option>`)
    .join('');
}

function openProductForm(p, presetCatId) {
  editingProduct = p ? p.id : null;
  $('pfTitle').textContent = p ? t('pf.edit') : t('pf.add');
  fillCategorySelect(p ? p.category_id : (presetCatId ?? categories[0]?.id));
  formImage = p?.image ?? '';
  $('pfName').value = p?.name ?? '';
  $('pfNameAr').value = p?.name_ar ?? '';
  $('pfPrice').value = p ? String(p.price) : '';
  $('pfBadge').value = p?.badge ?? '';
  $('pfDesc').value = p?.description ?? '';
  $('pfDescAr').value = p?.description_ar ?? '';
  $('pfAvailable').checked = p ? !!p.available : true;
  $('pfFeatured').checked = p ? !!p.featured : false;
  $('pfError').textContent = '';
  // paint dropzone
  const preview = $('pfPreview');
  preview.hidden = !formImage;
  if (formImage) preview.src = resolveImage(formImage);
  $('pfDropHint').hidden = !!formImage;
  $('pfClear').hidden = !formImage;
  $('pfUploading').hidden = true;
  openLayer($('productModal'));
  setTimeout(() => $('pfName').focus(), 60);
}

async function saveProductForm() {
  const err = $('pfError');
  err.textContent = '';
  const body = {
    name: $('pfName').value,
    name_ar: $('pfNameAr').value,
    price: $('pfPrice').value,
    category_id: $('pfCategory').value,
    description: $('pfDesc').value,
    description_ar: $('pfDescAr').value,
    badge: $('pfBadge').value,
    image: formImage,
    available: $('pfAvailable').checked,
    featured: $('pfFeatured').checked,
  };
  const btn = $('pfSave');
  btn.disabled = true;
  try {
    if (editingProduct) {
      const updated = await updateProduct(editingProduct, body);
      const i = products.findIndex((p) => p.id === editingProduct);
      if (i > -1) products[i] = updated;
      toast(t('mn.prodSaved', { name: updated.name }));
    } else {
      const created = await createProduct(body);
      products.push(created);
      const c = catById(created.category_id);
      if (c) c.product_count += 1;
      toast(t('mn.prodAdded', { name: created.name }));
    }
    closeLayer($('productModal'));
    await reload();
    paint();
  } catch (e2) {
    err.textContent = e2.message;
  } finally {
    btn.disabled = false;
  }
}

function openCategoryForm(c) {
  editingCategory = c ? c.id : null;
  $('cfTitle').textContent = c ? t('cf2.edit') : t('cf2.add');
  $('cfName').value = c?.name ?? '';
  $('cfNameAr').value = c?.name_ar ?? '';
  $('cfError').textContent = '';
  openLayer($('categoryModal'));
  setTimeout(() => $('cfName').focus(), 60);
}

async function saveCategoryForm() {
  const err = $('cfError');
  err.textContent = '';
  const name = $('cfName').value;
  const nameAr = $('cfNameAr').value;
  const btn = $('cfSave');
  btn.disabled = true;
  try {
    if (editingCategory) {
      const updated = await updateCategory(editingCategory, name, { name_ar: nameAr });
      const i = categories.findIndex((c) => c.id === editingCategory);
      if (i > -1) categories[i] = { ...categories[i], ...updated };
      toast(t('mn.catSaved', { name: updated.name }));
    } else {
      const created = await createCategory(name, nameAr);
      categories.push({ ...created, visible: true });
      toast(t('mn.catAdded', { name: created.name }));
    }
    closeLayer($('categoryModal'));
    await reload();
    paint();
  } catch (e2) {
    err.textContent = e2.message;
  } finally {
    btn.disabled = false;
  }
}
