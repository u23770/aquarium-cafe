// ============================================================
//  Aquarium Cafe & Resturant — Admin · Delivery Zones (v5.1)
//  The whole delivery geography is edited here:
//   · Main zones — named EN + AR, each with its own delivery
//     fee and an optional per-zone free-above override.
//   · Sub zones — unlimited per main zone (the customer's
//     step-2 picker), orderable & toggleable — and EACH ONE
//     carries its own delivery fee that wins over the zone
//     fee the moment the customer picks it.
//  The customer wizard, the price RPC and the waiter board
//  all read these same rows — nothing is hardcoded.
// ============================================================
import {
  getZones, createZone, updateZone, deleteZone, saveZoneOrder,
  createSubZone, updateSubZone, deleteSubZone, saveSubZoneOrder,
} from './api.js';
import { $, esc, toast, confirmDialog, setSaveState } from './ui.js';
import { t } from '../../shared/i18n.js';

let zones = [];
let savingSub = new Set();

const zoneById = (id) => zones.find((z) => z.id === id);
const fmt = (n) => (+n).toFixed(+n % 1 === 0 ? 0 : 2);

/* ═══════════════════ render ═══════════════════ */
export async function renderZones(view) {
  view.innerHTML = `
    <div class="toolbar">
      <span class="count-note" id="znCount"></span>
      <span class="toolbar__spacer"></span>
      <button class="btn btn--primary" id="znAdd">
        <svg class="icon"><use href="#i-pin"/></svg> ${esc(t('zn.add'))}
      </button>
    </div>
    <p class="toolbar-note">
      <svg class="icon"><use href="#i-scooter"/></svg>
      <span>${esc(t('zn.note'))}</span>
    </p>
    <div id="znList"><div class="skel-rows">${'<div class="skel-row"></div>'.repeat(3)}</div></div>`;

  $('znAdd').addEventListener('click', addZone);
  view.addEventListener('click', onAction);
  view.addEventListener('change', onChange);

  try {
    zones = await getZones();
    paint();
  } catch (err) {
    $('znList').innerHTML = `<div class="err-box"><svg class="icon"><use href="#i-warn"/></svg><p>${esc(err.message)}</p></div>`;
  }
}

/* ═══════════════════ painting ═══════════════════ */
function subRows(zone) {
  const subs = zone.subZones;
  return `
    <div class="zsubs" data-zone="${zone.id}">
      ${subs.map((s, i) => `
        <div class="zsub ${s.active ? '' : 'is-off'}" data-sub="${s.id}">
          <span class="zsub__grip">
            <button class="icon-btn" data-act="s-up" aria-label="${esc(t('g.moveUp'))}" ${i === 0 ? 'disabled' : ''}><svg class="icon"><use href="#i-chev-up"/></svg></button>
            <button class="icon-btn" data-act="s-down" aria-label="${esc(t('g.moveDown'))}" ${i === subs.length - 1 ? 'disabled' : ''}><svg class="icon"><use href="#i-chev-dn"/></svg></button>
          </span>
          <span class="zsub__name">
            <input class="zsub__en" data-f="s-en" maxlength="80" value="${esc(s.name_en)}" placeholder="${esc(t('zn.subEnPh'))}" aria-label="${esc(t('zn.subEn'))}">
            <input class="zsub__ar" data-f="s-ar" maxlength="80" dir="auto" value="${esc(s.name_ar)}" placeholder="${esc(t('zn.subArPh'))}" aria-label="${esc(t('zn.subAr'))}">
          </span>
          <label class="zfee zsub__fee" title="${esc(t('zn.subFeeHint'))}">
            <span>${esc(t('zn.fee'))}</span>
            <input data-f="s-fee" type="number" min="0" max="10000" step="1" value="${fmt(s.fee)}" aria-label="${esc(t('zn.subFee'))}">
            <small>EGP</small>
          </label>
          <label class="switch" title="${esc(t('zn.subActive'))}">
            <input type="checkbox" data-f="s-active" ${s.active ? 'checked' : ''}><i></i>
          </label>
          <button class="icon-btn danger" data-act="s-del" aria-label="${esc(t('act.del'))}"><svg class="icon"><use href="#i-trash"/></svg></button>
        </div>`).join('')}
      <div class="zsub zsub--adder">
        <span class="zsub__name">
          <input class="zsub__en" id="zsEn-${zone.id}" maxlength="80" placeholder="${esc(t('zn.newSubEn'))}" aria-label="${esc(t('zn.subEn'))}">
          <input class="zsub__ar" id="zsAr-${zone.id}" maxlength="80" dir="auto" placeholder="${esc(t('zn.newSubAr'))}" aria-label="${esc(t('zn.subAr'))}">
        </span>
        <label class="zfee zsub__fee" title="${esc(t('zn.subFeeHint'))}">
          <input id="zsFee-${zone.id}" type="number" min="0" max="10000" step="1" value="${fmt(zone.fee)}" aria-label="${esc(t('zn.subFee'))}">
          <small>EGP</small>
        </label>
        <button class="btn btn--ghost btn--sm" data-act="s-add">
          <svg class="icon"><use href="#i-plus"/></svg> ${esc(t('zn.addSub'))}
        </button>
      </div>
    </div>`;
}

