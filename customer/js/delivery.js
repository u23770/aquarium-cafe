// ============================================================
//  Aquarium Cafe & Resturant — Delivery system (customer, v5)
//  ------------------------------------------------------------
//  CHECKOUT, in three calm steps:
//    1 · main zone (grid of zones, fee shown — set per zone)
//    2 · sub zone (unlimited, defined per zone — or skip)
//    3 · detailed address + contact + optional maps link
//  then a coupon field, loyalty points (members), payment and
//  live totals — everything re-validated & re-priced server-side
//  by place_delivery_order(). Automatic discounts (global /
//  product / category / signup) are previewed client-side from
//  the readable discounts table; the server is the final truth.
//
//  LIVE TRACKING: animated step timeline (bilingual statuses),
//  progress bar, ETA, elapsed ticker, captain card — permanent
//  OR temporary driver with a call button — status history and
//  the loyalty points earned on delivery. Driven by Supabase
//  Realtime on the unguessable order uuid.
// ============================================================
import {
  getDeliverySettings, getDeliveryZones, validateCoupon, placeDeliveryOrder,
  getDeliveryOrder, getDeliveryHistory, subscribeDeliveryOrder,
  getLoyaltyConfig, getMyPoints, getAutoDiscounts, countMyOrders,
} from './api.js';
import { getUser, getProfile } from './auth.js';
import { toast, money, esc, openLayer, closeLayer } from './ui.js';
import { t, pickLang } from '../../shared/i18n.js';

const ACTIVE_KEY = 'aquarium_delivery_active_v1';
const STEPS = [
  { status: 'Received',         icon: 'i-receipt' },
  { status: 'Accepted',         icon: 'i-checkc'  },
  { status: 'Preparing',        icon: 'i-clock'   },
  { status: 'Ready',            icon: 'i-bag'     },
  { status: 'Out for Delivery', icon: 'i-scooter' },
  { status: 'Delivered',        icon: 'i-check'   },
];
const TERMINAL = ['Delivered', 'Cancelled'];

const $ = (id) => document.getElementById(id);

let els = null;
let settings = null;        // delivery settings (min order, ETA, methods…)
let zones = [];             // delivery zones (+ sub zones)
let cartCache = null;       // { items, total, count } handed over from cart.js

let step = 1;               // current checkout step (1 zone · 2 sub · 3 address)
let zoneSel = null;         // chosen main zone
let subSel = null;          // chosen sub zone (null = none/skipped)
let subSkipped = false;     // user explicitly skipped step 2

let coupon = null;          // { code, amount, label, kind }
let couponBusy = false;

let loyaltyCfg = null;      // { enabled, pointsPerOrder, pointValue, minRedeem, maxRedeem }
let myPoints = 0;           // member wallet balance
let autoDiscounts = [];     // active code-less discounts (fetched on open)

let trackedId = null;       // uuid currently open in the tracking modal
let channel = null;         // realtime channel
let tickTimer = null;       // elapsed-time ticker
let placing = false;

/* ═══════════════ persistence of the active order uuid ═══════════════ */
function saveActive(id) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id, ts: Date.now() }));
}
function readActive() {
  try {
    const v = JSON.parse(localStorage.getItem(ACTIVE_KEY));
    return v && typeof v.id === 'string' ? v.id : null;
  } catch {
    return null;
  }
}
function clearActive() {
  localStorage.removeItem(ACTIVE_KEY);
}

/* ═══════════════ helpers ═══════════════ */
const fmtTime = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleTimeString(document.documentElement.lang === 'ar' ? 'ar-EG' : 'en-EG', { hour: '2-digit', minute: '2-digit' });
};
const telHref = (p) => 'tel:' + String(p || '').replace(/[^\d+]/g, '');
const statusLabel = (s) => { const k = 'status.' + s; const v = t(k); return v === k ? s : v; };

/** delivery fee for the chosen zone/sub-zone — mirrors the server rule
    exactly: the sub zone's own fee always wins; "free above" is applied
    on top (zone override wins over the global threshold). */
function feeFor(subtotal) {
  if (!zoneSel) return null; // unknown until step 1
  const freeAbove = zoneSel.freeAbove > 0 ? zoneSel.freeAbove : settings?.freeAbove ?? 0;
  if (freeAbove > 0 && subtotal >= freeAbove) return 0;
  return subSel ? subSel.fee : zoneSel.fee;
}

