-- Aquarium Cafe — Hurghada delivery areas
-- Safe/idempotent seed: existing zones with the same slug are left untouched.
BEGIN;

INSERT INTO public.delivery_zones (name_en, name_ar, fee, free_above, active, sort_order)
SELECT v.name_en, v.name_ar, 0, 0, true, v.sort_order
FROM (VALUES
 ('El Hadaba','الهضبة',1),('Brands Mall','براندز مول',2),('Al Ahya''a Police Station','مركز شرطة الأحياء',3),('Al Dahar','الدهار',4),
 ('El Centre Eliby','المركز الليبي',5),('Abo Nawas','أبو نواس',6),('Arabia Area','منطقة عربية',7),('Al Fayrouz','الفيروز',8),
 ('Hawaii Riviera Aqua Park','حديقة هاواي ريفيرا المائية',9),('El Dary Jouhina','الداري جهينه',10),('El Nagda Buildings','عمارات النجدة',11),('Zahabia','ذهبيه',12),
 ('El Gama''a','الجامعة',13),('El Batros Resort','منتجع البتروس',14),('Sheraton','شيراتون',15),('El-Kothar','الكوثر',16),
 ('The Beach Resort','منتجع الشاطئ',17),('Soma Bay','خليج سوما',18),('Mubark 11','مبارك 11',19),('El Hegaz','الحجاز',20),
 ('El Helal','منطقة الهلال',21),('Aquarium','حوض سمك',22),('Marine Sports Club','نادي الرياضات البحرية',23),('Makadi Bay','خليج مكادي',24),
 ('Long Beach Resort','قرية لونج بيتش',25),('Hay El Arab','حي العرب',26),('Al Quraa Area','منطقه القري',27),('Evangelical Church','الكنيسة الانجيلية',28),
 ('Intercontinental District','منطقة انتركونتيننتال',29),('El Sakallah Square','ميدان السقالة',30),('Masaken El Nagda','مساكن النجدة',31),('Hurghada Airport','مطار الغردقه',32),
 ('Mubark 7','مبارك 7',33),('Palm Beach Resort','منتجع بالم بيتش',34),('El Wafaa','الوفاء',35),('Grand Aquarium','جراند اكواريم',36),
 ('Hafr El Batn','حفر البطن',37),('Senzo Mall','مول سينزو',38),('Sahl Hashish','سهل حشيش',39),('El Ahia` area','منطقة الأحياء',40)
) AS v(name_en,name_ar,sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.delivery_zones z WHERE lower(trim(z.name_en)) = lower(trim(v.name_en))
);

COMMIT;
