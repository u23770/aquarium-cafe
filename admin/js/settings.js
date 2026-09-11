// ============================================================
//  Aquarium Cafe & Resturant — Admin · Settings (v5)
//  One page for every operational switch:
//   · Delivery settings (enabled, minimum order, ETA, global
//     free-above fallback, payment methods, customer note)
//     — read by place_delivery_order() inside Postgres.
//     Per-zone fees live in the Zones page.
//   · Loyalty Rewards (points per order, signup bonus, point
//     value, min/max redemption) — the wallet customers see.
//   · Notification defaults.
//   · Business TODO checklist — what public research could
//     NOT find; the owner works through it here.
//  Everything autosaves (debounced). Fully bilingual.
// ============================================================
import { getKVConfig, saveKVConfig, getBusinessTodo, saveBusinessTodo } from './api.js';
import { esc, toast, setSaveState } from './ui.js';
import { t } from '../shared/i18n.js';
import * as C from './controls.js';

let state = null;
let timers = {};
let saving = {};
let pending = {};

function scheduleSave(bucket) {
  clearTimeout(timers[bucket]);
  timers[bucket] = setTimeout(() => persist(bucket), 900);
  setSaveState('busy');
}

async function persist(bucket) {
  if (saving[bucket]) { pending[bucket] = true; return; }
  saving[bucket] = true;
  setSaveState('busy');
  try {
    if (bucket === 'delivery')      await saveKVConfig('delivery_settings', state.delivery);
    if (bucket === 'rewards')       await saveKVConfig('loyalty_settings', state.rewards);
    if (bucket === 'notification')  await saveKVConfig('notification_settings', state.notification);
    if (bucket === 'todo')          await saveBusinessTodo(state.todo);
    setSaveState('ok');
  } catch (err) {
    setSaveState('error');
    toast(err.message, 'error');
  } finally {
    saving[bucket] = false;
    if (pending[bucket]) { pending[bucket] = false; persist(bucket); }
  }
}

const note = (text) => {
  const el = document.createElement('p');
  el.className = 'ctl__note';
  el.textContent = text;
  return el;
};

/* ---------- payment method toggle ---------- */
function payToggle(kind, label) {
  return C.toggleControl({
    label,
    value: Array.isArray(state.delivery.payment_methods) && state.delivery.payment_methods.includes(kind),
    onChange: (on) => {
      const set = new Set(Array.isArray(state.delivery.payment_methods) ? state.delivery.payment_methods : []);
      if (on) set.add(kind); else set.delete(kind);
      state.delivery.payment_methods = [...set];
      if (state.delivery.payment_methods.length === 0) {
        state.delivery.payment_methods = [kind];          // never leave zero payment methods
        render(state._view, true);
        toast(t('set.payOne'), 'error');
      }
      scheduleSave('delivery');
    },
  });
}

