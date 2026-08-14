// ============================================================
//  Aquarium Cafe & Resturant — Appearance engine (Visual Builder, client side)
// ------------------------------------------------------------
//  Loads settings / theme / content / sections from Supabase,
//  merges them over the shared defaults and applies everything:
//  CSS variables, fonts, body variants, text, images, nav,
//  sections order & visibility, feature switches, favicon…
//
//  It also powers the Admin Live Preview (?preview=1 → the
//  customizer streams unsaved changes via postMessage) and
//  hot-applies saved changes through Supabase Realtime.
// ============================================================
import {
  defaultSettings, defaultTheme, defaultContent, defaultSections,
  settingsFromRows, themeFromRows, contentFromRows, sectionsFromRows,
  FONT_STACKS, SHADOW_SIZES, IMAGE_RATIOS, IMAGE_HEIGHTS, BUTTON_SIZES,
  hexToRgba, ensureFontLoaded,
} from '../../shared/appearance.js';
import { isExternalUrl } from '../../shared/media.js';
import { getAppearance, subscribeAppearance } from './api.js';
import { setCurrency, esc, initReveals } from './ui.js';
import { t, getLang } from '../../shared/i18n.js';

/* nav/footer anchors that map to dictionary keys (instant EN⇄AR) */
const NAV_KEYS = {
  '#hero': 'nav.home',
  '#menu': 'nav.menu',
  '#gallery': 'nav.gallery',
  '#about': 'nav.about',
  '#reviews': 'nav.reviews',
  '#contact': 'nav.contact',
};

/** Switch known nav/footer labels with the language — DB labels win in EN,
    dictionary labels take over in AR. Safe to call after every re-render. */
export function applyNavLang() {
  document.querySelectorAll('[data-i18n-nav]').forEach((a) => {
    const key = a.dataset.i18nNav;
    if (getLang() === 'ar') {
      a.textContent = t(key);
    } else if (a.dataset.dbLabel != null) {
      a.textContent = a.dataset.dbLabel;
    }
  });
}

export const PREVIEW = new URLSearchParams(location.search).has('preview');

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const body = document.body;

/* current fully-resolved appearance */
export const appearance = {
  settings: defaultSettings(),
  theme: defaultTheme(),
  content: defaultContent(),
  sections: defaultSections(),
};

/* bundled site images resolve relative to this page; storage URLs pass through */
const resolveSrc = (p) => (!p ? '' : isExternalUrl(p) ? p : String(p).replace(/^\/+/, ''));

/* pick readable text color for a background hex (nav…) */
function textOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return '#f6ecdd';
  const n = parseInt(m[1], 16);
  const lum = (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.55 ? '#2b2018' : '#f6ecdd';
}

const setVar = (name, value) => { if (value !== undefined && value !== null) root.style.setProperty(name, value); };

