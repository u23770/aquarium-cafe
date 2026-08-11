// ============================================================
//  Aquarium Cafe & Resturant — Admin · Overview (v5)
//  Delivery-only operations dashboard: today's deliveries &
//  revenue, active orders needing attention, drivers, zones,
//  coupons, loyalty members, review queue — plus the latest
//  orders feed, quick actions and the business TODO widget.
//  Numbers come from get_overview() inside Postgres.
// ============================================================
import { getOverview, getBusinessTodo } from './api.js';
import { esc, money } from './ui.js';
import { t } from '../../shared/i18n.js';

const short = (id) => '#' + String(id).slice(0, 4).toUpperCase();
const statusLabel = (s) => { const k = 'status.' + s; const v = t(k); return v === k ? s : v; };

export async function renderOverview(view) {
  view.innerHTML = `<div class="skel-rows">${'<div class="skel-row"></div>'.repeat(3)}</div>`;
  const [d, todo] = await Promise.all([getOverview(), getBusinessTodo().catch(() => [])]);

  const cards = [
    { icon: 'i-scooter', color: '#0d7d9e', value: d.delivery_today, label: t('ov.deliveriesToday'), small: t('ov.deliveriesTodaySub'), href: '#/deliveries' },
    { icon: 'i-cash',    color: '#23a6c4', value: money(d.delivery_revenue), label: t('ov.revenue'), small: t('ov.revenueSub'), href: '#/deliveries' },
    { icon: 'i-bell',    color: d.delivery_active > 0 ? '#c2544a' : '#7d93a0', value: d.delivery_active, label: t('ov.activeDesc'), small: t('ov.activeSub'), href: '#/deliveries' },
    { icon: 'i-users',   color: '#0b5b78', value: d.drivers_active, label: t('ov.drivers'), small: t('ov.driversSub'), href: '#/drivers' },
    { icon: 'i-pin',     color: '#2f7e96', value: d.zones_active, label: t('ov.zones'), small: t('ov.zonesSub'), href: '#/zones' },
    { icon: 'i-ticket',  color: '#8a6244', value: d.coupons_active, label: t('ov.coupons'), small: t('ov.couponsSub'), href: '#/discounts' },
    { icon: 'i-gift',    color: '#2e9c6f', value: d.loyalty_members, label: t('ov.members'), small: t('ov.membersSub'), href: '#/settings' },
    { icon: 'i-star-o',  color: d.reviews_pending > 0 ? '#d98e2b' : '#2e9c6f', value: d.reviews_pending, label: t('ov.reviews'), small: t('ov.reviewsSub'), href: '#/reviews' },
    { icon: 'i-cup',     color: '#0d7d9e', value: `${d.available}<small style="font-size:.9rem;color:var(--faint)">/${d.products}</small>`, label: t('ov.products'), small: t('ov.productsSub'), href: '#/menu' },
  ];

  const recent = (Array.isArray(d.recent) ? d.recent : []);
  const recentOrders = recent.length
    ? recent.map((r) => `
        <div class="ro-row">
          <span class="rid">${short(r.id)}</span>
          <span class="rtable">${esc(r.customer)} · ${esc(t('ov.itemsN', { n: r.itemsCount }))}</span>
          <span class="ro-status ${esc(r.status)}">${esc(statusLabel(r.status))}</span>
          <span class="rtotal">${money(r.total)}</span>
        </div>`).join('')
    : `<p class="empty-mini">${esc(t('ov.recentEmpty'))}</p>`;

  const pendingTodo = todo.filter((x) => !x.done);
  const todoWidget = todo.length
    ? `
      <div class="panel">
        <div class="panel__head">
          <h2>${esc(t('ov.todoTitle'))}</h2>
          <small>${esc(t('ov.todoDone', { d: todo.length - pendingTodo.length, t: todo.length }))} · <a href="#/settings">${esc(t('ov.todoOpen'))}</a></small>
        </div>
        ${pendingTodo.length
          ? `<ul class="todo-mini">
              ${pendingTodo.slice(0, 5).map((x) => `<li><svg class="icon"><use href="#i-warn"/></svg><span>${esc(x.text)}</span></li>`).join('')}
            </ul>
            ${pendingTodo.length > 5 ? `<p class="form-hint">${esc(t('ov.todoMore', { n: pendingTodo.length - 5 }))}</p>` : ''}`
          : `<p class="empty-mini">${esc(t('ov.todoEmpty'))}</p>`}
      </div>`
    : '';

  view.innerHTML = `
    <div class="stat-grid">
      ${cards.map((c) => `
        ${c.href ? `<a class="stat-card stat-card--link" href="${c.href}" style="--sc:${c.color}">` : `<div class="stat-card" style="--sc:${c.color}">`}
          <span class="stat-card__icon"><svg class="icon"><use href="#${c.icon}"/></svg></span>
          <strong>${c.value}</strong>
          <span>${c.label}</span>
          <small>${c.small}</small>
        ${c.href ? '</a>' : '</div>'}
      `).join('')}
    </div>

    <div class="ov-grid">
      <div class="panel">
        <div class="panel__head"><h2>${esc(t('ov.quickTitle'))}</h2><small>${esc(t('ov.quickSub'))}</small></div>
        <div class="quick-grid">
          <a class="quick-tile" href="#/customizer"><svg class="icon"><use href="#i-brush"/></svg> ${esc(t('ov.qDesign'))} <small>${esc(t('side.customizer'))}</small></a>
          <a class="quick-tile" href="#/menu"><svg class="icon"><use href="#i-cup"/></svg> ${esc(t('ov.qMenu'))} <small>${esc(t('side.menu'))}</small></a>
          <a class="quick-tile" href="#/zones"><svg class="icon"><use href="#i-pin"/></svg> ${esc(t('ov.qZones'))} <small>${esc(t('side.zones'))}</small></a>
          <a class="quick-tile" href="#/discounts"><svg class="icon"><use href="#i-ticket"/></svg> ${esc(t('ov.qCoupons'))} <small>${esc(t('side.discounts'))}</small></a>
          <a class="quick-tile" href="#/banners"><svg class="icon"><use href="#i-mega"/></svg> ${esc(t('ov.qBanners'))} <small>${esc(t('side.banners'))}</small></a>
          <a class="quick-tile" href="#/drivers"><svg class="icon"><use href="#i-scooter"/></svg> ${esc(t('ov.qDrivers'))} <small>${esc(t('side.drivers'))}</small></a>
          <a class="quick-tile" href="#/settings"><svg class="icon"><use href="#i-gear"/></svg> ${esc(t('ov.qSettings'))} <small>${esc(t('side.settings'))}</small></a>
          <a class="quick-tile" href="../waiter/index.html" target="_blank" rel="noopener"><svg class="icon"><use href="#i-receipt"/></svg> ${esc(t('ov.qWaiter'))} <small>live</small></a>
        </div>
      </div>

      ${todoWidget}

      <div class="panel">
        <div class="panel__head"><h2>${esc(t('ov.recentTitle'))}</h2><small>${esc(t('ov.recentSub'))}</small></div>
        ${recentOrders}
        <div class="panel__foot-link"><a href="#/deliveries"><svg class="icon"><use href="#i-scooter"/></svg> ${esc(t('ov.watch'))}</a></div>
      </div>
    </div>`;
}
