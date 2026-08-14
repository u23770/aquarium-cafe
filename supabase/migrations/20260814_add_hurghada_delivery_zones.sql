-- ============================================================
-- Aquarium Cafe — Hurghada delivery areas
-- Adds the supplied Hurghada delivery areas to the existing
-- delivery_zones table.
--
-- IMPORTANT:
-- * Existing zones are NOT duplicated and their current fees are
--   NOT changed.
-- * New zones inherit the CURRENT global delivery fee from
--   delivery_settings.config.fee (30 EGP in the supplied schema).
-- * Admin can change each zone's fee later from Admin → Zones.
-- * All areas are enabled for delivery by default.
-- * Safe to run more than once.
-- ============================================================

BEGIN;

WITH supplied(name_en, name_ar, requested_order) AS (
  VALUES
    ('El Hadaba', 'الهضبة', 1),
    ('Brands Mall', 'براندز مول', 2),
    ('Al Ahya''a Police Station', 'مركز شرطة الأحياء', 3),
    ('Al Dahar', 'الدهار', 4),
    ('El Centre Eliby', 'المركز الليبي', 5),
    ('Abo Nawas', 'أبو نواس', 6),
    ('Arabia Area', 'منطقة عربية', 7),
    ('Al Fayrouz', 'الفيروز', 8),
    ('Hawaii Riviera Aqua Park', 'حديقة هاواي ريفيرا المائية', 9),
    ('El Dary Jouhina', 'الداري جهينه', 10),
    ('El Nagda Buildings', 'عمارات النجدة', 11),
    ('Zahabia', 'ذهبيه', 12),
    ('El Gama''a', 'الجامعة', 13),
    ('El Batros Resort', 'منتجع البتروس', 14),
    ('Sheraton', 'شيراتون', 15),
    ('El-Kothar', 'الكوثر', 16),
    ('The Beach Resort', 'منتجع الشاطئ', 17),
    ('Soma Bay', 'خليج سوما', 18),
    ('Mubark 11', 'مبارك 11', 19),
    ('El Hegaz', 'الحجاز', 20),
    ('El Helal', 'منطقة الهلال', 21),
    ('Aquarium', 'حوض سمك', 22),
    ('Marine Sports Club', 'نادي الرياضات البحرية', 23),
    ('Makadi Bay', 'خليج مكادي', 24),
    ('Long Beach Resort', 'قرية لونج بيتش', 25),
    ('Hay El Arab', 'حي العرب', 26),
    ('Al Quraa Area', 'منطقه القري', 27),
    ('Evangelical Church', 'الكنيسة الانجيلية', 28),
    ('Intercontinental District', 'منطقة انتركونتيننتال', 29),
    ('El Sakallah Square', 'ميدان السقالة', 30),
    ('Masaken El Nagda', 'مساكن النجدة', 31),
    ('Hurghada Airport', 'مطار الغردقه', 32),
    ('Mubark 7', 'مبارك 7', 33),
    ('Palm Beach Resort', 'منتجع بالم بيتش', 34),
    ('El Wafaa', 'الوفاء', 35),
    ('Grand Aquarium', 'جراند اكواريم', 36),
    ('Hafr El Batn', 'حفر البطن', 37),
    ('Senzo Mall', 'مول سينزو', 38),
    ('Sahl Hashish', 'سهل حشيش', 39),
    ('El Ahia` area', 'منطقة الأحياء', 40)
),
config AS (
  SELECT COALESCE((value ->> 'fee')::numeric, 0) AS global_fee
  FROM public.delivery_settings
  WHERE key = 'config'
  LIMIT 1
),
missing AS (
  SELECT
    s.name_en,
    s.name_ar,
    s.requested_order,
    COALESCE((SELECT global_fee FROM config), 0)::numeric(10,2) AS fee
  FROM supplied s
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.delivery_zones z
    WHERE lower(trim(z.name_en)) = lower(trim(s.name_en))
  )
),
base AS (
  SELECT COALESCE(MAX(sort_order), 0) AS max_order
  FROM public.delivery_zones
)
INSERT INTO public.delivery_zones
  (name_en, name_ar, fee, free_above, active, sort_order)
SELECT
  m.name_en,
  m.name_ar,
  m.fee,
  0,
  true,
  base.max_order + ROW_NUMBER() OVER (ORDER BY m.requested_order)
FROM missing m
CROSS JOIN base;

COMMIT;

-- Verification:
-- SELECT id, name_en, name_ar, fee, active, sort_order
-- FROM public.delivery_zones
-- ORDER BY sort_order, id;
