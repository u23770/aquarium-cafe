import { getCategories, getProducts } from './api.js';
import { addToCart } from './cart.js';
import { money, esc, openLayer, closeLayer, observeReveals, toast } from './ui.js';
import { t, pickLang, isRTL } from '../shared/i18n.js';

const MAX_QTY = 20;
const FAV_KEY = 'aquarium_favs_v1';

let categories = [];
let products = [];
let menuProducts = [];
let additionProducts = [];
let activeSlug = 'all';
let query = '';
let sortMode = 'default';
let favs = loadFavs();
let modalProduct = null;
let modalQty = 1;
let selectedVariantId = null;
let selectedAdditionIds = new Set();
let categoryObserver = null;
let els = null;

const $ = (id) => document.getElementById(id);
const pname = (p) => pickLang(p, 'name');
const pdesc = (p) => pickLang(p, 'description');
const pcat = (p) => isRTL() && p.category_ar ? p.category_ar : p.category;
const label = (en, ar) => isRTL() ? ar : en;

function loadPremiumDesign() {
  if (document.querySelector('link[data-premium-design]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/premium-navbar-hero.css';
  link.dataset.premiumDesign = '1';
  document.head.appendChild(link);
}

function loadFavs() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY));
    return new Set(Array.isArray(raw) ? raw.map(Number).filter(Number.isFinite) : []);
  } catch { return new Set(); }
}
function persistFavs() { localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(favs))); }
function toggleFav(id) {
  if (favs.has(id)) favs.delete(id);
  else {
    favs.add(id);
    const p = menuProducts.find((x) => x.id === id);
    if (p) toast(t('fav.add') + ' · ' + pname(p) + ' ♥');
  }
  persistFavs();
}

const SIZE_RE = /\s*\((S|D|T|Q)\)\s*$/i;
const isAddition = (p) => p.category_id === 4 || /addition|extra|إضاف/.test([p.category_slug, p.category, p.category_ar].filter(Boolean).join(' ').toLowerCase());
const stripSize = (s) => String(s || '').replace(SIZE_RE, '').trim();

function buildMenuProducts() {
  const groups = new Map();
  additionProducts = [];
  for (const p of products) {
    if (isAddition(p)) {
      additionProducts.push(p);
      continue;
    }
    const m = String(p.name || '').match(SIZE_RE);
    const key = p.category_id + '::' + stripSize(p.name).toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ p, variant: m ? m[1].toUpperCase() : null });
  }

  menuProducts = [];
  for (const rows of groups.values()) {
    const variantRows = rows.filter((x) => x.variant);
    const hasPriceMap = rows.some((x) => x.p.prices && Object.keys(x.p.prices).length);
    if (variantRows.length < 2 && !hasPriceMap) {
      menuProducts.push(rows[0].p);
      continue;
    }

    const order = { S: 1, D: 2, T: 3, Q: 4 };
    variantRows.sort((a, b) => (order[a.variant] || 99) - (order[b.variant] || 99));
    const base = rows.find((x) => x.p.prices && Object.keys(x.p.prices).length)?.p || variantRows[0]?.p || rows[0].p;
    menuProducts.push({
      ...base,
      name: stripSize(base.name),
      name_ar: stripSize(base.name_ar),
      price: Math.min(...variantRows.map((x) => +x.p.price)),
      configurable: true,
      variants: variantRows.map((x) => ({
        id: x.p.id,
        key: x.variant,
        price: +x.p.price,
        image: x.p.image,
        name: stripSize(x.p.name),
        name_ar: stripSize(x.p.name_ar)
      }))
    });
  }
  menuProducts.sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));
}

function isMenuCategory(c) {
  return !/addition|extra|إضاف/.test([c.slug, c.name, c.name_ar].filter(Boolean).join(' ').toLowerCase());
}

function renderChips() {
  const cats = categories.filter(isMenuCategory);
  const feats = menuProducts.filter((p) => p.featured).length;
  let html = '<button class="chip" data-slug="all" role="tab">' + esc(t('chip.all')) + ' <small>' + menuProducts.length + '</small></button>';
  if (favs.size) html += '<button class="chip chip--fav" data-slug="favorites" role="tab"><svg class="icon"><use href="#i-heart"/></svg> ' + esc(t('chip.favorites')) + ' <small>' + favs.size + '</small></button>';
  if (feats) html += '<button class="chip chip--feat" data-slug="featured" role="tab"><svg class="icon"><use href="#i-star"/></svg> ' + esc(t('chip.featured')) + ' <small>' + feats + '</small></button>';
  html += cats.map((c) => {
    const count = menuProducts.filter((p) => p.category_slug === c.slug).length;
    return '<button class="chip" data-slug="' + esc(c.slug) + '" role="tab">' + esc(pickLang(c, 'name')) + ' <small>' + count + '</small></button>';
  }).join('');
  els.bar.innerHTML = html;
  els.bar.querySelector('[data-slug="' + CSS.escape(activeSlug) + '"]')?.classList.add('is-active');
}

