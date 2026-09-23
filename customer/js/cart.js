// ============================================================
// Aquarium Cafe & Restaurant — persistent cart + instant drawer
// Cart stays on the menu page; no separate cart navigation.
// Customized lines keep their selected size and additions.
// ============================================================
import { toast, money, esc, openLayer, closeLayer } from './ui.js';
import { openDeliveryCheckout } from './delivery.js';
import { t } from '../shared/i18n.js';

const STORAGE_KEY = 'aquarium_cart_v2';
const LEGACY_KEY = 'aquarium_cart_v1';
const MAX_QTY = 20;

let cart = loadCart();
let els = null;

const $ = (id) => document.getElementById(id);

function normalizeItem(i) {
  if (!i || !i.id || !(i.qty > 0)) return null;
  return {
    lineKey: i.lineKey || String(i.id),
    id: Number(i.id),
    name: i.name || '',
    nameAr: i.nameAr || '',
    categoryId: i.categoryId ?? null,
    price: Number(i.price || 0),
    image: i.image || '',
    qty: Math.min(MAX_QTY, Math.max(1, Number(i.qty) || 1)),
    variant: i.variant || '',
    additions: Array.isArray(i.additions)
      ? i.additions.filter((a) => a && a.id).map((a) => ({
          id: Number(a.id),
          name: a.name || '',
          nameAr: a.nameAr || '',
          price: Number(a.price || 0),
        }))
      : [],
  };
}

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(raw)) return raw.map(normalizeItem).filter(Boolean);
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
    return Array.isArray(legacy) ? legacy.map(normalizeItem).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

const itemName = (i) =>
  document.documentElement.lang === 'ar' && i.nameAr ? i.nameAr : i.name;

const additionName = (a) =>
  document.documentElement.lang === 'ar' && a.nameAr ? a.nameAr : a.name;

export function addToCart(product, qty = 1, options = {}) {
  const variantProduct = options.variantProduct || product;
  const additions = Array.isArray(options.additions) ? options.additions : [];
  const variant = variantProduct !== product
    ? (String(variantProduct.name || '').match(/\((S|D|T|Q)\)\s*$/i)?.[1]?.toUpperCase() || '')
    : (options.variant || '');

  const selectedId = Number(variantProduct.id || product.id);
  const lineKey = [
    selectedId,
    variant,
    additions.map((a) => Number(a.id)).sort((a, b) => a - b).join(','),
  ].join('|');

  const found = cart.find((i) => i.lineKey === lineKey);
  const cleanAdditions = additions.map((a) => ({
    id: Number(a.id),
    name: a.name || '',
    nameAr: a.name_ar || a.nameAr || '',
    price: Number(a.price || 0),
  }));

  if (found) {
    found.qty = Math.min(MAX_QTY, found.qty + qty);
  } else {
    cart.push({
      lineKey,
      id: selectedId,
      name: product.name || variantProduct.name || '',
      nameAr: product.name_ar || variantProduct.name_ar || '',
      categoryId: product.category_id ?? variantProduct.category_id ?? null,
      price: Number(variantProduct.price ?? product.price ?? 0),
      image: product.image || variantProduct.image || '',
      qty: Math.min(MAX_QTY, qty),
      variant,
      additions: cleanAdditions,
    });
  }

  persist();
  renderCart();
  renderBadge(true);

  const display = itemName(cart.find((i) => i.lineKey === lineKey) || { name: product.name });
  toast(t('msg.added', { name: display }));
}

export const cartCount = () => cart.reduce((s, i) => s + i.qty, 0);

export const cartTotal = () =>
  cart.reduce((s, i) => {
    const extras = i.additions.reduce((x, a) => x + Number(a.price || 0), 0);
    return s + i.qty * (Number(i.price || 0) + extras);
  }, 0);

export const cartItems = () => {
  const rows = [];
  for (const i of cart) {
    rows.push({ id: i.id, qty: i.qty });
    for (const a of i.additions) rows.push({ id: a.id, qty: i.qty });
  }
  return rows;
};

export function clearCartExternal() {
  clearCart();
}

function changeQty(lineKey, delta) {
  const item = cart.find((i) => i.lineKey === lineKey);
  if (!item) return;
  item.qty = Math.min(MAX_QTY, Math.max(1, item.qty + delta));
  persist();
  renderCart();
  renderBadge();
}

function removeItem(lineKey) {
  const item = cart.find((i) => i.lineKey === lineKey);
  cart = cart.filter((i) => i.lineKey !== lineKey);
  persist();
  renderCart();
  renderBadge();
  if (item) toast(t('msg.removed', { name: itemName(item) }));
}

function clearCart() {
  cart = [];
  persist();
  renderCart();
  renderBadge();
}

function openCart() {
  if (!els?.drawer) return;
  els.overlay?.classList.add('show');
  openLayer(els.drawer);
}

function closeCart() {
  if (!els?.drawer) return;
  closeLayer(els.drawer);
}

export function openCartDrawer() {
  openCart();
}

