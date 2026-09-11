// ============================================================
//  Aquarium Cafe & Resturant — Admin · Gallery Manager
//  The photo wall on the customer website. Pick images from
//  the Media Library (or upload), caption, reorder, hide and
//  delete. Changes reach open customer tabs instantly.
// ============================================================
import {
  getGallery, createGalleryItem, updateGalleryItem, deleteGalleryItem, saveGalleryOrder,
} from './api.js';
import { esc, toast, confirmDialog } from './ui.js';
import { t } from '../shared/i18n.js';
import { resolveImage } from '../shared/media.js';
import * as C from './controls.js';

let items = [];

async function reorder(id, dir) {
  const i = items.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  paint();
  try {
    await saveGalleryOrder(items.map((x) => x.id));
  } catch (err) {
    toast(err.message, 'error');
    items = await getGallery();
    paint();
  }
}

function paint() {
  const grid = document.getElementById('galGrid');
  if (!grid) return;
  document.getElementById('galCount').textContent =
    t(items.length === 1 ? 'gl.counts1' : 'gl.counts', { n: items.length, v: items.filter((x) => x.visible).length });

  grid.innerHTML = items.length
    ? items.map((g, i) => `
      <figure class="gal-card ${g.visible ? '' : 'is-hidden'}" style="--d:${Math.min(i, 10) * 40}ms" data-id="${g.id}">
        <div class="gal-card__img"><img src="${esc(resolveImage(g.image))}" alt="${esc(g.title || t('gl.alt'))}" loading="lazy" /></div>
        <input class="gal-card__title" type="text" maxlength="120" value="${esc(g.title)}"
               placeholder="${esc(t('gl.captionPh'))}" data-title="${g.id}" aria-label="${esc(t('gl.caption'))}" />
        <figcaption class="gal-card__foot">
          <label class="switch" title="${esc(t('gl.show'))}">
            <input type="checkbox" data-vis="${g.id}" ${g.visible ? 'checked' : ''} /><i></i>
          </label>
          <span class="gal-card__acts">
            <button class="icon-btn" data-up="${g.id}" aria-label="${esc(t('gl.moveEarlier'))}"><svg class="icon"><use href="#i-chev-up"/></svg></button>
            <button class="icon-btn" data-down="${g.id}" aria-label="${esc(t('gl.moveLater'))}"><svg class="icon"><use href="#i-chev-dn"/></svg></button>
            <button class="icon-btn danger" data-del="${g.id}" aria-label="${esc(t('gl.delAria'))}"><svg class="icon"><use href="#i-trash"/></svg></button>
          </span>
        </figcaption>
      </figure>`).join('')
    : `<p class="empty-mini" style="grid-column:1/-1">${esc(t('gl.empty'))}</p>`;
}

/* ---------- main ---------- */
export async function renderGallery(view) {
  view.innerHTML = `<div class="skel-rows">${'<div class="skel-row"></div>'.repeat(3)}</div>`;
  items = await getGallery();

  const shell = document.createElement('div');

  /* add panel */
  const panel = document.createElement('div');
  panel.className = 'panel gal-add';
  let pickedImage = '';
  const imgCtl = C.imageControl({
    label: t('gl.photo'),
    folder: 'gallery',
    value: '',
    onChange: (v) => { pickedImage = v; },
  });
  const titleCtl = C.textControl({
    label: t('gl.captionPh'),
    value: '',
    placeholder: t('gl.titlePh'),
    onChange: (v) => { titleCtl._v = v; },
  });
  panel.innerHTML = `<div class="panel__head"><h2>${esc(t('gl.addHd'))}</h2><small>${esc(t('gl.addSub'))}</small></div>`;
  const row = document.createElement('div');
  row.className = 'gal-add__row';
  row.appendChild(imgCtl);
  row.appendChild(titleCtl);
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--primary';
  addBtn.innerHTML = `<svg class="icon"><use href="#i-plus"/></svg> ${esc(t('gl.add'))}`;
  addBtn.addEventListener('click', async () => {
    if (!pickedImage) { toast(t('gl.chooseFirst'), 'error'); return; }
    addBtn.disabled = true;
    try {
      const created = await createGalleryItem({ image: pickedImage, title: titleCtl._v ?? '' });
      items.push(created);
      items.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      paint();
      toast(t('gl.added'));
      pickedImage = '';
      renderGalleryKeep(view);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      addBtn.disabled = false;
    }
  });
  const btnWrap = document.createElement('div');
  btnWrap.className = 'gal-add__btn';
  btnWrap.appendChild(addBtn);
  row.appendChild(btnWrap);
  panel.appendChild(row);

  shell.appendChild(panel);

  /* list */
  const listPanel = document.createElement('div');
  listPanel.innerHTML = `
    <div class="toolbar">
      <span class="count-note" id="galCount">—</span>
      <span class="toolbar__spacer"></span>
    </div>
    <div class="gal-grid" id="galGrid"></div>
    <p class="toolbar-note" style="margin-top:.9rem">
      <svg class="icon"><use href="#i-img"/></svg>
      <span>${esc(t('gl.note'))}</span>
    </p>`;
  shell.appendChild(listPanel);

  view.innerHTML = '';
  view.appendChild(shell);
  paint();

  /* events (delegated) */
  view.addEventListener('click', async (e) => {
    const up = e.target.closest('[data-up]');
    const down = e.target.closest('[data-down]');
    const del = e.target.closest('[data-del]');
    if (up) reorder(Number(up.dataset.up), -1);
    if (down) reorder(Number(down.dataset.down), +1);
    if (del) {
      const g = items.find((x) => x.id === Number(del.dataset.del));
      const ok = await confirmDialog({
        title: t('gl.delTitle'),
        text: g?.title ? t('gl.delTextT', { title: g.title }) : t('gl.delText'),
        yes: t('gl.delYes'),
      });
      if (!ok) return;
      try {
        await deleteGalleryItem(g.id);
        items = items.filter((x) => x.id !== g.id);
        paint();
        toast(t('gl.removed'));
      } catch (err) { toast(err.message, 'error'); }
    }
  });

  let titleTimer;
  view.addEventListener('input', (e) => {
    const inp = e.target.closest('[data-title]');
    if (!inp) return;
    clearTimeout(titleTimer);
    const id = Number(inp.dataset.title);
    titleTimer = setTimeout(async () => {
      try {
        await updateGalleryItem(id, { title: inp.value });
        const g = items.find((x) => x.id === id);
        if (g) g.title = inp.value;
        toast(t('gl.captionSaved'));
      } catch (err) { toast(err.message, 'error'); }
    }, 800);
  });

  view.addEventListener('change', async (e) => {
    const tgl = e.target.closest('[data-vis]');
    if (!tgl) return;
    const id = Number(tgl.dataset.vis);
    try {
      await updateGalleryItem(id, { visible: tgl.checked });
      const g = items.find((x) => x.id === id);
      if (g) g.visible = tgl.checked;
      tgl.closest('.gal-card')?.classList.toggle('is-hidden', !tgl.checked);
      toast(tgl.checked ? t('gl.visibleOn') : t('gl.visibleOff'));
    } catch (err) {
      tgl.checked = !tgl.checked;
      toast(err.message, 'error');
    }
  });
}

/* re-render helper after adding (keeps grid fresh) */
function renderGalleryKeep(view) {
  // keep event listeners intact — just repaint the grid
  paint();
}
