// Aquarium Cafe — progressive delivery selector UI
// Keeps delivery.js and Supabase as the source of truth. This module only
// mirrors the existing zone/sub-zone buttons into compact native selects.

function loadStyle() {
  if (document.querySelector('link[data-delivery-select-ui]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/delivery-select-ui.css?v=20260911';
  link.dataset.deliverySelectUi = '1';
  document.head.appendChild(link);
}

function createSelect(host, id, label, placeholder) {
  if (!host || document.getElementById(id)) return document.getElementById(id);
  const wrap = document.createElement('label');
  wrap.className = 'dl-select is-empty';
  wrap.htmlFor = id;
  wrap.innerHTML = `
    <span>${label}</span>
    <select id="${id}" aria-label="${label}">
      <option value="">${placeholder}</option>
    </select>
  `;
  host.insertBefore(wrap, host.firstChild);
  return wrap.querySelector('select');
}

function optionText(button) {
  const name = button.querySelector('.zn__name')?.textContent?.trim() || '';
  const fee = button.querySelector('.zn__fee')?.textContent?.trim() || '';
  return fee ? `${name} · ${fee}` : name;
}

function syncSelect(grid, select, key, placeholder) {
  if (!grid || !select) return;
  const buttons = [...grid.querySelectorAll(`button[data-${key}]`)];
  const selected = buttons.find((b) => b.classList.contains('is-active'));
  const selectedValue = selected?.dataset[key] || '';
  const current = select.value;

  select.innerHTML = `<option value="">${placeholder}</option>`;
  for (const button of buttons) {
    const value = button.dataset[key];
    if (!value) continue;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = optionText(button);
    select.appendChild(option);
  }

  select.value = selectedValue || (buttons.some((b) => b.dataset[key] === current) ? current : '');
  select.closest('.dl-select')?.classList.toggle('is-empty', !select.value);
  select.disabled = buttons.length === 0;
}

function bridgeChange(select, grid, key) {
  select.addEventListener('change', () => {
    const value = select.value;
    if (!value) return;
    const button = grid?.querySelector(`button[data-${key}="${CSS.escape(value)}"]`);
    button?.click();
  });
}

export function initDeliverySelectUI() {
  const zoneGrid = document.getElementById('dlZoneGrid');
  const subGrid = document.getElementById('dlSubGrid');
  if (!zoneGrid || !subGrid) return;

  loadStyle();

  const zoneSelect = createSelect(zoneGrid, 'dlZoneSelect', 'Delivery area', 'Choose your area…');
  const subSelect = createSelect(subGrid, 'dlSubSelect', 'Sub-area', 'Choose your sub-area…');
  if (!zoneSelect || !subSelect) return;

  zoneGrid.classList.add('dl-select-source');
  subGrid.classList.add('dl-select-source');

  const sync = () => {
    syncSelect(zoneGrid, zoneSelect, 'zone', 'Choose your area…');
    syncSelect(subGrid, subSelect, 'sub', 'Choose your sub-area…');
  };

  bridgeChange(zoneSelect, zoneGrid, 'zone');
  bridgeChange(subSelect, subGrid, 'sub');

  new MutationObserver(sync).observe(zoneGrid, { childList: true, subtree: true });
  new MutationObserver(sync).observe(subGrid, { childList: true, subtree: true });
  sync();
}

initDeliverySelectUI();
