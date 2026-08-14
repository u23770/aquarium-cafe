// ============================================================
//  Aquarium Cafe & Resturant — Promo banner + Gallery grid (v5)
//  (both are managed from the admin; images resolve from the
//  media library or the bundled images/ folder). Chrome strings
//  (aria labels, empty state) are bilingual via the dictionary.
// ============================================================
import { getBanners, getGallery } from './api.js';
import { esc, openLayer, observeReveals } from './ui.js';
import { t } from '../../shared/i18n.js';

const $ = (id) => document.getElementById(id);

/* ---------- promo banner strip ---------- */
async function renderBanner() {
  const wrap = $('bannerStrip');
  if (!wrap) return;
  try {
    const rows = await getBanners();
    if (!rows.length) {
      wrap.innerHTML = '';
      document.querySelector('[data-section="banner"]')?.setAttribute('hidden', '');
      return;
    }
    const b = rows[0]; // show the first visible banner
    wrap.innerHTML = `
      <div class="banner__card ${b.image ? 'has-img' : ''}">
        ${b.image ? `<div class="banner__media"><img src="${esc(b.image)}" alt=""
              loading="lazy" decoding="async" onerror="this.parentElement.remove()"></div>` : ''}
        <div class="banner__info">
          <h3>${esc(b.title)}</h3>
          ${b.subtitle ? `<p>${esc(b.subtitle)}</p>` : ''}
          ${b.cta_text && b.cta_link
            ? `<a class="btn btn--primary" href="${esc(b.cta_link)}"
                  ${b.cta_link.startsWith('#') ? 'data-scroll' : 'target="_blank" rel="noopener"'}">${esc(b.cta_text)}
                 <svg class="icon"><use href="#i-arrow"/></svg></a>`
            : ''}
        </div>
      </div>`;
  } catch {
    wrap.innerHTML = '';
  }
}

/* ---------- gallery grid + lightbox ---------- */
function tileHTML(g, i) {
  return `
  <button class="gallery__tile reveal" style="--d:${(i % 9) * 60}ms" data-img="${esc(g.image)}"
          data-title="${esc(g.title || '')}" aria-label="${esc(t('gal.viewPhoto', { n: i + 1 }))}${g.title ? ': ' + esc(g.title) : ''}">
    <img src="${esc(g.image)}" alt="${esc(g.title || 'Aquarium photo')}" loading="lazy" decoding="async"
         onerror="this.closest('.gallery__tile').remove()">
    ${g.title ? `<span class="gallery__cap">${esc(g.title)}</span>` : ''}
  </button>`;
}

async function renderGallery() {
  const grid = $('galleryGrid');
  if (!grid) return;
  try {
    const rows = await getGallery();
    grid.innerHTML = rows.length
      ? rows.map(tileHTML).join('')
      : `<div class="menu__empty">
           <svg class="icon"><use href="#i-img"/></svg>
           <p>${esc(t('gal.empty'))}</p>
         </div>`;
    observeReveals(grid.querySelectorAll('.reveal'));
  } catch {
    grid.innerHTML = '';
  }
}

export function initGallery() {
  renderBanner();
  renderGallery();

  const grid = $('galleryGrid');
  const box = $('lightbox');
  if (!grid || !box) return;
  grid.addEventListener('click', (e) => {
    const tile = e.target.closest('.gallery__tile');
    if (!tile) return;
    $('lbImg').src = tile.dataset.img;
    $('lbImg').alt = tile.dataset.title || 'Aquarium photo';
    $('lbTitle').textContent = tile.dataset.title || '';
    openLayer(box);
  });

  // aria labels follow the language
  document.addEventListener('lang:changed', renderGallery);
}
