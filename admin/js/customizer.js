// ============================================================
//  Aquarium Cafe & Resturant — Admin · Visual Website Builder (Customizer)
//  Left: contextual control panels (General, Colors, Type,
//  Layout, Hero, Navbar, Product Card, Buttons, Animations).
//  Right: a LIVE preview of the real customer site — every
//  change streams into the iframe instantly, before saving.
//  Nothing is written to Supabase until "Save changes".
// ============================================================
import { getAppearance, saveAppearance } from './api.js';
import { $, esc, toast, setSaveState, confirmDialog } from './ui.js';
import { t } from '../../shared/i18n.js';
import * as C from './controls.js';

let state = null;          // { settings, theme, content, sections }
let savedSnapshot = '';
let activeTab = 'general';
let frameReady = false;
let previewTimer = null;

const snapshot = () => JSON.stringify({ s: state.settings, t: state.theme, c: state.content });
const isDirty = () => snapshot() !== savedSnapshot;

/* ═══════════════ preview channel ═══════════════ */
function pushPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const frame = $('czFrame');
    if (!frame?.contentWindow || !frameReady) return;
    frame.contentWindow.postMessage(
      {
        source: 'menta-admin',
        type: 'appearance:preview',
        payload: {
          settings: state.settings,
          theme: state.theme,
          content: state.content,
          sections: state.sections,
        },
      },
      location.origin
    );
  }, 90);
}

window.addEventListener('message', (e) => {
  if (e.data?.source === 'menta-customer' && e.data?.type === 'preview:ready') {
    frameReady = true;
    pushPreview();
  }
});

/* any control changed → bind into state, flag dirty, preview */
function emit(path, value, { rerender = false } = {}) {
  C.setPath(state, path, value);
  paintDirty();
  if (rerender) openTab(activeTab);
  pushPreview();
}

function paintDirty() {
  const dirty = isDirty();
  $('czSave').disabled = !dirty;
  $('czReset').disabled = !dirty;
  $('czDirty').hidden = !dirty;
  setSaveState(dirty ? 'busy' : 'ok', dirty ? t('cz.unsavedState') : t('cz.savedState'));
}

/* ═══════════════ panel definitions ═══════════════ */
const bind = ({ path, def }) =>
  C[def.kind]({ ...def, value: def.value ?? C.getPath(state, path), onChange: (v) => emit(path, v, def) });

/* shorthand builders bound to current state (labels via the dictionary) */
const txt  = (p, labelKey, o = {}) => bind({ path: p, def: { kind: 'textControl', label: t(labelKey), ...o } });
const col  = (p, labelKey) => bind({ path: p, def: { kind: 'colorControl', label: t(labelKey) } });
const rng  = (p, labelKey, min, max, o = {}) => bind({ path: p, def: { kind: 'rangeControl', label: t(labelKey), min, max, ...o } });
const sel  = (p, labelKey, options) => bind({ path: p, def: { kind: 'selectControl', label: t(labelKey), options } });
const tog  = (p, labelKey, hintKey) => bind({ path: p, def: { kind: 'toggleControl', label: t(labelKey), ...(hintKey ? { hint: t(hintKey) } : {}) } });
const img  = (p, labelKey, hintKey) => bind({ path: p, def: { kind: 'imageControl', label: t(labelKey), ...(hintKey ? { hint: t(hintKey) } : {}) } });
const font = (p, labelKey) => bind({ path: p, def: { kind: 'fontControl', label: t(labelKey) } });

const SHADOW_OPTS = () => [
  { value: 'none', label: t('cz.animNone') },
  { value: 'small', label: t('cz.sizeS') },
  { value: 'medium', label: t('cz.sizeM') },
  { value: 'large', label: t('cz.sizeL') },
];
const HOVER_OPTS = () => [
  { value: 'lift', label: t('cz.animLift') },
  { value: 'zoom', label: t('cz.revealZoom') },
  { value: 'glow', label: t('cz.animGlow') },
  { value: 'none', label: t('cz.animNone') },
];