function visibleProducts() {
  let list = activeSlug === 'all' ? [...menuProducts]
    : activeSlug === 'featured' ? menuProducts.filter((p) => p.featured)
    : activeSlug === 'favorites' ? menuProducts.filter((p) => favs.has(p.id))
    : menuProducts.filter((p) => p.category_slug === activeSlug);

  const q = query.trim().toLowerCase();
  if (q) list = list.filter((p) =>
    String(p.name || '').toLowerCase().includes(q) ||
    String(p.name_ar || '').includes(query.trim()) ||
    String(p.description || '').toLowerCase().includes(q) ||
    String(p.description_ar || '').includes(query.trim()) ||
    String(p.category || '').toLowerCase().includes(q) ||
    String(p.category_ar || '').includes(query.trim())
  );

  if (sortMode === 'price-asc') list.sort((a, b) => a.price - b.price || a.id - b.id);
  else if (sortMode === 'price-desc') list.sort((a, b) => b.price - a.price || a.id - b.id);
  else if (sortMode === 'name') list.sort((a, b) => pname(a).localeCompare(pname(b), isRTL() ? 'ar' : 'en'));
  return list;
}

function cardHTML(p, i) {
  const fav = favs.has(p.id);
  const name = pname(p);
  const price = p.configurable ? label('From ', 'من ') + money(p.price) : money(p.price);
  return '<article class="card reveal ' + (p.configurable ? 'card--configurable' : '') + '" style="--d:' + ((i % 8) * 60) + 'ms" data-id="' + p.id + '" tabindex="0" role="button" aria-label="' + esc(t('card.details')) + ' · ' + esc(name) + '">' +
    '<div class="card__media">' +
      '<img src="' + esc(p.image || 'images/placeholder.svg') + '" alt="' + esc(name) + '" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\'images/placeholder.svg\'">' +
      '<span class="card__cat">' + esc(pcat(p)) + '</span>' +
      (p.badge ? '<span class="card__badge">' + esc(p.badge) + '</span>' : '') +
      (p.featured ? '<span class="card__feat"><svg class="icon"><use href="#i-star"/></svg> ' + esc(t('chip.featured')) + '</span>' : '') +
      '<button class="card__fav ' + (fav ? 'is-fav' : '') + '" data-fav="' + p.id + '" aria-pressed="' + fav + '" aria-label="' + esc(fav ? t('fav.remove') : t('fav.add')) + '"><svg class="icon"><use href="#i-heart"/></svg></button>' +
    '</div>' +
    '<div class="card__body"><h3 class="card__name">' + esc(name) + '</h3><p class="card__desc">' + esc(pdesc(p)) + '</p>' +
    '<div class="card__foot"><span class="card__price">' + price + '</span>' +
    '<button class="card__add" data-add="' + p.id + '" aria-label="' + esc(p.configurable ? label('Customize order', 'تخصيص الطلب') : t('card.addAria', { name: name })) + '"><svg class="icon"><use href="#i-plus"/></svg></button>' +
    '</div></div></article>';
}

function renderSkeletons() {
  els.grid.innerHTML = Array.from({ length: 8 }, () => '<div class="skel"><div class="skel__img"></div><div class="skel__body"><div class="skel__line w60"></div><div class="skel__line"></div><div class="skel__line w40"></div></div></div>').join('');
}