/* ═══════════════ automatic (code-less) discount preview ═══════════════
   Client mirror of the server's best-of selection. The client reads
   the readable discounts table purely to PREVIEW; place_delivery_order
   recomputes authoritatively. */
async function fetchAutoDiscounts() {
  try {
    const rows = await getAutoDiscounts();
    const user = getUser();
    let firstOrder = true;
    if (user) {
      try { firstOrder = (await countMyOrders(user.id)) === 0; } catch { firstOrder = true; }
    }
    autoDiscounts = rows.filter((d) => !(d.type === 'signup' && (!user || !firstOrder)));
  } catch {
    autoDiscounts = [];
  }
}

/** value of one discount against the cart — client mirror of _discount_value */
function discountValue(d, subtotal) {
  const lines = cartCache?.items ?? [];
  let base = subtotal;
  if (d.type === 'product') {
    base = lines.filter((l) => l.id === d.target_id).reduce((s, l) => s + l.price * l.qty, 0);
  } else if (d.type === 'category') {
    base = lines.filter((l) => l.categoryId && l.categoryId === d.target_id).reduce((s, l) => s + l.price * l.qty, 0);
  }
  if (base <= 0) return 0;
  let amount;
  if (d.value_type === 'percent') {
    amount = Math.round(base * d.value) / 100;
    if (d.max_discount != null) amount = Math.min(amount, +d.max_discount);
  } else {
    amount = Math.min(+d.value, base);
  }
  return Math.min(Math.max(amount, 0), subtotal);
}

/** { id, label, amount } of the best automatic discount (code-less only) */
function bestAutoDiscount(subtotal) {
  let best = { id: null, label: '', amount: 0 };
  for (const d of autoDiscounts) {
    if (subtotal < +d.min_order) continue;
    const amount = discountValue(d, subtotal);
    if (amount > best.amount) best = { id: d.id, label: d.name, amount };
  }
  return best;
}

/* ═══════════════ totals ═══════════════ */
function currentCalculation() {
  const sub = cartCache?.total ?? 0;
  // explicit coupon wins over automatic discounts (server rule)
  const disc = coupon
    ? { label: coupon.label, amount: Math.min(coupon.amount, sub) }
    : bestAutoDiscount(sub);
  const pts = redeemPoints();
  const cfg = loyaltyCfg;
  let ptsValue = 0;
  if (pts > 0 && cfg?.pointValue > 0) {
    ptsValue = Math.min(Math.round(pts * cfg.pointValue * 100) / 100, sub - disc.amount);
  }
  const rawFee = feeFor(sub) ?? 0;
  // Menu prices are before VAT. VAT is applied to the net taxable food
  // amount after discounts and loyalty redemption, not to delivery.
  const taxable = Math.max(sub - disc.amount - ptsValue, 0);
  const vat = Math.round(taxable * 0.14 * 100) / 100;
  const total = Math.max(Math.round((taxable + rawFee + vat) * 100) / 100, 0);
  return { sub, disc, pts, ptsValue, fee: rawFee, vat, total };
}

function redeemPoints() {
  if (!loyaltyCfg?.enabled) return 0;
  const raw = Math.floor(+(els.ptsInput?.value || 0));
  if (!raw || raw <= 0) return 0;
  return Math.min(raw, myPoints, loyaltyCfg.maxRedeem > 0 ? loyaltyCfg.maxRedeem : raw);
}

function paintTotals() {
  const c = currentCalculation();
  els.subtotal.textContent = money(c.sub);

  const hasDisc = c.disc.amount > 0.004;
  els.rowDisc.hidden = !hasDisc;
  if (hasDisc) {
    els.discLabel.textContent = c.disc.label || t('dl.discount');
    els.discAmt.textContent = '−' + money(c.disc.amount);
  }

  const hasPts = c.ptsValue > 0.004;
  els.rowPts.hidden = !hasPts;
  if (hasPts) els.ptsAmt.textContent = '−' + money(c.ptsValue);

  const fee = feeFor(c.sub);
  if (fee === null) {
    els.fee.textContent = t('dl.step1') + '…'; // pick a zone first
  } else {
    els.fee.textContent = fee === 0 ? t('dl.feeFree') : money(fee);
  }
  els.vat.textContent = money(c.vat);
  els.total.textContent = money(c.total);

  const bits = [t('dl.eta', { n: settings?.estimatedMinutes ?? 45 })];
  if (settings?.minOrder > 0) bits.push(t('dl.minOrder', { x: money(settings.minOrder) }));
  if (settings?.note) bits.push(settings.note);
  els.eta.textContent = bits.join(' · ');
}

