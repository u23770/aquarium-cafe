// ============================================================
//  Aquarium Cafe & Resturant — Admin · Website Content editor
//  About, contact, phones, WhatsApp, email, maps, working
//  hours, branches, socials, highlights strip & footer text.
//  Everything autosaves (debounced) straight to website_content
//  — open customer tabs pick changes up via Realtime.
// ============================================================
import { getAppearance, saveContent } from './api.js';
import { $, esc, toast, setSaveState } from './ui.js';
import { t } from '../../shared/i18n.js';
import * as C from './controls.js';

let state = null;
let saveTimer = null;
let saving = false;
let pending = false;

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 900);
  setSaveState('busy', t('ct.editing'));
}

async function persist() {
  if (saving) { pending = true; return; }
  saving = true;
  setSaveState('busy');
  try {
    await saveContent(state.content);
    setSaveState('ok');
  } catch (err) {
    setSaveState('error');
    toast(err.message, 'error');
  } finally {
    saving = false;
    if (pending) { pending = false; persist(); }
  }
}

const emit = (path, value) => { C.setPath(state, path, value); scheduleSave(); };

const b = (kind, path, def) =>
  C[kind]({ ...def, value: C.getPath(state, path), onChange: (v) => emit(path, v) });

export async function renderContent(view) {
  view.innerHTML = `<div class="skel-rows">${'<div class="skel-row"></div>'.repeat(3)}</div>`;
  state = await getAppearance();
  const { content } = state;

  const wrap = document.createElement('div');
  wrap.className = 'set-grid';

  /* About */
  wrap.appendChild(C.group(t('ct.about'), 'i-leaf', [
    b('textControl', 'content.about.title', { label: t('ct.title') }),
    b('textControl', 'content.about.text', { label: t('ct.story'), area: true, rows: 5 }),
    b('imageControl', 'content.about.imageUrl', { label: t('ct.aboutImg'), hint: t('ct.aboutImgHint') }),
  ]));

  /* Contact */
  wrap.appendChild(C.group(t('ct.contact'), 'i-phone', [
    b('textControl', 'content.contact.address', { label: t('ct.address') }),
    b('textControl', 'content.contact.email', { label: t('ct.email'), placeholder: 'hello@aquariumcafe.com' }),
    b('textControl', 'content.contact.whatsapp', { label: t('ct.wa'), placeholder: 'https://wa.me/201002345678' }),
    b('textControl', 'content.contact.mapsUrl', { label: t('ct.maps') }),
    label(t('ct.phones')),
    C.listEditor({
      items: content.contact.phones,
      addLabel: t('ct.addPhone'),
      singular: t('ct.phone'),
      onChange: (v) => emit('content.contact.phones', v),
    }),
  ]));

  /* Working hours */
  wrap.appendChild(C.group(t('ct.hours'), 'i-clock', [
    C.listEditor({
      items: content.hours,
      fields: [
        { key: 'days', label: t('ct.days'), ph: t('ct.daysPh') },
        { key: 'time', label: t('ct.hoursLb'), ph: t('ct.hoursPh') },
      ],
      addLabel: t('ct.addHours'),
      singular: t('ct.hoursRow'),
      onChange: (v) => emit('content.hours', v),
    }),
  ]));

  /* Branches */
  wrap.appendChild(C.group(t('ct.branches'), 'i-pin', [
    C.listEditor({
      items: content.branches,
      fields: [
        { key: 'name', label: t('ct.branch'), ph: t('ct.branchPh') },
        { key: 'address', label: t('ct.address'), ph: t('ct.branchAddrPh'), flex: 2 },
        { key: 'phone', label: t('ct.phones'), ph: t('ct.branchPhonePh') },
      ],
      addLabel: t('ct.addBranch'),
      singular: t('ct.branchOne'),
      onChange: (v) => emit('content.branches', v),
    }),
  ]));

  /* Socials → their own page (social_links table) */
  const soc = C.group(t('ct.socials'), 'i-share', []);
  const socNote = document.createElement('p');
  socNote.className = 'ctl__note';
  socNote.innerHTML = `${esc(t('ct.socialsNote'))}
    <a href="#/socials"><strong>${esc(t('ct.socialsPage'))}</strong></a>`;
  soc.querySelector('.cz-group__fields').appendChild(socNote);
  wrap.appendChild(soc);

  /* Highlights strip */
  wrap.appendChild(C.group(t('ct.highlights'), 'i-spark', [
    C.listEditor({
      items: content.highlights,
      addLabel: t('ct.addPhrase'),
      singular: t('ct.phrase'),
      onChange: (v) => emit('content.highlights', v.filter?.((x) => x !== undefined) ?? v),
    }),
    note(t('ct.highlightsHint')),
  ]));

  /* Footer */
  wrap.appendChild(C.group(t('ct.footer'), 'i-layout', [
    b('textControl', 'content.footerAbout', { label: t('ct.footerAbout'), area: true, rows: 3, hint: t('ct.footerAboutHint') }),
  ]));

  view.innerHTML = '';
  view.appendChild(wrap);

  const tip = document.createElement('div');
  tip.className = 'set-note';
  tip.innerHTML = `<svg class="icon"><use href="#i-check"/></svg>
    <span>${esc(t('ct.autosave'))}</span>`;
  view.appendChild(tip);

  function label(text) {
    const el = document.createElement('label');
    el.className = 'ctl__label ctl__label--block';
    el.textContent = text;
    return el;
  }
  function note(text) {
    const el = document.createElement('p');
    el.className = 'ctl__note';
    el.textContent = text;
    return el;
  }
}