function renderGrid() {
  const list = visibleProducts();
  if (!list.length) {
    const searching = !!query.trim();
    const favEmpty = activeSlug === 'favorites';
    els.grid.innerHTML = '<div class="menu__empty"><svg class="icon"><use href="#' + (searching ? 'i-search' : favEmpty ? 'i-heart' : 'i-cup') + '"/></svg><strong>' +
      esc(t(searching ? 'menu.noResultsTitle' : favEmpty ? 'menu.favEmptyTitle' : 'menu.catEmptyTitle')) + '</strong><p>' +
      esc(t(searching ? 'menu.noResultsSub' : favEmpty ? 'menu.favEmptySub' : 'menu.catEmptySub')) + '</p></div>';
    return;
  }

  if (activeSlug === 'all' && !query.trim() && sortMode === 'default') {
    const cats = categories.filter(isMenuCategory);
    els.grid.innerHTML = cats.map((c) => {
      const rows = list.filter((p) => p.category_slug === c.slug);
      if (!rows.length) return '';
      return '<section class="menu-category-block" data-menu-category="' + esc(c.slug) + '">' +
        '<div class="menu-category-heading"><h3>' + esc(pickLang(c, 'name')) + '</h3><span>' + rows.length + '</span></div>' +
        '<div class="menu-category-grid">' + rows.map(cardHTML).join('') + '</div></section>';
    }).join('');
  } else {
    els.grid.innerHTML = list.map(cardHTML).join('');
  }
  observeReveals(els.grid.querySelectorAll('.reveal'));
  setupStickyCategories();
}

function setupStickyCategories() {
  categoryObserver?.disconnect();
  if (activeSlug !== 'all' || query.trim() || sortMode !== 'default') return;
  const targets = [...document.querySelectorAll('[data-menu-category]')];
  if (!targets.length) return;

  categoryObserver = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    const current = visible[0]?.target?.dataset.menuCategory;
    if (!current) return;
    activeSlug = current;
    els.bar.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c.dataset.slug === current));
    const chip = els.bar.querySelector('[data-slug="' + CSS.escape(current) + '"]');
    if (chip) chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, { root: null, rootMargin: '-18% 0px -68% 0px', threshold: [0, .15, .4] });

  targets.forEach((el) => categoryObserver.observe(el));
}