/* ═══════════════ 1 · visual variables ═══════════════ */
function applyTheme(t) {
  const c = t.colors;
  setVar('--c-primary', c.primary);
  setVar('--c-secondary', c.secondary);
  setVar('--c-accent', c.accent);
  setVar('--c-bg', c.background);
  setVar('--c-section', c.sectionBg);
  setVar('--c-card', c.cardBg);
  setVar('--c-btn', c.buttonBg);
  setVar('--c-btn-hover', c.buttonHover);
  setVar('--c-text', c.text);
  setVar('--c-heading', c.heading);
  setVar('--c-border', c.border);
  setVar('--c-footer', c.footerBg);
  setVar('--c-navbar', c.navbarBg);
  setVar('--c-overlay', c.overlay);
  setVar('--nav-bg', hexToRgba(c.navbarBg, t.navbar.transparency));
  setVar('--nav-text', textOn(c.navbarBg));
  setVar('--hero-bg', t.hero.bgColor);
  setVar('--hero-overlay', hexToRgba(t.hero.overlayColor, t.hero.overlayOpacity));

  const ty = t.typography;
  ensureFontLoaded(ty.headingFont);
  ensureFontLoaded(ty.bodyFont);
  setVar('--font-head', FONT_STACKS[ty.headingFont] || FONT_STACKS['Playfair Display']);
  setVar('--font-body', FONT_STACKS[ty.bodyFont] || FONT_STACKS.Manrope);
  setVar('--fs-body', ty.bodySize + 'px');
  setVar('--fs-h1', ty.h1Size + 'px');
  setVar('--fs-h2', ty.h2Size + 'px');
  setVar('--fs-h3', ty.h3Size + 'px');
  setVar('--fw-head', ty.headingWeight);
  setVar('--fw-body', ty.bodyWeight);
  setVar('--ls-body', ty.letterSpacing + 'px');
  setVar('--lh-body', ty.lineHeight);

  const l = t.layout;
  setVar('--container-w', l.containerWidth + 'px');
  setVar('--gutter', l.spacing + 'px');
  setVar('--section-pad', l.sectionPadding + 'px');
  setVar('--radius', l.cardRadius + 'px');
  setVar('--shadow-1', SHADOW_SIZES[l.shadowSize] ?? SHADOW_SIZES.medium);
  setVar('--grid-cols', l.gridColumns);

  const cd = t.card;
  setVar('--card-radius', cd.radius + 'px');
  setVar('--card-shadow', SHADOW_SIZES[cd.shadow] ?? SHADOW_SIZES.medium);
  setVar('--card-pad', cd.spacing + 'px');
  setVar('--card-img-ratio', IMAGE_RATIOS[cd.imageRatio] ?? IMAGE_RATIOS['4:3']);
  setVar('--card-img-max-h', IMAGE_HEIGHTS[cd.imageSize] ?? IMAGE_HEIGHTS.medium);
  body.dataset.cardStyle = cd.style;
  body.dataset.cardHover = cd.hover;

  const b = t.buttons;
  const bs = BUTTON_SIZES[b.size] || BUTTON_SIZES.medium;
  setVar('--btn-radius', b.radius + 'px');
  setVar('--btn-py', bs.py);
  setVar('--btn-px', bs.px);
  setVar('--btn-fs', bs.fs);
  body.dataset.btnStyle = b.style;
  body.dataset.btnAnim = b.animation;

  const n = t.navbar;
  body.dataset.navStyle = n.style;
  body.dataset.navSticky = n.sticky ? 'on' : 'off';
  body.classList.toggle('nav-blur', !!n.blur);
  setVar('--logo-h', n.logoSize + 'px');
  setVar('--nav-h', (n.logoSize + 38) + 'px');

  const a = t.animations;
  body.dataset.animType = a.type;
  body.classList.toggle('anim-off', !a.enabled);
  const ms = Math.max(80, (a.duration || 700) * (100 / Math.max(25, a.speed || 100)));
  setVar('--anim-dur', (ms / 1000).toFixed(3) + 's');
}

/* ═══════════════ 2 · identity & feature switches ═══════════════ */
function applySettings(s) {
  const name = s.cafeName?.trim() || 'Aquarium Cafe & Resturant';

  document.title = `${name}${s.slogan ? ' — ' + s.slogan : ''}`;
  const meta = $('metaDesc');
  if (meta && s.description) meta.setAttribute('content', s.description);

  document.querySelectorAll('[data-brand-name]').forEach((el) => {
    if (el.firstChild) el.firstChild.nodeValue = name.toUpperCase();
  });

  // logo (falls back to the mint-leaf mark)
  document.querySelectorAll('.brand__mark').forEach((m) => {
    if (s.logoUrl) {
      m.classList.add('has-logo');
      if (!m.querySelector('img'))
        m.innerHTML = `<img class="brand__logo-img" src="${esc(resolveSrc(s.logoUrl))}" alt="${esc(name)} logo">`;
      else m.querySelector('img').src = resolveSrc(s.logoUrl);
    } else {
      m.classList.remove('has-logo');
      m.innerHTML = '<svg class="icon"><use href="#i-leaf"/></svg>';
    }
  });

  // favicon (custom → logo → bundled default)
  const fav = $('favicon');
  const favSrc = s.faviconUrl || s.logoUrl;
  if (fav && favSrc) fav.href = resolveSrc(favSrc);

  const pre = $('preWord');
  if (pre) pre.textContent = name.split(/\s+/)[0].toUpperCase();

  setCurrency(s.currency);

  body.classList.toggle('feat-no-order', s.features?.ordering === false);
  // v5: reservations/dine-in are gone for good — nothing to toggle.
  body.classList.toggle('feat-no-delivery', s.features?.delivery === false);
}

