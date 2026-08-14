// ============================================================
//  Aquarium Cafe & Resturant — Admin · reusable form controls
//  One tiny widget library powers the whole Visual Builder:
//  colors, ranges, selects, toggles, text, fonts, images,
//  and repeatable list editors. Value binding is dot-path
//  based: ctl reads/writes state and emits a single change.
// ============================================================
import { esc } from './ui.js';
import { t } from '../shared/i18n.js';
import { resolveImage } from '../shared/media.js';
import { FONT_STACKS, ensureFontLoaded } from '../shared/appearance.js';
import { uploadMedia } from './api.js';
import { openMediaPicker } from './media.js';
import { toast } from './ui.js';

/* ---------- dot-path helpers ---------- */
export const getPath = (obj, path) =>
  path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
}

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

/* ═══════════════ color ═══════════════ */
export function colorControl({ label, value, onChange }) {
  const el = h(`
    <div class="ctl ctl--color">
      <label class="ctl__label">${esc(label)}</label>
      <div class="ctl__row">
        <span class="ctl__swatch"><input type="color" value="${esc(value)}" aria-label="${esc(label)} picker"></span>
        <input class="ctl__hex" type="text" maxlength="7" value="${esc(value)}" spellcheck="false" aria-label="${esc(label)} hex">
      </div>
    </div>`);
  const sw = el.querySelector('input[type="color"]');
  const hex = el.querySelector('.ctl__hex');
  const sync = (v, fire = true) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
    sw.value = v;
    hex.value = v;
    if (fire) onChange(v);
  };
  sw.addEventListener('input', () => sync(sw.value));
  hex.addEventListener('change', () => {
    let v = hex.value.trim();
    if (v && !v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) sync(v);
    else { hex.value = sw.value; toast(t('g.hexWarn'), 'error'); }
  });
  return el;
}

/* ═══════════════ range ═══════════════ */
export function rangeControl({ label, value, min, max, step = 1, unit = '', onChange }) {
  const el = h(`
    <div class="ctl">
      <label class="ctl__label">${esc(label)} <b class="ctl__val">${esc(String(value))}${esc(unit)}</b></label>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${esc(String(value))}" aria-label="${esc(label)}">
    </div>`);
  const range = el.querySelector('input[type="range"]');
  const out = el.querySelector('.ctl__val');
  const paint = () => {
    const p = ((range.value - min) / (max - min)) * 100;
    range.style.background =
      `linear-gradient(90deg, var(--coffee) ${p}%, var(--beige) ${p}%)`;
  };
  range.addEventListener('input', () => {
    out.textContent = range.value + unit;
    paint();
    onChange(Number(range.value));
  });
  paint();
  return el;
}

/* ═══════════════ select ═══════════════ */
export function selectControl({ label, value, options, onChange }) {
  const opts = options
    .map((o) => {
      const opt = typeof o === 'object' ? o : { value: o, label: o };
      return `<option value="${esc(String(opt.value))}" ${String(opt.value) === String(value) ? 'selected' : ''}>${esc(opt.label)}</option>`;
    })
    .join('');
  const el = h(`
    <div class="ctl">
      <label class="ctl__label">${esc(label)}</label>
      <select class="ctl__select">${opts}</select>
    </div>`);
  el.querySelector('select').addEventListener('change', (e) => onChange(e.target.value));
  return el;
}

/* ═══════════════ toggled switch ═══════════════ */
export function toggleControl({ label, value, hint = '', onChange }) {
  const el = h(`
    <label class="ctl ctl--toggle">
      <span class="switch"><input type="checkbox" ${value ? 'checked' : ''}><i></i></span>
      <span class="ctl__toggle-text">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span>
    </label>`);
  el.querySelector('input').addEventListener('change', (e) => onChange(e.target.checked));
  return el;
}

