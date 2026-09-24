// ============================================================
//  Aquarium Cafe & Restaurant — digital menu (v5, bilingual)
//  categories (EN + AR names), search (both languages), sort,
//  favorites, product grid & modal. Every chrome string comes
//  from the dictionary; product/category names switch with the
//  language through pickLang().
// ============================================================
import { getCategories, getProducts, getAdditions } from './api.js';
import { addToCart } from './cart.js';
import { money, esc, openLayer, closeLayer, observeReveals, toast } from './ui.js';
import { t, pickLang, isRTL } from '../shared/i18n.js';

const MAX_QTY = 20;
const FAV_KEY = 'aquarium_favs_v1';

let categories = [];
let products = [];
let additions = [];
let activeSlug = 'all';
let query = '';
let sortMode = 'default';

let modalProduct = null;
let modalQty = 1;
let selectedSize = null;
let selectedAdditions = new Map();

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

/* ---------- bilingual product text ---------- */
const pname = (p) => pickLang(p, 'name');
const pdesc = (p) => pickLang(p, 'description');
const pcat = (p) => (isRTL() && p.category_ar ? p.category_ar : p.category);
const SIZE_KEYS = ['S', 'D', 'T', 'Q'];

function variantKey(name) {
  const m = String(name || '').match(/\s*\(([SDTQ])\)\s*$/i);
  return m ? m[1].toUpperCase() : null;
}

function baseProductName(name) {
  return String(name || '').replace(/\s*\(([SDTQ])\)\s*$/i, '').trim();
}

function groupProducts(raw) {
  const groups = new Map();
  for (const p of raw || []) {
    const key = baseProductName(p.name);
    const size = variantKey(p.name);
    if (!size) {
      groups.set(String(p.id), { ...p, variants: [{ ...p, size: null }] });
      continue;
    }
    const existing = groups.get(key);
    if (existing) {
      existing.variants.push({ ...p, size });
    } else {
      groups.set(key, { ...p, name: key, variants: [{ ...p, size }] });
    }
  }
  return [...groups.values()].map((p) => {
    const variants = p.variants.slice().sort((a, b) => {
      const ai = SIZE_KEYS.indexOf(a.size); const bi = SIZE_KEYS.indexOf(b.size);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.id - b.id;
    });
    const defaultVariant = variants.find((v) => v.size === 'S') || variants[0];
    return {
      ...p,
      id: defaultVariant.id,
      price: defaultVariant.price,
      variants,
      defaultVariant,
    };
  });
}

function sizeLabel(size) {
  return ({ S: 'S', D: 'D', T: 'T', Q: 'Q' })[size] || size;
}

function selectedVariant() {
  if (!modalProduct) return null;
  return modalProduct.variants?.find((v) => v.size === selectedSize) || modalProduct.defaultVariant || modalProduct;
}



/* ---------- favorites (localStorage) ---------- */
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
  els.bar.innerHTML =
    `<button class="chip" data-slug="all" role="tab">${esc(t('chip.all'))} <small>${total}</small></button>` +
    (favs.size
      ? `<button class="chip chip--fav" data-slug="favorites" role="tab"><svg class="icon"><use href="#i-heart"/></svg> ${esc(t('chip.favorites'))} <small>${favs.size}</small></button>`
      : '') +
    (feats
      ? `<button class="chip chip--feat" data-slug="featured" role="tab"><svg class="icon"><use href="#i-star"/></svg> ${esc(t('chip.featured'))} <small>${feats}</small></button>`
      : '') +
    categories
      .map(
        (c) =>
          `<button class="chip" data-slug="${esc(c.slug)}" role="tab">${esc(pickLang(c, 'name'))} <small>${c.product_count}</small></button>`
      )
      .join('');
  els.bar.querySelector(`[data-slug="${CSS.escape(activeSlug)}"]`)?.classList.add('is-active');
}

function onChipClick(e) {
  const btn = e.target.closest('.chip');
  if (!btn || btn.dataset.slug === activeSlug) return;
  activeSlug = btn.dataset.slug;
  els.bar.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c === btn));
  renderGrid(true);
}

/* ---------- filtering (chip + search + sort) ---------- */
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
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.name_ar || '').includes(query.trim()) ||
        p.description.toLowerCase().includes(q) ||
        (p.description_ar || '').includes(query.trim()) ||
        p.category.toLowerCase().includes(q) ||
        (p.category_ar || '').includes(query.trim())
    );
  }

  if (sortMode === 'price-asc') list.sort((a, b) => a.price - b.price || a.id - b.id);
  else if (sortMode === 'price-desc') list.sort((a, b) => b.price - a.price || a.id - b.id);
  else if (sortMode === 'name')
    list.sort((a, b) => pname(a).localeCompare(pname(b), isRTL() ? 'ar' : 'en'));

  return list;
}

