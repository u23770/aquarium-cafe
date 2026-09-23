// ============================================================
// Aquarium Cafe & Restaurant — digital menu
// Dedicated menu page with grouped size variants + additions.
// ============================================================
import { getCategories, getProducts } from './api.js';
import { addToCart } from './cart.js';
import { money, esc, openLayer, closeLayer, observeReveals, toast } from './ui.js';
import { t, pickLang, isRTL } from '../shared/i18n.js';

const MAX_QTY = 20;
const FAV_KEY = 'aquarium_favs_v1';
const ADDITIONS_CATEGORY_ID = 4;
const VARIANT_RE = /\s*\((S|D|T|Q)\)\s*$/i;
const VARIANT_LABELS = { S: 'S', D: 'D', T: 'T', Q: 'Q' };

let categories = [];
let products = [];
let additions = [];
let activeSlug = 'all';
let query = '';
let sortMode = 'default';

let modalProduct = null;
let modalVariant = null;
let modalQty = 1;
let els = null;

const $ = (id) => document.getElementById(id);

function loadPremiumDesign() {
  if (document.querySelector('link[data-premium-design]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/premium-navbar-hero.css';
  link.dataset.premiumDesign = '1';
  document.head.appendChild(link);
}

const pname = (p) => pickLang(p, 'name');
const pdesc = (p) => pickLang(p, 'description');
const pcat = (p) => (isRTL() && p.category_ar ? p.category_ar : p.category);

function baseName(name) {
  return String(name || '').replace(VARIANT_RE, '').trim();
}

function variantKey(name) {
  const m = String(name || '').match(VARIANT_RE);
  return m ? m[1].toUpperCase() : null;
}

function groupProducts(raw) {
  const groups = new Map();
  const singles = [];

  for (const p of raw) {
    const key = variantKey(p.name);
    if (!key) {
      singles.push({ ...p, baseName: pname(p), variantOptions: [] });
      continue;
    }

    const groupKey = String(p.category_id) + '|' + baseName(p.name).toLowerCase();
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(p);
  }

  const grouped = [];
  for (const rows of groups.values()) {
    rows.sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));
    const master = rows.find((p) => p.prices && typeof p.prices === 'object') || rows[0];
    const options = rows
      .map((p) => {
        const key = variantKey(p.name);
        const price = Number(p.price);
        return { key, label: VARIANT_LABELS[key] || key, price, productId: p.id };
      })
      .filter((v) => v.key);

    const prices = master.prices && typeof master.prices === 'object' ? master.prices : {};
    for (const option of options) {
      if (prices[option.key] != null) option.price = Number(prices[option.key]);
    }

    grouped.push({
      ...master,
      name: baseName(master.name),
      name_ar: baseName(master.name_ar),
      baseName: baseName(master.name),
      price: Math.min(...options.map((v) => v.price)),
      variantOptions: options,
      hasVariants: options.length > 0,
    });
  }

  return [...singles, ...grouped].sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));
}

/* ---------- favorites ---------- */
function loadFavs() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY));
    return new Set(Array.isArray(raw) ? raw.filter((n) => Number.isFinite(+n)).map(Number) : []);
  } catch {
    return new Set();
  }
}
let favs = loadFavs();
const persistFavs = () => localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));

function toggleFav(id) {
  if (favs.has(id)) favs.delete(id);
  else {
    favs.add(id);
    const p = products.find((x) => x.id === id);
    if (p) toast(t('fav.add') + ' · ' + pname(p) + ' ♥');
  }
  persistFavs();
}

/* ---------- chips ---------- */
function renderChips() {
  const total = products.length;
  const feats = products.filter((p) => p.featured).length;
  const visibleCategories = categories.filter((c) => c.id !== ADDITIONS_CATEGORY_ID);

  els.bar.innerHTML =
    `<button class="chip" data-slug="all" role="tab">${esc(t('chip.all'))} <small>${total}</small></button>` +
    (favs.size
      ? `<button class="chip chip--fav" data-slug="favorites" role="tab"><svg class="icon"><use href="#i-heart"/></svg> ${esc(t('chip.favorites'))} <small>${favs.size}</small></button>`
      : '') +
    (feats
      ? `<button class="chip chip--feat" data-slug="featured" role="tab"><svg class="icon"><use href="#i-star"/></svg> ${esc(t('chip.featured'))} <small>${feats}</small></button>`
      : '') +
    visibleCategories
      .map((c) => `<button class="chip" data-slug="${esc(c.slug)}" role="tab">${esc(pickLang(c, 'name'))} <small>${Math.max(0, c.product_count || 0)}</small></button>`)
      .join('');

  els.bar.querySelector(`[data-slug="${CSS.escape(activeSlug)}"]`)?.classList.add('is-active');
}

