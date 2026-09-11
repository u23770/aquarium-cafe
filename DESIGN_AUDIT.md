# Aquarium Cafe — Visual Design Audit

Date: 2026-09-11
Scope: customer, admin, waiter visual systems. Functional/business logic intentionally excluded from redesign.

## Audit summary

### P0 — Public customer experience
- Header had accumulated responsive overrides and needed a single consistent visual layer.
- Mobile hero had too much competing visual weight: large title, long paragraph, CTA, stats and the floating tracking control all competed for attention.
- Hero overlay needed stronger directional contrast so text remains readable over the terrace image.
- Menu cards were visually solid but could use tighter hierarchy, cleaner separators and more consistent mobile density.
- Gallery, contact cards and reviews could use a more unified elevation/border language.
- Checkout/tracking/cart surfaces needed stronger modal/drawer depth and mobile safe-area handling.
- Empty reviews state needed to remain honest and avoid implying a review volume that does not exist.
- Arabic/RTL needed the same visual treatment, especially hero alignment, overlays and physically positioned controls.

### P1 — Interaction polish
- Focus-visible treatment was inconsistent across the customer surface.
- Floating tracking pill needed safer positioning around mobile browser/gesture areas.
- Modal/drawer backdrop and elevation could be more consistent.
- Mobile spacing needed tighter breakpoints for narrow Android screens.

### P2 — Operations surfaces
- Admin and waiter styles were audited. They already have coherent sea/cream tokens, responsive tables, status pills, cards, modals, and mobile layouts.
- No wholesale redesign was justified; operational screens should prioritize scanability and stability over decorative changes.

## Implemented

1. Added `customer/css/design-polish.css` as a design-only override layer.
2. Loaded the layer from `customer/js/main.js` without changing business logic or page IDs.
3. Refined navbar chrome, hero hierarchy/overlay, menu cards/tools/chips, gallery, about/contact, footer, cart, modals, checkout and tracking.
4. Added consistent `:focus-visible` styling.
5. Added mobile safe-area handling for the tracking pill/footer.
6. Added explicit RTL visual balancing for the hero and relevant surfaces.
7. Kept the existing theme/customizer system intact; the new layer consumes the existing CSS variables rather than replacing them.
8. Kept admin/waiter functional styling untouched after audit because their current visual systems are already consistent.

## Explicit non-goals

- No database schema changes.
- No order/checkout/auth logic changes.
- No Supabase RPC changes.
- No route/URL changes.
- No replacement of `customer/css/style.css`.
- No fabricated review content or review counts.
