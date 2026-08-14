# VAT checkout update

- Added 14% VAT line to delivery checkout and order confirmation.
- Menu VAT notice now says: “14% VAT will be added.” / “يضاف 14% ضريبة قيمة مضافة”.
- Server-side `place_delivery_order` now calculates VAT at 14% on the net taxable item amount after discounts and loyalty redemption, excluding delivery.
- Added `delivery_orders.vat_amount` and returned `vatAmount` from the RPC.
- Menu item prices are unchanged.

For an existing Supabase database, run:
`supabase/migrations/20260813_add_vat_to_delivery_orders.sql`

- Customer install button: added visible bilingual label (English: Click to install / Arabic: انقر للتحميل).
