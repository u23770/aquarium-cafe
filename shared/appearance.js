// ============================================================
//  Aquarium Cafe & Restaurant — shared appearance model
//  (single source of truth for customer site AND admin builder)
// ------------------------------------------------------------
//  All visual customization lives in Supabase. This module holds
//  the DEFAULTS + the DB-row → app-object mappers used by BOTH
//  the customer site (to render) and the admin customizer
//  (to preview & save), so the two can never drift apart.
//
//  Storage layout in Supabase:
//    settings         (key → text)    restaurant identity & features
//    website_theme    (key → jsonb)   colors / typography / layout /
//                                     navbar / hero style / card /
//                                     buttons / animations
//    website_content  (key → jsonb)   hero text, nav items, about,
//                                     contact, hours, branches,
//                                     highlights, footer
//    website_sections (rows)          order & visibility of sections
//  (social links moved to the social_links TABLE in v4.)
// ============================================================

/* ═══════════════ defaults ═══════════════ */

export function defaultSettings() {
  return {
    cafeName: 'Aquarium Cafe & Restaurant',
    cafeName_ar: 'أكواريوم كافيه ومطعم',
    slogan: 'Sea View · Seafood · Coffee & Shisha',
    slogan_ar: 'إطلالة بحرية · مأكولات بحرية · قهوة وشيشة',
    description:
      'A family terrace directly on the Hurghada waterfront — fresh seafood, generous shisha, fresh juices and real coffee, with an indoor aquarium and a kids\u2019 play corner.',
    description_ar:
      'تراس عائلي مباشرةً على واجهة الغردقة البحرية — مأكولات بحرية طازجة، شيشة، عصائر طازجة وقهوة، مع حوض أسماك وركن ألعاب للأطفال.',
    copyright: '© {year} Aquarium Cafe & Restaurant — on the Hurghada corniche, behind the General Hospital.',
    copyright_ar: '© {year} أكواريوم كافيه ومطعم — على كورنيش الغردقة خلف المستشفى العام.',
    logoUrl: 'images/logo.svg',
    faviconUrl: 'images/logo.svg',
    currency: 'EGP',
    features: { ordering: true, reservations: false, delivery: true },
    businessTodo: [],
  };
}

export function defaultTheme() {
  return {
    // Aquarium marine brand — sampled from the printed menu:
    // deep-sea blue + bright aqua on white, rounded bold headings.
    colors: {
      primary:     '#0d7d9e',
      secondary:   '#0b5b78',
      accent:      '#23b5d3',
      background:  '#f3fafc',
      sectionBg:   '#e4f3f7',
      cardBg:      '#ffffff',
      buttonBg:    '#0d7d9e',
      buttonHover: '#0a647f',
      text:        '#2b5261',
      heading:     '#09384c',
      border:      '#d3e8ee',
      footerBg:    '#09384c',
      navbarBg:    '#09384c',
      overlay:     '#06293a',
    },
    typography: {
      headingFont:   'Poppins',
      bodyFont:      'Inter',
      bodySize:      16,
      h1Size:        58,
      h2Size:        36,
      h3Size:        20,
      headingWeight: 700,
      bodyWeight:    400,
      letterSpacing: 0,
      lineHeight:    1.65,
    },
    layout: {
      containerWidth: 1200,
      spacing:        18,
      sectionPadding: 92,
      cardRadius:     20,
      shadowSize:     'medium',
      gridColumns:    3,
    },
    navbar: {
      style:        'glass',   // glass | solid | transparent
      sticky:       true,
      blur:         true,
      transparency: 88,        // % opacity of the navbar background
      logoSize:     40,        // px — brand mark height
    },
    hero: {
      bgColor:        '#06293a',
      overlayColor:   '#06293a',
      overlayOpacity: 55,
    },
    card: {
      style:      'elevated',  // elevated | outline | flat
      imageRatio: '4:3',       // 1:1 | 4:3 | 3:2 | 16:9
      imageSize:  'medium',    // small | medium | large  (height cap)
      radius:     20,
      shadow:     'medium',    // none | small | medium | large
      hover:      'lift',      // lift | zoom | glow | none
      spacing:    18,          // inner padding px
    },
    buttons: {
      radius:    14,
      style:     'solid',      // solid | outline | soft
      size:      'medium',     // small | medium | large
      animation: 'lift',       // lift | scale | glow | none
    },
    animations: {
      enabled:  true,
      type:     'rise',        // rise | fade | zoom | slide
      duration: 700,           // ms base
      speed:    100,           // % multiplier (100 = normal)
    },
  };
}