function renderBadge(bump = false) {
  const n = cartCount();
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    el.textContent = n;
    el.classList.toggle('is-zero', n === 0);
  });
  if (els?.count) {
    els.count.textContent = n;
    els.count.classList.toggle('is-zero', n === 0);
  }
  if (bump && n > 0 && els?.btn) {
    els.btn.classList.remove('bump');
    void els.btn.offsetWidth;
    els.btn.classList.add('bump');
  }
  const bar = els?.menuCartBar;
  if (bar) {
    bar.hidden = n === 0;
    if (n) {
      bar.querySelector('[data-menu-cart-count]')?.replaceChildren(document.createTextNode(String(n)));
      const total = bar.querySelector('[data-menu-cart-total]');
      if (total) total.textContent = money(cartTotal());
    }
  }
}

function renderCart() {
  const targetItems = els?.items;
  const targetTotal = els?.total;
  const targetCheckout = els?.checkout;
  if (!targetItems || !targetTotal || !targetCheckout) return;

  const n = cartCount();
  if (els.headCount) els.headCount.textContent = n ? t(n > 1 ? 'cart.itemCountPlural' : 'cart.itemCount', { n }) : '';

  if (!cart.length) {
    targetItems.innerHTML = `
      <div class="drawer__empty">
        <svg class="icon"><use href="#i-fish"/></svg>
        <strong>${esc(t('cart.emptyTitle'))}</strong>
        <small>${esc(t('cart.emptySub'))}</small>
      </div>`;
  } else {
    targetItems.innerHTML = cart.map((i) => {
      const extras = i.additions.length
        ? `<div class="ci__extras">${i.additions.map((a) => `<span>+${esc(additionName(a))} · ${money(a.price)}</span>`).join('')}</div>`
        : '';
      const variant = i.variant ? `<span class="ci__variant">${esc(i.variant)}</span>` : '';
      const unit = Number(i.price || 0) + i.additions.reduce((s, a) => s + Number(a.price || 0), 0);
      return `
        <div class="ci" data-line-key="${esc(i.lineKey)}">
          <img class="ci__img" src="${esc(i.image || 'images/placeholder.svg')}" alt="${esc(itemName(i))}" loading="lazy" onerror="this.onerror=null;this.src='images/placeholder.svg'">
          <div class="ci__meta">
            <b>${esc(itemName(i))} ${variant}</b>
            <span>${money(unit)} ${esc(t('cart.each'))}</span>
            ${extras}
          </div>
          <div class="ci__qty">
            <button type="button" data-dec aria-label="${esc(t('cart.decrease'))}"><svg class="icon"><use href="#i-minus"/></svg></button>
            <b>${i.qty}</b>
            <button type="button" data-inc aria-label="${esc(t('cart.increase'))}"><svg class="icon"><use href="#i-plus"/></svg></button>
          </div>
          <strong class="ci__line">${money(unit * i.qty)}</strong>
          <button type="button" class="ci__rm" data-remove aria-label="${esc(t('cart.remove', { name: itemName(i) }))}"><svg class="icon"><use href="#i-trash"/></svg></button>
        </div>`;
    }).join('');
  }

  targetTotal.textContent = money(cartTotal());
  targetCheckout.disabled = !cart.length;
}

function onItemsClick(e) {
  const btn = e.target.closest('button');
  const row = e.target.closest('.ci');
  if (!btn || !row) return;
  const key = row.dataset.lineKey;
  if (btn.hasAttribute('data-inc')) changeQty(key, +1);
  else if (btn.hasAttribute('data-dec')) changeQty(key, -1);
  else if (btn.hasAttribute('data-remove')) removeItem(key);
}

function openCheckout() {
  if (!cart.length) {
    toast(t('msg.cartEmpty'));
    return;
  }
  closeCart();
  openDeliveryCheckout({
    items: cartItems(),
    total: cartTotal(),
    count: cartCount(),
  });
}

export function initCart() {
  els = {
    btn: $('cartBtn'),
    count: $('cartCount'),
    drawer: $('cartDrawer'),
    overlay: $('cartOverlay'),
    close: $('cartClose'),
    items: $('cartItems'),
    total: $('cartTotal'),
    headCount: $('cartHeadCount'),
    checkout: $('checkoutBtn'),
    menuCartBar: $('menuCartBar'),
  };

  document.querySelectorAll('[data-open-cart]').forEach((b) => b.addEventListener('click', openCart));
  els.btn?.addEventListener('click', openCart);
  els.close?.addEventListener('click', closeCart);
  els.overlay?.addEventListener('click', closeCart);
  els.drawer?.addEventListener('layer:close', () => els.overlay?.classList.remove('show'));

  els.items?.addEventListener('click', onItemsClick);
  els.checkout?.addEventListener('click', openCheckout);
  document.addEventListener('delivery:placed', clearCart);
  document.addEventListener('lang:changed', () => { renderCart(); renderBadge(); });

  renderCart();
  renderBadge();
}