/* ═══════════════ 3 · content ═══════════════ */
function applyContent(ct, s) {
  /* --- navigation --- (v5: delivery-only — no reserve link;
         known anchors get data-i18n-nav for instant EN⇄AR) */
  const navItems = Array.isArray(ct.navItems) ? ct.navItems : [];
  const navHTML = navItems
    .map((n, i) => {
      const href = String(n.href || '#');
      const anchor = href.startsWith('#') ? href.slice(1) : '';
      return `<a href="${esc(href)}" ${anchor ? 'data-scroll' : 'target="_blank" rel="noopener"'} ${anchor ? `data-link="${esc(anchor)}"` : ''} class="${i === 0 ? 'is-active' : ''}">${esc(n.label || 'Link')}</a>`;
    })
    .join('');
  const nav = $('navLinks');
  if (nav) {
    nav.innerHTML = navHTML;
    nav.querySelectorAll('a').forEach((a) => {
      a.dataset.dbLabel = a.textContent;
      const key = NAV_KEYS[a.getAttribute('href')];
      if (key) a.dataset.i18nNav = key;
    });
  }

  const fNav = $('fNav');
  if (fNav) {
    fNav.innerHTML = navItems
      .map((n) => {
        const href = String(n.href || '#');
        const anchor = href.startsWith('#');
        return `<a href="${esc(href)}" ${anchor ? 'data-scroll' : 'target="_blank" rel="noopener"'}>${esc(n.label || 'Link')}</a>`;
      })
      .join('');
    fNav.querySelectorAll('a').forEach((a) => {
      a.dataset.dbLabel = a.textContent;
      const key = NAV_KEYS[a.getAttribute('href')];
      if (key) a.dataset.i18nNav = key;
    });
  }
  applyNavLang();

  /* --- hero --- */
  const h = ct.hero || {};
  const slogan = s.slogan || '';
  const heroSlogan = $('heroSlogan');
  if (heroSlogan) heroSlogan.textContent = slogan;
  const heroTitle = $('heroTitle');
  if (heroTitle) heroTitle.textContent = h.title || '';
  const heroSub = $('heroSub');
  if (heroSub) heroSub.textContent = h.subtitle || '';
  const heroBtn = $('heroBtn');
  if (heroBtn) {
    $('heroBtnText').textContent = h.buttonText || 'Explore';
    const link = String(h.buttonLink || '#menu');
    heroBtn.setAttribute('href', link);
    if (link.startsWith('#')) {
      heroBtn.setAttribute('data-scroll', '');
      heroBtn.removeAttribute('target');
    } else {
      heroBtn.removeAttribute('data-scroll');
      heroBtn.setAttribute('target', '_blank');
      heroBtn.setAttribute('rel', 'noopener');
    }
  }
  const heroBg = $('heroBg');
  if (heroBg && h.imageUrl) heroBg.style.backgroundImage = `url("${resolveSrc(h.imageUrl)}")`;

  /* --- highlights strip --- */
  const track = $('highlightsTrack');
  if (track) {
    const items = (Array.isArray(ct.highlights) ? ct.highlights : []).filter(Boolean);
    const seq = items.length ? items : ['Aquarium Cafe & Resturant'];
    track.innerHTML = [...seq, ...seq].map((t) => `<span>${esc(t)}</span><i>✦</i>`).join('');
  }

  /* --- about --- */
  if (ct.about) {
    const at = $('aboutTitle');
    if (at) at.textContent = ct.about.title || '';
    const ap = $('aboutText');
    if (ap) ap.textContent = ct.about.text || '';
    const ai = $('aboutImg');
    if (ai && ct.about.imageUrl) ai.src = resolveSrc(ct.about.imageUrl);
  }

  /* --- contact --- */
  const k = ct.contact || {};
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('cAddress', k.address || '');
  set('cAddress2', k.address || '');
  set('fAddress', k.address || '');

  const phones = Array.isArray(k.phones) ? k.phones.filter(Boolean) : [];
  const phoneLinks = phones
    .map((p) => `<a href="tel:${esc(String(p).replace(/[^\d+]/g, ''))}">${esc(p)}</a>`)
    .join('');
  const cPhones = $('cPhones');
  if (cPhones) cPhones.innerHTML = phoneLinks || '<p class="dim">—</p>';
  const fPhones = $('fPhones');
  if (fPhones) fPhones.innerHTML = phoneLinks;

  const wa = $('cWaLink');
  if (wa) {
    if (k.whatsapp) { wa.href = k.whatsapp; wa.classList.remove('is-hidden'); }
    else wa.classList.add('is-hidden');
  }
  const em = $('cEmailLink');
  if (em) {
    if (k.email) { em.href = 'mailto:' + k.email; em.innerHTML = `<svg class="icon"><use href="#i-mail"/></svg> ${esc(k.email)}`; em.classList.remove('is-hidden'); }
    else em.classList.add('is-hidden');
  }
  const maps = $('mapsBtn');
  if (maps) {
    if (k.mapsUrl) { maps.href = k.mapsUrl; maps.classList.remove('is-hidden'); }
    else maps.classList.add('is-hidden');
  }

  /* socials (hide an icon when its URL is empty) */
  const socials = { ...(ct.socials || {}), whatsapp: k.whatsapp };
  document.querySelectorAll('[data-social]').forEach((a) => {
    const url = socials[a.dataset.social];
    a.classList.toggle('is-hidden', !url);
    if (url) a.href = url;
  });

  /* working hours */
  const hourRows = (Array.isArray(ct.hours) ? ct.hours : [])
    .map((r, i) => `<p${i ? ' class="dim"' : ''}>${esc(r.days)} · ${esc(r.time)}</p>`)
    .join('');
  const cHours = $('cHours');
  if (cHours) cHours.innerHTML = hourRows;
  const fHours = $('fHours');
  if (fHours) fHours.innerHTML = hourRows;

  /* branches */
  const branches = (Array.isArray(ct.branches) ? ct.branches : []).filter((b) => b && (b.name || b.address));
  const brWrap = $('cBranches');
  const brRow = $('cBranchesRow');
  if (brWrap && brRow) {
    brWrap.hidden = branches.length === 0;
    brRow.innerHTML = branches
      .map(
        (b) => `
      <div class="branch">
        <b>${esc(b.name || '')}</b>
        <p>${esc(b.address || '')}</p>
        ${b.phone ? `<a href="tel:${esc(String(b.phone).replace(/[^\d+]/g, ''))}"><svg class="icon"><use href="#i-phone"/></svg> ${esc(b.phone)}</a>` : ''}
      </div>`
      )
      .join('');
  }

  /* footer */
  set('fDescription', s.description || ct.footerAbout || '');
  const copy = $('fCopyright');
  if (copy)
    copy.innerHTML = esc(String(s.copyright || '').replace('{year}', new Date().getFullYear()));
}