/* ═══════════════ STEP WIZARD ═══════════════ */
function paintStep() {
  els.dot1.classList.toggle('is-active', step === 1);
  els.dot2.classList.toggle('is-active', step === 2);
  els.dot3.classList.toggle('is-active', step === 3);
  els.dot1.classList.toggle('is-done', step > 1);
  els.dot2.classList.toggle('is-done', step > 2);
  els.pane1.hidden = step !== 1;
  els.pane2.hidden = step !== 2;
  els.pane3.hidden = step !== 3;
  els.back.hidden = step === 1;
  els.next.hidden = step === 3;
}

function goStep(n) {
  if (n >= 2 && !zoneSel) {
    els.error.textContent = t('val.zone');
    n = 1;
  } else {
    els.error.textContent = '';
  }
  if (n >= 3 && zoneSel?.subZones?.length && !subSel && !subSkipped) {
    // sub zone pending decision — hold the user on step 2, with a hint
    els.error.textContent = t('val.subzone', { skip: t('dl.subSkip') });
    n = 2;
  }
  step = Math.min(3, Math.max(1, n));
  paintStep();
}

function zoneName(z) { return pickLang(z, 'name_en'); }

function paintZones() {
  if (!zones.length) {
    els.zoneGrid.innerHTML = `<p class="dl__none">${esc(t('msg.deliveryOff'))}</p>`;
    return;
  }
  els.zoneGrid.innerHTML = zones
    .map((z) => {
      const sel = zoneSel?.id === z.id ? ' is-active' : '';
      const free = z.freeAbove > 0 ? `<small class="zn__free">${esc(t('dl.freeAbove', { x: money(z.freeAbove) }))}</small>` : '';
      return `
      <button type="button" class="zn${sel}" data-zone="${z.id}">
        <span class="zn__name">${esc(zoneName(z))}</span>
        <span class="zn__fee">${esc(t('dl.feePerZone'))} <b>${money(z.fee)}</b></span>
        ${free}
      </button>`;
    })
    .join('');
}

function paintSubZones() {
  const list = zoneSel?.subZones ?? [];
  els.subNone.hidden = list.length > 0;
  const skipSel = subSkipped && !subSel ? ' is-active' : '';
  let html = '';
  if (list.length) {
    html += `<button type="button" class="zn zn--skip${skipSel}" data-subskip="1">
        <span class="zn__name">${esc(t('dl.subSkip'))}</span>
      </button>`;
  }
  html += list
    .map((s) => {
      const sel = subSel?.id === s.id ? ' is-active' : '';
      return `
      <button type="button" class="zn${sel}" data-sub="${s.id}">
        <span class="zn__name">${esc(zoneName(s))}</span>
        <span class="zn__fee">${esc(t('dl.feePerZone'))} <b>${money(s.fee)}</b></span>
      </button>`;
    })
    .join('');
  els.subGrid.innerHTML = html;
}

function selectZone(id) {
  const z = zones.find((x) => x.id === id);
  if (!z) return;
  if (zoneSel?.id !== z.id) { subSel = null; subSkipped = false; }
  zoneSel = z;
  paintZones();
  paintSubZones();
  paintTotals();
  goStep(2);
}

function selectSub(id) {
  subSel = (zoneSel?.subZones ?? []).find((x) => x.id === id) ?? null;
  subSkipped = false;
  paintSubZones();
  paintTotals(); // the sub zone's own fee replaces the zone fee
  goStep(3);
}

function skipSub() {
  subSel = null;
  subSkipped = true;
  paintSubZones();
  paintTotals(); // back to the zone fee
  goStep(3);
}

