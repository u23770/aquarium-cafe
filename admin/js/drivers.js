// ============================================================
//  Aquarium Cafe & Resturant — Admin · Delivery Drivers (v5)
//  The driver roster used at the "Ready for delivery" step:
//  names + phones (+ optional notes), activatable /
//  deactivatable, deletable. Temporary (one-off) drivers are
//  bound to a single order from the waiter board instead —
//  they never show up here.
// ============================================================
import { getDrivers, createDriver, updateDriver, deleteDriver } from './api.js';
import { $, esc, toast, confirmDialog } from './ui.js';
import { t } from '../../shared/i18n.js';

let drivers = [];

export async function renderDrivers(view) {
  view.innerHTML = `
    <div class="panel">
      <div class="panel__head">
        <h2><svg class="icon"><use href="#i-scooter"/></svg> ${esc(t('drv.addHd'))}</h2>
        <small>${esc(t('drv.addSub'))}</small>
      </div>
      <div class="drv-adder">
        <input id="drvName" type="text" maxlength="60" placeholder="${esc(t('drv.namePh'))}" aria-label="${esc(t('drv.name'))}">
        <input id="drvPhone" type="tel" maxlength="20" dir="ltr" placeholder="${esc(t('drv.phonePh'))}" aria-label="${esc(t('drv.phone'))}">
        <input id="drvNotes" type="text" maxlength="200" placeholder="${esc(t('drv.notesPh'))}" aria-label="${esc(t('drv.notes'))}">
        <button class="btn btn--primary" id="drvAdd"><svg class="icon"><use href="#i-plus"/></svg> ${esc(t('drv.add'))}</button>
      </div>
      <p class="form-hint">${esc(t('drv.hint'))}</p>
    </div>

    <div class="panel">
      <div class="panel__head">
        <h2>${esc(t('drv.listHd'))}</h2>
        <small id="drvCount"></small>
      </div>
      <div id="drvList"><div class="skel-rows">${'<div class="skel-row"></div>'.repeat(2)}</div></div>
    </div>

    <p class="toolbar-note">
      <svg class="icon"><use href="#i-clock"/></svg>
      <span>${esc(t('drv.note'))}</span>
    </p>`;

  $('drvAdd').addEventListener('click', addDriver);
  ['drvName', 'drvPhone'].forEach((id) =>
    $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') addDriver(); }));

  view.addEventListener('click', onAction);
  view.addEventListener('change', onChange);

  try {
    drivers = await getDrivers();
    paint();
  } catch (err) {
    $('drvList').innerHTML = `<div class="err-box"><svg class="icon"><use href="#i-warn"/></svg><p>${esc(err.message)}</p></div>`;
  }
}

/* ═══════════════════ painting ═══════════════════ */
function paint() {
  const list = $('drvList');
  if (!list) return;
  const active = drivers.filter((d) => d.active).length;
  $('drvCount').textContent = t('drv.count', { a: active, n: drivers.length });

  if (!drivers.length) {
    list.innerHTML = `<p class="empty-mini">${esc(t('drv.empty'))}</p>`;
    return;
  }

  list.innerHTML = drivers.map((d, i) => `
    <div class="drv-card ${d.active ? '' : 'is-off'}" data-id="${d.id}" style="--d:${Math.min(i, 10) * 40}ms">
      <span class="drv-card__ava"><svg class="icon"><use href="#i-scooter"/></svg></span>
      <div class="drv-card__body">
        <b>${esc(d.name)}</b>
        <small>
          <a href="tel:${esc(d.phone)}" dir="ltr">${esc(d.phone)}</a>
          ${d.notes ? ` · ${esc(d.notes)}` : ''}
        </small>
      </div>
      <label class="switch" title="${esc(t('drv.active'))}">
        <input type="checkbox" data-f="active" ${d.active ? 'checked' : ''}><i></i>
      </label>
      <span class="drv-card__acts">
        <button class="icon-btn" data-act="edit" aria-label="${esc(t('act.edit'))}"><svg class="icon"><use href="#i-pen"/></svg></button>
        <button class="icon-btn danger" data-act="del" aria-label="${esc(t('act.del'))}"><svg class="icon"><use href="#i-trash"/></svg></button>
      </span>
    </div>`).join('');
}

/* ═══════════════════ add ═══════════════════ */
async function addDriver() {
  const name = $('drvName').value.trim();
  const phone = $('drvPhone').value.trim();
  const notes = $('drvNotes').value.trim();
  if (name.length < 2) { toast(t('drv.errName'), 'error'); $('drvName').focus(); return; }
  if (phone.length < 8) { toast(t('drv.errPhone'), 'error'); $('drvPhone').focus(); return; }
  $('drvAdd').disabled = true;
  try {
    const created = await createDriver({ name, phone, notes });
    drivers.push(created);
    drivers.sort((a, b) => a.name.localeCompare(b.name));
    $('drvName').value = $('drvPhone').value = $('drvNotes').value = '';
    paint();
    toast(t('drv.added', { name: created.name }));
    $('drvName').focus();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    $('drvAdd').disabled = false;
  }
}

/* ═══════════════════ actions ═══════════════════ */
async function onAction(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = Number(btn.closest('[data-id]').dataset.id);
  const d = drivers.find((x) => x.id === id);
  if (!d) return;

  if (btn.dataset.act === 'edit') {
    const name = prompt(t('drv.editName'), d.name);
    if (name == null) return;
    const phone = prompt(t('drv.editPhone'), d.phone);
    if (phone == null) return;
    const notes = prompt(t('drv.editNotes'), d.notes);
    if (notes == null) return;
    try {
      const updated = await updateDriver(id, { name, phone, notes });
      Object.assign(d, updated);
      drivers.sort((a, b) => a.name.localeCompare(b.name));
      paint();
      toast(t('drv.saved', { name: d.name }));
    } catch (err) {
      toast(err.message, 'error');
    }
    return;
  }

  if (btn.dataset.act === 'del') {
    const ok = await confirmDialog({
      title: t('drv.delTitle', { name: d.name }),
      text: t('drv.delText'),
      yes: t('drv.delYes'),
    });
    if (!ok) return;
    try {
      await deleteDriver(id);
      drivers = drivers.filter((x) => x.id !== id);
      paint();
      toast(t('drv.deleted', { name: d.name }));
    } catch (err) {
      toast(err.message, 'error');
    }
  }
}

async function onChange(e) {
  const inp = e.target.closest('[data-f="active"]');
  if (!inp) return;
  const id = Number(inp.closest('[data-id]').dataset.id);
  const d = drivers.find((x) => x.id === id);
  try {
    await updateDriver(id, { active: inp.checked });
    d.active = inp.checked;
    inp.closest('.drv-card')?.classList.toggle('is-off', !inp.checked);
    toast(inp.checked ? t('drv.on', { name: d.name }) : t('drv.off', { name: d.name }));
    $('drvCount').textContent = t('drv.count', { a: drivers.filter((x) => x.active).length, n: drivers.length });
  } catch (err) {
    inp.checked = !inp.checked;
    toast(err.message, 'error');
  }
}