function onChipClick(e) {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  activeSlug = btn.dataset.slug;
  els.bar.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c === btn));
  renderGrid(true);
}

function visibleProducts() {
  let list =
    activeSlug === 'all'
      ? [...products]
      : activeSlug === 'featured'
        ? products.filter((p) => p.featured)
        : activeSlug === 'favorites'
          ? products.filter((p) => favs.has(p.id))
          : products.filter((p) => p.category_slug === activeSlug);

  const q = query.trim().toLowerCase();
  if (q) {
    list = list.filter((p) =>
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.name_ar || '').includes(query.trim()) ||
      String(p.description || '').toLowerCase().includes(q) ||
      String(p.description_ar || '').includes(query.trim()) ||
      String(p.category || '').toLowerCase().includes(q) ||
      String(p.category_ar || '').includes(query.trim())
    );
  }

  if (sortMode === 'price-asc') list.sort((a, b) => a.price - b.price || a.id - b.id);
  else if (sortMode === 'price-desc') list.sort((a, b) => b.price - a.price || a.id - b.id);
  else if (sortMode === 'name') list.sort((a, b) => pname(a).localeCompare(pname(b), isRTL() ? 'ar' : 'en'));
  return list;
}

/* ---------- product cards ---------- */
function cardHTML(p, i) {
  const fav = favs.has(p.id);
  const name = pname(p);
  const needsCustomization = p.hasVariants || additions.length > 0;
  const prices = p.variantOptions?.map((v) => v.price).filter(Number.isFinite) || [p.price];
  const minPrice = Math.min(...prices);

  return `
  <article class="card reveal" style="--d:${(i % 8) * 60}ms" data-id="${p.id}" tabindex="0"
           role="button" aria-label="${esc(t('card.details'))} · ${esc(name)}">
    <div class="card__media">
      <img src="${esc(p.image || 'images/placeholder.svg')}" alt="${esc(name)}" loading="lazy" decoding="async"
           onerror="this.onerror=null;this.src='images/placeholder.svg'">
      <span class="card__cat">${esc(pcat(p))}</span>
      ${p.badge ? `<span class="card__badge">${esc(p.badge)}</span>` : ''}
      ${p.featured ? `<span class="card__feat"><svg class="icon"><use href="#i-star"/></svg> ${esc(t('chip.featured'))}</span>` : ''}
      <button class="card__fav ${fav ? 'is-fav' : ''}" data-fav="${p.id}" aria-pressed="${fav}" aria-label="${esc(fav ? t('fav.remove') : t('fav.add'))}">
        <svg class="icon"><use href="#i-heart"/></svg>
      </button>
    </div>
    <div class="card__body">
      <h3 class="card__name">${esc(name)}</h3>
      <p class="card__desc">${esc(pdesc(p))}</p>
      <div class="card__foot">
        <span class="card__price">${p.hasVariants ? esc(t('card.from')) + ' ' : ''}${money(minPrice)}</span>
        <button class="card__add ${needsCustomization ? 'card__add--custom' : ''}" data-add="${p.id}" aria-label="${esc(t('card.addAria', { name }))}">
          <svg class="icon"><use href="#i-${needsCustomization ? 'plus' : 'bag'}"/></svg>
        </button>
      </div>
    </div>
  </article>`;
}

function renderSkeletons() {
  els.grid.innerHTML = Array.from({ length: 8 }, () => `
    <div class="skel"><div class="skel__img"></div><div class="skel__body"><div class="skel__line w60"></div><div class="skel__line"></div><div class="skel__line w40"></div></div></div>`).join('');
}