export function defaultContent() {
  return {
    hero: {
      title:      'Dine where the sea meets your table',
      title_ar:   'استمتع بوجبتك حيث يلتقي البحر بمائدتك',
      subtitle:
        'Fresh seafood, creamy smoothies, generous shisha and slow coffee — a family terrace on the Hurghada corniche, behind the General Hospital.',
      subtitle_ar:
        'مأكولات بحرية طازجة، سموذي كريمي، شيشة وقهوة على مهل — تراس عائلي على كورنيش الغردقة خلف المستشفى العام.',
      buttonText: 'Explore the menu',
      buttonText_ar: 'استكشف المنيو',
      buttonLink: '#menu',
      imageUrl:   'images/hero-sea.jpg',
    },
    navItems: [
      { label: 'Home', label_ar: 'الرئيسية',    href: '#hero' },
      { label: 'Menu', label_ar: 'المنيو',    href: '#menu' },
      { label: 'Gallery', label_ar: 'المعرض', href: '#gallery' },
      { label: 'About', label_ar: 'عن المطعم',   href: '#about' },
      { label: 'Reviews', label_ar: 'التقييمات', href: '#reviews' },
      { label: 'Contact', label_ar: 'تواصل معنا', href: '#contact' },
    ],
    about: {
      title: 'A terrace on the water, since day one',
      title_ar: 'تراس على البحر منذ اليوم الأول',
      text:
        'Aquarium is where Hurghada families come to breathe. Our wooden terrace sits directly above the Red Sea, an aquarium tank glows inside, and the little ones have their own play corner while you finish your shisha. The kitchen moves between the day\u2019s fresh catch, stone-oven pizza and proper espresso — and the smoothie bar never stops. Morning coffee here is quiet; evenings are pure Red Sea.',
      text_ar:
        'أكواريوم هو المكان الذي تأتي إليه عائلات الغردقة للاستمتاع. تراسنا الخشبي يطل مباشرةً على البحر الأحمر، وداخل المطعم حوض أسماك وركن ألعاب للصغار. يقدم المطبخ صيد اليوم والبيتزا المخبوزة في الفرن وقهوة الإسبريسو، بينما يقدم بار السموذي مشروباته طوال اليوم. قهوة الصباح هادئة هنا، والمساء بطابع البحر الأحمر.',
      imageUrl: 'images/seafood.jpg',
    },
    highlights: [
      'Sea View Terrace',
      'Fresh Seafood',
      'Shisha Lounge',
      'Fresh Juices & Smoothies',
      'Family Friendly',
      'Behind the General Hospital · Hurghada',
    ],
    highlights_ar: ['تراس بإطلالة بحرية','مأكولات بحرية طازجة','لاونج شيشة','عصائر وسموذي طازج','مناسب للعائلات','خلف المستشفى العام · الغردقة'],
    contact: {
      address:
        'Behind the General Hospital (El Mustashfa El Aam), Hurghada, Red Sea — plus code 7R69+JH',
      address_ar: 'خلف المستشفى العام، الغردقة، البحر الأحمر — كود الموقع 7R69+JH',
      phones:   ['+20 10 13913636'],
      whatsapp: 'https://wa.me/201013913636',
      email:    'aquariumseaview@gmail.com',
      mapsUrl:  'https://maps.app.goo.gl/D1q6Viif77U9MWqm8',
    },
    hours: [
      { days: 'Every day', days_ar: 'كل يوم', time: '8:00 AM – 2:00 AM', time_ar: '8:00 صباحًا – 2:00 صباحًا' },
    ],
    branches: [
      { name: 'Aquarium — Main Terrace', name_ar: 'أكواريوم — التراس الرئيسي', address: 'Behind the General Hospital, Hurghada', address_ar: 'خلف المستشفى العام، الغردقة', phone: '+20 10 13913636' },
    ],
    // v4: socials live in the social_links TABLE (Admin → Socials).
    // This object stays as a graceful fallback for old databases.
    socials: {},
    footerAbout:
      'Fresh seafood, shisha and slow coffee right on the Hurghada waterfront — bring the family, stay for the sunset.',
    footerAbout_ar: 'مأكولات بحرية طازجة وشيشة وقهوة على واجهة الغردقة البحرية — تعال مع العائلة واستمتع بالغروب.',
  };
}

