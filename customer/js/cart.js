// ============================================================
//  Aquarium Cafe & Resturant — cart state, drawer UI & checkout
//  v5: delivery-only platform. Checkout hands the cart straight
//  to the delivery flow (zones → address → payment → tracking,
//  handled by delivery.js). Fully bilingual: items keep their
//  EN + AR names, and every label/toast follows the language.
// ============================================================
import { toast, money, esc, openLayer, closeLayer } from './ui.js';
import { openDeliveryCheckout } from './delivery.js';
import { t } from '../shared/i18n.js';

const STORAGE_KEY = 'aquarium_cart_v1';
const MAX_QTY = 20;

let cart = loadCart();
let els = null;

const $ = (id) => document.getElementById(id);

/* ---------- persistence ---------- */
function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(raw) ? raw.filter((i) => i && i.id && i.qty > 0) : [];
  } catch {
    return [];
  }
}
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

/* ---------- bilingual item helpers ---------- */
const itemName = (i) =>
  document.documentElement.lang === 'ar' && i.nameAr ? i.nameAr : i.name;

/* ---------- public cart API (used by menu.js / delivery.js) ---------- */
export function addToCart(product, qty = 1) {
  const found = cart.find((i) => i.id === product.id);
  if (found) {
    found.qty = Math.min(MAX_QTY, found.qty + qty);
    found.nameAr = product.name_ar || found.nameAr || ''; // refresh names on re-add
    found.name = product.name || found.name;
    found.categoryId = product.category_id ?? found.categoryId ?? null; // auto-discount preview
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      nameAr: product.name_ar ?? '',
      categoryId: product.category_id ?? null,
      price: product.price,
      image: product.image,
      qty: Math.min(MAX_QTY, qty),
    });
  }
  persist();
  renderCart();
  renderBadge(true);
  toast(t('msg.added', { name: itemName(cart.find((i) => i.id === product.id) || { name: product.name }) }));
}

export const cartCount = () => cart.reduce((s, i) => s + i.qty, 0);
export const cartTotal = () => cart.reduce((s, i) => s + i.qty * i.price, 0);
export const cartItems = () => cart.map((i) => ({ ...i }));

export function clearCartExternal() {
  clearCart(); // used after a successful delivery order
}

/* ---------- mutations ---------- */
function changeQty(id, delta) {
  const item = cart.find((i) => i.id === id);
  if (!item) return;
  item.qty = Math.min(MAX_QTY, Math.max(1, item.qty + delta));
  persist();
  renderCart();
  renderBadge();
}

function removeItem(id) {
  const item = cart.find((i) => i.id === id);
  cart = cart.filter((i) => i.id !== id);
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

/* ---------- drawer ---------- */
function openCart() {
  els.overlay.classList.add('show');
  openLayer(els.drawer);
}
function closeCart() {
  closeLayer(els.drawer);
}

function renderBadge(bump = false) {
  const n = cartCount();
  els.count.textContent = n;
  els.count.classList.toggle('is-zero', n === 0);
  if (bump && n > 0) {
    els.btn.classList.remove('bump');
    void els.btn.offsetWidth; // restart animation
    els.btn.classList.add('bump');
  }
}

function renderCart() {
  const n = cartCount();
  els.headCount.textContent = n ? t(n > 1 ? 'cart.itemCountPlural' : 'cart.itemCount', { n }) : '';

  if (!cart.length) {
    els.items.innerHTML = `
      <div class="drawer__empty">
        <svg class="icon"><use href="#i-fish"/></svg>
        <strong>${esc(t('cart.emptyTitle'))}</strong>
        <small>${esc(t('cart.emptySub'))}</small>
        <button class="btn btn--ghost js-browse">
          ${esc(t('cart.browse'))} <svg class="icon"><use href="#i-arrow"/></svg>
        </button>
      </div>`;
    els.items.querySelector('.js-browse').addEventListener('click', () => {
      closeCart();
      document.querySelector('#menu')?.scrollIntoView({ behavior: 'smooth' });
    });
  } else {
    els.items.innerHTML = cart
      .map(
        (i) => `
      <div class="ci" data-id="${i.id}">
        <img class="ci__img" src="${esc(i.image || 'images/placeholder.svg')}" alt="${esc(itemName(i))}"
             loading="lazy" onerror="this.onerror=null;this.src='images/placeholder.svg'">
        <div class="ci__meta">
          <b>${esc(itemName(i))}</b>
          <span>${money(i.price)}</span>
        </div>
        <div class="ci__qty">
          <button data-dec aria-label="${esc(t('cart.decrease'))}"><svg class="icon"><use href="#i-minus"/></svg></button>
          <b>${i.qty}</b>
          <button data-inc aria-label="${esc(t('cart.increase'))}"><svg class="icon"><use href="#i-plus"/></svg></button>
        </div>
        <strong class="ci__line">${money(i.price * i.qty)}</strong>
        <button class="ci__rm" data-remove aria-label="${esc(t('cart.remove', { name: itemName(i) }))}">
          <svg class="icon"><use href="#i-trash"/></svg>
        </button>
      </div>`
      )
      .join('');
  }

  els.total.textContent = money(cartTotal());
  els.checkout.disabled = !cart.length;
}

function onItemsClick(e) {
  const btn = e.target.closest('button');
  const row = e.target.closest('.ci');
  if (!btn || !row) return;
  const id = Number(row.dataset.id);
  if (btn.hasAttribute('data-inc')) changeQty(id, +1);
  else if (btn.hasAttribute('data-dec')) changeQty(id, -1);
  else if (btn.hasAttribute('data-remove')) removeItem(id);
}

/* ---------- checkout → delivery ---------- */
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

/* ---------- init ---------- */
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
  };
  if (!els.btn) return;

  els.btn.addEventListener('click', openCart);
  els.close.addEventListener('click', closeCart);
  els.overlay.addEventListener('click', closeCart);
  // Ensure the overlay hides whenever the drawer layer closes (ESC, etc.)
  els.drawer.addEventListener('layer:close', () => els.overlay.classList.remove('show'));

  els.items.addEventListener('click', onItemsClick);
  els.checkout.addEventListener('click', openCheckout);

  // delivery.js broadcasts this once the courier order is accepted by the server
  document.addEventListener('delivery:placed', clearCart);

  // language switch → item names & labels re-render
  document.addEventListener('lang:changed', () => { renderCart(); renderBadge(); });

  renderCart();
  renderBadge();
}