/* ---------- TODO checklist ---------- */
function todoGroup() {
  const el = C.group(t('set.todoTitle'), 'i-warn', []);
  const box = el.querySelector('.cz-group__fields');

  box.appendChild(note(t('set.todoIntro')));

  const listWrap = document.createElement('div');
  listWrap.className = 'todo';
  const doneCount = state.todo.filter((x) => x.done).length;

  const progress = document.createElement('div');
  progress.className = 'todo__progress';
  progress.innerHTML = state.todo.length
    ? `<span class="todo__bar"><i style="width:${Math.round((doneCount / state.todo.length) * 100)}%"></i></span>
       <span class="todo__count">${esc(t('set.todoCount', { d: doneCount, t: state.todo.length }))}</span>`
    : `<span class="todo__count">${esc(t('set.todoAllDone'))}</span>`;
  listWrap.appendChild(progress);

  state.todo.forEach((todoItem, i) => {
    const row = document.createElement('label');
    row.className = 'todo__row' + (todoItem.done ? ' is-done' : '');
    row.innerHTML = `
      <span class="switch"><input type="checkbox" ${todoItem.done ? 'checked' : ''}><i></i></span>
      <span class="todo__text">${esc(todoItem.text)}</span>
      <button type="button" class="icon-btn danger todo__del" aria-label="${esc(t('set.todoDel'))}">
        <svg class="icon"><use href="#i-trash"/></svg>
      </button>`;
    row.querySelector('input').addEventListener('change', (e) => {
      state.todo[i].done = e.target.checked;
      row.classList.toggle('is-done', e.target.checked);
      scheduleSave('todo');
      const dc = state.todo.filter((x) => x.done).length;
      progress.querySelector('.todo__count').textContent = t('set.todoCount', { d: dc, t: state.todo.length });
      progress.querySelector('.todo__bar i')?.style.setProperty('width', `${Math.round((dc / state.todo.length) * 100)}%`);
    });
    row.querySelector('.todo__del').addEventListener('click', (e) => {
      e.preventDefault();
      state.todo.splice(i, 1);
      scheduleSave('todo');
      render(state._view, true);
    });
    listWrap.appendChild(row);
  });

  const adder = document.createElement('div');
  adder.className = 'todo__adder';
  adder.innerHTML = `
    <input type="text" maxlength="300" placeholder="${esc(t('set.todoAdd'))}">
    <button type="button" class="btn btn--primary btn--sm"><svg class="icon"><use href="#i-plus"/></svg> ${esc(t('act.add'))}</button>`;
  const add = () => {
    const text = adder.querySelector('input').value.trim();
    if (!text) return;
    state.todo.push({ text, done: false });
    scheduleSave('todo');
    render(state._view, true);
  };
  adder.querySelector('button').addEventListener('click', add);
  adder.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  listWrap.appendChild(adder);

  box.appendChild(listWrap);
  return el;
}

/* ---------- order availability (manual pause + opening hours) ---------- */
const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function ensureDay(hours, key) {
  if (!hours[key] || typeof hours[key] !== 'object') {
    hours[key] = { enabled: true, open: '08:00', close: '02:00' };
  }
  return hours[key];
}

