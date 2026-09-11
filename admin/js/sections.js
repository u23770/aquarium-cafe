// ============================================================
//  Aquarium Cafe & Resturant — Admin · Section Manager (v5)
//  Reorder the customer page by drag & drop, show/hide any
//  section, and switch whole features (ordering, delivery)
//  on or off — never touching code.
// ============================================================
import { getSections, saveSections, getAppearance, saveSettings } from './api.js';
import { $, esc, toast, setSaveState } from './ui.js';
import { t } from '../shared/i18n.js';

let sections = [];
let features = { ordering: true, delivery: true };
let busy = false;

export async function renderSections(view) {
  view.innerHTML = `
    <div class="panel sm-hint">
      <h2><svg class="icon"><use href="#i-layers"/></svg> ${esc(t('sc.hd'))}</h2>
      <p class="dim">${esc(t('sc.intro'))}</p>
    </div>
    <div id="smList"><div class="skel-rows">${'<div class="skel-row"></div>'.repeat(3)}</div></div>
    <div class="panel" id="smFeatures"></div>`;

  try {
    const [secs, app] = await Promise.all([getSections(), getAppearance()]);
    sections = secs;
    features = { ordering: app.settings.features?.ordering !== false, delivery: app.settings.features?.delivery !== false };
    paintList();
    paintFeatures();
  } catch (err) {
    $('smList').innerHTML = `<div class="err-box"><svg class="icon"><use href="#i-warn"/></svg><p>${esc(err.message)}</p></div>`;
  }
}

/* ---------- section rows ---------- */
function paintList() {
  const icons = { hero: 'i-hero', highlights: 'i-spark', menu: 'i-cup', about: 'i-leaf', contact: 'i-pin', footer: 'i-layout' };
  $('smList').innerHTML = `
    <div class="sm-list" id="smDnd">
      ${sections
        .map(
          (s, i) => `
        <div class="sm-row ${s.visible ? '' : 'is-off'}" draggable="true" data-i="${i}" data-id="${esc(s.id)}">
          <span class="sm-row__grip" title="${esc(t('sc.drag'))}"><svg class="icon"><use href="#i-grip"/></svg></span>
          <span class="sm-row__icon"><svg class="icon"><use href="#${icons[s.id] || 'i-layout'}"/></svg></span>
          <div class="sm-row__text">
            <b>${esc(s.label)}</b>
            <small>#${esc(s.id)}</small>
          </div>
          <span class="sm-pill ${s.visible ? 'on' : 'off'}">${esc(s.visible ? t('sc.visible') : t('sc.hidden'))}</span>
          <span class="switch"><input type="checkbox" data-vis="${i}" ${s.visible ? 'checked' : ''} aria-label="${esc(t('sc.showAria', { label: s.label }))}"><i></i></span>
        </div>`
        )
        .join('')}
    </div>`;

  /* visibility switches */
  $('smDnd').addEventListener('change', async (e) => {
    const tg = e.target.closest('[data-vis]');
    if (!tg) return;
    const s = sections[Number(tg.dataset.vis)];
    s.visible = tg.checked;
    updateRow(tg.closest('.sm-row'), s);
    await persist(s.visible ? t('sc.nowVisible', { label: s.label }) : t('sc.nowHidden', { label: s.label }));
  });

  wireDnd($('smDnd'));
}

function updateRow(row, s) {
  row.classList.toggle('is-off', !s.visible);
  const pill = row.querySelector('.sm-pill');
  pill.className = `sm-pill ${s.visible ? 'on' : 'off'}`;
  pill.textContent = s.visible ? t('sc.visible') : t('sc.hidden');
}

/* ---------- drag & drop reorder ---------- */
function wireDnd(listEl) {
  let dragEl = null;

  listEl.addEventListener('dragstart', (e) => {
    dragEl = e.target.closest('.sm-row');
    if (!dragEl) return;
    dragEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragEl.dataset.id);
  });

  listEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const over = e.target.closest('.sm-row');
    if (!over || over === dragEl) return;
    const rect = over.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    listEl.insertBefore(dragEl, after ? over.nextSibling : over);
  });

  listEl.addEventListener('drop', (e) => e.preventDefault());

  listEl.addEventListener('dragend', async () => {
    dragEl?.classList.remove('dragging');
    dragEl = null;
    const order = [...listEl.querySelectorAll('.sm-row')].map((r) => r.dataset.id);
    sections.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    sections.forEach((s, i) => (s.position = (i + 1) * 10));
    await persist(t('sc.orderSaved'));
  });
}

/* ---------- feature switches ---------- */
function paintFeatures() {
  $('smFeatures').innerHTML = `
    <div class="panel__head"><h2>${esc(t('sc.feats'))}</h2><small>${esc(t('sc.featsSub'))}</small></div>
    <div class="sm-feats">
      <label class="ctl ctl--toggle">
        <span class="switch"><input type="checkbox" data-feat="ordering" ${features.ordering ? 'checked' : ''}><i></i></span>
        <span class="ctl__toggle-text">${esc(t('sc.ordering'))}
          <small>${esc(t('sc.orderingHint'))}</small></span>
      </label>
      <label class="ctl ctl--toggle">
        <span class="switch"><input type="checkbox" data-feat="delivery" ${features.delivery ? 'checked' : ''}><i></i></span>
        <span class="ctl__toggle-text">${esc(t('sc.delivery'))}
          <small>${esc(t('sc.deliveryHint'))}</small></span>
      </label>
    </div>`;

  $('smFeatures').addEventListener('change', async (e) => {
    const tg = e.target.closest('[data-feat]');
    if (!tg) return;
    features[tg.dataset.feat] = tg.checked;
    setSaveState('busy');
    try {
      const app = await getAppearance();
      app.settings.features = features;
      await saveSettings(app.settings);
      setSaveState('ok');
      const name = tg.dataset.feat === 'ordering' ? t('sc.orderingName') : t('sc.deliveryName');
      toast(t(tg.checked ? 'sc.on' : 'sc.off', { name }));
    } catch (err) {
      setSaveState('error');
      tg.checked = !tg.checked;
      features[tg.dataset.feat] = tg.checked;
      toast(err.message, 'error');
    }
  });
}

/* ---------- persist helper ---------- */
async function persist(msg) {
  if (busy) return;
  busy = true;
  setSaveState('busy');
  try {
    await saveSections(sections);
    setSaveState('ok');
    toast(msg);
  } catch (err) {
    setSaveState('error');
    toast(err.message, 'error');
  } finally {
    busy = false;
  }
}