/* ---------- product grid ---------- */
function cardHTML(p, i) {
  const fav = favs.has(p.id);
  const name = pname(p);
  return `
  <article class="card reveal" style="--d:${(i % 8) * 60}ms" data-id="${p.id}" tabindex="0"
           role="button" aria-label="${esc(t('card.details'))} · ${esc(name)}">
    <div class="card__media">
      <img src="${esc(p.image || 'images/placeholder.svg')}" alt="${esc(name)}" loading="lazy" decoding="async"
           onerror="this.onerror=null;this.src='images/placeholder.svg'">
      <span class="card__cat">${esc(pcat(p))}</span>
      ${p.badge ? `<span class="card__badge">${esc(p.badge)}</span>` : ''}
      ${p.featured ? `<span class="card__feat"><svg class="icon"><use href="#i-star"/></svg> ${esc(t('chip.featured'))}</span>` : ''}
      <button class="card__fav ${fav ? 'is-fav' : ''}" data-fav="${p.id}"
              aria-pressed="${fav}" aria-label="${esc(fav ? t('fav.remove') : t('fav.add'))}">
        <svg class="icon"><use href="#i-heart"/></svg>
      </button>
    </div>
    <div class="card__body">
      <h3 class="card__name">${esc(name)}</h3>
      <p class="card__desc">${esc(pdesc(p))}</p>
      <div class="card__foot">
        <span class="card__price">${money(p.price)}</span>
        <button class="card__add" data-add="${p.id}" aria-label="${esc(t('card.addAria', { name }))}">
          <svg class="icon"><use href="#i-plus"/></svg>
        </button>
      </div>
    </div>
  </article>`;
}

function renderSkeletons() {
  els.grid.innerHTML = Array.from({ length: 8 }, () => `
    <div class="skel">
      <div class="skel__img"></div>
      <div class="skel__body">
        <div class="skel__line w60"></div>
        <div class="skel__line"></div>
        <div class="skel__line w40"></div>
      </div>
    </div>`).join('');
}