function availabilityGroup() {
  const d = state.delivery;
  const el = C.group(t('avail.title'), 'i-scooter', []);
  const box = el.querySelector('.cz-group__fields');

  /* status pill + pause / resume (saves immediately, no debounce) */
  const statusRow = document.createElement('div');
  statusRow.className = 'ctl__row';
  statusRow.style.justifyContent = 'space-between';
  statusRow.style.flexWrap = 'wrap';
  statusRow.style.gap = '.75rem';

  const statusText = document.createElement('span');
  statusText.style.fontWeight = '600';
  const paintStatus = () => {
    statusText.textContent = d.manual_pause
      ? ('\u{1F534} ' + t('avail.ordersPaused'))
      : ('\u{1F7E2} ' + t('avail.acceptingOrders'));
  };
  paintStatus();

  const pauseBtn = document.createElement('button');
  pauseBtn.type = 'button';
  const paintBtn = () => {
    pauseBtn.textContent = d.manual_pause ? t('avail.resume') : t('avail.pause');
    pauseBtn.className = 'btn btn--sm ' + (d.manual_pause ? 'btn--primary' : 'btn--danger');
  };
  paintBtn();
  pauseBtn.addEventListener('click', async () => {
    pauseBtn.disabled = true;
    d.manual_pause = !d.manual_pause;
    paintStatus();
    paintBtn();
    clearTimeout(timers.delivery);
    try {
      await persist('delivery'); // immediate save — pausing must take effect right away
    } finally {
      pauseBtn.disabled = false;
    }
  });

  statusRow.appendChild(statusText);
  statusRow.appendChild(pauseBtn);
  box.appendChild(statusRow);
  box.appendChild(note(t('avail.pauseHint')));

  box.appendChild(C.toggleControl({
    label: t('avail.enableHours'),
    hint: t('avail.enableHoursHint'),
    value: d.schedule_enabled,
    onChange: (v) => { d.schedule_enabled = v; scheduleSave('delivery'); },
  }));

  const daysWrap = document.createElement('div');
  daysWrap.className = 'avail-days';
  DOW_KEYS.forEach((key) => {
    const day = ensureDay(d.opening_hours, key);
    const row = document.createElement('div');
    row.className = 'ctl__row avail-day';
    row.style.flexWrap = 'wrap';

    const dayName = document.createElement('span');
    dayName.textContent = t('avail.day.' + key);
    dayName.style.minWidth = '92px';
    dayName.style.display = 'inline-block';

    const switchWrap = document.createElement('span');
    switchWrap.className = 'switch';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = day.enabled !== false;
    switchWrap.appendChild(cb);
    switchWrap.appendChild(document.createElement('i'));

    const openInput = document.createElement('input');
    openInput.type = 'time';
    openInput.value = day.open || '08:00';
    openInput.setAttribute('aria-label', t('avail.day.' + key) + ' ' + t('avail.openLabel'));

    const arrow = document.createElement('span');
    arrow.textContent = '\u2192';
    arrow.setAttribute('aria-hidden', 'true');

    const closeInput = document.createElement('input');
    closeInput.type = 'time';
    closeInput.value = day.close || '02:00';
    closeInput.setAttribute('aria-label', t('avail.day.' + key) + ' ' + t('avail.closeLabel'));

    cb.addEventListener('change', () => { day.enabled = cb.checked; scheduleSave('delivery'); });
    openInput.addEventListener('change', () => { day.open = openInput.value || '08:00'; scheduleSave('delivery'); });
    closeInput.addEventListener('change', () => { day.close = closeInput.value || '02:00'; scheduleSave('delivery'); });

    row.appendChild(dayName);
    row.appendChild(switchWrap);
    row.appendChild(openInput);
    row.appendChild(arrow);
    row.appendChild(closeInput);
    daysWrap.appendChild(row);
  });
  box.appendChild(daysWrap);
  box.appendChild(note(t('avail.hoursNote')));

  return el;
}