function renderGrid(animate = false) {
  const list = visibleProducts();
  if (!list.length) {
    const searching = query.trim().length > 0;
    const favEmpty = activeSlug === 'favorites';
    const titleKey = searching ? 'menu.noResultsTitle' : favEmpty ? 'menu.favEmptyTitle' : 'menu.catEmptyTitle';
    const subKey = searching ? 'menu.noResultsSub' : favEmpty ? 'menu.favEmptySub' : 'menu.catEmptySub';
    els.grid.innerHTML = `<div class="menu__empty"><svg class="icon"><use href="#${searching ? 'i-search' : favEmpty ? 'i-heart' : 'i-cup'}"/></svg><strong>${esc(t(titleKey))}</strong><p>${esc(t(subKey))}</p></div>`;
    return;
  }
  els.grid.innerHTML = list.map(cardHTML).join('');
  observeReveals(els.grid.querySelectorAll('.reveal'));
  if (animate) {
    els.grid.classList.remove('switching');
    void els.grid.offsetWidth;
    els.grid.classList.add('switching');
  }
}

/* ---------- customization modal ---------- */
function renderVariantOptions() {
  const wrap = els.variants;
  if (!wrap || !modalProduct?.variantOptions?.length) {
    if (wrap) wrap.innerHTML = '';
    return;
  }
  const opts = modalProduct.variantOptions;
  const defaultKey = opts.some((v) => v.key === 'S') ? 'S' : opts[0].key;
  if (!modalVariant || !opts.some((v) => v.key === modalVariant.key)) {
    modalVariant = opts.find((v) => v.key === defaultKey) || opts[0];
  }

  wrap.innerHTML = `
    <div class="pm-option-head"><strong>${esc(t('pm.size'))}</strong><small>${esc(t('pm.chooseSize'))}</small></div>
    <div class="pm-variants" role="radiogroup" aria-label="${esc(t('pm.size'))}">
      ${opts.map((v) => `
        <button type="button" class="pm-variant ${v.key === modalVariant.key ? 'is-active' : ''}" data-variant="${esc(v.key)}">
          <span>${esc(v.label)}</span><strong>${money(v.price)}</strong>
        </button>`).join('')}
    </div>`;
}

function renderAdditions() {
  const wrap = els.additions;
  if (!wrap) return;
  if (!additions.length) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = `
    <div class="pm-option-head"><strong>${esc(t('pm.additions'))}</strong><small>${esc(t('pm.additionsHint'))}</small></div>
    <div class="pm-additions">
      ${additions.map((a) => `
        <label class="pm-addition">
          <input type="checkbox" value="${a.id}" data-addition>
          <span class="pm-addition__name">${esc(pname(a))}</span>
          <strong>+${money(a.price)}</strong>
        </label>`).join('')}
    </div>`;
}

function selectedAdditions() {
  return [...els.additions.querySelectorAll('[data-addition]:checked')]
    .map((input) => additions.find((a) => a.id === Number(input.value)))
    .filter(Boolean);
}

function modalUnitPrice() {
  const base = Number(modalVariant?.price ?? modalProduct?.price ?? 0);
  const extras = selectedAdditions().reduce((sum, a) => sum + Number(a.price || 0), 0);
  return base + extras;
}

function paintModal() {
  const p = modalProduct;
  if (!p) return;
  const name = pname(p);
  els.img.src = p.image || 'images/placeholder.svg';
  els.img.alt = name;
  els.img.onerror = () => { els.img.onerror = null; els.img.src = 'images/placeholder.svg'; };
  els.cat.textContent = pcat(p) + (p.featured ? ' · ★ ' + t('chip.featured') : '');
  els.name.textContent = name;
  els.desc.textContent = pdesc(p);
  els.price.textContent = money(modalUnitPrice());
  if (p.badge) {
    els.badge.textContent = p.badge;
    els.badge.hidden = false;
  } else els.badge.hidden = true;
  els.qtyVal.textContent = modalQty;
  els.addTotal.textContent = money(modalUnitPrice() * modalQty);
}

function updateModalTotal() {
  const unit = modalUnitPrice();
  els.price.textContent = money(unit);
  els.addTotal.textContent = money(unit * modalQty);
}

function openProduct(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  modalProduct = p;
  modalVariant = null;
  modalQty = 1;
  openLayer(els.modal);
  renderVariantOptions();
  renderAdditions();
  paintModal();
}

function setModalQty(n) {
  modalQty = Math.min(MAX_QTY, Math.max(1, n));
  els.qtyVal.textContent = modalQty;
  els.addTotal.textContent = money(modalUnitPrice() * modalQty);
}

