// ============================================================
//  Aquarium Cafe & Resturant — Admin · Homepage Banners
//  Promo strips on the customer website (title, subtitle,
//  image, call-to-action). The first VISIBLE banner (in the
//  order set here) is what the homepage shows.
// ============================================================
import {
  getBanners, createBanner, updateBanner, deleteBanner, saveBannerOrder,
} from './api.js';
import { esc, toast, confirmDialog } from './ui.js';
import { t } from '../../shared/i18n.js';
import { resolveImage } from '../../shared/media.js';
import * as C from './controls.js';

let items = [];
let editingId = null;

/* form state lives in these controls */
const form = {};

function buildForm(container) {
  container.innerHTML = `<div class="panel__head"><h2 id="banFormTitle">${esc(editingId ? t('bn.formEdit') : t('bn.formAdd'))}</h2><small>${esc(t('bn.formSub'))}</small></div>`;
  const grid = document.createElement('div');
  grid.className = 'ban-form';

  form.title = C.textControl({ label: t('bn.title'), value: form._v?.title ?? '', placeholder: t('bn.titlePh'), onChange: (v) => (form._v.title = v) });
  form.subtitle = C.textControl({ label: t('bn.subtitle'), value: form._v?.subtitle ?? '', placeholder: t('bn.subtitlePh'), onChange: (v) => (form._v.subtitle = v) });
  form.image = C.imageControl({ label: t('bn.image'), folder: 'banners', value: form._v?.image ?? '', onChange: (v) => (form._v.image = v) });
  form.cta_text = C.textControl({ label: t('bn.ctaText'), value: form._v?.cta_text ?? '', placeholder: t('bn.ctaTextPh'), onChange: (v) => (form._v.cta_text = v) });
  form.cta_link = C.textControl({ label: t('bn.ctaLink'), value: form._v?.cta_link ?? '', placeholder: '#menu  or  https://…', onChange: (v) => (form._v.cta_link = v) });
  form.visible = C.toggleControl({ label: t('bn.visible'), value: form._v?.visible !== false, onChange: (v) => (form._v.visible = v) });

  grid.append(form.title, form.subtitle, form.image, form.cta_text, form.cta_link, form.visible);
  container.appendChild(grid);

  const actions = document.createElement('div');
  actions.className = 'ban-form__acts';
  actions.innerHTML = `
    <button class="btn btn--primary" id="banSave"><svg class="icon"><use href="#i-check"/></svg> ${esc(editingId ? t('bn.save') : t('bn.add'))}</button>
    ${editingId ? `<button class="btn btn--ghost" id="banCancelEdit">${esc(t('bn.cancelEdit'))}</button>` : ''}`;
  container.appendChild(actions);

  actions.querySelector('#banSave').addEventListener('click', onSave);
  actions.querySelector('#banCancelEdit')?.addEventListener('click', () => {
    editingId = null;
    form._v = {};
    buildForm(container);
  });
}

