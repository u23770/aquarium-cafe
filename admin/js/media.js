// ============================================================
//  Aquarium Cafe & Resturant — Admin · Media Library (v5)
//  Upload · replace · delete · reuse · organise by folder.
//  The same grid doubles as an "image picker" modal used by
//  the customizer, content editor and product form — so an
//  uploaded image can be reused anywhere without re-uploading.
// ============================================================
import { listMedia, uploadMedia, replaceMedia, deleteMedia } from './api.js';
import { $, esc, toast, openLayer, closeLayer, confirmDialog } from './ui.js';
import { t } from '../shared/i18n.js';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
const fmtKB = (b) => (b >= 1024 * 1024 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

let items = [];
let folder = 'all';
let query = '';

/* ---------- derived data ---------- */
const folders = () => [...new Set(items.map((m) => m.folder))].sort();

function filtered() {
  const q = query.trim().toLowerCase();
  return items.filter(
    (m) =>
      (folder === 'all' || m.folder === folder) &&
      (!q || m.name.toLowerCase().includes(q) || m.folder.toLowerCase().includes(q))
  );
}

/* ---------- shared card markup ---------- */
function cardHTML(m, { picker = false } = {}) {
  return `
  <figure class="ml-card" data-id="${m.id}" ${picker ? 'data-pick="1" role="button" tabindex="0"' : ''}>
    <span class="ml-card__img"><img src="${esc(m.public_url)}" alt="${esc(m.name)}" loading="lazy"></span>
    <figcaption>
      <b title="${esc(m.name)}">${esc(m.name)}</b>
      <small><i class="ml-folder">${esc(m.folder)}</i> · ${fmtKB(m.size_bytes)}</small>
    </figcaption>
    <span class="ml-card__acts">
      <button class="icon-btn" data-act="copy" title="${esc(t('md.copy'))}" aria-label="${esc(t('md.copy'))}"><svg class="icon"><use href="#i-link"/></svg></button>
      ${picker
        ? ''
        : `<button class="icon-btn" data-act="replace" title="${esc(t('md.replace'))}" aria-label="${esc(t('md.replace'))}"><svg class="icon"><use href="#i-upload"/></svg></button>
           <button class="icon-btn danger" data-act="del" title="${esc(t('md.delete'))}" aria-label="${esc(t('md.delete'))}"><svg class="icon"><use href="#i-trash"/></svg></button>`}
    </span>
    ${picker ? `<span class="ml-card__pick"><svg class="icon"><use href="#i-check"/></svg> ${esc(t('md.use'))}</span>` : ''}
  </figure>`;
}

function folderOptions(selVal) {
  return ['all', ...folders()]
    .map((f) => `<option value="${esc(f)}" ${f === selVal ? 'selected' : ''}>${f === 'all' ? esc(t('md.allFolders')) : esc(f)}</option>`)
    .join('');
}

/* ---------- actions ---------- */
async function doUpload(files, targetFolder, after) {
  for (const f of files) {
    try {
      const row = await uploadMedia(f, targetFolder);
      items.unshift(row);
      toast(t('md.uploaded', { name: row.name, folder: row.folder }));
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  after?.();
}

async function doCopy(m) {
  try {
    await navigator.clipboard.writeText(m.public_url);
    toast(t('md.copied'));
  } catch {
    toast(m.public_url, 'ok');
  }
}

async function doReplace(m, file, after) {
  try {
    const row = await replaceMedia(m, file);
    const i = items.findIndex((x) => x.id === m.id);
    if (i > -1) items[i] = row;
    toast(t('md.replaced', { name: m.name }));
    after?.();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function doDelete(m, after) {
  const ok = await confirmDialog({
    title: t('md.delTitle', { name: m.name }),
    text: t('md.delText'),
  });
  if (!ok) return;
  try {
    await deleteMedia(m);
    items = items.filter((x) => x.id !== m.id);
    toast(t('md.deleted', { name: m.name }));
    after?.();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function wireGrid(grid, { after, picker = false, onPick = null }) {
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.ml-card');
    if (!card) return;
    const m = items.find((x) => x.id === Number(card.dataset.id));
    if (!m) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'copy') return doCopy(m);
    if (act === 'replace') return pickFile((f) => doReplace(m, f, after));
    if (act === 'del') return doDelete(m, after);
    if (picker) onPick?.(m);
  });
  if (picker) {
    grid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.ml-card');
      if (!card) return;
      e.preventDefault();
      const m = items.find((x) => x.id === Number(card.dataset.id));
      if (m) onPick?.(m);
    });
  }
}

function pickFile(cb) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = ACCEPT;
  inp.onchange = () => { if (inp.files?.[0]) cb(inp.files[0]); };
  inp.click();
}

/* ═══════════════ Media Library page ═══════════════ */
export async function renderMedia(view) {
  view.innerHTML = `
    <div class="toolbar">
      <select class="select" id="mlFolder">${folderOptions('all')}</select>
      <label class="searchbox searchbox--sm">
        <svg class="icon"><use href="#i-search"/></svg>
        <input id="mlQ" type="search" placeholder="${esc(t('md.searchPh'))}" autocomplete="off">
      </label>
      <span class="count-note" id="mlCount"></span>
      <input class="select" id="mlNewFolder" placeholder="${esc(t('md.folderPh'))}" value="general" aria-label="${esc(t('md.folderAria'))}" style="max-width:130px">
      <button class="btn btn--primary" id="mlUpload">
        <svg class="icon"><use href="#i-upload"/></svg> ${esc(t('md.upload'))}
      </button>
    </div>
    <div id="mlGrid"><div class="skel-rows">${'<div class="skel-row"></div>'.repeat(3)}</div></div>`;

  const paint = () => {
    const sel = $('mlFolder');
    sel.innerHTML = folderOptions(folder === 'all' || folders().includes(folder) ? folder : 'all');
    const list = filtered();
    $('mlCount').textContent = list.length === 1 ? t('md.count1') : t('md.count', { n: list.length });
    $('mlGrid').innerHTML = list.length
      ? `<div class="ml-grid">${list.map((m) => cardHTML(m)).join('')}</div>`
      : `<div class="err-box">
           <svg class="icon"><use href="#i-img"/></svg>
           <p>${esc(query || folder !== 'all' ? t('md.emptyMatch') : t('md.emptyLibrary'))}</p>
         </div>`;
  };

  $('mlFolder').addEventListener('change', (e) => { folder = e.target.value; paint(); });
  $('mlQ').addEventListener('input', (e) => { query = e.target.value; paint(); });
  $('mlUpload').addEventListener('click', () =>
    pickUploads(($('mlNewFolder').value || 'general').trim(), paint)
  );
  wireGrid($('mlGrid'), { after: paint });

  try {
    items = await listMedia();
    query = '';
    folder = 'all';
    paint();
  } catch (err) {
    $('mlGrid').innerHTML = `<div class="err-box"><svg class="icon"><use href="#i-warn"/></svg><p>${esc(err.message)}</p></div>`;
  }
}

function pickUploads(targetFolder, after) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = ACCEPT;
  inp.multiple = true;
  inp.onchange = () => { if (inp.files?.length) doUpload([...inp.files], targetFolder, after); };
  inp.click();
}

