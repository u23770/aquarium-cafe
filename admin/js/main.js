// ============================================================
//  Aquarium Cafe & Resturant — Admin console main (v5)
//  Router + shell behaviour + instant EN⇄AR (RTL) language
//  switch. Delivery-only platform pages.
// ============================================================
import { initI18n, toggleLang, langSwitchLabel, t, applyI18n } from '../shared/i18n.js';
import { requireStaffSession } from '../shared/staff-auth.js';
import { dictionary } from './lang.js';
import { $, initUI, esc } from './ui.js';
import { renderOverview } from './overview.js';
import { renderCustomizer } from './customizer.js';
import { renderContent } from './content.js';
import { renderMedia } from './media.js';
import { renderMenu } from './menu.js';
import { renderZones } from './zones.js';
import { renderDiscounts } from './discounts.js';
import { renderSections } from './sections.js';
import { renderBanners } from './banners.js';
import { renderGallery } from './gallery.js';
import { renderReviews } from './reviews.js';
import { renderSocials } from './socials.js';
import { renderDeliveries } from './deliveries.js';
import { renderDrivers } from './drivers.js';
import { renderSettings } from './settings.js';
import { renderCommission } from './commission.js';

initI18n({ dictionary, defaultLang: 'en' });

const routes = {
  overview:   { titleKey: 'pt.overview',   render: renderOverview },
  customizer: { titleKey: 'pt.customizer', render: renderCustomizer },
  content:    { titleKey: 'pt.content',    render: renderContent },
  media:      { titleKey: 'pt.media',      render: renderMedia },
  sections:   { titleKey: 'pt.sections',   render: renderSections },
  menu:       { titleKey: 'pt.menu',       render: renderMenu },
  zones:      { titleKey: 'pt.zones',      render: renderZones },
  discounts:  { titleKey: 'pt.discounts',  render: renderDiscounts },
  banners:    { titleKey: 'pt.banners',    render: renderBanners },
  gallery:    { titleKey: 'pt.gallery',    render: renderGallery },
  reviews:    { titleKey: 'pt.reviews',    render: renderReviews },
  socials:    { titleKey: 'pt.socials',    render: renderSocials },
  deliveries: { titleKey: 'pt.deliveries', render: renderDeliveries },
  drivers:    { titleKey: 'pt.drivers',    render: renderDrivers },
  commission: { titleKey: 'pt.settings',   render: renderCommission },
  settings:   { titleKey: 'pt.settings',   render: renderSettings },
};

const paintLangBtn = () => {
  const btn = $('langBtn');
  const label = $('langBtnLabel');
  if (!btn || !label) return;
  label.textContent = langSwitchLabel();
  btn.setAttribute('aria-label', t('top.lang'));
  btn.setAttribute('title', t('top.lang'));
};

$('langBtn')?.addEventListener('click', toggleLang);

function paintCommissionNav() {
  const nav = $('snav');
  if (!nav) return;

  let link = nav.querySelector('.snav__link[data-route="commission"]');
  if (!link) {
    link = document.createElement('a');
    link.href = '#/commission';
    link.className = 'snav__link';
    link.dataset.route = 'commission';
    link.innerHTML = '<svg class="icon"><use href="#i-percent"/></svg><span data-commission-label></span>';

    const settingsLink = nav.querySelector('.snav__link[data-route="settings"]');
    if (settingsLink) settingsLink.before(link);
    else nav.appendChild(link);
  }

  const label = link.querySelector('[data-commission-label]');
  if (label) label.textContent = document.documentElement.lang === 'ar' ? 'العمولات' : 'Commission';
}

document.addEventListener('lang:changed', () => {
  paintLangBtn();
  applyI18n(document);
  paintCommissionNav();
  navigate();
});

paintLangBtn();
paintCommissionNav();

const sidebar = $('sidebar');
const scrim = $('sidebarScrim');
const closeSidebar = () => {
  sidebar.classList.remove('open');
  scrim.classList.remove('show');
};

$('menuBtn').addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  scrim.classList.toggle('show', open);
});

scrim.addEventListener('click', closeSidebar);

let currentKey = 'overview';

async function navigate() {
  const key = location.hash.replace(/^#\//, '') || 'overview';
  const route = routes[key] || routes.overview;
  currentKey = routes[key] ? key : 'overview';

  document.querySelectorAll('.snav__link[data-route]').forEach((l) =>
    l.classList.toggle('is-active', l.dataset.route === currentKey)
  );

  const title = $('pageTitle');
  title.textContent = currentKey === 'commission'
    ? (document.documentElement.lang === 'ar' ? 'كشف حساب العمولة' : 'Commission Statement')
    : t(route.titleKey);

  title.style.animation = 'none';
  void title.offsetWidth;
  title.style.animation = '';

  const oldView = $('view');
  const view = oldView.cloneNode(false);
  oldView.replaceWith(view);
  view.style.animation = 'none';
  void view.offsetWidth;
  view.style.animation = '';

  closeSidebar();

  try {
    await route.render(view);
  } catch (err) {
    // Never place a raw database/network error inside innerHTML.
    // Error messages are treated as untrusted text at this boundary.
    view.innerHTML = `
      <div class="err-box">
        <svg class="icon"><use href="#i-warn"/></svg>
        <p data-error-message></p>
        <button class="btn btn--ghost" data-reload>${esc(t('act.reload'))}</button>
      </div>`;
    view.querySelector('[data-error-message]').textContent = err?.message || t('err.load');
    view.querySelector('[data-reload]').addEventListener('click', () => location.reload());
  }
}

window.addEventListener('hashchange', navigate);

requireStaffSession('admin').then(() => {
  initUI();
  paintCommissionNav();
  navigate();
});