function panels() {
  return [
    /* ───────── GENERAL ───────── */
    [
      C.group(t('cz.g.identity'), 'i-leaf', [
        txt('settings.cafeName', 'cz.cafeName'),
        txt('settings.slogan', 'cz.slogan'),
        txt('settings.description', 'cz.description', { area: true, rows: 3 }),
        txt('settings.copyright', 'cz.copyright', { hint: t('cz.copyrightHint') }),
      ]),
      C.group(t('cz.g.logo'), 'i-img', [
        img('settings.logoUrl', 'cz.logo', 'cz.logoHint'),
        img('settings.faviconUrl', 'cz.favicon', 'cz.faviconHint'),
      ]),
      C.group(t('cz.g.regional'), 'i-sliders', [
        sel('settings.currency', 'cz.currency', ['EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD']),
      ]),
    ],

    /* ───────── COLORS ───────── */
    [
      C.group(t('cz.g.palette'), 'i-drop', [
        grid([col('theme.colors.primary', 'cz.primary'), col('theme.colors.secondary', 'cz.secondary'), col('theme.colors.accent', 'cz.accent')]),
      ]),
      C.group(t('cz.g.surfaces'), 'i-drop', [
        grid([col('theme.colors.background', 'cz.background'), col('theme.colors.sectionBg', 'cz.sectionBg'), col('theme.colors.cardBg', 'cz.cardBg'), col('theme.colors.border', 'cz.border')]),
      ]),
      C.group(t('cz.g.btnText'), 'i-drop', [
        grid([col('theme.colors.buttonBg', 'cz.buttonBg'), col('theme.colors.buttonHover', 'cz.buttonHover'), col('theme.colors.text', 'cz.text'), col('theme.colors.heading', 'cz.headings')]),
      ]),
      C.group(t('cz.g.chrome'), 'i-drop', [
        grid([col('theme.colors.navbarBg', 'cz.navbarBg'), col('theme.colors.footerBg', 'cz.footerBg'), col('theme.colors.overlay', 'cz.overlay')]),
      ]),
    ],

    /* ───────── TYPOGRAPHY ───────── */
    [
      C.group(t('cz.g.fonts'), 'i-type', [
        font('theme.typography.headingFont', 'cz.headingFont'),
        font('theme.typography.bodyFont', 'cz.bodyFont'),
      ]),
      C.group(t('cz.g.sizes'), 'i-type', [
        rng('theme.typography.bodySize', 'cz.bodySize', 14, 18, { unit: 'px' }),
        rng('theme.typography.h1Size', 'cz.h1Size', 40, 84, { unit: 'px' }),
        rng('theme.typography.h2Size', 'cz.h2Size', 26, 52, { unit: 'px' }),
        rng('theme.typography.h3Size', 'cz.h3Size', 16, 26, { unit: 'px' }),
        sel('theme.typography.headingWeight', 'cz.headingWeight', ['500', '600', '700', '800']),
        sel('theme.typography.bodyWeight', 'cz.bodyWeight', ['400', '500', '600']),
      ]),
      C.group(t('cz.g.rhythm'), 'i-type', [
        rng('theme.typography.letterSpacing', 'cz.letterSpacing', -0.5, 3, { step: 0.1, unit: 'px' }),
        rng('theme.typography.lineHeight', 'cz.lineHeight', 1.3, 2.0, { step: 0.05 }),
      ]),
    ],

    /* ───────── LAYOUT ───────── */
    [
      C.group(t('cz.g.canvas'), 'i-layout', [
        rng('theme.layout.containerWidth', 'cz.containerWidth', 960, 1400, { step: 20, unit: 'px' }),
        rng('theme.layout.spacing', 'cz.spacing', 8, 28, { unit: 'px' }),
        rng('theme.layout.sectionPadding', 'cz.sectionPadding', 48, 140, { unit: 'px' }),
      ]),
      C.group(t('cz.g.cards'), 'i-layout', [
        rng('theme.layout.cardRadius', 'cz.cardRadius', 0, 32, { unit: 'px' }),
        sel('theme.layout.shadowSize', 'cz.shadowSize', SHADOW_OPTS()),
        sel('theme.layout.gridColumns', 'cz.gridColumns', ['2', '3', '4']),
      ]),
    ],

    /* ───────── HERO ───────── */
    [
      C.group(t('cz.g.heroBg'), 'i-hero', [
        img('content.hero.imageUrl', 'cz.heroImage', 'cz.heroImageHint'),
        col('theme.hero.bgColor', 'cz.bgColor'),
        col('theme.hero.overlayColor', 'cz.overlayColor'),
        rng('theme.hero.overlayOpacity', 'cz.overlayOpacity', 0, 90, { unit: '%' }),
      ]),
      C.group(t('cz.g.heroCopy'), 'i-type', [
        txt('content.hero.title', 'cz.heroTitle'),
        txt('content.hero.subtitle', 'cz.heroSubtitle', { area: true, rows: 3 }),
        txt('content.hero.buttonText', 'cz.heroButton'),
        txt('content.hero.buttonLink', 'cz.heroLink', { hint: t('cz.heroLinkHint') }),
      ]),
    ],

    /* ───────── NAVBAR ───────── */
    [
      C.group(t('cz.g.barBehavior'), 'i-nav', [
        sel('theme.navbar.style', 'cz.navbarStyle', [
          { value: 'glass', label: t('cz.navGlass') },
          { value: 'solid', label: t('cz.navSolid') },
          { value: 'transparent', label: t('cz.navTransparent') },
        ]),
        tog('theme.navbar.sticky', 'cz.sticky', 'cz.stickyHint'),
        tog('theme.navbar.blur', 'cz.blur'),
        rng('theme.navbar.transparency', 'cz.transparency', 40, 100, { unit: '%' }),
        rng('theme.navbar.logoSize', 'cz.logoSize', 28, 64, { unit: 'px' }),
      ]),
      C.group(t('cz.g.navItems'), 'i-nav', [
        C.listEditor({
          items: state.content.navItems,
          fields: [
            { key: 'label', label: t('cz.navLabel'), ph: t('cz.navLabelPh') },
            { key: 'href', label: t('cz.navLink'), ph: '#menu' },
          ],
          addLabel: t('cz.addNav'),
          singular: t('cz.navLink'),
          onChange: (items) => emit('content.navItems', items),
        }),
        note(t('cz.navItemsHint')),
      ]),
    ],

    /* ───────── PRODUCT CARD ───────── */
    [
      C.group(t('cz.g.cardDesign'), 'i-card', [
        sel('theme.card.style', 'cz.cardStyle', [
          { value: 'elevated', label: t('cz.cardElevated') },
          { value: 'outline', label: t('cz.cardOutline') },
          { value: 'flat', label: t('cz.cardFlat') },
        ]),
        rng('theme.card.radius', 'cz.borderRadius', 0, 32, { unit: 'px' }),
        sel('theme.card.shadow', 'cz.shadow', SHADOW_OPTS()),
        sel('theme.card.hover', 'cz.hoverAnim', HOVER_OPTS()),
        rng('theme.card.spacing', 'cz.innerPadding', 8, 28, { unit: 'px' }),
      ]),
      C.group(t('cz.g.cardImage'), 'i-img', [
        sel('theme.card.imageRatio', 'cz.imageRatio', ['1:1', '4:3', '3:2', '16:9']),
        sel('theme.card.imageSize', 'cz.imageSize', [
          { value: 'small', label: t('cz.sizeS') },
          { value: 'medium', label: t('cz.sizeM') },
          { value: 'large', label: t('cz.sizeL') },
        ]),
      ]),
    ],

    /* ───────── BUTTONS ───────── */
    [
      C.group(t('cz.g.btnDesign'), 'i-btn', [
        rng('theme.buttons.radius', 'cz.borderRadius', 0, 28, { unit: 'px' }),
        sel('theme.buttons.style', 'cz.style', [
          { value: 'solid', label: t('cz.styleSolid') },
          { value: 'outline', label: t('cz.styleOutline') },
          { value: 'soft', label: t('cz.styleSoft') },
        ]),
        sel('theme.buttons.size', 'cz.size', [
          { value: 'small', label: t('cz.sizeS') },
          { value: 'medium', label: t('cz.sizeM') },
          { value: 'large', label: t('cz.sizeL') },
        ]),
        sel('theme.buttons.animation', 'cz.hoverAnim', [
          { value: 'lift', label: t('cz.animLift') },
          { value: 'scale', label: t('cz.animScale') },
          { value: 'glow', label: t('cz.animGlow') },
          { value: 'none', label: t('cz.animNone') },
        ]),
      ]),
    ],

    /* ───────── ANIMATIONS ───────── */
    [
      C.group(t('cz.g.motion'), 'i-play', [
        tog('theme.animations.enabled', 'cz.animEnabled', 'cz.animEnabledHint'),
        sel('theme.animations.type', 'cz.revealType', [
          { value: 'rise', label: t('cz.revealRise') },
          { value: 'fade', label: t('cz.revealFade') },
          { value: 'zoom', label: t('cz.revealZoom') },
          { value: 'slide', label: t('cz.revealSlide') },
        ]),
        rng('theme.animations.duration', 'cz.baseDuration', 200, 1200, { step: 50, unit: 'ms' }),
        rng('theme.animations.speed', 'cz.speed', 50, 200, { step: 10, unit: '%' }),
      ]),
    ],
  ];
}