/* ═══════════════ coupon ═══════════════ */
function paintCouponMsg(kind, text) {
  els.couponMsg.classList.remove('is-ok', 'is-err');
  if (kind) els.couponMsg.classList.add(kind);
  els.couponMsg.innerHTML = coupon
    ? `<span>${esc(text)}</span>
       <button type="button" class="dl__coupon-x" id="dlCouponX" aria-label="${esc(t('misc.close'))}">
         <svg class="icon"><use href="#i-x"/></svg>
       </button>`
    : esc(text);
  const x = $('dlCouponX');
  if (x) x.addEventListener('click', removeCoupon);
}

function removeCoupon() {
  coupon = null;
  els.coupon.value = '';
  els.couponMsg.innerHTML = '';
  els.couponMsg.classList.remove('is-ok', 'is-err');
  paintTotals();
}

async function applyCoupon() {
  if (couponBusy) return;
  const code = els.coupon.value.trim();
  if (!code) { removeCoupon(); return; }
  couponBusy = true;
  els.couponBtn.disabled = true;
  try {
    const res = await validateCoupon({
      code,
      userId: getUser()?.id || '',
      items: (cartCache?.items ?? []).map((i) => ({ productId: i.id, quantity: i.qty })),
    });
    if (res?.ok) {
      coupon = { code, amount: +res.amount, label: res.label || code, kind: res.kind || '' };
      paintCouponMsg('is-ok', t('dl.couponApplied', { label: coupon.label, x: money(coupon.amount) }));
    } else {
      coupon = null;
      const key = 'coupon.' + (res?.key || 'invalid');
      const vars = { min: res?.min != null ? money(res.min) : '' };
      const msg = t(key) === key ? (res?.message || t('coupon.invalid')) : t(key, vars);
      paintCouponMsg('is-err', msg);
    }
  } catch (err) {
    coupon = null;
    paintCouponMsg('is-err', err.message || t('coupon.invalid'));
  } finally {
    couponBusy = false;
    els.couponBtn.disabled = false;
    paintTotals();
  }
}

/* ═══════════════ loyalty row (members only) ═══════════════ */
async function refreshMemberUI() {
  const user = getUser();
  const prof = getProfile();
  // sign-in nudge ⇆ earn hint ⇆ points row
  els.nudge.hidden = !!user;
  if (!user) {
    els.ptsRow.hidden = true;
    els.earn.hidden = true;
    return;
  }
  if (prof) {
    if (!els.name.value.trim() && prof.name) els.name.value = prof.name;
    if (!els.phone.value.trim() && prof.phone) els.phone.value = prof.phone;
  }
  try {
    if (!loyaltyCfg) loyaltyCfg = await getLoyaltyConfig();
    if (!loyaltyCfg?.enabled) {
      els.ptsRow.hidden = true;
      els.earn.hidden = true;
      return;
    }
    // earn hint
    if (loyaltyCfg.pointsPerOrder > 0) {
      els.earn.hidden = false;
      els.earn.textContent = '🎁 ' + t('dl.earn', { n: loyaltyCfg.pointsPerOrder });
    } else {
      els.earn.hidden = true;
    }
    // redeem row
    myPoints = await getMyPoints(user.id);
    const canRedeem = loyaltyCfg.minRedeem > 0 && myPoints >= loyaltyCfg.minRedeem && loyaltyCfg.pointValue > 0;
    els.ptsRow.hidden = !canRedeem;
    if (canRedeem) {
      els.ptsHave.textContent = t('dl.pointsHave', { n: myPoints });
      els.ptsHint.textContent = t('dl.pointsRange', {
        min: loyaltyCfg.minRedeem,
        max: loyaltyCfg.maxRedeem > 0 ? loyaltyCfg.maxRedeem : myPoints,
        v: money(loyaltyCfg.pointValue),
      });
      els.ptsInput.max = Math.min(myPoints, loyaltyCfg.maxRedeem > 0 ? loyaltyCfg.maxRedeem : myPoints);
    }
  } catch {
    els.ptsRow.hidden = true;
  }
}

