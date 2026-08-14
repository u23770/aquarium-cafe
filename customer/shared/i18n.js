// ============================================================
//  Aquarium Cafe & Resturant — shared i18n engine (EN / AR)
// ------------------------------------------------------------
//  · t(key)                → instant translation + {var} slots
//  · setLang('en'|'ar')    → switches the WHOLE app instantly:
//    [data-i18n] texts, placeholders, aria-labels, titles,
//    html direction (RTL ⇄ LTR), <html lang>, and a
//    'lang:changed' event so dynamic views re-render.
//  · applyI18n(root)       → re-translate a freshly-rendered tree
//  · pickLang(row, 'name') → data-driven bilingual fields:
//    Arabic column (name_ar) when Arabic is on & filled,
//    otherwise the original field (never breaks old data).
// ============================================================

const LS_KEY = 'aquarium_lang_v1';

let DICT = { en: {}, ar: {} };
let current = 'en';

/* ---------- core translate ---------- */
export function t(key, vars) {
  let s = DICT[current]?.[key] ?? DICT.en?.[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export const getLang = () => current;
export const isRTL = () => current === 'ar';

/* pick a bilingual DB field: name_ar when Arabic + filled, else name */
export function pickLang(row, field) {
  if (!row) return '';
  if (current === 'ar') {
    const ar = row[field + '_ar'];
    if (ar != null && String(ar).trim() !== '') return ar;
  }
  return row[field] ?? '';
}

/* ---------- apply to the DOM ---------- */
function setDocumentDirection() {
  const html = document.documentElement;
  html.lang = current;
  html.dir = current === 'ar' ? 'rtl' : 'ltr';
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.setAttribute('placeholder', t(el.dataset.i18nPh));
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.dataset.i18nTitle));
  });
  root.querySelectorAll('[data-i18n-value]').forEach((el) => {
    el.value = t(el.dataset.i18nValue);
  });
}

/* ---------- language switch ---------- */
export function setLang(lang) {
  if (!['en', 'ar'].includes(lang)) lang = 'en';
  current = lang;
  try { localStorage.setItem(LS_KEY, lang); } catch { /* private mode */ }
  setDocumentDirection();
  applyI18n(document);
  document.dispatchEvent(new CustomEvent('lang:changed', { detail: { lang } }));
}

export function toggleLang() {
  setLang(current === 'ar' ? 'en' : 'ar');
}

/* ---------- boot (each app passes its own dictionary) ----------
   options: { dictionary: {en:{…}, ar:{…}}, defaultLang }  */
export function initI18n({ dictionary, defaultLang = 'en' } = {}) {
  if (dictionary) {
    DICT = {
      en: { ...(dictionary.en || {}) },
      ar: { ...(dictionary.ar || {}) },
    };
  }
  current = defaultLang;
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (['en', 'ar'].includes(saved)) current = saved;
  } catch { /* private mode */ }
  setDocumentDirection();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyI18n(document));
  } else {
    applyI18n(document);
  }
  return current;
}

/* small helper: a language toggle button's two states */
export function langSwitchLabel() {
  return current === 'ar' ? 'EN' : 'ع';
}