function paint() {
  const list = $('znList');
  if (!list) return;
  const subTotal = zones.reduce((n, z) => n + z.subZones.length, 0);
  $('znCount').textContent = t('zn.count', { z: zones.length, s: subTotal });

  if (!zones.length) {
    list.innerHTML = `
      <div class="err-box">
        <svg class="icon"><use href="#i-pin"/></svg>
        <p>${esc(t('zn.empty'))}</p>
      </div>`;
    return;
  }

  list.innerHTML = zones.map((z, i) => `
    <section class="znc ${z.active ? '' : 'is-off'}" data-zone="${z.id}">
      <header class="znc__head">
        <span class="znc__grip">
          <button class="icon-btn" data-act="z-up" aria-label="${esc(t('g.moveUp'))}" ${i === 0 ? 'disabled' : ''}><svg class="icon"><use href="#i-chev-up"/></svg></button>
          <button class="icon-btn" data-act="z-down" aria-label="${esc(t('g.moveDown'))}" ${i === zones.length - 1 ? 'disabled' : ''}><svg class="icon"><use href="#i-chev-dn"/></svg></button>
        </span>
        <span class="znc__name">
          <label class="zfield"><span>EN</span>
            <input data-f="z-en" maxlength="60" value="${esc(z.name_en)}" aria-label="${esc(t('zn.nameEn'))}">
          </label>
          <label class="zfield"><span>ع</span>
            <input data-f="z-ar" maxlength="60" dir="auto" value="${esc(z.name_ar)}" placeholder="${esc(t('zn.nameArPh'))}" aria-label="${esc(t('zn.nameAr'))}">
          </label>
        </span>
        <label class="zfee" title="${esc(t('zn.feeHint'))}">
          <span>${esc(t('zn.fee'))}</span>
          <input data-f="z-fee" type="number" min="0" max="10000" step="1" value="${fmt(z.fee)}" aria-label="${esc(t('zn.fee'))}">
          <small>EGP</small>
        </label>
        <label class="zfee" title="${esc(t('zn.freeHint'))}">
          <span>${esc(t('zn.free'))}</span>
          <input data-f="z-free" type="number" min="0" max="100000" step="50" value="${fmt(z.free_above)}" aria-label="${esc(t('zn.free'))}">
        </label>
        <label class="switch" title="${esc(t('zn.active'))}">
          <input type="checkbox" data-f="z-active" ${z.active ? 'checked' : ''} /><i></i>
        </label>
        <button class="icon-btn danger" data-act="z-del" aria-label="${esc(t('act.del'))}"><svg class="icon"><use href="#i-trash"/></svg></button>
      </header>
      <details class="znc__subs" ${z.subZones.length ? 'open' : ''}>
        <summary>${esc(t('zn.subs', { n: z.subZones.length }))}</summary>
        ${subRows(z)}
      </details>
    </section>`).join('');
}

/* ═══════════════════ helpers ═══════════════════ */
async function guarded(fn) {
  setSaveState('busy');
  try {
    await fn();
    setSaveState('ok');
  } catch (err) {
    setSaveState('error');
    toast(err.message, 'error');
  }
}

/* ═══════════════════ zone actions ═══════════════════ */
async function addZone() {
  await guarded(async () => {
    const created = await createZone({ name_en: 'New Zone', name_ar: '' });
    zones.push(created);
    paint();
    toast(t('zn.added'));
    const card = document.querySelector(`.znc[data-zone="${created.id}"] [data-f="z-en"]`);
    if (card) { card.focus(); card.select(); }
  });
}

async function reorderZones(id, dir) {
  const i = zones.findIndex((z) => z.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= zones.length) return;
  [zones[i], zones[j]] = [zones[j], zones[i]];
  paint();
  await guarded(() => saveZoneOrder(zones.map((z) => z.id)));
}

async function reorderSubs(zone, subId, dir) {
  const i = zone.subZones.findIndex((s) => s.id === subId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= zone.subZones.length) return;
  [zone.subZones[i], zone.subZones[j]] = [zone.subZones[j], zone.subZones[i]];
  paint();
  await guarded(() => saveSubZoneOrder(zone.subZones.map((s) => s.id)));
}