/* ═══════════════ 1 · CHECKOUT ═══════════════ */
export async function openDeliveryCheckout(cartSnapshot) {
  cartCache = cartSnapshot;
  if (!cartCache?.items?.length) {
    toast(t('msg.cartEmpty'));
    return;
  }
  if (!els) return; // initDelivery not run yet (should never happen)

  els.form.hidden = false;
  els.done.hidden = true;
  els.error.textContent = '';
  removeCoupon();
  els.ptsInput.value = '';
  els.summary.textContent = t(cartCache.count > 1 ? 'dl.summaryPlural' : 'dl.summary', { n: cartCache.count });

  // fresh settings + zones + discounts every open (admin can edit anytime)
  try {
    [settings, zones] = await Promise.all([getDeliverySettings(), getDeliveryZones()]);
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  if (!settings.enabled || !zones.length) {
    toast(t('msg.deliveryOff'));
    return;
  }

  // payment methods offered by the restaurant
  els.payGroup.querySelectorAll('.dl__payopt').forEach((opt) => {
    const input = opt.querySelector('input');
    const offered = settings.paymentMethods.includes(input.value);
    opt.classList.toggle('is-hidden', !offered);
    input.checked = offered && (input.value === settings.paymentMethods[0]);
    input.disabled = !offered;
  });

  // reset the wizard
  step = 1;
  zoneSel = null;
  subSel = null;
  subSkipped = false;
  paintZones();
  paintSubZones();
  paintStep();

  fetchAutoDiscounts().then(paintTotals); // async preview, non-blocking
  paintTotals();
  refreshMemberUI();

  openLayer(els.modal);
  setTimeout(() => els.zoneGrid.querySelector('.zn')?.focus(), 420);
}

function setLoading(on) {
  placing = on;
  els.submit.disabled = on;
  els.submit.innerHTML = on
    ? t('dl.sending')
    : `<span data-i18n="dl.submit">${t('dl.submit')}</span> <svg class="icon"><use href="#i-scooter"/></svg>`;
}

function validate(v) {
  if (!zoneSel) return { msg: t('val.zone'), at: 1 };
  if (zoneSel.subZones?.length && !subSel && !subSkipped)
    return { msg: t('val.subzone', { skip: t('dl.subSkip') }), at: 2 };
  if (v.name.length < 2) return { msg: t('val.name'), at: 3 };
  const digits = v.phone.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return { msg: t('val.phone'), at: 3 };
  if (v.address.length < 4) return { msg: t('val.address'), at: 3 };
  if (v.mapsLink && !/^https?:\/\//i.test(v.mapsLink)) return { msg: t('val.maps'), at: 3 };
  if (!v.payment) return { msg: t('val.payment'), at: 3 };
  // points sanity (mirrors server; UI normally prevents this)
  const pts = redeemPoints();
  if (pts > 0) {
    if (pts < loyaltyCfg.minRedeem) return { msg: t('val.pointsMin', { n: loyaltyCfg.minRedeem }), at: 3 };
    if (loyaltyCfg.maxRedeem > 0 && pts > loyaltyCfg.maxRedeem) return { msg: t('val.pointsMax', { n: loyaltyCfg.maxRedeem }), at: 3 };
    if (pts > myPoints) return { msg: t('val.pointsBalance', { n: myPoints }), at: 3 };
  }
  return null;
}

async function submit(e) {
  e.preventDefault();
  if (placing) return;

  const v = {
    name: els.name.value.trim().replace(/\s+/g, ' '),
    phone: els.phone.value.trim(),
    address: els.address.value.trim(),
    mapsLink: els.maps.value.trim(),
    notes: els.notes.value.trim().slice(0, 500),
    payment: els.payGroup.querySelector('input[name="dlPay"]:checked')?.value ?? '',
  };

  const problem = validate(v);
  if (problem) {
    els.error.textContent = problem.msg;
    goStep(problem.at);
    return;
  }
  els.error.textContent = '';
  setLoading(true);
  try {
    const { order } = await placeDeliveryOrder({
      name: v.name,
      phone: v.phone,
      addressDetail: v.address,
      mapsLink: v.mapsLink,
      notes: v.notes,
      payment: v.payment,
      zoneId: String(zoneSel.id),
      subZoneId: subSel ? String(subSel.id) : '',
      userId: getUser()?.id || '',
      coupon: coupon?.code || '',
      redeemPoints: redeemPoints() || 0,
      items: cartCache.items.map((i) => ({ productId: i.id, quantity: i.qty })),
    });

    saveActive(order.id);
    document.dispatchEvent(new CustomEvent('delivery:placed')); // cart clears itself
    refreshPill(order.id, order.status);

    els.form.hidden = true;
    els.done.hidden = false;
    $('dlDoneId').textContent = '…' + String(order.id).slice(-8).toUpperCase();
    $('dlDoneVat').textContent = money(order.vatAmount || 0);
    $('dlDoneTotal').textContent = money(order.total);
    $('dlDonePay').textContent = t('pay.' + order.paymentMethod) === 'pay.' + order.paymentMethod
      ? order.paymentMethod
      : t('pay.' + order.paymentMethod);
    // server-truth rows: discount settled + loyalty settled
    const discRow = $('dlDoneDiscRow');
    if (discRow) {
      discRow.hidden = !(+order.discount > 0);
      if (+order.discount > 0) {
        $('dlDoneDiscLabel').textContent = order.discountLabel || t('dl.discount');
        $('dlDoneDisc').textContent = '−' + money(order.discount);
      }
    }
    const ptsRow = $('dlDonePtsRow');
    if (ptsRow) {
      const show = (+order.pointsRedeemed > 0) || (+order.pointsRedeemed >= 0 && loyaltyCfg?.enabled && loyaltyCfg.pointsPerOrder > 0 && getUser());
      ptsRow.hidden = !show;
      if (show) $('dlDonePts').textContent = t('dl.donePointsLine', { used: +order.pointsRedeemed || 0, earn: loyaltyCfg?.pointsPerOrder || 0 });
    }
    trackedId = order.id;
    toast(t('msg.orderPlaced'));
  } catch (err) {
    els.error.textContent = err.message || t('auth.err.generic');
  } finally {
    setLoading(false);
  }
}

/* ═══════════════ 2 · LIVE TRACKING ═══════════════ */
function stepIndex(status) {
  return STEPS.findIndex((s) => s.status === status);
}

function renderSteps(order) {
  const cancelled = order.status === 'Cancelled';
  const idx = stepIndex(order.status);
  els.steps.innerHTML = STEPS.map((s, i) => {
    const state = cancelled ? '' : i < idx ? 'done' : i === idx ? 'active' : '';
    return `
    <li class="tk__step ${state}" style="--i:${i}">
      <span class="tk__step-icon"><svg class="icon"><use href="#${s.icon}"/></svg></span>
      <span class="tk__step-label">${esc(statusLabel(s.status))}</span>
    </li>`;
  }).join('');

  const pct = cancelled ? 100 : (idx / (STEPS.length - 1)) * 100;
  els.barFill.style.width = pct + '%';
  els.barFill.classList.toggle('cancelled', cancelled);

  if (cancelled) {
    els.status.textContent = statusLabel('Cancelled');
    els.status.classList.add('is-cancelled');
  } else {
    els.status.textContent =
      order.status === 'Out for Delivery' ? t('tk.onway') : statusLabel(order.status);
    els.status.classList.remove('is-cancelled');
  }
}

function renderMeta(order) {
  els.orderId.textContent = '…' + String(order.id).slice(-8).toUpperCase();
  const eta = order.estimatedMinutes ?? settings?.estimatedMinutes ?? 45;
  els.eta.textContent =
    order.status === 'Delivered'
      ? t('tk.enjoy')
      : order.status === 'Cancelled'
        ? t('tk.callIfMistake')
        : t('tk.eta', { n: eta });
  paintElapsed(order.createdAt);

  // delivering-to zone line
  if (els.zoneLine) {
    const zn = order.zone ? pickLang(order.zone, 'name_en') : '';
    const sz = order.subZone ? pickLang(order.subZone, 'name_en') : '';
    const full = [zn, sz].filter(Boolean).join(' — ');
    els.zoneLine.hidden = !full;
    if (full) $('tkZoneText').textContent = t('tk.zone', { name: full });
  }

  const note = order.deliveryNote?.trim();
  els.note.hidden = !note;
  if (note) $('tkNoteText').textContent = note;

  // captain card — permanent driver wins; temporary driver falls back
  const captain = order.driver
    ? { name: order.driver.name, phone: order.driver.phone }
    : order.tempDriverName
      ? { name: order.tempDriverName, phone: order.tempDriverPhone }
      : null;
  const showDriver = !!captain && ['Out for Delivery', 'Ready'].includes(order.status);
  els.driver.hidden = !showDriver;
  if (showDriver) {
    $('tkDrvName').textContent = captain.name;
    $('tkDrvCall').href = telHref(captain.phone);
  }

  // loyalty earned line — members see it the moment points land
  if (els.earned) {
    const show = +order.loyaltyEarned > 0 && order.status === 'Delivered';
    els.earned.hidden = !show;
    if (show) els.earned.textContent = t('tk.earned', { n: order.loyaltyEarned });
  }
}

function paintElapsed(createdAt) {
  clearInterval(tickTimer);
  const started = new Date(createdAt).getTime();
  const runTick = () => {
    const mins = Math.max(0, Math.round((Date.now() - started) / 60000));
    els.elapsed.textContent =
      mins < 1 ? t('tk.justNow')
      : mins < 60 ? t('tk.minAgo', { n: mins })
      : t('tk.hAgo', { h: Math.floor(mins / 60), m: mins % 60 });
  };
  runTick();
  tickTimer = setInterval(runTick, 30000);
}

function renderHistory(rows) {
  els.history.innerHTML = rows
    .map(
      (h) => `
    <li>
      <span class="tk__h-dot"></span>
      <div>
        <b>${esc(statusLabel(h.status))}</b>
        ${h.note ? `<p>${esc(h.note)}</p>` : ''}
      </div>
      <time>${esc(fmtTime(h.created_at))}</time>
    </li>`
    )
    .join('');
}

async function loadTracking(id) {
  const [order, history] = await Promise.all([getDeliveryOrder(id), getDeliveryHistory(id)]);
  trackedId = id;
  renderSteps(order);
  renderMeta(order);
  renderHistory(history);
  return order;
}

/** Subscribe the open tracking modal to live updates. */
function startLive(id) {
  stopLive();
  channel = subscribeDeliveryOrder(id, () => {
    loadTracking(id).catch(() => {});
  });
}
function stopLive() {
  if (channel) {
    channel.unsubscribe?.();
    channel = null;
  }
}

export async function openTracking(id) {
  if (!id) return;
  openLayer(els.track);
  els.history.innerHTML = `<li class="tk__h-loading">${esc(t('tk.connecting'))}</li>`;
  try {
    const order = await loadTracking(id);
    startLive(id);
    refreshPill(id, order.status);
  } catch (err) {
    els.history.innerHTML = '';
    toast(err.message, 'error');
    closeLayer(els.track);
  }
}

/* ═══════════════ track pill (persistent re-entry) ═══════════════ */
function refreshPill(id, status) {
  const terminal = TERMINAL.includes(status);
  if (terminal) {
    if (readActive() === id) clearActive();
    els.pill.hidden = true;
    return;
  }
  els.pill.hidden = false;
  els.pill.querySelector('span').textContent =
    status === 'Out for Delivery' ? t('nav.trackPillOnway') : t('nav.trackPill');
}

async function bootPill() {
  const id = readActive();
  if (!id) return;
  try {
    const order = await getDeliveryOrder(id);
    if (TERMINAL.includes(order.status)) {
      clearActive();
      return;
    }
    els.pill.hidden = false;
    trackedId = id;
  } catch {
    clearActive(); // order vanished (db reset?) — stop nagging
  }
}

/* ═══════════════ language switch → repaint dynamic content ═══════════════ */
function refreshLang() {
  if (els.modal.classList.contains('open') && !els.form.hidden) {
    paintZones();
    paintSubZones();
    paintTotals();
    refreshMemberUI();
    if (coupon) paintCouponMsg('is-ok', t('dl.couponApplied', { label: coupon.label, x: money(coupon.amount) }));
    if (cartCache) els.summary.textContent = t(cartCache.count > 1 ? 'dl.summaryPlural' : 'dl.summary', { n: cartCache.count });
  }
  if (els.track.classList.contains('open') && trackedId) {
    loadTracking(trackedId).catch(() => {});
  }
  const id = trackedId || readActive();
  if (id && !els.pill.hidden) getDeliveryOrder(id).then((o) => refreshPill(id, o.status)).catch(() => {});
}

/* ═══════════════ init ═══════════════ */
export function initDelivery() {
  els = {
    modal: $('deliveryModal'),
    form: $('dlForm'),
    done: $('dlDone'),
    summary: $('dlSummary'),
    dot1: $('dlDot1'),
    dot2: $('dlDot2'),
    dot3: $('dlDot3'),
    pane1: $('dlPane1'),
    pane2: $('dlPane2'),
    pane3: $('dlPane3'),
    zoneGrid: $('dlZoneGrid'),
    subGrid: $('dlSubGrid'),
    subNone: $('dlSubNone'),
    back: $('dlBack'),
    next: $('dlNext'),
    name: $('dlName'),
    phone: $('dlPhone'),
    address: $('dlAddress'),
    maps: $('dlMaps'),
    notes: $('dlNotes'),
    payGroup: $('dlPayGroup'),
    coupon: $('dlCoupon'),
    couponBtn: $('dlCouponBtn'),
    couponMsg: $('dlCouponMsg'),
    nudge: $('dlNudge'),
    earn: $('dlEarn'),
    ptsRow: $('dlPointsRow'),
    ptsHave: $('dlPointsHave'),
    ptsHint: $('dlPointsHint'),
    ptsInput: $('dlPointsInput'),
    subtotal: $('dlSubtotal'),
    rowDisc: $('dlRowDisc'),
    discLabel: $('dlDiscLabel'),
    discAmt: $('dlDiscAmt'),
    rowPts: $('dlRowPts'),
    ptsAmt: $('dlPtsAmt'),
    fee: $('dlFee'),
    vat: $('dlVat'),
    total: $('dlTotal'),
    eta: $('dlEta'),
    error: $('dlError'),
    submit: $('dlSubmit'),
    track: $('trackModal'),
    steps: $('tkSteps'),
    barFill: $('tkBarFill'),
    status: $('tkStatus'),
    etaTrack: $('tkEta'),
    orderId: $('tkOrderId'),
    elapsed: $('tkElapsed'),
    note: $('tkNote'),
    driver: $('tkDriver'),
    history: $('tkHistory'),
    pill: $('trackPill'),
    zoneLine: $('tkZone'),
    earned: $('tkEarned'),
  };
  if (!els.modal) return;
  els.eta = $('dlEta');

  els.form.addEventListener('submit', submit);
  els.name.addEventListener('input', () => (els.error.textContent = ''));

  /* step wizard */
  els.zoneGrid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-zone]');
    if (b) selectZone(Number(b.dataset.zone));
  });
  els.subGrid.addEventListener('click', (e) => {
    const skip = e.target.closest('[data-subskip]');
    if (skip) { skipSub(); return; }
    const b = e.target.closest('[data-sub]');
    if (b) selectSub(Number(b.dataset.sub));
  });
  els.back.addEventListener('click', () => goStep(step - 1));
  els.next.addEventListener('click', () => goStep(step + 1));

  /* coupon */
  els.couponBtn.addEventListener('click', applyCoupon);
  els.coupon.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); }
  });
  els.coupon.addEventListener('input', () => {
    if (coupon) removeCoupon(); // editing the code invalidates the applied one
  });

  /* loyalty points input → live totals */
  els.ptsInput.addEventListener('input', paintTotals);

  $('dlTrackBtn').addEventListener('click', () => {
    closeLayer(els.modal);
    if (trackedId) openTracking(trackedId);
  });

  // reset error lines when the modal closes
  els.modal.addEventListener('layer:close', () => {
    els.error.textContent = '';
  });

  // stop the realtime channel + ticker when tracking closes
  els.track.addEventListener('layer:close', () => {
    stopLive();
    clearInterval(tickTimer);
  });

  els.pill.addEventListener('click', () => {
    const id = trackedId || readActive();
    if (id) openTracking(id);
  });

  /* auth transitions (sign in while checkout open → loyalty row appears) */
  document.addEventListener('auth:changed', (e) => {
    loyaltyCfg = e.detail?.loyalty ?? loyaltyCfg;
    if (els.modal.classList.contains('open') && !els.form.hidden) {
      refreshMemberUI();
      fetchAutoDiscounts().then(paintTotals);
    }
  });

  /* language switch */
  document.addEventListener('lang:changed', refreshLang);

  // deep link: ?track=<uuid> opens the live tracker straight away
  const deep = new URLSearchParams(location.search).get('track');
  if (deep) {
    saveActive(deep);
    setTimeout(() => openTracking(deep), 600);
  } else {
    bootPill();
  }
}
