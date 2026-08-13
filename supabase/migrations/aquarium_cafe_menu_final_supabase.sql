-- Aquarium Cafe menu data migration compatible with the project's schema.sql
-- Preserves the supplied Arabic/English menu names, descriptions and prices.
-- Multi-tier prices are additionally preserved in public.products.prices.
-- This file ONLY adds menu data; it does not drop or recreate project tables.

BEGIN;

-- Preserve S/D/T or D/Q price structures without breaking the project's required numeric price column.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS prices JSONB;

-- 1) Categories
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Sandwiches', 'الساندويتش', 'sandwiches', true, 1)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Burger', 'البرجر', 'burger', true, 2)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Fried Chicken', 'فرايد تشيكن', 'fried-chicken', true, 3)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Sauces', 'الصوصات', 'sauces', true, 4)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Hot drinks', 'مشروبات ساخنة', 'hot-drinks', true, 5)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Oriental Drinks', 'مشروبات شرقية', 'oriental-drinks', true, 6)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Cold Drinks', 'مشروبات باردة', 'cold-drinks', true, 7)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Iced Drinks', 'مشروبات مثلجه', 'iced-drinks', true, 8)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Matcha', 'ماتشا', 'matcha', true, 9)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('RedBull Cocktail', 'ريدبول كوكتيلات', 'redbull-cocktail', true, 10)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Fresh Juices', 'عصائر فريش', 'fresh-juices', true, 11)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Soda Cocktails', 'صودا كوكتيل', 'soda-cocktails', true, 12)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Cocktails', 'كوكتيلات', 'cocktails', true, 13)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Smoothie', 'سموزي', 'smoothie', true, 14)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Soups & Appetizers', 'الشوربة والمقبلات', 'soups-appetizers', true, 15)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Salads', 'السلطات', 'salads', true, 16)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Main Courses', 'الأطباق الرئيسية', 'main-courses', true, 17)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Pasta', 'الباستا', 'pasta', true, 18)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Pizza', 'البيتزا', 'pizza', true, 19)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Desserts, Crepes & Waffles', 'الحلويات والكريب والوافل', 'desserts-crepes-waffles', true, 20)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.categories (name, name_ar, slug, visible, sort_order)
VALUES ('Milkshakes & Yogurt Drinks', 'ميلك شيك وزبادوه', 'milkshakes-yogurt-drinks', true, 21)
ON CONFLICT (slug) DO NOTHING;