async function onAction(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  const act = btn.dataset.act;
  const zoneId = Number(btn.closest('[data-zone]')?.dataset.zone);
  const zone = zoneById(zoneId);
  const subId = btn.closest('[data-sub]') ? Number(btn.closest('[data-sub]').dataset.sub) : null;

  try {
    if (act === 'z-up' || act === 'z-down') return reorderZones(zoneId, act === 'z-up' ? -1 : 1);
    if (act === 's-up' || act === 's-down') return reorderSubs(zone, subId, act === 's-up' ? -1 : 1);

    if (act === 'z-del') {
      const ok = await confirmDialog({
        title: t('zn.delTitle', { name: zone.name_en }),
        text: t('zn.delText', { n: zone.subZones.length }),
        yes: t('zn.delYes'),
      });
      if (!ok) return;
      await deleteZone(zoneId);
      zones = zones.filter((z) => z.id !== zoneId);
      paint();
      toast(t('zn.deleted', { name: zone.name_en }));
      return;
    }

    if (act === 's-del') {
      const s = zone.subZones.find((x) => x.id === subId);
      const ok = await confirmDialog({
        title: t('zn.delSubTitle', { name: s.name_en }),
        text: t('zn.delSubText'),
        yes: t('act.del'),
      });
      if (!ok) return;
      await deleteSubZone(subId);
      zone.subZones = zone.subZones.filter((x) => x.id !== subId);
      paint();
      toast(t('zn.subDeleted', { name: s.name_en }));
      return;
    }

    if (act === 's-add') {
      if (savingSub.has(zoneId)) return;
      const en = $(`zsEn-${zoneId}`).value.trim();
      const ar = $(`zsAr-${zoneId}`).value.trim();
      const fee = Number($(`zsFee-${zoneId}`).value);
      if (en.length < 2) { toast(t('zn.subShort'), 'error'); $(`zsEn-${zoneId}`).focus(); return; }
      if (!Number.isFinite(fee) || fee < 0 || fee > 10000) { toast(t('zn.feeBad'), 'error'); $(`zsFee-${zoneId}`).focus(); return; }
      savingSub.add(zoneId);
      try {
        const created = await createSubZone({ zone_id: zoneId, name_en: en, name_ar: ar, fee });
        zone.subZones.push({ ...created, fee: +created.delivery_fee });
        paint();
        toast(t('zn.subAdded', { name: created.name_en }));
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        savingSub.delete(zoneId);
      }
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ═══════════════════ inline edits ═══════════════════ */
async function onChange(e) {
  const inp = e.target.closest('[data-f]');
  if (!inp) return;
  const f = inp.dataset.f;
  const zoneId = Number(inp.closest('[data-zone]')?.dataset.zone);
  const zone = zoneById(zoneId);
  if (!zone) return;
  const subId = inp.closest('[data-sub]') ? Number(inp.closest('[data-sub]').dataset.sub) : null;
  const sub = subId ? zone.subZones.find((s) => s.id === subId) : null;

  try {
    switch (f) {
      case 'z-en': {
        const v = inp.value.trim();
        if (v === zone.name_en) return;
        await updateZone(zoneId, { name_en: v });
        zone.name_en = v;
        toast(t('zn.saved'));
        break;
      }
      case 'z-ar': {
        const v = inp.value.trim();
        if (v === zone.name_ar) return;
        await updateZone(zoneId, { name_ar: v });
        zone.name_ar = v;
        toast(t('zn.saved'));
        break;
      }
      case 'z-fee': {
        const v = Number(inp.value);
        if (v === zone.fee) return;
        await updateZone(zoneId, { fee: v });
        zone.fee = v;
        inp.value = fmt(v);
        toast(t('zn.feeSaved', { name: zone.name_en }));
        break;
      }
      case 'z-free': {
        const v = Number(inp.value);
        if (v === zone.free_above) return;
        await updateZone(zoneId, { free_above: v });
        zone.free_above = v;
        inp.value = fmt(v);
        toast(t('zn.saved'));
        break;
      }
      case 'z-active': {
        await updateZone(zoneId, { active: inp.checked });
        zone.active = inp.checked;
        inp.closest('.znc')?.classList.toggle('is-off', !inp.checked);
        toast(inp.checked ? t('zn.on', { name: zone.name_en }) : t('zn.off', { name: zone.name_en }));
        break;
      }
      case 's-en': {
        const v = inp.value.trim();
        if (v === sub.name_en) return;
        await updateSubZone(subId, { name_en: v });
        sub.name_en = v;
        toast(t('zn.saved'));
        break;
      }
      case 's-ar': {
        const v = inp.value.trim();
        if (v === sub.name_ar) return;
        await updateSubZone(subId, { name_ar: v });
        sub.name_ar = v;
        toast(t('zn.saved'));
        break;
      }
      case 's-fee': {
        const v = Number(inp.value);
        if (v === sub.fee) return;
        await updateSubZone(subId, { fee: v });
        sub.fee = v;
        inp.value = fmt(v);
        toast(t('zn.feeSaved', { name: sub.name_en }));
        break;
      }
      case 's-active': {
        await updateSubZone(subId, { active: inp.checked });
        sub.active = inp.checked;
        inp.closest('.zsub')?.classList.toggle('is-off', !inp.checked);
        toast(inp.checked ? t('zn.on', { name: sub.name_en }) : t('zn.off', { name: sub.name_en }));
        break;
      }
    }
  } catch (err) {
    toast(err.message, 'error');
    zones = await getZones();
    paint();
  }
}