function onGridClick(e) {
  const favBtn = e.target.closest('[data-fav]');
  if (favBtn) {
    e.stopPropagation();
    const id = Number(favBtn.dataset.fav);
    toggleFav(id);
    const on = favs.has(id);
    if (activeSlug === 'favorites') {
      renderChips();
      renderGrid(true);
    } else {
      favBtn.classList.toggle('is-fav', on);
      favBtn.setAttribute('aria-pressed', String(on));
      favBtn.setAttribute('aria-label', on ? t('fav.remove') : t('fav.add'));
      renderChips();
    }
    return;
  }

  const addBtn = e.target.closest('[data-add]');
  if (addBtn) {
    e.stopPropagation();
    openProduct(Number(addBtn.dataset.add));
    return;
  }

  const card = e.target.closest('.card');
  if (card) openProduct(Number(card.dataset.id));
}

function onGridKeydown(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.card');
  if (!card || e.target.closest('[data-fav]')) return;
  e.preventDefault();
  openProduct(Number(card.dataset.id));
}

let searchTimer = null;
function onSearch(e) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    query = e.target.value;
    renderGrid(true);
  }, 160);
}
function onSort(e) {
  sortMode = e.target.value;
  renderGrid(true);
}

function addConfiguredProduct() {
  if (!modalProduct) return;
  const selected = modalVariant || { productId: modalProduct.id, price: modalProduct.price };
  addToCart(modalProduct, modalQty, {
    variantProduct: products.find((p) => p.id === selected.productId) || selected,
    additions: selectedAdditions(),
  });
  closeLayer(els.modal);
}

function initQueryCategory() {
  const requested = new URLSearchParams(location.search).get('category');
  if (requested && categories.some((c) => c.slug === requested && c.id !== ADDITIONS_CATEGORY_ID)) {
    activeSlug = requested;
  }
}

export async function initMenu() {
  if (!els) return;
  loadPremiumDesign();
  renderSkeletons();

  try {
    const [rawCategories, rawProducts] = await Promise.all([getCategories(), getProducts()]);
    categories = rawCategories;
    additions = rawProducts.filter((p) => p.category_id === ADDITIONS_CATEGORY_ID);
    products = groupProducts(rawProducts.filter((p) => p.category_id !== ADDITIONS_CATEGORY_ID));
    initQueryCategory();
    const stat = document.getElementById('statItems');
    if (stat) stat.textContent = String(products.length) + '+';
  } catch (err) {
    els.grid.innerHTML = `
      <div class="menu__empty"><svg class="icon"><use href="#i-cup"/></svg><p>${esc(err.message || t('menu.loadError'))}</p><button class="btn btn--ghost" id="menuRetry">${esc(t('menu.retry'))}</button></div>`;
    $('menuRetry').addEventListener('click', initMenu);
    return;
  }

  renderChips();
  renderGrid();

  els.bar.addEventListener('click', onChipClick);
  els.grid.addEventListener('click', onGridClick);
  els.grid.addEventListener('keydown', onGridKeydown);
  els.search?.addEventListener('input', onSearch);
  els.sort?.addEventListener('change', onSort);

  els.minus?.addEventListener('click', () => setModalQty(modalQty - 1));
  els.plus?.addEventListener('click', () => setModalQty(modalQty + 1));
  els.add?.addEventListener('click', addConfiguredProduct);
  els.variants?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-variant]');
    if (!b || !modalProduct) return;
    modalVariant = modalProduct.variantOptions.find((v) => v.key === b.dataset.variant) || modalVariant;
    els.variants.querySelectorAll('[data-variant]').forEach((x) => x.classList.toggle('is-active', x === b));
    updateModalTotal();
  });
  els.additions?.addEventListener('change', updateModalTotal);

  document.addEventListener('lang:changed', () => {
    renderChips();
    renderGrid();
    if (els.modal.classList.contains('open') && modalProduct) {
      renderVariantOptions();
      renderAdditions();
      paintModal();
    }
  });
}

export async function initHomeCategories() {
  const wrap = $('homeCategoryGrid');
  if (!wrap) return;
  try {
    const cats = await getCategories();
    const visible = cats.filter((c) => c.id !== ADDITIONS_CATEGORY_ID).slice(0, 8);
    wrap.innerHTML = visible.map((c) => `
      <a class="home-category-card" href="./menu.html?category=${encodeURIComponent(c.slug)}">
        <span class="home-category-card__icon"><svg class="icon"><use href="#i-cup"/></svg></span>
        <strong>${esc(pickLang(c, 'name'))}</strong>
        <small>${c.product_count || 0} ${esc(t('menu.itemsShort'))}</small>
      </a>`).join('');
  } catch {
    wrap.innerHTML = '';
  }
}