async function onSave() {
  const body = {
    title: form._v.title ?? '',
    subtitle: form._v.subtitle ?? '',
    image: form._v.image ?? '',
    cta_text: form._v.cta_text ?? '',
    cta_link: form._v.cta_link ?? '',
    visible: form._v.visible !== false,
  };
  try {
    if (editingId) {
      const updated = await updateBanner(editingId, body);
      const i = items.findIndex((x) => x.id === editingId);
      if (i > -1) items[i] = updated;
      toast(t('bn.saved'));
    } else {
      const created = await createBanner(body);
      items.push(created);
      items.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      toast(t('bn.added'));
    }
    editingId = null;
    form._v = {};
    buildForm(document.getElementById('banFormPanel'));
    paint();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function reorder(id, dir) {
  const i = items.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  paint();
  try {
    await saveBannerOrder(items.map((x) => x.id));
  } catch (err) {
    toast(err.message, 'error');
    items = await getBanners();
    paint();
  }
}

function paint() {
  const list = document.getElementById('banList');
  if (!list) return;
  list.innerHTML = items.length
    ? items.map((b, i) => `
      <div class="ban-row ${b.visible ? '' : 'is-hidden'}" style="--d:${Math.min(i, 10) * 40}ms">
        <span class="ban-row__img">${b.image
          ? `<img src="${esc(resolveImage(b.image))}" alt="" loading="lazy" />`
          : `<svg class="icon"><use href="#i-img"/></svg>`}</span>
        <div class="ban-row__text">
          <b>${esc(b.title)}</b>
          <small>${esc(b.subtitle || '—')}</small>
          ${b.cta_text ? `<span class="p-badge">${esc(b.cta_text)} → ${esc(b.cta_link || '#')}</span>` : ''}
        </div>
        <label class="switch" title="${esc(t('bn.visible'))}">
          <input type="checkbox" data-vis="${b.id}" ${b.visible ? 'checked' : ''} /><i></i>
        </label>
        <span class="ban-row__acts">
          <button class="icon-btn" data-up="${b.id}" aria-label="${esc(t('bn.moveEarlier'))}"><svg class="icon"><use href="#i-chev-up"/></svg></button>
          <button class="icon-btn" data-down="${b.id}" aria-label="${esc(t('bn.moveLater'))}"><svg class="icon"><use href="#i-chev-dn"/></svg></button>
          <button class="icon-btn" data-edit="${b.id}" aria-label="${esc(t('bn.editAria'))}"><svg class="icon"><use href="#i-pen"/></svg></button>
          <button class="icon-btn danger" data-del="${b.id}" aria-label="${esc(t('bn.delAria'))}"><svg class="icon"><use href="#i-trash"/></svg></button>
        </span>
      </div>`).join('')
    : `<p class="empty-mini">${esc(t('bn.empty'))}</p>`;
}

/* ---------- main ---------- */
export async function renderBanners(view) {
  view.innerHTML = `<div class="skel-rows">${'<div class="skel-row"></div>'.repeat(3)}</div>`;
  items = await getBanners();
  editingId = null;
  form._v = {};

  const shell = document.createElement('div');
  shell.innerHTML = `
    <div class="panel" id="banFormPanel"></div>
    <div class="panel">
      <div class="panel__head"><h2>${esc(t('bn.allHd'))}</h2><small>${esc(t('bn.allSub'))}</small></div>
      <div id="banList"></div>
    </div>
    <p class="toolbar-note">
      <svg class="icon"><use href="#i-mega"/></svg>
      <span>${esc(t('bn.note'))}</span>
    </p>`;
  view.innerHTML = '';
  view.appendChild(shell);
  buildForm(document.getElementById('banFormPanel'));
  paint();

  view.addEventListener('click', async (e) => {
    const up = e.target.closest('[data-up]');
    const down = e.target.closest('[data-down]');
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');

    if (up) reorder(Number(up.dataset.up), -1);
    if (down) reorder(Number(down.dataset.down), +1);

    if (edit) {
      const b = items.find((x) => x.id === Number(edit.dataset.edit));
      if (!b) return;
      editingId = b.id;
      form._v = {
        title: b.title, subtitle: b.subtitle, image: b.image,
        cta_text: b.cta_text, cta_link: b.cta_link, visible: b.visible,
      };
      buildForm(document.getElementById('banFormPanel'));
      document.getElementById('banFormPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (del) {
      const b = items.find((x) => x.id === Number(del.dataset.del));
      const ok = await confirmDialog({
        title: t('bn.delTitle'),
        text: t('bn.delText', { title: b?.title ?? '' }),
        yes: t('bn.delYes'),
      });
      if (!ok) return;
      try {
        await deleteBanner(b.id);
        items = items.filter((x) => x.id !== b.id);
        if (editingId === b.id) { editingId = null; form._v = {}; buildForm(document.getElementById('banFormPanel')); }
        paint();
        toast(t('bn.deleted'));
      } catch (err) { toast(err.message, 'error'); }
    }
  });

  view.addEventListener('change', async (e) => {
    const tgl = e.target.closest('[data-vis]');
    if (!tgl) return;
    const id = Number(tgl.dataset.vis);
    try {
      await updateBanner(id, { visible: tgl.checked });
      const b = items.find((x) => x.id === id);
      if (b) b.visible = tgl.checked;
      paint();
      toast(tgl.checked ? t('bn.liveOn') : t('bn.liveOff'));
    } catch (err) {
      tgl.checked = !tgl.checked;
      toast(err.message, 'error');
    }
  });
}
