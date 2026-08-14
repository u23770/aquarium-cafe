// ============================================================
//  Aquarium Cafe & Resturant — digital menu (v5, bilingual)
//  categories (EN + AR names), search (both languages), sort,
//  favorites, product grid & modal. Every chrome string comes
//  from the dictionary; product/category names switch with
//  the language through pickLang().
// ============================================================
import { getCategories, getProducts } from './api.js';
import { addToCart } from './cart.js';
import { money, esc, openLayer, closeLayer, observeReveals, toast } from './ui.js';
import { t, pickLang, isRTL } from '../../shared/i18n.js';

const MAX_QTY = 20;
const FAV_KEY = 'aquarium_favs_v1';

let categories = [];
let products = [];
let activeSlug = 'all';
let query = '';
let sortMode = 'default';

let modalProduct = null;
let modalQty = 1;

let els = null;
const $ = (id) => document.getElementById(id);

/* ---------- bilingual product text ---------- */
const pname = (p) => pickLang(p, 'name');
const pdesc = (p) => pickLang(p, 'description');
const pcat = (p) => (isRTL() && p.category_ar ? p.category_ar : p.category);

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
      renderChips(); // favorites chip appears/disappears with the counter
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
  els.img.src = p.image || 'images/placeholder.svg';
  els.img.alt = name;
  els.img.onerror = () => { els.img.onerror = null; els.img.src = 'images/placeholder.svg'; };
  els.cat.textContent = pcat(p) + (p.featured ? ' · ★ ' + t('chip.featured') : '');
  els.name.textContent = name;
  els.desc.textContent = pdesc(p);
  els.price.textContent = money(p.price);

  if (p.badge) {
    els.badge.textContent = p.badge;
    els.badge.hidden = false;
  } else {
    els.badge.hidden = true;
  }
}

function openProduct(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  modalProduct = p;
  setModalQty(1);
  paintModal();
  openLayer(els.modal);
}

function setModalQty(n) {
  modalQty = Math.min(MAX_QTY, Math.max(1, n));
  els.qtyVal.textContent = modalQty;
  if (modalProduct) els.addTotal.textContent = money(modalProduct.price * modalQty);
}

/* ---------- init ---------- */
export async function initMenu() {
  els = {
    bar: $('categoryBar'),
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
    [categories, products] = await Promise.all([getCategories(), getProducts()]);
    const stat = document.getElementById('statItems');
    if (stat && products.length) stat.textContent = `${products.length}+`;
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

  els.minus.addEventListener('click', () => setModalQty(modalQty - 1));
  els.plus.addEventListener('click', () => setModalQty(modalQty + 1));
  els.add.addEventListener('click', () => {
    if (!modalProduct) return;
    addToCart(modalProduct, modalQty);
    closeLayer(els.modal);
  });

  /* language switch: chips, grid, modal names all re-render */
  document.addEventListener('lang:changed', () => {
    renderChips();
    renderGrid();
    if (els.modal.classList.contains('open') && modalProduct) paintModal();
  });
}