-- 2) Products
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Meat Hawawshi with mozzarella', 'حواوشي لحمة بالموزاريلا', 'Egyptian bread filled with minced meat covered by mozzarella cheese, green pepper and tomato', 'عيش بلدي محشي لحمة مفرومة ومغطى بالموزاريلا والفلفل والطماطم', 180.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Meat Hawawshi with mozzarella' AND p.name_ar = 'حواوشي لحمة بالموزاريلا');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Fillet Steak with Cheese', 'فيلييه تشيز ستيك', 'Beef fillet slices with cheddar cheese and Bell peppers and mushrooms', 'شرائح لحمة الفيلييه مع الجبنة الشيدر مع فلفل ألوان ومشروم', 190.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Fillet Steak with Cheese' AND p.name_ar = 'فيلييه تشيز ستيك');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Kofta', 'كفته', '', '', 170.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Kofta' AND p.name_ar = 'كفته');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Meat Shawarma', 'شاورما لحمه', '', '', 185.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Meat Shawarma' AND p.name_ar = 'شاورما لحمه');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Oriental Sausage', 'سجق شرقى', '', '', 180.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Oriental Sausage' AND p.name_ar = 'سجق شرقى');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Alexandrian liver', 'كبده أسكندراني', '', '', 135.00, true, false, 6, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Alexandrian liver' AND p.name_ar = 'كبده أسكندراني');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Bread with minced meat', 'عيش باللحمة المفرومة', '', '', 190.00, true, false, 7, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Bread with minced meat' AND p.name_ar = 'عيش باللحمة المفرومة');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Crock Misyou', 'كروك مسيو', 'toast bread, Smoked Turkey, butter and mustard', 'عيش توست مع تركى مدخن و زبدة ومسطردة', 155.00, true, false, 8, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Crock Misyou' AND p.name_ar = 'كروك مسيو');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Roast beef', 'روزبيف', 'roast beef, cheddar slice, lettuce and tomato', 'روزبيف مع شريحة الشيدر والخس والطماطم', 160.00, true, false, 9, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Roast beef' AND p.name_ar = 'روزبيف');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Aquarium Rocket', 'صاروخ اكواريوم', 'chicken-salami-sausage-hotdog-Bell peppers and mushrooms', 'فراخ - سلامي - سجق - هوت دوج - فلفل ألوان - مشروم', 200.00, true, false, 10, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Aquarium Rocket' AND p.name_ar = 'صاروخ اكواريوم');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Chicken Roll', 'فراخ رول', 'Chicken-smoked turkey-mozzarella-salami', 'فراخ - تركي - موزاريلا - سلامي', 195.00, true, false, 11, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Chicken Roll' AND p.name_ar = 'فراخ رول');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Club Sandwich', 'كلوب ساندويتش', '', '', 185.00, true, false, 12, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Club Sandwich' AND p.name_ar = 'كلوب ساندويتش');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Chicken Pane', 'فراخ بانيه', '', '', 175.00, true, false, 13, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Chicken Pane' AND p.name_ar = 'فراخ بانيه');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Chicken Strips', 'تشيكن ستربس', '', '', 180.00, true, false, 14, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Chicken Strips' AND p.name_ar = 'تشيكن ستربس');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Shish Tawook', 'شيش طاووك', '', '', 170.00, true, false, 15, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Shish Tawook' AND p.name_ar = 'شيش طاووك');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Chicken Fajita', 'فاهيتا فراخ', '', '', 170.00, true, false, 16, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Chicken Fajita' AND p.name_ar = 'فاهيتا فراخ');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Chicken Shawarma', 'شاورما فراخ', '', '', 170.00, true, false, 17, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Chicken Shawarma' AND p.name_ar = 'شاورما فراخ');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'MEXICAN SHRIMP OR FRIED', 'جمبري مكسيكي أو فرايد', '', '', 195.00, true, false, 18, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'MEXICAN SHRIMP OR FRIED' AND p.name_ar = 'جمبري مكسيكي أو فرايد');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'MEXICAN OR FRIED CALAMARI', 'كاليماري مكسيكي أو فرايد', '', '', 190.00, true, false, 19, NULL
FROM public.categories c
WHERE c.slug = 'sandwiches'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'MEXICAN OR FRIED CALAMARI' AND p.name_ar = 'كاليماري مكسيكي أو فرايد');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Classic Burger', 'كلاسيك برجر', 'Beef burger with lettuce and tomato', 'برجر بقرى مع خس وطماطم', 0.00, true, false, 1, '{"S": 180, "D": 310, "T": 460}'::jsonb
FROM public.categories c
WHERE c.slug = 'burger'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Classic Burger' AND p.name_ar = 'كلاسيك برجر');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Big Tasty Burger', 'برجر بيج تيستي', 'Beef Burger with lettuce, tomato and big tasty sauce', 'برجر بقرى مع خس وطماطم و صوص البيج تيستي', 0.00, true, false, 2, '{"S": 185, "D": 320, "T": 490}'::jsonb
FROM public.categories c
WHERE c.slug = 'burger'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Big Tasty Burger' AND p.name_ar = 'برجر بيج تيستي');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Cheese Burger', 'تشيز برجر', 'Beef Burger with lettuce, tomato, cheddar cheese slice', 'برجر بقرى مع خس وطماطم و شريحة الجبنة الشيدر', 0.00, true, false, 3, '{"S": 190, "D": 320, "T": 490}'::jsonb
FROM public.categories c
WHERE c.slug = 'burger'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Cheese Burger' AND p.name_ar = 'تشيز برجر');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Fire Burger', 'فاير برجر', 'Beef Burger with lettuce, tomato, Fire sauce jalapeno and smoked beef', 'برجر بقرى مع خس وطماطم و صوص الفاير والهالابينو والبيف المدخن', 0.00, true, false, 4, '{"S": 195, "D": 350, "T": 520}'::jsonb
FROM public.categories c
WHERE c.slug = 'burger'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Fire Burger' AND p.name_ar = 'فاير برجر');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Smokey Burger', 'سموكي برجر', 'Beef Burger with lettuce, tomato, ranch sauce, smoked turkey, fried onion, and cheddar cheese', 'برجر بقرى مع خس وطماطم و صوص الرانش وتركى مدخن وبصل فرايد والجبنة الشيدر', 0.00, true, false, 5, '{"S": 195, "D": 360, "T": 530}'::jsonb
FROM public.categories c
WHERE c.slug = 'burger'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Smokey Burger' AND p.name_ar = 'سموكي برجر');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Mush Burger', 'ماش برجر', 'Beef Burger with lettuce, tomato, mushroom sauce', 'برجر بقرى مع خس وطماطم و صوص المشروم', 0.00, true, false, 6, '{"S": 200, "D": 350, "T": 540}'::jsonb
FROM public.categories c
WHERE c.slug = 'burger'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Mush Burger' AND p.name_ar = 'ماش برجر');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Cowboy Burger', 'كاوبوي برجر', 'Beef Burger with lettuce, tomato, cowboy sauce, Roast beef, colored pepper, and mayonnaise', 'برجر بقرى مع خس وطماطم و صوص الكاوبوى وروزبيف وفلفل الوان والمايونيز', 0.00, true, false, 7, '{"S": 195, "D": 355, "T": 530}'::jsonb
FROM public.categories c
WHERE c.slug = 'burger'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Cowboy Burger' AND p.name_ar = 'كاوبوي برجر');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Aquarium Burger', 'اكوار يوم برجر', 'Beef Burger with lettuce, tomato, thousand island sauce Salami, mozzarella fried, and cheddar cheese', 'برجر بقرى مع خس وطماطم و صوص الثاوساند ايلاند و السلامي والموزاريلا فرايد والجبنة الشيدر', 0.00, true, false, 8, '{"S": 205, "D": 380, "T": 580}'::jsonb
FROM public.categories c
WHERE c.slug = 'burger'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Aquarium Burger' AND p.name_ar = 'اكوار يوم برجر');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Chicken Asso', 'تشيكن أسو', 'chicken crispy with lettuce, tomato, ranch sauce, fried onion and cheddar cheese', 'فراخ كرسبي مع خس وطماطم و صوص الرانش و بصل فرايد والجبنة الشيدر', 0.00, true, false, 1, '{"S": 180, "D": 320, "T": 480}'::jsonb
FROM public.categories c
WHERE c.slug = 'fried-chicken'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Chicken Asso' AND p.name_ar = 'تشيكن أسو');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Chilly Chicken', 'شيلي تشيكن', 'chicken crispy with lettuce, tomato, chilly sauce, jalapeno, roast beef and cheddar cheese', 'فراخ كرسبي مع خس وطماطم و صوص الشيلي والهالابينو وروزبيف والجبنة الشيدر', 0.00, true, false, 2, '{"S": 185, "D": 330, "T": 500}'::jsonb
FROM public.categories c
WHERE c.slug = 'fried-chicken'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Chilly Chicken' AND p.name_ar = 'شيلي تشيكن');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Chicken Crispy', 'تشيكن كرسبي', 'chicken crispy with lettuce, tomato ranch sauce, smoked turkey and cheddar cheese', 'فراخ كرسبي مع خس وطماطم و صوص الرانش والتركي المدخن والجبنة الشيدر', 0.00, true, false, 3, '{"S": 185, "D": 330, "T": 500}'::jsonb
FROM public.categories c
WHERE c.slug = 'fried-chicken'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Chicken Crispy' AND p.name_ar = 'تشيكن كرسبي');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Cheesy Chicken', 'تشيزي تشيكن', 'chicken crispy with lettuce, tomato, thousand island sauce fried mozzarella, fried onion and cheddar cheese', 'فراخ كرسبي مع خس وطماطم و صوص الثاوساند ايلاند وموزاريلا فرايد و بصل فرايد والجبنة الشيدر', 0.00, true, false, 4, '{"S": 200, "D": 360, "T": 550}'::jsonb
FROM public.categories c
WHERE c.slug = 'fried-chicken'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Cheesy Chicken' AND p.name_ar = 'تشيزي تشيكن');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Aquarium Supreme', 'أكواريوم سوبريم', 'chicken crispy with lettuce, tomato, thousand island and honey mustard sauce, salami, roast beef colored pepper and cheddar cheese', 'فراخ كرسبي مع خس وطماطم و صوص الثاوساند ايلاند والمسطردة بالعسل وسلامي و روزبيف وفلفل الوان والجبنة الشيدر', 0.00, true, false, 5, '{"S": 195, "D": 360, "T": 540}'::jsonb
FROM public.categories c
WHERE c.slug = 'fried-chicken'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Aquarium Supreme' AND p.name_ar = 'أكواريوم سوبريم');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Aquarium Big Boom', 'أكواريوم بيج بووم', 'chicken crispy and beef burger with lettuce, tomato, thousand island, smoked turkey, roast beef and cheddar cheese', 'فراخ كرسبي وبرجر بقرى مع خس وطماطم و صوص التاوساند ايلاند وتركى مدخن و روز بيف والجبنة الشيدر', 0.00, true, false, 6, '{"D": 580, "Q": 690}'::jsonb
FROM public.categories c
WHERE c.slug = 'fried-chicken'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Aquarium Big Boom' AND p.name_ar = 'أكواريوم بيج بووم');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Chilli Sauce', 'شيلي صوص', '', '', 50.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'sauces'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Chilli Sauce' AND p.name_ar = 'شيلي صوص');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Fire Sauce', 'فاير صوص', '', '', 50.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'sauces'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Fire Sauce' AND p.name_ar = 'فاير صوص');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Cheddar Sauce', 'شيدر صوص', '', '', 50.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'sauces'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Cheddar Sauce' AND p.name_ar = 'شيدر صوص');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Thousand island Sauce', 'ثاوساند ايلاند صوص', '', '', 50.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'sauces'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Thousand island Sauce' AND p.name_ar = 'ثاوساند ايلاند صوص');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Ranch Sauce', 'رانش صوص', '', '', 50.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'sauces'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Ranch Sauce' AND p.name_ar = 'رانش صوص');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'BBQ Sauce', 'باربيكيو صوص', '', '', 50.00, true, false, 6, NULL
FROM public.categories c
WHERE c.slug = 'sauces'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'BBQ Sauce' AND p.name_ar = 'باربيكيو صوص');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Mayo Sauce', 'مايو صوص', '', '', 50.00, true, false, 7, NULL
FROM public.categories c
WHERE c.slug = 'sauces'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Mayo Sauce' AND p.name_ar = 'مايو صوص');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Honey Mustard Sauce', 'صوص المسطردة بالعسل', '', '', 50.00, true, false, 8, NULL
FROM public.categories c
WHERE c.slug = 'sauces'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Honey Mustard Sauce' AND p.name_ar = 'صوص المسطردة بالعسل');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Espresso', 'أسبرسو', '', '', 62.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Espresso' AND p.name_ar = 'أسبرسو');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Double Espresso', 'أسبرسو دوبل', '', '', 75.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Double Espresso' AND p.name_ar = 'أسبرسو دوبل');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Espresso macchiato', 'أسبرسو ميكاتو', '', '', 75.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Espresso macchiato' AND p.name_ar = 'أسبرسو ميكاتو');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Cappuccino', 'كابتشينو', '', '', 85.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Cappuccino' AND p.name_ar = 'كابتشينو');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'American Coffee', 'أمريكان كوفي', '', '', 85.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'American Coffee' AND p.name_ar = 'أمريكان كوفي');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Coffee Latte', 'لاتيه', '', '', 85.00, true, false, 6, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Coffee Latte' AND p.name_ar = 'لاتيه');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Mocha', 'موكا', '', '', 85.00, true, false, 7, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Mocha' AND p.name_ar = 'موكا');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Honey Coffee', 'كوفى عسل', '', '', 75.00, true, false, 8, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Honey Coffee' AND p.name_ar = 'كوفى عسل');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Nescafe with milk', 'نسكافيه بالحليب', '', '', 65.00, true, false, 9, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Nescafe with milk' AND p.name_ar = 'نسكافيه بالحليب');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Nescafe', 'نسكافيه', '', '', 55.00, true, false, 10, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Nescafe' AND p.name_ar = 'نسكافيه');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Hot Chocolate', 'هوت شوكلت', '', '', 70.00, true, false, 11, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Hot Chocolate' AND p.name_ar = 'هوت شوكلت');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Nutella with milk', 'نوتيلا بالحليب', '', '', 70.00, true, false, 12, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Nutella with milk' AND p.name_ar = 'نوتيلا بالحليب');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Turkish coffee', 'قهوه تركي', '', '', 45.00, true, false, 13, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Turkish coffee' AND p.name_ar = 'قهوه تركي');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Double Turkish coffee', 'قهوه تركي دوبل', '', '', 60.00, true, false, 14, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Double Turkish coffee' AND p.name_ar = 'قهوه تركي دوبل');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'French coffee', 'قهوه فرنساوي', '', '', 55.00, true, false, 15, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'French coffee' AND p.name_ar = 'قهوه فرنساوي');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Double French coffee', 'قهوه فرنساوي دوبل', '', '', 65.00, true, false, 16, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Double French coffee' AND p.name_ar = 'قهوه فرنساوي دوبل');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Turkish coffee with Flavors (Choclate-Vanilla-Hazelnut-Caramel)', 'قهوه تركى نكهات (شيكولاته-فانيليا-بندق-كراميل)', '', '', 60.00, true, false, 17, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Turkish coffee with Flavors (Choclate-Vanilla-Hazelnut-Caramel)' AND p.name_ar = 'قهوه تركى نكهات (شيكولاته-فانيليا-بندق-كراميل)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Tea', 'شاي', '', '', 35.00, true, false, 18, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Tea' AND p.name_ar = 'شاي');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Green Tea', 'شاي اخضر', '', '', 40.00, true, false, 19, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Green Tea' AND p.name_ar = 'شاي اخضر');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Tea Pot', 'شاي براد', '', '', 50.00, true, false, 20, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Tea Pot' AND p.name_ar = 'شاي براد');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Tea with milk', 'شاي بالحليب', '', '', 55.00, true, false, 21, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Tea with milk' AND p.name_ar = 'شاي بالحليب');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Tea with flavors (Peach-Mango-Jasmine-Berry)', 'شاي نكهات (خوخ-مانجو-ياسمين-توت)', '', '', 40.00, true, false, 22, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Tea with flavors (Peach-Mango-Jasmine-Berry)' AND p.name_ar = 'شاي نكهات (خوخ-مانجو-ياسمين-توت)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Flavors (Choclate-Vanilla-Hazelnut-Caramel)', 'فلفر (شيكولاته-فانيليا-بندق-كراميل)', '', '', 25.00, true, false, 23, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Flavors (Choclate-Vanilla-Hazelnut-Caramel)' AND p.name_ar = 'فلفر (شيكولاته-فانيليا-بندق-كراميل)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'FLAT WHITE', 'فلات وايت', '', '', 85.00, true, false, 24, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'FLAT WHITE' AND p.name_ar = 'فلات وايت');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'CORTADO', 'كورتادو', '', '', 85.00, true, false, 25, NULL
FROM public.categories c
WHERE c.slug = 'hot-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'CORTADO' AND p.name_ar = 'كورتادو');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Cinnamon', 'قرفه', '', '', 45.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'oriental-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Cinnamon' AND p.name_ar = 'قرفه');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Ginger', 'جنزبيل', '', '', 45.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'oriental-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Ginger' AND p.name_ar = 'جنزبيل');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Cinnamon with milk', 'قرفه بالحليب', '', '', 50.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'oriental-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Cinnamon with milk' AND p.name_ar = 'قرفه بالحليب');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Ginger with milk', 'جنزبيل بالحليب', '', '', 50.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'oriental-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Ginger with milk' AND p.name_ar = 'جنزبيل بالحليب');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Cinnamon with Ginger and milk 40', 'قرفه جنزبيل بالحليب', '', '', 60.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'oriental-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Cinnamon with Ginger and milk 40' AND p.name_ar = 'قرفه جنزبيل بالحليب');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Fenugreek', 'حلبه', '', '', 40.00, true, false, 6, NULL
FROM public.categories c
WHERE c.slug = 'oriental-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Fenugreek' AND p.name_ar = 'حلبه');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Anise', 'ينسون', '', '', 40.00, true, false, 7, NULL
FROM public.categories c
WHERE c.slug = 'oriental-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Anise' AND p.name_ar = 'ينسون');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Mint', 'نعناع', '', '', 40.00, true, false, 8, NULL
FROM public.categories c
WHERE c.slug = 'oriental-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Mint' AND p.name_ar = 'نعناع');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Hibiscus Tea', 'كركديه ساخن', '', '', 40.00, true, false, 9, NULL
FROM public.categories c
WHERE c.slug = 'oriental-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Hibiscus Tea' AND p.name_ar = 'كركديه ساخن');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Hot Lemon', 'ليمون ساخن', '', '', 45.00, true, false, 10, NULL
FROM public.categories c
WHERE c.slug = 'oriental-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Hot Lemon' AND p.name_ar = 'ليمون ساخن');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Herbs cocktail', 'كوكتيل أعشاب', '', '', 65.00, true, false, 11, NULL
FROM public.categories c
WHERE c.slug = 'oriental-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Herbs cocktail' AND p.name_ar = 'كوكتيل أعشاب');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Hummus Al Sham', 'حمص الشام', '', '', 60.00, true, false, 12, NULL
FROM public.categories c
WHERE c.slug = 'oriental-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Hummus Al Sham' AND p.name_ar = 'حمص الشام');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Sahlab with nuts', 'سحلب مكسرات', '', '', 75.00, true, false, 13, NULL
FROM public.categories c
WHERE c.slug = 'oriental-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Sahlab with nuts' AND p.name_ar = 'سحلب مكسرات');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Sahlab with fruits', 'سحلب فواكه', '', '', 90.00, true, false, 14, NULL
FROM public.categories c
WHERE c.slug = 'oriental-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Sahlab with fruits' AND p.name_ar = 'سحلب فواكه');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Hot Cider (Apple-Orange)', 'هوت سيدر (تفاح-برتقال)', '', '', 70.00, true, false, 15, NULL
FROM public.categories c
WHERE c.slug = 'oriental-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Hot Cider (Apple-Orange)' AND p.name_ar = 'هوت سيدر (تفاح-برتقال)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Cola-Pepsi', 'كولا - بيبسي', '', '', 45.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'cold-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Cola-Pepsi' AND p.name_ar = 'كولا - بيبسي');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Fayrouz - Brill - Schweppes', 'فيروز - بريل - شويبس', '', '', 50.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'cold-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Fayrouz - Brill - Schweppes' AND p.name_ar = 'فيروز - بريل - شويبس');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'RedBull', 'ريد بول', '', '', 90.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'cold-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'RedBull' AND p.name_ar = 'ريد بول');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Sparkling water', 'مياه فوارة', '', '', 50.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'cold-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Sparkling water' AND p.name_ar = 'مياه فوارة');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Small water', 'مياه صغيره', '', '', 20.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'cold-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Small water' AND p.name_ar = 'مياه صغيره');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Large water', 'مياه كبيره', '', '', 35.00, true, false, 6, NULL
FROM public.categories c
WHERE c.slug = 'cold-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Large water' AND p.name_ar = 'مياه كبيره');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Iced Tea', 'أيس تي', '', '', 55.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'iced-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Iced Tea' AND p.name_ar = 'أيس تي');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Iced Coffee', 'أيس كوفي', '', '', 75.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'iced-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Iced Coffee' AND p.name_ar = 'أيس كوفي');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Iced Latte', 'أيس لاتيه', '', '', 80.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'iced-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Iced Latte' AND p.name_ar = 'أيس لاتيه');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Iced Mocha', 'أيس موكا', '', '', 90.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'iced-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Iced Mocha' AND p.name_ar = 'أيس موكا');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Iced Chocolate', 'أيس شوكلت', '', '', 80.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'iced-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Iced Chocolate' AND p.name_ar = 'أيس شوكلت');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Frappe', 'فرابيه', '', '', 90.00, true, false, 6, NULL
FROM public.categories c
WHERE c.slug = 'iced-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Frappe' AND p.name_ar = 'فرابيه');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Frappuccino', 'فرابتشينو', '', '', 95.00, true, false, 7, NULL
FROM public.categories c
WHERE c.slug = 'iced-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Frappuccino' AND p.name_ar = 'فرابتشينو');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Blue Tea (Flavored Tea+Blue Curacao Syrup+Milk Foam)', 'بلو تي (شاي نكهات+بلو كوراسوا+فوم لبن)', '', '', 70.00, true, false, 8, NULL
FROM public.categories c
WHERE c.slug = 'iced-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Blue Tea (Flavored Tea+Blue Curacao Syrup+Milk Foam)' AND p.name_ar = 'بلو تي (شاي نكهات+بلو كوراسوا+فوم لبن)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Flavors (Choclate-Vanilla-Hazelnut-Caramel)', 'فلفر (شيكولاته-فانيليا-بندق-كراميل)', '', '', 25.00, true, false, 9, NULL
FROM public.categories c
WHERE c.slug = 'iced-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Flavors (Choclate-Vanilla-Hazelnut-Caramel)' AND p.name_ar = 'فلفر (شيكولاته-فانيليا-بندق-كراميل)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'SPANISH LATTE', 'اسبانش لاتيه', '', '', 75.00, true, false, 10, NULL
FROM public.categories c
WHERE c.slug = 'iced-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'SPANISH LATTE' AND p.name_ar = 'اسبانش لاتيه');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Matcha Latte (Matcha+Milk+Ice)', 'ماتشا لاتيه (ماتشا+لبن+ثلج)', '', '', 85.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'matcha'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Matcha Latte (Matcha+Milk+Ice)' AND p.name_ar = 'ماتشا لاتيه (ماتشا+لبن+ثلج)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Matcha Espresso (Matcha+Espresso+Milk+Ice)', 'ماتشا اسبرسو (ماتشا+اسبرسو+لبن+ثلج)', '', '', 100.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'matcha'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Matcha Espresso (Matcha+Espresso+Milk+Ice)' AND p.name_ar = 'ماتشا اسبرسو (ماتشا+اسبرسو+لبن+ثلج)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Choco Matcha (Matcha+Chocolate+Caramel+Milk+Ice)', 'شوكو ماتشا (ماتشا+شيكولاته+كراميل+لبن+ثلج)', '', '', 90.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'matcha'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Choco Matcha (Matcha+Chocolate+Caramel+Milk+Ice)' AND p.name_ar = 'شوكو ماتشا (ماتشا+شيكولاته+كراميل+لبن+ثلج)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Green Matcha (Matcha+Honey+Lemon+Ice)', 'جرين ماتشا (ماتشا+عسل+ليمون+ثلج)', '', '', 90.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'matcha'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Green Matcha (Matcha+Honey+Lemon+Ice)' AND p.name_ar = 'جرين ماتشا (ماتشا+عسل+ليمون+ثلج)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Matcha Mocha (Matcha+Espresso+Chocolate+Milk+Ice)', 'ماتشا موكا (ماتشا+اسبرسو+شيكولاته+لبن+ثلج)', '', '', 110.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'matcha'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Matcha Mocha (Matcha+Espresso+Chocolate+Milk+Ice)' AND p.name_ar = 'ماتشا موكا (ماتشا+اسبرسو+شيكولاته+لبن+ثلج)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Coco Chanel (Redbull+Blue Curacao Syrup + Coconut Syrup + Lemon)', 'كوكو شانيل (ريدبول + سيرب بلوكوراسو + سيرب جوزهند +ليمون)', '', '', 150.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'redbull-cocktail'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Coco Chanel (Redbull+Blue Curacao Syrup + Coconut Syrup + Lemon)' AND p.name_ar = 'كوكو شانيل (ريدبول + سيرب بلوكوراسو + سيرب جوزهند +ليمون)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Sun shine Redbull', 'صن شاين ريدبول', '', '', 130.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'redbull-cocktail'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Sun shine Redbull' AND p.name_ar = 'صن شاين ريدبول');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Redbull Kiwi', 'ريدبول كيوى', '', '', 130.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'redbull-cocktail'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Redbull Kiwi' AND p.name_ar = 'ريدبول كيوى');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Redbull Watermelon', 'ريدبول بطيخ', '', '', 130.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'redbull-cocktail'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Redbull Watermelon' AND p.name_ar = 'ريدبول بطيخ');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Redbull Passion', 'ريدبول باشون', '', '', 130.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'redbull-cocktail'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Redbull Passion' AND p.name_ar = 'ريدبول باشون');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'SPANISH LATTE (REDBULL+ESPRESSO)', 'همر هيد (ريدبول+اسبرسو)', '', '', 150.00, true, false, 6, NULL
FROM public.categories c
WHERE c.slug = 'redbull-cocktail'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'SPANISH LATTE (REDBULL+ESPRESSO)' AND p.name_ar = 'همر هيد (ريدبول+اسبرسو)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Avocado', 'أفوكادو', '', '', 125.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Avocado' AND p.name_ar = 'أفوكادو');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Avocado with Nuts and Honey', 'أفوكادو بالمكسرات والعسل', '', '', 150.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Avocado with Nuts and Honey' AND p.name_ar = 'أفوكادو بالمكسرات والعسل');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Orange', 'برتقال', '', '', 70.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Orange' AND p.name_ar = 'برتقال');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Orange with Carrot', 'برتقال بالجزر', '', '', 75.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Orange with Carrot' AND p.name_ar = 'برتقال بالجزر');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Mango', 'مانجو', '', '', 75.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Mango' AND p.name_ar = 'مانجو');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Strawberry', 'فراوله', '', '', 75.00, true, false, 6, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Strawberry' AND p.name_ar = 'فراوله');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Strawberry with milk', 'فراوله حليب', '', '', 80.00, true, false, 7, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Strawberry with milk' AND p.name_ar = 'فراوله حليب');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Guava', 'جوافه', '', '', 80.00, true, false, 8, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Guava' AND p.name_ar = 'جوافه');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Guava with milk', 'جوافه حليب', '', '', 85.00, true, false, 9, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Guava with milk' AND p.name_ar = 'جوافه حليب');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Banana with milk', 'موز حليب', '', '', 75.00, true, false, 10, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Banana with milk' AND p.name_ar = 'موز حليب');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Watermelon', 'بطيخ', '', '', 75.00, true, false, 11, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Watermelon' AND p.name_ar = 'بطيخ');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Cantaloupe', 'كنتالوب', '', '', 75.00, true, false, 12, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Cantaloupe' AND p.name_ar = 'كنتالوب');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Cantaloupe with milk', 'كنتالوب بالحليب', '', '', 80.00, true, false, 13, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Cantaloupe with milk' AND p.name_ar = 'كنتالوب بالحليب');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Kiwi', 'كيوى', '', '', 90.00, true, false, 14, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Kiwi' AND p.name_ar = 'كيوى');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Dates with milk', 'بلح بالحليب', '', '', 80.00, true, false, 15, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Dates with milk' AND p.name_ar = 'بلح بالحليب');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Cold Hibiscus', 'كركديه ساقع', '', '', 70.00, true, false, 16, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Cold Hibiscus' AND p.name_ar = 'كركديه ساقع');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Lemon', 'ليمون', '', '', 65.00, true, false, 17, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Lemon' AND p.name_ar = 'ليمون');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Lemon with milk', 'ليمون حليب', '', '', 70.00, true, false, 18, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Lemon with milk' AND p.name_ar = 'ليمون حليب');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Lemon with mint', 'ليمون نعناع', '', '', 70.00, true, false, 19, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Lemon with mint' AND p.name_ar = 'ليمون نعناع');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'yogurt', 'زبادي ساده', '', '', 65.00, true, false, 20, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'yogurt' AND p.name_ar = 'زبادي ساده');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'yogurt with Honey', 'زبادي عسل', '', '', 75.00, true, false, 21, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'yogurt with Honey' AND p.name_ar = 'زبادي عسل');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'yogurt with Fruit', 'زبادي فواكه', '', '', 90.00, true, false, 22, NULL
FROM public.categories c
WHERE c.slug = 'fresh-juices'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'yogurt with Fruit' AND p.name_ar = 'زبادي فواكه');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Aquarium Soda (Kiwi + pineapple + sprite + mint + lemon)', 'أكواريوم صودا (كيوى+أناناس+سبرايت+نعناع+ليمون)', '', '', 120.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'soda-cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Aquarium Soda (Kiwi + pineapple + sprite + mint + lemon)' AND p.name_ar = 'أكواريوم صودا (كيوى+أناناس+سبرايت+نعناع+ليمون)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Blue Curacao (Blue Curacao Syrup + Sprite + Lemon)', 'بلوكوراساو (سيرب بلوكوراساو+سبرايت+ليمون)', '', '', 90.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'soda-cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Blue Curacao (Blue Curacao Syrup + Sprite + Lemon)' AND p.name_ar = 'بلوكوراساو (سيرب بلوكوراساو+سبرايت+ليمون)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'PINECOLADA SODA (COCONUT SYRUP+PINEAPPLE SYRUP+SPRITE)', 'بيناكولادا صودا (سيرب جوزهند+سيرب اناناس+سبرايت)', '', '', 90.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'soda-cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'PINECOLADA SODA (COCONUT SYRUP+PINEAPPLE SYRUP+SPRITE)' AND p.name_ar = 'بيناكولادا صودا (سيرب جوزهند+سيرب اناناس+سبرايت)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Orange Soda (orange juice + Passion fruit + Sprite)', 'اورانج صودا (عصير برتقال+باشون فروت+سبرايت)', '', '', 90.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'soda-cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Orange Soda (orange juice + Passion fruit + Sprite)' AND p.name_ar = 'اورانج صودا (عصير برتقال+باشون فروت+سبرايت)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Electric Shock (Lemon juice+Mint+Mint Syrup+Blue Curacao+Sprite)', 'اليكتريك شوك (عصير ليمون+نعناع+سيرب نعناع+سيرب بلوكرا سوا+سبرايت)', '', '', 90.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'soda-cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Electric Shock (Lemon juice+Mint+Mint Syrup+Blue Curacao+Sprite)' AND p.name_ar = 'اليكتريك شوك (عصير ليمون+نعناع+سيرب نعناع+سيرب بلوكرا سوا+سبرايت)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Coco Soda (Coconut Syrup+Blue Curacao+Sprite+Lemon)', 'كوكو صودا (سيرب جوزهند+سيرب بلو كوراسوا +سبرايت+ليمون)', '', '', 90.00, true, false, 6, NULL
FROM public.categories c
WHERE c.slug = 'soda-cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Coco Soda (Coconut Syrup+Blue Curacao+Sprite+Lemon)' AND p.name_ar = 'كوكو صودا (سيرب جوزهند+سيرب بلو كوراسوا +سبرايت+ليمون)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Sun Shine (Orange+Pomegranate Syrup + sprite)', 'صن شاين (برتقال+سيرب رمان+سبرايت)', '', '', 85.00, true, false, 7, NULL
FROM public.categories c
WHERE c.slug = 'soda-cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Sun Shine (Orange+Pomegranate Syrup + sprite)' AND p.name_ar = 'صن شاين (برتقال+سيرب رمان+سبرايت)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Classic Mojito', 'موخيتو كلاسيك', '', '', 80.00, true, false, 8, NULL
FROM public.categories c
WHERE c.slug = 'soda-cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Classic Mojito' AND p.name_ar = 'موخيتو كلاسيك');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Berry Mojito', 'موخيتو بيرى', '', '', 80.00, true, false, 9, NULL
FROM public.categories c
WHERE c.slug = 'soda-cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Berry Mojito' AND p.name_ar = 'موخيتو بيرى');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Strawberry Mojito', 'موخيتو فراولة', '', '', 80.00, true, false, 10, NULL
FROM public.categories c
WHERE c.slug = 'soda-cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Strawberry Mojito' AND p.name_ar = 'موخيتو فراولة');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Aquarium Cocktail (Mango + Banana +Kiwi + Banana Pieces + Vanilla Icecream)', 'أكواريوم كوكتيل (مانجو+موز+كيوى+قطع موز +أيس كريم فانيليا)', '', '', 110.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Aquarium Cocktail (Mango + Banana +Kiwi + Banana Pieces + Vanilla Icecream)' AND p.name_ar = 'أكواريوم كوكتيل (مانجو+موز+كيوى+قطع موز +أيس كريم فانيليا)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Power Cocktail (Avocado + Banana + Dates + Vanilla Icecream)', 'باور كوكتيل (أفوكادو+موز+بلح+أيس فانيليا)', '', '', 125.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Power Cocktail (Avocado + Banana + Dates + Vanilla Icecream)' AND p.name_ar = 'باور كوكتيل (أفوكادو+موز+بلح+أيس فانيليا)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Dream (Avocado + Peanut butter + watercress + Vanilla Icecream)', 'دريم (افوكادو+زبدة فول سودانى+جرجير +ايس كريم فانيليا)', '', '', 130.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Dream (Avocado + Peanut butter + watercress + Vanilla Icecream)' AND p.name_ar = 'دريم (افوكادو+زبدة فول سودانى+جرجير +ايس كريم فانيليا)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Harakat (Watermelon + mango+vanilla Ice cream + strawberry sauce)', 'حركات (بطيخ+مانجو+ايس كريم فانيليا +صوص فراوله)', '', '', 110.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Harakat (Watermelon + mango+vanilla Ice cream + strawberry sauce)' AND p.name_ar = 'حركات (بطيخ+مانجو+ايس كريم فانيليا +صوص فراوله)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'CREAMY DELIGHT (CHERIMOYA+PERSIMMON+PLUM+MILK+NUTS)', 'كريمى ديلايت (شيريمويا+كاكا+برقوق+لبن+مكسرات)', '', '', 120.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'CREAMY DELIGHT (CHERIMOYA+PERSIMMON+PLUM+MILK+NUTS)' AND p.name_ar = 'كريمى ديلايت (شيريمويا+كاكا+برقوق+لبن+مكسرات)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'DRAGON COCKTAIL (DRAGON FRUIT+PASSION FRUIT+BANANA)', 'دراجون كوكتيل (دراجون فروت+باشون فروت+موز)', '', '', 130.00, true, false, 6, NULL
FROM public.categories c
WHERE c.slug = 'cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'DRAGON COCKTAIL (DRAGON FRUIT+PASSION FRUIT+BANANA)' AND p.name_ar = 'دراجون كوكتيل (دراجون فروت+باشون فروت+موز)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Energy (banana+strawberry+mango+yogurt)', 'انرجى (موز+فراولة+مانجو+زبادى)', '', '', 120.00, true, false, 7, NULL
FROM public.categories c
WHERE c.slug = 'cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Energy (banana+strawberry+mango+yogurt)' AND p.name_ar = 'انرجى (موز+فراولة+مانجو+زبادى)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'UTOPIA (CHERIMOYA+BANANA+GUAVA+COCONUT SYRUP)', 'يوتوبيا (شيريمويا+موز+جوافه+سيرب جوزهند)', '', '', 120.00, true, false, 8, NULL
FROM public.categories c
WHERE c.slug = 'cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'UTOPIA (CHERIMOYA+BANANA+GUAVA+COCONUT SYRUP)' AND p.name_ar = 'يوتوبيا (شيريمويا+موز+جوافه+سيرب جوزهند)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'HAVANA (PERSIMMON+PASSION FRUIT+VANILLA ICECREAM)', 'هافانا (كاكا+باشون+ايس كريم فانيليا)', '', '', 110.00, true, false, 9, NULL
FROM public.categories c
WHERE c.slug = 'cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'HAVANA (PERSIMMON+PASSION FRUIT+VANILLA ICECREAM)' AND p.name_ar = 'هافانا (كاكا+باشون+ايس كريم فانيليا)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'FITNESS (KIWI + PINEAPPLE + ORANGE + LEMON)', 'فيتنس (كيوى+أناناس+برتقال+ليمون)', '', '', 110.00, true, false, 10, NULL
FROM public.categories c
WHERE c.slug = 'cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'FITNESS (KIWI + PINEAPPLE + ORANGE + LEMON)' AND p.name_ar = 'فيتنس (كيوى+أناناس+برتقال+ليمون)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Island (mango+pineapple + coconut +vanilla Ice cream)', 'ايلاند (مانجو +اناناس + جوز هند +ايس كريم فانيليا )', '', '', 110.00, true, false, 11, NULL
FROM public.categories c
WHERE c.slug = 'cocktails'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Island (mango+pineapple + coconut +vanilla Ice cream)' AND p.name_ar = 'ايلاند (مانجو +اناناس + جوز هند +ايس كريم فانيليا )');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Mango Smoothie', 'سموزى مانجو', '', '', 80.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Mango Smoothie' AND p.name_ar = 'سموزى مانجو');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Strawberry Smoothie', 'سموزى فراولة', '', '', 80.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Strawberry Smoothie' AND p.name_ar = 'سموزى فراولة');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Lemon with Mint Smoothie', 'سموزى ليمون نعناع', '', '', 75.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Lemon with Mint Smoothie' AND p.name_ar = 'سموزى ليمون نعناع');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Kiwi Smoothie', 'سموزى كيوى', '', '', 110.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Kiwi Smoothie' AND p.name_ar = 'سموزى كيوى');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Peach Smoothie', 'سموزى خوخ', '', '', 80.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Peach Smoothie' AND p.name_ar = 'سموزى خوخ');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Watermelon Smoothie', 'سموزى بطيخ', '', '', 80.00, true, false, 6, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Watermelon Smoothie' AND p.name_ar = 'سموزى بطيخ');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Berry Smoothie', 'سموزى توت', '', '', 80.00, true, false, 7, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Berry Smoothie' AND p.name_ar = 'سموزى توت');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Mango with Coconut Smoothie', 'سموزى مانجو جوزهند', '', '', 85.00, true, false, 8, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Mango with Coconut Smoothie' AND p.name_ar = 'سموزى مانجو جوزهند');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Strawberry with Coconut Smoothie', 'سموزى فراولة جوزهند', '', '', 85.00, true, false, 9, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Strawberry with Coconut Smoothie' AND p.name_ar = 'سموزى فراولة جوزهند');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Mango with Mint Smoothie', 'سموزى مانجو نعناع', '', '', 85.00, true, false, 10, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Mango with Mint Smoothie' AND p.name_ar = 'سموزى مانجو نعناع');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Mango with Berry Smoothie', 'سموزى مانجو بيري', '', '', 85.00, true, false, 11, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Mango with Berry Smoothie' AND p.name_ar = 'سموزى مانجو بيري');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Banana with Berry Smoothie', 'سموزى بنانا بيري', '', '', 85.00, true, false, 12, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Banana with Berry Smoothie' AND p.name_ar = 'سموزى بنانا بيري');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Banana with Strawberry Smoothie', 'سموزى بنانا فراولة', '', '', 85.00, true, false, 13, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Banana with Strawberry Smoothie' AND p.name_ar = 'سموزى بنانا فراولة');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Mango with Vanilla Smoothie', 'سموزي مانجو فانيليا', '', '', 90.00, true, false, 14, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Mango with Vanilla Smoothie' AND p.name_ar = 'سموزي مانجو فانيليا');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Cantaloupe with Vanilla Smoothie', 'سموزي كنتالوب فانيليا', '', '', 90.00, true, false, 15, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Cantaloupe with Vanilla Smoothie' AND p.name_ar = 'سموزي كنتالوب فانيليا');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Lemon, Mint and Kiwi Smoothie', 'سموزي ليمون نعناع كيوى', '', '', 100.00, true, false, 16, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Lemon, Mint and Kiwi Smoothie' AND p.name_ar = 'سموزي ليمون نعناع كيوى');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Peach and Orange Smoothie', 'سموزي برتقال خوخ', '', '', 90.00, true, false, 17, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Peach and Orange Smoothie' AND p.name_ar = 'سموزي برتقال خوخ');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Punch Smoothie (watermelon+strawberry+peach)', 'سموزى بانش (بطيخ + فراولة+خوخ)', '', '', 90.00, true, false, 18, NULL
FROM public.categories c
WHERE c.slug = 'smoothie'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Punch Smoothie (watermelon+strawberry+peach)' AND p.name_ar = 'سموزى بانش (بطيخ + فراولة+خوخ)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Sea Food Soup', 'شوربة سي فود', '', '', 185.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'soups-appetizers'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Sea Food Soup' AND p.name_ar = 'شوربة سي فود');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Creamy Chicken Mushroom Soup', 'شوربة كريمة بالفراخ والمشروم', '', '', 120.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'soups-appetizers'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Creamy Chicken Mushroom Soup' AND p.name_ar = 'شوربة كريمة بالفراخ والمشروم');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Farm Frites', 'بطاطس فارم فريتس', '', '', 60.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'soups-appetizers'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Farm Frites' AND p.name_ar = 'بطاطس فارم فريتس');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Potato Wedges', 'بطاطس ودجز', '', '', 70.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'soups-appetizers'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Potato Wedges' AND p.name_ar = 'بطاطس ودجز');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Cheddar Cheese Fries', 'بطاطس بالجبنة الشيدر', '', '', 85.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'soups-appetizers'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Cheddar Cheese Fries' AND p.name_ar = 'بطاطس بالجبنة الشيدر');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Fried Mozzarella Sticks', 'أصابع الموزاريلا المقلية', '', '', 120.00, true, false, 6, NULL
FROM public.categories c
WHERE c.slug = 'soups-appetizers'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Fried Mozzarella Sticks' AND p.name_ar = 'أصابع الموزاريلا المقلية');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Fried Onion Rings', 'حلقات البصل المقلية', '', '', 80.00, true, false, 7, NULL
FROM public.categories c
WHERE c.slug = 'soups-appetizers'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Fried Onion Rings' AND p.name_ar = 'حلقات البصل المقلية');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Mix Appetizer (Mozzarella sticks + Onion rings + Fries)', 'ميكس أبتايزر (أصابع موزاريلا + حلقات بصل + بطاطس)', '', '', 180.00, true, false, 8, NULL
FROM public.categories c
WHERE c.slug = 'soups-appetizers'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Mix Appetizer (Mozzarella sticks + Onion rings + Fries)' AND p.name_ar = 'ميكس أبتايزر (أصابع موزاريلا + حلقات بصل + بطاطس)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Chicken Caesar Salad', 'سلطة سيزر فراخ', '', '', 140.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'salads'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Chicken Caesar Salad' AND p.name_ar = 'سلطة سيزر فراخ');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Greek Salad', 'سلطة يونانية', '', '', 110.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'salads'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Greek Salad' AND p.name_ar = 'سلطة يونانية');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Green Salad', 'سلطة خضراء', '', '', 60.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'salads'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Green Salad' AND p.name_ar = 'سلطة خضراء');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Tuna Salad', 'سلطة تونة', '', '', 130.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'salads'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Tuna Salad' AND p.name_ar = 'سلطة تونة');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Grilled Steak (Beef Fillet)', 'ستيك مشوي (بيف فيليه)', 'Served with Mushroom or Pepper sauce', 'يقدم مع صوص المشروم أو الفلفل الأسود', 450.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'main-courses'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Grilled Steak (Beef Fillet)' AND p.name_ar = 'ستيك مشوي (بيف فيليه)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Ribeye Steak', 'ريب آي ستيك', '', '', 490.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'main-courses'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Ribeye Steak' AND p.name_ar = 'ريب آي ستيك');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Mixed Seafood Platter (Shrimp + Calamari + Fish Fillet)', 'طبق سي فود مشكل (جمبري + كاليماري + سمك فيليه)', '', '', 480.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'main-courses'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Mixed Seafood Platter (Shrimp + Calamari + Fish Fillet)' AND p.name_ar = 'طبق سي فود مشكل (جمبري + كاليماري + سمك فيليه)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Chicken Piccata with Mushroom', 'فراخ بيكاتا بالمشروم', '', '', 320.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'main-courses'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Chicken Piccata with Mushroom' AND p.name_ar = 'فراخ بيكاتا بالمشروم');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Chicken Cordon Bleu', 'تشيكن كوردون بلو', '', '', 340.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'main-courses'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Chicken Cordon Bleu' AND p.name_ar = 'تشيكن كوردون بلو');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Grilled Chicken Breast', 'فراخ مشوية علي الجريل', '', '', 300.00, true, false, 6, NULL
FROM public.categories c
WHERE c.slug = 'main-courses'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Grilled Chicken Breast' AND p.name_ar = 'فراخ مشوية علي الجريل');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Shish Tawook Platter', 'شيش طاووك طبق', '', '', 310.00, true, false, 7, NULL
FROM public.categories c
WHERE c.slug = 'main-courses'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Shish Tawook Platter' AND p.name_ar = 'شيش طاووك طبق');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Mix Grill Platter', 'مكس جريل (كفتة + شيش + استيك)', '', '', 460.00, true, false, 8, NULL
FROM public.categories c
WHERE c.slug = 'main-courses'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Mix Grill Platter' AND p.name_ar = 'مكس جريل (كفتة + شيش + استيك)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Pasta Arrabbiata', 'باستا أربياتا', '', '', 140.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'pasta'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Pasta Arrabbiata' AND p.name_ar = 'باستا أربياتا');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Pasta Negresco', 'باستا نجرسكو', '', '', 210.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'pasta'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Pasta Negresco' AND p.name_ar = 'باستا نجرسكو');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Chicken Mushroom Alfredo Pasta', 'باستا ألفردو بالفراخ والمشروم', '', '', 220.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'pasta'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Chicken Mushroom Alfredo Pasta' AND p.name_ar = 'باستا ألفردو بالفراخ والمشروم');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Seafood White Sauce Pasta', 'باستا سي فود وايت صوص', '', '', 280.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'pasta'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Seafood White Sauce Pasta' AND p.name_ar = 'باستا سي فود وايت صوص');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Pasta Bolognese', 'باستا بولونيز', '', '', 180.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'pasta'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Pasta Bolognese' AND p.name_ar = 'باستا بولونيز');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Four Cheese Pasta', 'باستا فور تشيز', '', '', 200.00, true, false, 6, NULL
FROM public.categories c
WHERE c.slug = 'pasta'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Four Cheese Pasta' AND p.name_ar = 'باستا فور تشيز');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Mac & Cheese', 'ماك أند تشيز', '', '', 170.00, true, false, 7, NULL
FROM public.categories c
WHERE c.slug = 'pasta'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Mac & Cheese' AND p.name_ar = 'ماك أند تشيز');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Margherita Pizza', 'بيتزا مارجريتا', '', '', 160.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'pizza'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Margherita Pizza' AND p.name_ar = 'بيتزا مارجريتا');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Vegetable Pizza', 'بيتزا خضار', '', '', 175.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'pizza'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Vegetable Pizza' AND p.name_ar = 'بيتزا خضار');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Mix Cheese Pizza', 'بيتزا مشكل جبن', '', '', 210.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'pizza'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Mix Cheese Pizza' AND p.name_ar = 'بيتزا مشكل جبن');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Chicken BBQ Pizza', 'بيتزا تشيكن باربيكيو', '', '', 230.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'pizza'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Chicken BBQ Pizza' AND p.name_ar = 'بيتزا تشيكن باربيكيو');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Chicken Ranch Pizza', 'بيتزا تشيكن رانش', '', '', 240.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'pizza'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Chicken Ranch Pizza' AND p.name_ar = 'بيتزا تشيكن رانش');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Pepperoni / Salami Pizza', 'بيتزا بيبروني / سلامي', '', '', 220.00, true, false, 6, NULL
FROM public.categories c
WHERE c.slug = 'pizza'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Pepperoni / Salami Pizza' AND p.name_ar = 'بيتزا بيبروني / سلامي');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Oriental Sausage Pizza', 'بيتزا سجق شرقي', '', '', 230.00, true, false, 7, NULL
FROM public.categories c
WHERE c.slug = 'pizza'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Oriental Sausage Pizza' AND p.name_ar = 'بيتزا سجق شرقي');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Seafood Pizza', 'بيتزا سي فود', '', '', 290.00, true, false, 8, NULL
FROM public.categories c
WHERE c.slug = 'pizza'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Seafood Pizza' AND p.name_ar = 'بيتزا سي فود');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Aquarium Mix Meat Pizza', 'بيتزا أكواريوم مشكل لحوم', '', '', 260.00, true, false, 9, NULL
FROM public.categories c
WHERE c.slug = 'pizza'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Aquarium Mix Meat Pizza' AND p.name_ar = 'بيتزا أكواريوم مشكل لحوم');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Molten Cake with Ice Cream', 'مولتن كيك مع أيس كريم', '', '', 110.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'desserts-crepes-waffles'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Molten Cake with Ice Cream' AND p.name_ar = 'مولتن كيك مع أيس كريم');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Cheesecake (Nutella - Lotus - Strawberry - Blueberry)', 'تشيز كيك (نوتيلا - لوتس - فراولة - توت)', '', '', 95.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'desserts-crepes-waffles'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Cheesecake (Nutella - Lotus - Strawberry - Blueberry)' AND p.name_ar = 'تشيز كيك (نوتيلا - لوتس - فراولة - توت)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Brownies with Ice Cream', 'براونيز مع أيس كريم', '', '', 90.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'desserts-crepes-waffles'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Brownies with Ice Cream' AND p.name_ar = 'براونيز مع أيس كريم');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Om Ali with Nuts', 'أم علي بالمكسرات', '', '', 75.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'desserts-crepes-waffles'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Om Ali with Nuts' AND p.name_ar = 'أم علي بالمكسرات');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Ice Cream (3 Scoops)', 'أيس كريم (3 بولات)', '', '', 65.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'desserts-crepes-waffles'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Ice Cream (3 Scoops)' AND p.name_ar = 'أيس كريم (3 بولات)');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Nutella Waffle', 'وافل نوتيلا', '', '', 100.00, true, false, 6, NULL
FROM public.categories c
WHERE c.slug = 'desserts-crepes-waffles'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Nutella Waffle' AND p.name_ar = 'وافل نوتيلا');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Lotus Waffle', 'وافل لوتس', '', '', 110.00, true, false, 7, NULL
FROM public.categories c
WHERE c.slug = 'desserts-crepes-waffles'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Lotus Waffle' AND p.name_ar = 'وافل لوتس');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Mix Fruits & Nutella Waffle', 'وافل ميكس فواكه ونوتيلا', '', '', 130.00, true, false, 8, NULL
FROM public.categories c
WHERE c.slug = 'desserts-crepes-waffles'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Mix Fruits & Nutella Waffle' AND p.name_ar = 'وافل ميكس فواكه ونوتيلا');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Nutella Crepe', 'كريب نوتيلا', '', '', 95.00, true, false, 9, NULL
FROM public.categories c
WHERE c.slug = 'desserts-crepes-waffles'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Nutella Crepe' AND p.name_ar = 'كريب نوتيلا');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Lotus Crepe', 'كريب لوتس', '', '', 105.00, true, false, 10, NULL
FROM public.categories c
WHERE c.slug = 'desserts-crepes-waffles'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Lotus Crepe' AND p.name_ar = 'كريب لوتس');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Nutella & Banana Crepe', 'كريب ميكس نوتيلا وموز', '', '', 110.00, true, false, 11, NULL
FROM public.categories c
WHERE c.slug = 'desserts-crepes-waffles'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Nutella & Banana Crepe' AND p.name_ar = 'كريب ميكس نوتيلا وموز');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Vanilla Milkshake', 'ميلك شيك فانيليا', '', '', 85.00, true, false, 1, NULL
FROM public.categories c
WHERE c.slug = 'milkshakes-yogurt-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Vanilla Milkshake' AND p.name_ar = 'ميلك شيك فانيليا');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Chocolate Milkshake', 'ميلك شيك شيكولاتة', '', '', 85.00, true, false, 2, NULL
FROM public.categories c
WHERE c.slug = 'milkshakes-yogurt-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Chocolate Milkshake' AND p.name_ar = 'ميلك شيك شيكولاتة');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Strawberry Milkshake', 'ميلك شيك فراولة', '', '', 85.00, true, false, 3, NULL
FROM public.categories c
WHERE c.slug = 'milkshakes-yogurt-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Strawberry Milkshake' AND p.name_ar = 'ميلك شيك فراولة');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Mango Milkshake', 'ميلك شيك مانجو', '', '', 90.00, true, false, 4, NULL
FROM public.categories c
WHERE c.slug = 'milkshakes-yogurt-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Mango Milkshake' AND p.name_ar = 'ميلك شيك مانجو');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Nutella Milkshake', 'ميلك شيك نوتيلا', '', '', 100.00, true, false, 5, NULL
FROM public.categories c
WHERE c.slug = 'milkshakes-yogurt-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Nutella Milkshake' AND p.name_ar = 'ميلك شيك نوتيلا');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Lotus Milkshake', 'ميلك شيك لوتس', '', '', 105.00, true, false, 6, NULL
FROM public.categories c
WHERE c.slug = 'milkshakes-yogurt-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Lotus Milkshake' AND p.name_ar = 'ميلك شيك لوتس');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Oreo Milkshake', 'ميلك شيك أوريو', '', '', 95.00, true, false, 7, NULL
FROM public.categories c
WHERE c.slug = 'milkshakes-yogurt-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Oreo Milkshake' AND p.name_ar = 'ميلك شيك أوريو');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Plain / Honey Yogurt Drink', 'زبادوه سادة / عسل', '', '', 70.00, true, false, 8, NULL
FROM public.categories c
WHERE c.slug = 'milkshakes-yogurt-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Plain / Honey Yogurt Drink' AND p.name_ar = 'زبادوه سادة / عسل');
INSERT INTO public.products (category_id, name, name_ar, description, description_ar, price, available, featured, sort_order, prices)
SELECT c.id, 'Fruit Yogurt Drink (Strawberry / Mango / Berry)', 'زبادوه فواكه (فراولة / مانجو / توت)', '', '', 85.00, true, false, 9, NULL
FROM public.categories c
WHERE c.slug = 'milkshakes-yogurt-drinks'
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.name = 'Fruit Yogurt Drink (Strawberry / Mango / Berry)' AND p.name_ar = 'زبادوه فواكه (فراولة / مانجو / توت)');

COMMIT;

-- Verification
SELECT count(*) AS categories_count FROM public.categories;
SELECT count(*) AS products_count FROM public.products;
SELECT count(*) AS products_with_tiered_prices FROM public.products WHERE prices IS NOT NULL;