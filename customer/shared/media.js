// ============================================================
//  Aquarium Cafe & Resturant — image helpers shared by the three apps
// ------------------------------------------------------------
//  The `image` column stores either:
//    · a bundled path  "images/espresso.webp"  (ships in customer/images)
//    · a full Supabase Storage public URL      (uploaded in the admin)
//  resolveImage() turns both into a URL usable from ANY app.
// ============================================================
import { CUSTOMER_BASE } from './config.js';

export const isExternalUrl = (s = '') => /^https?:\/\//i.test(String(s));

export function resolveImage(path = '') {
  if (!path) return '';
  if (isExternalUrl(path)) return path;
  const base = CUSTOMER_BASE.replace(/\/+$/, '');
  return `${base}/${String(path).replace(/^\/+/, '')}`;
}

/** Extract { bucket, path } from a Supabase public storage URL (else null). */
export function storagePathFromUrl(url) {
  try {
    const m = new URL(url).pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    return m ? { bucket: m[1], path: decodeURIComponent(m[2]) } : null;
  } catch {
    return null;
  }
}