/* ═══════════════ 4 · sections (order & visibility) ═══════════════ */
function applySections(list) {
  const main = $('pageMain');
  const map = new Map();
  document.querySelectorAll('[data-section]').forEach((el) => map.set(el.dataset.section, el));

  // order main-page sections
  const ordered = list
    .filter((s) => map.has(s.id) && map.get(s.id).parentElement === main)
    .sort((a, b) => a.position - b.position);
  for (const s of ordered) main.appendChild(map.get(s.id));

  // visibility everywhere (main sections + footer)
  for (const s of list) {
    const el = map.get(s.id);
    if (el) el.hidden = s.visible === false;
  }
}

/* ═══════════════ apply everything ═══════════════ */
export function applyAll(a) {
  Object.assign(appearance.settings, a.settings);
  Object.assign(appearance.theme, a.theme);
  Object.assign(appearance.content, a.content);
  appearance.sections = a.sections;

  applyTheme(appearance.theme);
  applySettings(appearance.settings);
  applyContent(appearance.content, appearance.settings);
  applySections(appearance.sections);

  initReveals(); // sections may have re-ordered / re-rendered
  document.dispatchEvent(new CustomEvent('theme:applied'));
}

/* fetch from Supabase and apply (graceful: defaults stay on failure) */
export async function loadAppearance() {
  try {
    const rows = await getAppearance();
    applyAll({
      settings: settingsFromRows(rows.settings),
      theme: themeFromRows(rows.theme),
      content: contentFromRows(rows.content),
      sections: sectionsFromRows(rows.sections),
    });
    return true;
  } catch {
    return false; // bundled defaults remain — site still renders
  }
}

/* ═══════════════ boot: preview stream + realtime ═══════════════ */
export function initAppearance() {
  if (PREVIEW) {
    // the admin customizer streams entire appearance objects
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (!d || d.source !== 'menta-admin' || d.type !== 'appearance:preview' || !d.payload) return;
      const p = d.payload;
      applyAll({
        settings: { ...defaultSettings(), ...p.settings },
        theme: { ...defaultTheme(), ...p.theme },
        content: { ...defaultContent(), ...p.content },
        sections: sectionsFromRows(p.sections?.length ? p.sections : defaultSections()),
      });
    });
    // tell the parent we're ready to receive
    window.parent?.postMessage({ source: 'menta-customer', type: 'preview:ready' }, location.origin);
  }

  loadAppearance();

  if (!PREVIEW) {
    let t = null;
    subscribeAppearance(() => {
      clearTimeout(t);
      t = setTimeout(loadAppearance, 300); // burst of saves → one reload
    });
  }
}