function onChipClick(e) {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  const slug = btn.dataset.slug;
  if (slug === activeSlug) {
    if (slug !== 'all' && slug !== 'favorites' && slug !== 'featured') {
      document.querySelector('[data-menu-category="' + CSS.escape(slug) + '"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
  }
  activeSlug = slug;
  els.bar.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c === btn));
  renderGrid();
  if (slug !== 'all' && slug !== 'favorites' && slug !== 'featured') {
    document.querySelector('[data-menu-category="' + CSS.escape(slug) + '"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function onGridClick(e) {
  const favBtn = e.target.closest('[data-fav]');
  if (favBtn) {
    e.stopPropagation();
    const id = Number(favBtn.dataset.fav);
    toggleFav(id);
    if (activeSlug === 'favorites') renderGrid();
    else {
      favBtn.classList.toggle('is-fav', favs.has(id));
      favBtn.setAttribute('aria-pressed', String(favs.has(id)));
      renderChips();
      els.bar.querySelector('[data-slug="' + CSS.escape(activeSlug) + '"]')?.classList.add('is-active');
    }
    return;
  }
  const addBtn = e.target.closest('[data-add]');
  if (addBtn) {
    e.stopPropagation();
    openProduct(menuProducts.find((p) => p.id === Number(addBtn.dataset.add)));
    return;
  }
  const card = e.target.closest('.card');
  if (card) openProduct(menuProducts.find((p) => p.id === Number(card.dataset.id)));
}

function onGridKeydown(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.card');
  if (!card || e.target.closest('[data-fav]')) return;
  e.preventDefault();
  openProduct(menuProducts.find((p) => p.id === Number(card.dataset.id)));
}

function customizationHTML() {
  if (!modalProduct) return '';
  let html = '';
  if (modalProduct.configurable && modalProduct.variants?.length) {
    html += '<section class="pm-options__group"><h4>' + esc(label('Choose size', 'اختار الحجم')) + '</h4><div class="pm-options__choices pm-options__choices--sizes">';
    html += modalProduct.variants.map((v) =>
      '<button type="button" class="pm-choice ' + (v.id === selectedVariantId ? 'is-selected' : '') + '" data-variant="' + v.id + '"><span>' + esc(v.key) + '</span><strong>' + money(v.price) + '</strong></button>'
    ).join('');
    html += '</div></section>';
  }
  if (additionProducts.length) {
    html += '<section class="pm-options__group"><h4>' + esc(label('Additions', 'الإضافات')) + '<small>' + esc(label('Optional', 'اختياري')) + '</small></h4><div class="pm-options__choices pm-options__choices--extras">';
    html += additionProducts.map((a) =>
      '<label class="pm-extra ' + (selectedAdditionIds.has(a.id) ? 'is-selected' : '') + '"><input type="checkbox" data-addition="' + a.id + '"' + (selectedAdditionIds.has(a.id) ? ' checked' : '') + '><span>' + esc(pname(a)) + '</span><strong>+' + money(a.price) + '</strong></label>'
    ).join('');
    html += '</div></section>';
  }
  return html;
}

function selectedVariant() {
  if (!modalProduct) return null;
  return modalProduct.configurable ? modalProduct.variants.find((v) => v.id === selectedVariantId) : modalProduct;
}

function modalTotal() {
  const base = +(selectedVariant()?.price || 0);
  const extras = additionProducts.filter((a) => selectedAdditionIds.has(a.id)).reduce((s, a) => s + (+a.price || 0), 0);
  return (base + extras) * modalQty;
}

function paintModal() {
  const p = modalProduct;
  if (!p) return;
  els.img.src = p.image || 'images/placeholder.svg';
  els.img.alt = pname(p);
  els.img.onerror = () => { els.img.onerror = null; els.img.src = 'images/placeholder.svg'; };
  els.cat.textContent = pcat(p) + (p.featured ? ' · ★ ' + t('chip.featured') : '');
  els.name.textContent = pname(p);
  els.desc.textContent = pdesc(p);
  els.options.innerHTML = customizationHTML();
  els.options.hidden = !p.configurable && !additionProducts.length;
  els.price.textContent = p.configurable ? label('From ' + money(p.price), 'من ' + money(p.price)) : money(p.price);
  if (p.badge) { els.badge.textContent = p.badge; els.badge.hidden = false; } else els.badge.hidden = true;
  els.addTotal.textContent = money(modalTotal());
}

function openProduct(p) {
  if (!p) return;
  modalProduct = p;
  selectedVariantId = p.configurable ? p.variants[0]?.id : p.id;
  selectedAdditionIds = new Set();
  setModalQty(1);
  paintModal();
  openLayer(els.modal);
}

function setModalQty(n) {
  modalQty = Math.min(MAX_QTY, Math.max(1, n));
  if (els?.qtyVal) els.qtyVal.textContent = modalQty;
  if (modalProduct && els?.addTotal) els.addTotal.textContent = money(modalTotal());
}

function onOptionsClick(e) {
  const variant = e.target.closest('[data-variant]');
  if (variant) {
    selectedVariantId = Number(variant.dataset.variant);
    paintModal();
    return;
  }
  const input = e.target.closest('input[data-addition]');
  if (input) {
    const id = Number(input.dataset.addition);
    if (input.checked) selectedAdditionIds.add(id);
    else selectedAdditionIds.delete(id);
    paintModal();
  }
}

function addConfiguredToCart() {
  const variant = selectedVariant();
  if (!variant) return;
  const realVariant = products.find((p) => p.id === variant.id);
  if (realVariant) addToCart(realVariant, modalQty);
  for (const id of selectedAdditionIds) {
    const extra = additionProducts.find((p) => p.id === id);
    if (extra) addToCart(extra, modalQty);
  }
  closeLayer(els.modal);
}

function onSearch(e) {
  clearTimeout(onSearch.timer);
  onSearch.timer = setTimeout(() => { query = e.target.value; activeSlug = 'all'; renderGrid(); }, 160);
}
function onSort(e) { sortMode = e.target.value; activeSlug = 'all'; renderGrid(); }

export async function initMenu() {
  loadPremiumDesign();
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
    options: $('pmOptions'),
    price: $('pmPrice'),
    qtyVal: $('pmQtyVal'),
    minus: $('pmMinus'),
    plus: $('pmPlus'),
    add: $('pmAdd'),
    addTotal: $('pmAddTotal')
  };
  renderSkeletons();
  try {
    [categories, products] = await Promise.all([getCategories(), getProducts()]);
    buildMenuProducts();
    const stat = document.getElementById('statItems');
    if (stat) stat.textContent = '200+';
  } catch (err) {
    els.grid.innerHTML = '<div class="menu__empty"><svg class="icon"><use href="#i-cup"/></svg><p>' + esc(err.message || t('menu.loadError')) + '</p><button class="btn btn--ghost" id="menuRetry">' + esc(t('menu.retry')) + '</button></div>';
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
  els.options.addEventListener('click', onOptionsClick);
  els.minus.addEventListener('click', () => setModalQty(modalQty - 1));
  els.plus.addEventListener('click', () => setModalQty(modalQty + 1));
  els.add.addEventListener('click', addConfiguredToCart);

  document.addEventListener('lang:changed', () => {
    buildMenuProducts();
    renderChips();
    renderGrid();
    if (els.modal.classList.contains('open') && modalProduct) paintModal();
  });
}