const TAB_DEFS = [
  { id: 'general',    labelKey: 'cz.t.general',    icon: 'i-leaf',   i: 0 },
  { id: 'colors',     labelKey: 'cz.t.colors',     icon: 'i-drop',   i: 1 },
  { id: 'typography', labelKey: 'cz.t.typography', icon: 'i-type',   i: 2 },
  { id: 'layout',     labelKey: 'cz.t.layout',     icon: 'i-layout', i: 3 },
  { id: 'hero',       labelKey: 'cz.t.hero',       icon: 'i-hero',   i: 4 },
  { id: 'navbar',     labelKey: 'cz.t.navbar',     icon: 'i-nav',    i: 5 },
  { id: 'cards',      labelKey: 'cz.t.cards',      icon: 'i-card',   i: 6 },
  { id: 'buttons',    labelKey: 'cz.t.buttons',    icon: 'i-btn',    i: 7 },
  { id: 'animations', labelKey: 'cz.t.animations', icon: 'i-play',   i: 8 },
];

function grid(nodes) {
  const el = document.createElement('div');
  el.className = 'cz-2col';
  nodes.forEach((n) => el.appendChild(n));
  return el;
}
function note(text) {
  const el = document.createElement('p');
  el.className = 'ctl__note';
  el.textContent = text;
  return el;
}