/* ---------- main render ---------- */
export async function renderSettings(view, keepState = false) {
  if (!keepState || !state) {
    view.innerHTML = `<div class="skel-rows">${'<div class="skel-row"></div>'.repeat(3)}</div>`;
    const [delivery, rewards, notification, todo] = await Promise.all([
      getKVConfig('delivery_settings'),
      getKVConfig('loyalty_settings'),
      getKVConfig('notification_settings'),
      getBusinessTodo(),
    ]);
    state = {
      delivery: {
        enabled: delivery.enabled !== false,
        free_above: Number(delivery.free_above ?? 0),
        min_order: Number(delivery.min_order ?? 0),
        estimated_minutes: Number(delivery.estimated_minutes ?? 45),
        payment_methods: Array.isArray(delivery.payment_methods) ? delivery.payment_methods : ['cash'],
        note: String(delivery.note ?? ''),
        manual_pause: !!delivery.manual_pause,
        schedule_enabled: !!delivery.schedule_enabled,
        opening_hours: (delivery.opening_hours && typeof delivery.opening_hours === 'object')
          ? { ...delivery.opening_hours }
          : {},
      },
      rewards: {
        enabled: rewards.enabled !== false,
        points_per_order: Number(rewards.points_per_order ?? 20),
        signup_bonus: Number(rewards.signup_bonus ?? 50),
        point_value_egp: Number(rewards.point_value_egp ?? 0.5),
        min_redeem: Number(rewards.min_redeem ?? 50),
        max_redeem: Number(rewards.max_redeem ?? 300),
      },
      notification: {
        sound: notification.sound !== false,
        browser: !!notification.browser,
      },
      todo,
    };
  }
  state._view = view;

  const wrap = document.createElement('div');
  wrap.className = 'set-grid';

  /* Order Availability */
  wrap.appendChild(availabilityGroup());

  /* Delivery */
  const d = state.delivery;
  wrap.appendChild(C.group(t('set.delivery'), 'i-scooter', [
    C.toggleControl({
      label: t('set.dEnabled'),
      hint: t('set.dEnabledHint'),
      value: d.enabled,
      onChange: (v) => { d.enabled = v; scheduleSave('delivery'); },
    }),
    C.rangeControl({
      label: t('set.minOrder'), value: d.min_order, min: 0, max: 500, step: 25, unit: ' EGP',
      onChange: (v) => { d.min_order = v; scheduleSave('delivery'); },
    }),
    C.rangeControl({
      label: t('set.freeAbove'), value: d.free_above, min: 0, max: 2000, step: 50, unit: ' EGP',
      onChange: (v) => { d.free_above = v; scheduleSave('delivery'); },
    }),
    C.rangeControl({
      label: t('set.eta'), value: d.estimated_minutes, min: 10, max: 180, step: 5, unit: ' min',
      onChange: (v) => { d.estimated_minutes = v; scheduleSave('delivery'); },
    }),
    note(t('set.payNote')),
    payToggle('cash', t('set.cash')),
    payToggle('card_on_delivery', t('set.card')),
    C.textControl({
      label: t('set.note'), value: d.note, area: true, rows: 2,
      onChange: (v) => { d.note = v; scheduleSave('delivery'); },
    }),
    note(t('set.enforced')),
  ]));

  /* Loyalty Rewards */
  const r = state.rewards;
  wrap.appendChild(C.group(t('set.rewards'), 'i-gift', [
    C.toggleControl({
      label: t('set.rEnabled'),
      value: r.enabled,
      onChange: (v) => { r.enabled = v; scheduleSave('rewards'); },
    }),
    C.rangeControl({
      label: t('set.rPPO'), value: r.points_per_order, min: 0, max: 200, step: 5, unit: '',
      onChange: (v) => { r.points_per_order = v; scheduleSave('rewards'); },
    }),
    C.rangeControl({
      label: t('set.rBonus'), value: r.signup_bonus, min: 0, max: 500, step: 10, unit: '',
      onChange: (v) => { r.signup_bonus = v; scheduleSave('rewards'); },
    }),
    C.rangeControl({
      label: t('set.rValue'), value: r.point_value_egp, min: 0, max: 5, step: 0.25, unit: ' EGP',
      onChange: (v) => { r.point_value_egp = v; scheduleSave('rewards'); },
    }),
    C.rangeControl({
      label: t('set.rMin'), value: r.min_redeem, min: 0, max: 1000, step: 10, unit: '',
      onChange: (v) => { r.min_redeem = v; scheduleSave('rewards'); },
    }),
    C.rangeControl({
      label: t('set.rMax'), value: r.max_redeem, min: 0, max: 2000, step: 50, unit: '',
      onChange: (v) => { r.max_redeem = v; scheduleSave('rewards'); },
    }),
    note(t('set.rNote')),
  ]));

  /* Notifications */
  const n = state.notification;
  wrap.appendChild(C.group(t('set.notifications'), 'i-bell', [
    C.toggleControl({
      label: t('set.nSound'),
      hint: t('set.nSoundHint'),
      value: n.sound,
      onChange: (v) => { n.sound = v; scheduleSave('notification'); },
    }),
    C.toggleControl({
      label: t('set.nBrowser'),
      hint: t('set.nBrowserHint'),
      value: n.browser,
      onChange: (v) => { n.browser = v; scheduleSave('notification'); },
    }),
  ]));

  /* Business TODO */
  wrap.appendChild(todoGroup());

  view.innerHTML = '';
  view.appendChild(wrap);

  const tip = document.createElement('div');
  tip.className = 'set-note';
  tip.innerHTML = `<svg class="icon"><use href="#i-check"/></svg>
    <span>${esc(t('set.autosave'))}</span>`;
  view.appendChild(tip);
}

/* internal re-render helper (TODO add/remove) */
function render(view, keepState) {
  return renderSettings(view, keepState);
}