export function defaultSections() {
  return [
    { id: 'hero',       label: 'Hero',             position: 0,  visible: true },
    { id: 'highlights', label: 'Highlights strip', position: 10, visible: true },
    { id: 'banner',     label: 'Promo banner',     position: 15, visible: true },
    { id: 'menu',       label: 'Menu',             position: 20, visible: true },
    { id: 'gallery',    label: 'Gallery',          position: 25, visible: true },
    { id: 'about',      label: 'About',            position: 30, visible: true },
    { id: 'reviews',    label: 'Reviews',          position: 35, visible: true },
    { id: 'contact',    label: 'Contact & hours',  position: 40, visible: true },
    { id: 'footer',     label: 'Footer',           position: 50, visible: true },
  ];
}

/* ═══════════════ curated option catalogues (customizer selects) ═══════════════ */

// CSS font stacks + which ones need a Google Fonts <link>.
export const FONT_STACKS = {
  'Playfair Display':   "'Playfair Display', Georgia, serif",
  'Cormorant Garamond': "'Cormorant Garamond', Georgia, serif",
  'Lora':               "'Lora', Georgia, serif",
  'Manrope':            "'Manrope', 'Segoe UI', sans-serif",
  'Inter':              "'Inter', 'Segoe UI', sans-serif",
  'Poppins':            "'Poppins', 'Segoe UI', sans-serif",
  'Montserrat':         "'Montserrat', 'Segoe UI', sans-serif",
  'DM Sans':            "'DM Sans', 'Segoe UI', sans-serif",
  'Raleway':            "'Raleway', 'Segoe UI', sans-serif",
  'Cairo':              "'Cairo', 'Segoe UI', sans-serif",
  'Georgia':            'Georgia, serif',
  'System UI':          'system-ui, -apple-system, sans-serif',
};

export const GOOGLE_FONTS = Object.keys(FONT_STACKS).filter(
  (f) => !['Georgia', 'System UI'].includes(f)
);

export const SHADOW_SIZES = {
  none:   'none',
  small:  '0 4px 14px -6px rgb(9 56 76 / .20)',
  medium: '0 16px 38px -16px rgb(9 56 76 / .28)',
  large:  '0 32px 64px -20px rgb(9 56 76 / .36)',
};

export const IMAGE_RATIOS = {
  '1:1':  '1 / 1',
  '4:3':  '4 / 3',
  '3:2':  '3 / 2',
  '16:9': '16 / 9',
};

export const IMAGE_HEIGHTS = { small: '170px', medium: '230px', large: '300px' };

export const BUTTON_SIZES = {
  small:  { py: '.58rem', px: '1.1rem', fs: '.85rem' },
  medium: { py: '.8rem',  px: '1.55rem', fs: '.95rem' },
  large:  { py: '1.02rem', px: '2.1rem', fs: '1.06rem' },
};

/* ═══════════════ DB rows → app objects ═══════════════ */

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** settings rows [{key, value}] → camelCase settings object. */
export function settingsFromRows(rows, base = defaultSettings()) {
  const m = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
  const out = { ...base };
  if (m.cafe_name != null)   out.cafeName   = m.cafe_name;
  if (m.cafe_name_ar != null) out.cafeName_ar = m.cafe_name_ar;
  if (m.slogan != null)      out.slogan     = m.slogan;
  if (m.slogan_ar != null)   out.slogan_ar  = m.slogan_ar;
  if (m.description != null) out.description = m.description;
  if (m.description_ar != null) out.description_ar = m.description_ar;
  if (m.copyright != null)   out.copyright  = m.copyright;
  if (m.copyright_ar != null) out.copyright_ar = m.copyright_ar;
  if (m.logo_url != null)    out.logoUrl    = m.logo_url;
  if (m.favicon_url != null) out.faviconUrl = m.favicon_url;
  if (m.currency != null)    out.currency   = m.currency || base.currency;
  if (m.features != null) {
    try {
      const f = JSON.parse(m.features);
      out.features = {
        ordering:     f.ordering !== false,
        // v5: delivery-only platform — the legacy flag is parsed
        // (old rows still carry it) but can never switch back on.
        reservations: false,
        delivery:     f.delivery !== false,
      };
    } catch { /* keep defaults */ }
  }
  if (m.business_todo != null) {
    try {
      const t = JSON.parse(m.business_todo);
      out.businessTodo = Array.isArray(t)
        ? t.filter((x) => x && typeof x.text === 'string')
             .map((x) => ({ text: x.text, done: x.done === true }))
        : [];
    } catch { /* keep defaults */ }
  }
  return out;
}

