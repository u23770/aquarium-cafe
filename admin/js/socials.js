// ============================================================
//  Aquarium Cafe & Resturant — Admin · Social Links
//  The social_icons shared by the website footer and the
//  Contact section. Live in the social_links table — the
//  customer site renders every VISIBLE row in this order.
// ============================================================
import {
  getSocialLinks, createSocialLink, updateSocialLink, deleteSocialLink, saveSocialOrder,
} from './api.js';
import { esc, toast, confirmDialog } from './ui.js';
import { t } from '../../shared/i18n.js';

const KNOWN = [
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['tiktok', 'TikTok'],
  ['whatsapp', 'WhatsApp'],
  ['youtube', 'YouTube'],
  ['x', 'X (Twitter)'],
  ['website', 'Website'],
  ['snapchat', 'Snapchat'],
];

let items = [];

async function reorder(id, dir) {
  const i = items.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  paint();
  try {
    await saveSocialOrder(items.map((x) => x.id));
  } catch (err) {
    toast(err.message, 'error');
    items = await getSocialLinks();
    paint();
  }
}

function paint() {
  const list = document.getElementById('socList');
  if (!list) return;
  list.innerHTML = items.length
    ? items.map((s, i) => `
      <div class="soc-row ${s.visible ? '' : 'is-hidden'}" style="--d:${Math.min(i, 10) * 40}ms">
        <span class="soc-row__platform"><b>${esc(s.platform)}</b></span>
        <input class="soc-row__url" type="url" maxlength="500" value="${esc(s.url)}"
               placeholder="https://…" data-url="${s.id}" aria-label="${esc(s.platform)} URL" dir="ltr" />
        <label class="switch" title="${esc(t('so.show'))}">
          <input type="checkbox" data-vis="${s.id}" ${s.visible ? 'checked' : ''} /><i></i>
        </label>
        <span class="soc-row__acts">
          <button class="icon-btn" data-up="${s.id}" aria-label="${esc(t('so.moveUp'))}"><svg class="icon"><use href="#i-chev-up"/></svg></button>
          <button class="icon-btn" data-down="${s.id}" aria-label="${esc(t('so.moveDown'))}"><svg class="icon"><use href="#i-chev-dn"/></svg></button>
          <button class="icon-btn danger" data-del="${s.id}" aria-label="${esc(t('so.delAria'))}"><svg class="icon"><use href="#i-trash"/></svg></button>
        </span>
      </div>`).join('')
    : `<p class="empty-mini">${esc(t('so.empty'))}</p>`;

  // only platforms not yet used can be added (unique per platform)
  const used = new Set(items.map((s) => s.platform));
  const sel = document.getElementById('socPlatform');
  if (sel) {
    sel.innerHTML = [
      `<option value="">${esc(t('so.choose'))}</option>`,
      ...KNOWN.filter(([k]) => !used.has(k)).map(([k, label]) => `<option value="${k}">${label}</option>`),
    ].join('');
  }
}

/* ---------- main ---------- */
export async function renderSocials(view) {
  view.innerHTML = `<div class="skel-rows">${'<div class="skel-row"></div>'.repeat(2)}</div>`;
  items = await getSocialLinks();

  const shell = document.createElement('div');
  shell.innerHTML = `
    <div class="panel">
      <div class="panel__head"><h2>${esc(t('so.addHd'))}</h2><small>${esc(t('so.addSub'))}</small></div>
      <div class="soc-adder">
        <select class="select" id="socPlatform"></select>
        <input class="soc-adder__url" id="socUrl" type="url" maxlength="500" placeholder="${esc(t('so.urlPh'))}" dir="ltr" />
        <button class="btn btn--primary" id="socAdd"><svg class="icon"><use href="#i-plus"/></svg> ${esc(t('so.add'))}</button>
      </div>
      <p class="form-hint">${esc(t('so.hint'))}</p>
    </div>

    <div class="panel">
      <div class="panel__head"><h2>${esc(t('so.allHd'))}</h2><small>${esc(t('so.allSub'))}</small></div>
      <div id="socList"></div>
    </div>`;
  view.innerHTML = '';
  view.appendChild(shell);
  paint();

  shell.querySelector('#socAdd').addEventListener('click', async () => {
    const platform = shell.querySelector('#socPlatform').value;
    const url = shell.querySelector('#socUrl').value.trim();
    if (!platform) { toast(t('so.chooseFirst'), 'error'); return; }
    if (url && !/^https?:\/\//i.test(url)) { toast(t('so.httpsWarn'), 'error'); return; }
    try {
      const created = await createSocialLink({ platform, url });
      items.push(created);
      items.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      shell.querySelector('#socUrl').value = '';
      paint();
      toast(t('so.added', { platform }));
    } catch (err) { toast(err.message, 'error'); }
  });

  view.addEventListener('click', async (e) => {
    const up = e.target.closest('[data-up]');
    const down = e.target.closest('[data-down]');
    const del = e.target.closest('[data-del]');
    if (up) reorder(Number(up.dataset.up), -1);
    if (down) reorder(Number(down.dataset.down), +1);
    if (del) {
      const s = items.find((x) => x.id === Number(del.dataset.del));
      const ok = await confirmDialog({
        title: t('so.delTitle', { platform: s?.platform ?? '' }),
        text: t('so.delText'),
        yes: t('so.delYes'),
      });
      if (!ok) return;
      try {
        await deleteSocialLink(s.id);
        items = items.filter((x) => x.id !== s.id);
        paint();
        toast(t('so.deleted'));
      } catch (err) { toast(err.message, 'error'); }
    }
  });

  let urlTimer;
  view.addEventListener('input', (e) => {
    const inp = e.target.closest('[data-url]');
    if (!inp) return;
    clearTimeout(urlTimer);
    const id = Number(inp.dataset.url);
    urlTimer = setTimeout(async () => {
      const v = inp.value.trim();
      if (v && !/^https?:\/\//i.test(v)) { toast(t('so.httpsWarn'), 'error'); return; }
      try {
        await updateSocialLink(id, { url: v });
        const s = items.find((x) => x.id === id);
        if (s) s.url = v;
        toast(t('so.saved'));
      } catch (err) { toast(err.message, 'error'); }
    }, 800);
  });

  view.addEventListener('change', async (e) => {
    const tgl = e.target.closest('[data-vis]');
    if (!tgl) return;
    const id = Number(tgl.dataset.vis);
    try {
      await updateSocialLink(id, { visible: tgl.checked });
      const s = items.find((x) => x.id === id);
      if (s) s.visible = tgl.checked;
      paint();
      toast(tgl.checked ? t('so.visibleOn') : t('so.visibleOff'));
    } catch (err) {
      tgl.checked = !tgl.checked;
      toast(err.message, 'error');
    }
  });
}