function openTab(id) {
  activeTab = id;
  document.querySelectorAll('.cz-tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === id));
  const box = $('czFields');
  box.innerHTML = '';
  const tab = TAB_DEFS.find((x) => x.id === id);
  for (const g of panels()[tab.i]) box.appendChild(g);
  box.style.animation = 'none';
  void box.offsetWidth;
  box.style.animation = '';
}

/* ═══════════════ actions ═══════════════ */
async function save() {
  if (!isDirty()) return;
  const btn = $('czSave');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> ${esc(t('cz.saving'))}`;
  setSaveState('busy', t('cz.savingState'));
  try {
    await saveAppearance({ settings: state.settings, theme: state.theme, content: state.content });
    savedSnapshot = snapshot();
    paintDirty();
    toast(t('cz.savedToast'));
  } catch (err) {
    setSaveState('error');
    toast(err.message, 'error');
  } finally {
    btn.innerHTML = `<svg class="icon"><use href="#i-check"/></svg> ${esc(t('cz.save'))}`;
    paintDirty();
  }
}

async function reset() {
  const ok = await confirmDialog({
    title: t('cz.discardTitle'),
    text: t('cz.discardText'),
    yes: t('cz.discardYes'),
  });
  if (!ok) return;
  await boot();
  toast(t('cz.reverted'));
}

async function boot() {
  state = await getAppearance();
  savedSnapshot = snapshot();
  openTab(activeTab);
  frameReady = true;
  pushPreview();
  paintDirty();
}

/* ═══════════════ page render ═══════════════ */
export async function renderCustomizer(view) {
  view.innerHTML = `
    <div class="cz">
      <aside class="cz__panel">
        <div class="cz__tabs" id="czTabs" role="tablist" aria-label="${esc(t('cz.tabsAria'))}">
          ${TAB_DEFS.map((x) => `
            <button class="cz-tab" data-tab="${x.id}" role="tab">
              <svg class="icon"><use href="#${x.icon}"/></svg><span>${esc(t(x.labelKey))}</span>
            </button>`).join('')}
        </div>
        <div class="cz__fields" id="czFields"></div>
      </aside>

      <div class="cz__stage">
        <div class="cz__bar">
          <span class="cz__live"><i></i> ${esc(t('cz.live'))}</span>
          <span class="cz__device" role="group" aria-label="${esc(t('cz.deviceAria'))}">
            <button class="cz__devbtn is-active" data-dev="desktop" title="${esc(t('cz.desktop'))}"><svg class="icon"><use href="#i-monitor"/></svg></button>
            <button class="cz__devbtn" data-dev="mobile" title="${esc(t('cz.mobile'))}"><svg class="icon"><use href="#i-phone-dev"/></svg></button>
          </span>
          <span class="cz__spacer"></span>
          <span class="cz__dirty" id="czDirty" hidden>${esc(t('cz.dirty'))}</span>
          <button class="btn btn--ghost btn--sm" id="czReload" title="${esc(t('cz.reload'))}">
            <svg class="icon"><use href="#i-refresh"/></svg>
          </button>
          <a class="btn btn--ghost btn--sm" href="../customer/index.html" target="_blank" rel="noopener">
            <svg class="icon"><use href="#i-ext"/></svg> ${esc(t('cz.openSite'))}
          </a>
          <button class="btn btn--ghost btn--sm" id="czReset" disabled>${esc(t('cz.reset'))}</button>
          <button class="btn btn--primary btn--sm" id="czSave" disabled>
            <svg class="icon"><use href="#i-check"/></svg> ${esc(t('cz.save'))}
          </button>
        </div>
        <div class="cz__frame-wrap" data-dev="desktop" id="czFrameWrap">
          <iframe id="czFrame" src="../customer/index.html?preview=1" title="${esc(t('cz.frameTitle'))}"></iframe>
        </div>
        <p class="cz__hint">
          ${esc(t('cz.hint1'))}
          <b>${esc(t('cz.save'))}</b>. ${esc(t('cz.hint2'))}
        </p>
      </div>
    </div>`;

  $('czTabs').addEventListener('click', (e) => {
    const b = e.target.closest('.cz-tab');
    if (b) openTab(b.dataset.tab);
  });
  $('czSave').addEventListener('click', save);
  $('czReset').addEventListener('click', reset);
  $('czReload').addEventListener('click', () => {
    frameReady = false;
    $('czFrame').src = $('czFrame').src; // reload → customer asks for state again
  });
  document.querySelector('.cz__device').addEventListener('click', (e) => {
    const b = e.target.closest('.cz__devbtn');
    if (!b) return;
    document.querySelectorAll('.cz__devbtn').forEach((x) => x.classList.toggle('is-active', x === b));
    $('czFrameWrap').dataset.dev = b.dataset.dev;
  });

  try {
    await boot();
  } catch (err) {
    $('czFields').innerHTML = `<div class="err-box"><svg class="icon"><use href="#i-warn"/></svg><p>${esc(err.message)}</p></div>`;
  }
}