/* ═══════════════ image picker modal ═══════════════ */
let pickerReady = false;
let pickResolve = null;
let pickFolder = 'all';
let pickQuery = '';

export function initMediaPicker() {
  if (pickerReady) return;
  pickerReady = true;

  $('mpFolder').addEventListener('change', (e) => { pickFolder = e.target.value; paintPicker(); });
  $('mpQ').addEventListener('input', (e) => { pickQuery = e.target.value; paintPicker(); });
  $('mpUpload').addEventListener('click', () =>
    pickUploads(pickFolder === 'all' ? 'general' : pickFolder, async () => {
      const grid = $('mpGrid');
      try { items = await listMedia(); } catch { /* keep current */ }
      paintPicker(grid);
    })
  );
  wireGrid($('mpGrid'), {
    picker: true,
    after: async () => { try { items = await listMedia(); } catch {} paintPicker(); },
    onPick: (m) => {
      const cb = pickResolve;
      pickResolve = null;
      closeLayer($('mediaPicker'));
      cb?.(m.public_url);
    },
  });
}

function paintPicker() {
  const sel = $('mpFolder');
  sel.innerHTML = folderOptions(pickFolder);
  const list = (() => {
    const q = pickQuery.trim().toLowerCase();
    return items.filter(
      (m) =>
        (pickFolder === 'all' || m.folder === pickFolder) &&
        (!q || m.name.toLowerCase().includes(q))
    );
  })();
  $('mpGrid').innerHTML = list.length
    ? `<div class="ml-grid ml-grid--picker">${list.map((m) => cardHTML(m, { picker: true })).join('')}</div>`
    : `<div class="err-box"><svg class="icon"><use href="#i-img"/></svg><p>${esc(t('md.emptyPicker'))}</p></div>`;
}

/** Open the picker; resolves with the chosen public URL (or null). */
export async function openMediaPicker(onPick) {
  initMediaPicker();
  pickResolve = onPick;
  pickFolder = 'all';
  pickQuery = '';
  $('mpQ').value = '';
  try {
    items = await listMedia();
  } catch (err) {
    toast(err.message, 'error');
  }
  paintPicker();
  openLayer($('mediaPicker'));
}