/** settings object → rows for upsert. */
export function settingsToRows(s) {
  const rows = [
    { key: 'cafe_name',   value: String(s.cafeName ?? '').slice(0, 80) },
    { key: 'slogan',      value: String(s.slogan ?? '').slice(0, 160) },
    { key: 'slogan_ar',   value: String(s.slogan_ar ?? '').slice(0, 160) },
    { key: 'description', value: String(s.description ?? '').slice(0, 1000) },
    { key: 'description_ar', value: String(s.description_ar ?? '').slice(0, 1000) },
    { key: 'copyright',   value: String(s.copyright ?? '').slice(0, 200) },
    { key: 'copyright_ar', value: String(s.copyright_ar ?? '').slice(0, 200) },
    { key: 'logo_url',    value: String(s.logoUrl ?? '').slice(0, 500) },
    { key: 'favicon_url', value: String(s.faviconUrl ?? '').slice(0, 500) },
    { key: 'currency',    value: String(s.currency ?? 'EGP').slice(0, 12) },
    {
      key: 'features',
      value: JSON.stringify({
        ordering:     s.features?.ordering !== false,
        reservations: false,
        delivery:     s.features?.delivery !== false,
      }),
    },
  ];
  // the business checklist is saved separately (Admin → Settings),
  // but settingsToRows must never DESTROY it when the customizer saves.
  if (s.businessTodo !== undefined) {
    rows.push({ key: 'business_todo', value: JSON.stringify(s.businessTodo ?? []).slice(0, 1900) });
  }
  return rows;
}

/** website_theme rows [{key, value(jsonb)}] → deep theme object (group rows deep-merged). */
export function themeFromRows(rows, base = defaultTheme()) {
  const out = structuredClone(base);
  for (const { key, value } of rows || []) {
    if (isObj(value) && isObj(out[key])) Object.assign(out[key], value);
  }
  return out;
}

/** theme object → rows for upsert (one row per group). */
export function themeToRows(theme) {
  return Object.entries(theme)
    .filter(([, v]) => isObj(v))
    .map(([key, value]) => ({ key, value }));
}

/** website_content rows → content object. */
export function contentFromRows(rows, base = defaultContent()) {
  const out = structuredClone(base);
  for (const { key, value } of rows || []) {
    if (value === undefined || value === null) continue;
    if (isObj(value) && isObj(out[key])) Object.assign(out[key], value);
    else out[key] = value;
  }
  return out;
}

/** content object → rows for upsert. */
export function contentToRows(content) {
  return Object.entries(content).map(([key, value]) => ({ key, value }));
}

/** website_sections rows → ordered, sanitised section list. */
export function sectionsFromRows(rows, base = defaultSections()) {
  if (!rows?.length) return structuredClone(base);
  const clean = rows.map((r, i) => ({
    id:       String(r.id),
    label:    r.label ?? r.id,
    position: Number.isFinite(+r.position) ? +r.position : i * 10,
    visible:  r.visible !== false,
  }));
  clean.sort((a, b) => a.position - b.position);
  return clean;
}

/* ═══════════════ misc helpers shared by all apps ═══════════════ */

/** "#rrggbb" + opacity% → "rgba(r,g,b,α)" (nav bg, hero overlay…). */
export function hexToRgba(hex, opacity = 100) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return String(hex);
  const n = parseInt(m[1], 16);
  const a = Math.max(0, Math.min(100, +opacity)) / 100;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${+a.toFixed(3)})`;
}

/** Load a Google Font at most once per page (dynamic font picker). */
const loadedFonts = new Set();
export function ensureFontLoaded(family) {
  if (!family || !GOOGLE_FONTS.includes(family) || loadedFonts.has(family)) return;
  loadedFonts.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=' +
    encodeURIComponent(family).replace(/%20/g, '+') +
    ':ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&display=swap';
  document.head.appendChild(link);
}