function renderGrid(animate = false) {
  const list = visibleProducts();

  if (!list.length) {
    const searching = query.trim().length > 0;
    const favEmpty = activeSlug === 'favorites';
    const titleKey = searching ? 'menu.noResultsTitle' : favEmpty ? 'menu.favEmptyTitle' : 'menu.catEmptyTitle';
    const subKey = searching ? 'menu.noResultsSub' : favEmpty ? 'menu.favEmptySub' : 'menu.catEmptySub';
    els.grid.innerHTML = `
      <div class="menu__empty">
        <svg class="icon"><use href="#${searching ? 'i-search' : favEmpty ? 'i-heart' : 'i-cup'}"/></svg>
        <strong>${esc(t(titleKey))}</strong>
        <p>${esc(t(subKey))}</p>
      </div>`;
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

function onGridClick(e) {
  const favBtn = e.target.closest('[data-fav]');
  if (favBtn) {
    e.stopPropagation();
    const wasFavChip = activeSlug === 'favorites';
    toggleFav(Number(favBtn.dataset.fav));
    if (wasFavChip) {
      renderChips();
      renderGrid(true);
    } else {
      const on = favs.has(Number(favBtn.dataset.fav));
      favBtn.classList.toggle('is-fav', on);
      favBtn.setAttribute('aria-pressed', String(on));
      favBtn.setAttribute('aria-label', on ? t('fav.remove') : t('fav.add'));
      renderChips();
      els.bar.querySelector(`[data-slug="${CSS.escape(activeSlug)}"]`)?.classList.add('is-active');
    }
    return;
  }
  const addBtn = e.target.closest('[data-add]');
  if (addBtn) {
    e.stopPropagation();
    const p = products.find((x) => x.id === Number(addBtn.dataset.add));
    if (p) addToCart(p, 1);
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

/* ---------- search & sort ---------- */
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

/* ---------- product modal ---------- */
function paintModal() {
  const p = modalProduct;
  if (!p) return;
  const name = pname(p);
  const variant = selectedVariant();
  els.img.src = variant?.image || p.image || 'images/placeholder.svg';
  els.img.alt = name;
  els.img.onerror = () => { els.img.onerror = null; els.img.src = 'images/placeholder.svg'; };
  els.cat.textContent = pcat(p) + (p.featured ? ' · ★ ' + t('chip.featured') : '');
  els.name.textContent = name;
  els.desc.textContent = pdesc(p);

  const variants = (p.variants || []).filter((v) => v.size);
  els.sizes.hidden = variants.length < 2;
  els.sizes.innerHTML = variants.length < 2 ? '' : variants.map((v) =>
    `<button type="button" class="pm__size ${v.size === selectedSize ? 'is-active' : ''}" data-size="${v.size}">
      <span>${esc(sizeLabel(v.size))}</span><b>${money(v.price)}</b>
    </button>`).join('');

  els.additions.innerHTML = additions.length
    ? additions.map((a) => {
        const qty = selectedAdditions.get(a.id) || 0;
        return `<div class="pm__extra" data-extra-id="${a.id}">
          <div><strong>${esc(pname(a))}</strong><small>${money(a.price)}</small></div>
          <div class="pm__extra-qty">
            <button type="button" data-extra-dec aria-label="Decrease">−</button>
            <b>${qty}</b>
            <button type="button" data-extra-inc aria-label="Increase">+</button>
          </div>
        </div>`;
      }).join('')
    : `<p class="pm__extras-empty">${esc(isRTL() ? 'لا توجد إضافات مضافة حالياً.' : 'No additions are configured.')}</p>`;

  els.price.textContent = money(variant?.price ?? p.price);
  if (p.badge) {
    els.badge.textContent = p.badge;
    els.badge.hidden = false;
  } else els.badge.hidden = true;
  updateModalTotal();
}

function updateModalTotal() {
  const variant = selectedVariant();
  const base = Number(variant?.price ?? modalProduct?.price ?? 0);
  const extras = [...selectedAdditions.entries()].reduce((sum, [id, qty]) => {
    const a = additions.find((x) => x.id === id);
    return sum + (a ? Number(a.price) * qty : 0);
  }, 0);
  els.addTotal.textContent = money((base + extras) * modalQty);
}

function openProduct(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  modalProduct = p;
  const variants = p.variants || [];
  selectedSize = variants.find((v) => v.size === 'S')?.size || variants[0]?.size || null;
  selectedAdditions = new Map();
  setModalQty(1);
  paintModal();
  openLayer(els.modal);
}

function setModalQty(n) {
  modalQty = Math.min(MAX_QTY, Math.max(1, n));
  els.qtyVal.textContent = modalQty;
  updateModalTotal();
}

/* ---------- init ---------- */
export async function initMenu() {
  loadPremiumDesign();

  els = {
    bar: $('categoryBar'),
    sizes: $('pmSizes'),
    additions: $('pmAdditions'),
    grid: $('productGrid'),
    search: $('menuSearch'),
    sort: $('menuSort'),
    modal: $('productModal'),
    img: $('pmImg'),
    badge: $('pmBadge'),
    cat: $('pmCat'),
    name: $('pmName'),
    desc: $('pmDesc'),
    price: $('pmPrice'),
    qtyVal: $('pmQtyVal'),
    minus: $('pmMinus'),
    plus: $('pmPlus'),
    add: $('pmAdd'),
    addTotal: $('pmAddTotal'),
  };

  renderSkeletons();

  try {
    [categories, products, additions] = await Promise.all([getCategories(), getProducts(), getAdditions()]);
    products = groupProducts(products);
    const stat = document.getElementById('statItems');
    if (stat) stat.textContent = '200+';
  } catch (err) {
    els.grid.innerHTML = `
      <div class="menu__empty">
        <svg class="icon"><use href="#i-cup"/></svg>
        <p>${esc(err.message || t('menu.loadError'))}</p>
        <button class="btn btn--ghost" id="menuRetry">${esc(t('menu.retry'))}</button>
      </div>`;
    $('menuRetry').addEventListener('click', initMenu);
    return;
  }

  renderChips();
  renderGrid();

  els.bar.addEventListener('click', onChipClick);
  els.grid.addEventListener('click', onGridClick);
  els.grid.addEventListener('keydown', onGridKeydown);
  els.search.addEventListener('input', onSearch);
  els.sort.addEventListener('change', onSort);

  els.bar.classList.add('is-sticky');

  els.modal.addEventListener('click', (e) => {
    const size = e.target.closest('[data-size]');
    if (size && modalProduct) { selectedSize = size.dataset.size; paintModal(); return; }
    const extra = e.target.closest('[data-extra-inc], [data-extra-dec]');
    if (extra) {
      const row = extra.closest('[data-extra-id]');
      const id = Number(row?.dataset.extraId);
      const current = selectedAdditions.get(id) || 0;
      const next = extra.hasAttribute('data-extra-inc') ? Math.min(MAX_QTY, current + 1) : Math.max(0, current - 1);
      if (next) selectedAdditions.set(id, next); else selectedAdditions.delete(id);
      paintModal();
    }
  });

  els.minus.addEventListener('click', () => setModalQty(modalQty - 1));
  els.plus.addEventListener('click', () => setModalQty(modalQty + 1));
  els.add.addEventListener('click', () => {
    if (!modalProduct) return;
    const variant = selectedVariant();
    if (variant) addToCart(variant, modalQty);
    for (const [id, qty] of selectedAdditions.entries()) {
      const extra = additions.find((x) => x.id === id);
      if (extra && qty > 0) addToCart(extra, qty);
    }
    closeLayer(els.modal);
  });

  /* language switch: chips, grid, modal names all re-render */
  document.addEventListener('lang:changed', () => {
    renderChips();
    renderGrid();
    if (els.modal.classList.contains('open') && modalProduct) paintModal();
  });
}