/* ═══════════════ text / textarea ═══════════════ */
export function textControl({ label, value, placeholder = '', area = false, rows = 3, hint = '', onChange }) {
  const field = area
    ? `<textarea rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
    : `<input type="text" value="${esc(value)}" placeholder="${esc(placeholder)}">`;
  const el = h(`
    <div class="ctl">
      <label class="ctl__label">${esc(label)}${hint ? `<small class="ctl__hint">${esc(hint)}</small>` : ''}</label>
      ${field}
    </div>`);
  const input = el.querySelector('input, textarea');
  input.addEventListener('input', () => onChange(input.value));
  return el;
}

/* ═══════════════ font picker (live preview) ═══════════════ */
export function fontControl({ label, value, onChange }) {
  const el = h(`
    <div class="ctl ctl--font">
      <label class="ctl__label">${esc(label)}</label>
      <select class="ctl__select"></select>
      <p class="ctl__font-preview">${esc(t('g.fontPreview'))}</p>
    </div>`);
  const sel = el.querySelector('select');
  const prev = el.querySelector('.ctl__font-preview');
  const apply = (fam) => {
    ensureFontLoaded(fam);
    prev.style.fontFamily = FONT_STACKS[fam] || fam;
  };
  sel.innerHTML = Object.keys(FONT_STACKS)
    .map((f) => `<option value="${esc(f)}" ${f === value ? 'selected' : ''}>${esc(f)}</option>`)
    .join('');
  sel.addEventListener('change', () => { apply(sel.value); onChange(sel.value); });
  apply(value);
  return el;
}

/* ═══════════════ image (library / upload / clear) ═══════════════ */
export function imageControl({ label, value, folder = 'site', hint = '', onChange }) {
  const el = h(`
    <div class="ctl ctl--image">
      <label class="ctl__label">${esc(label)}${hint ? `<small class="ctl__hint">${esc(hint)}</small>` : ''}</label>
      <div class="ctl__img-row">
        <span class="ctl__img-preview"></span>
        <div class="ctl__img-actions">
          <button type="button" class="btn btn--ghost btn--sm" data-act="library">
            <svg class="icon"><use href="#i-img"/></svg> ${esc(t('g.library'))}
          </button>
          <button type="button" class="btn btn--ghost btn--sm" data-act="upload">
            <svg class="icon"><use href="#i-upload"/></svg> ${esc(t('g.upload'))}
          </button>
          <button type="button" class="btn btn--ghost btn--sm ctl__img-clear" data-act="clear">${esc(t('g.clear'))}</button>
        </div>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden>
      </div>
      <small class="ctl__img-path"></small>
    </div>`);

  const preview = el.querySelector('.ctl__img-preview');
  const pathEl = el.querySelector('.ctl__img-path');
  const file = el.querySelector('input[type="file"]');
  const clearBtn = el.querySelector('[data-act="clear"]');
  let current = value || '';

  const paint = () => {
    preview.innerHTML = current
      ? `<img src="${esc(resolveImage(current))}" alt="">`
      : `<svg class="icon"><use href="#i-img"/></svg>`;
    preview.classList.toggle('is-empty', !current);
    pathEl.textContent = current || t('g.noImage');
    clearBtn.hidden = !current;
  };

  el.querySelector('[data-act="library"]').addEventListener('click', () => {
    openMediaPicker((url) => { current = url; paint(); onChange(current); });
  });
  el.querySelector('[data-act="upload"]').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try {
      const row = await uploadMedia(f, folder);
      current = row.public_url;
      paint();
      onChange(current);
      toast(t('g.uploadedLib'));
    } catch (err) { toast(err.message, 'error'); }
  });
  clearBtn.addEventListener('click', () => { current = ''; paint(); onChange(''); });

  paint();
  return el;
}

/* ═══════════════ list editor (repeatable rows) ═══════════════
   fields: [{ key, label, ph, flex }] — or omit for a plain string list. */
export function listEditor({ items, fields = null, addLabel = null, singular = 'item', onChange }) {
  const addText = addLabel ?? t('g.addItem');
  let list = Array.isArray(items) ? items.map((x) => (fields ? { ...x } : x)) : [];

  const wrap = h(`<div class="ctl ctl--list"><div class="le__rows"></div>
    <button type="button" class="btn btn--ghost btn--sm le__add">
      <svg class="icon"><use href="#i-plus"/></svg> ${esc(addText)}
    </button></div>`);
  const rows = wrap.querySelector('.le__rows');

  const valueOf = (item, key) => (fields ? item[key] ?? '' : item ?? '');

  function emit() { onChange(list.map((x) => (fields ? { ...x } : x))); }

  function rowHTML(item, i) {
    const inputs = (fields || [{ key: '_v', label: singular }])
      .map(
        (f) => `
      <input type="text" data-i="${i}" data-k="${esc(f.key)}"
             value="${esc(String(valueOf(item, f.key)))}"
             placeholder="${esc(f.ph || f.label || '')}"
             style="flex:${f.flex || 1}" aria-label="${esc(f.label || singular)}">`
      )
      .join('');
    return `
    <div class="le__row" data-row="${i}">
      ${inputs}
      <span class="le__acts">
        <button type="button" class="icon-btn" data-up="${i}" aria-label="${esc(t('g.moveUp'))}"><svg class="icon"><use href="#i-chev-up"/></svg></button>
        <button type="button" class="icon-btn" data-down="${i}" aria-label="${esc(t('g.moveDown'))}"><svg class="icon"><use href="#i-chev-dn"/></svg></button>
        <button type="button" class="icon-btn danger" data-del="${i}" aria-label="${esc(t('g.remove'))} ${esc(singular)}"><svg class="icon"><use href="#i-trash"/></svg></button>
      </span>
    </div>`;
  }

  function render() {
    rows.innerHTML = list.length
      ? list.map(rowHTML).join('')
      : `<p class="le__empty">${esc(t('g.noItems', { what: singular }))}</p>`;
  }

  function readBack() {
    rows.querySelectorAll('input').forEach((inp) => {
      const i = Number(inp.dataset.i);
      const v = inp.value;
      if (fields) list[i][inp.dataset.k] = v;
      else list[i] = v;
    });
  }

  rows.addEventListener('input', () => { readBack(); emit(); });
  rows.addEventListener('click', (e) => {
    const up = e.target.closest('[data-up]');
    const dn = e.target.closest('[data-down]');
    const del = e.target.closest('[data-del]');
    if (!up && !dn && !del) return;
    readBack();
    const i = Number((up || dn || del).dataset.up ?? (up || dn || del).dataset.down ?? (up || dn || del).dataset.del);
    if (up && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    if (dn && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
    if (del) list.splice(i, 1);
    render();
    emit();
  });
  wrap.querySelector('.le__add').addEventListener('click', () => {
    readBack();
    list.push(fields ? Object.fromEntries(fields.map((f) => [f.key, ''])) : '');
    render();
    emit();
    rows.querySelector(`.le__row[data-row="${list.length - 1}"] input`)?.focus();
  });

  render();
  return wrap;
}

/* ═══════════════ grouped section wrapper ═══════════════ */
export function group(title, icon, nodes) {
  const el = h(`
    <section class="cz-group">
      <h3 class="cz-group__title">${icon ? `<svg class="icon"><use href="#${icon}"/></svg>` : ''} ${esc(title)}</h3>
      <div class="cz-group__fields"></div>
    </section>`);
  const box = el.querySelector('.cz-group__fields');
  for (const n of nodes) box.appendChild(n);
  return el;
}
