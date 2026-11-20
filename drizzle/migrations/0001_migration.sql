
alter table public.orders add column if not exists product_summary_en text;

insert into public.branches (id, code, name_en, name_ar, branch_type, city) values
 (1, 'CAI', 'Cairo showroom · Nasr City', 'معرض القاهرة · مدينة نصر', 'showroom', 'Cairo'),
 (2, 'GIZ', 'Sheikh Zayed showroom', 'معرض الشيخ زايد', 'showroom', 'Giza'),
 (3, 'ALX', 'Alexandria showroom', 'معرض الإسكندرية', 'showroom', 'Alexandria'),
 (4, 'FAC', 'Factory · 10th of Ramadan', 'المصنع · العاشر من رمضان', 'factory', 'Sharqia');
select setval('public.branches_id_seq', 4);

insert into public.sales_reps (id, name_en, name_ar, branch_id) values
 (1, 'Ahmed Ali', 'أحمد علي', 1), (2, 'Mona Samir', 'منى سمير', 1), (3, 'Karim Fathy', 'كريم فتحي', 2),
 (4, 'Hala Nabil', 'هالة نبيل', 2), (5, 'Omar Saeed', 'عمر سعيد', 3);
select setval('public.sales_reps_id_seq', 5);

insert into public.product_categories (code, name_en, name_ar) values
 ('BED', 'Bedrooms', 'غرف نوم'), ('WRD', 'Wardrobes', 'دواليب'), ('DIN', 'Dining', 'سفرة'),
 ('LIV', 'Living & sofas', 'معيشة وكنب'), ('OFF', 'Office', 'مكاتب'), ('KIT', 'Kitchens', 'مطابخ'),
 ('TVU', 'TV units', 'وحدات تلفزيون'), ('CHR', 'Chairs', 'كراسي');

insert into public.products (id, sku, name_en, name_ar, category_code, catalog_type, wood_en, wood_ar, finish_en, finish_ar, width_cm, depth_cm, height_cm, list_price, unit_cost) values
 (1, 'BED-001', 'Modern bedroom set', 'غرفة نوم مودرن', 'BED', 'bed', 'Walnut', 'جوز', 'Matte', 'مط', 180, 210, 110, 42500, 27000),
 (2, 'BED-002', 'Classic beech bed', 'سرير زان كلاسيك', 'BED', 'bed', 'Beech', 'زان', 'Natural oil', 'طبيعي (زيت)', 160, 200, 100, 22000, 13500),
 (3, 'BED-003', 'Kids bed', 'سرير أطفال', 'BED', 'bed', 'Pine', 'موسكي', 'Lacquer', 'دوكو', 120, 200, 90, 14500, 8800),
 (4, 'WRD-001', '3-door wardrobe', 'دولاب ٣ أبواب', 'WRD', 'wardrobe', 'Beech', 'زان', 'Matte', 'مط', 180, 60, 220, 18750, 11500),
 (5, 'WRD-002', 'Sliding wardrobe', 'دولاب سحاب', 'WRD', 'wardrobe', 'Oak', 'أرو', 'Lacquer', 'دوكو', 240, 65, 240, 32000, 19500),
 (6, 'WRD-003', 'Kids wardrobe', 'دولاب أطفال', 'WRD', 'wardrobe', 'MDF', 'MDF', 'Lacquer', 'دوكو', 120, 55, 180, 9800, 6200),
 (7, 'DIN-001', 'Dining table with 6 chairs', 'طاولة سفرة ٦ كراسي', 'DIN', 'dining_table', 'Walnut', 'جوز', 'Matte', 'مط', 200, 100, 75, 28900, 18000),
 (8, 'DIN-002', 'Round dining table', 'سفرة دائرية', 'DIN', 'dining_table', 'Oak', 'أرو', 'Natural oil', 'طبيعي (زيت)', 120, 120, 75, 16500, 10200),
 (9, 'LIV-001', '3-seat sofa', 'كنبة ٣ مقاعد', 'LIV', 'sofa', 'Beech', 'زان', 'Natural oil', 'طبيعي (زيت)', 220, 90, 85, 20000, 12600),
 (10, 'LIV-002', 'L-shaped sofa', 'ركنة حرف L', 'LIV', 'sofa', 'Beech', 'زان', 'Matte', 'مط', 280, 160, 85, 34000, 21500),
 (11, 'OFF-001', 'Executive desk', 'مكتب تنفيذي', 'OFF', 'desk', 'Walnut', 'جوز', 'High-gloss polyester', 'بوليستر لامع', 160, 80, 75, 15800, 9600),
 (12, 'OFF-002', 'Desk and storage unit', 'مكتب ووحدة تخزين', 'OFF', 'desk', 'MDF', 'MDF', 'Matte', 'مط', 140, 70, 75, 12400, 7800),
 (13, 'KIT-001', 'Oak kitchen', 'مطبخ خشب بلوط', 'KIT', null, 'Oak', 'أرو', 'Lacquer', 'دوكو', 360, 60, 220, 68200, 44000),
 (14, 'TVU-001', 'TV unit', 'وحدة تلفزيون', 'TVU', 'tv_unit', 'MDF', 'MDF', 'High-gloss polyester', 'بوليستر لامع', 180, 45, 50, 12000, 7400),
 (15, 'CHR-001', 'Dining chair', 'كرسي سفرة', 'CHR', 'chair', 'Beech', 'زان', 'Matte', 'مط', 45, 50, 95, 3500, 2100),
 (16, 'CUS-WRD', 'Custom wardrobe', 'دولاب تفصيل', 'WRD', 'wardrobe', null, null, null, null, null, null, null, 0, 0),
 (17, 'CUS-BED', 'Custom bed', 'سرير تفصيل', 'BED', 'bed', null, null, null, null, null, null, null, 0, 0),
 (18, 'CUS-DIN', 'Custom dining table', 'سفرة تفصيل', 'DIN', 'dining_table', null, null, null, null, null, null, null, 0, 0),
 (19, 'CUS-SOF', 'Custom sofa', 'كنبة تفصيل', 'LIV', 'sofa', null, null, null, null, null, null, null, 0, 0),
 (20, 'CUS-TVU', 'Custom TV unit', 'وحدة تلفزيون تفصيل', 'TVU', 'tv_unit', null, null, null, null, null, null, null, 0, 0),
 (21, 'CUS-DSK', 'Custom desk', 'مكتب تفصيل', 'OFF', 'desk', null, null, null, null, null, null, null, 0, 0),
 (22, 'CUS-CHR', 'Custom chair', 'كرسي تفصيل', 'CHR', 'chair', null, null, null, null, null, null, null, 0, 0);
select setval('public.products_id_seq', 22);

insert into public.customers (id, name, phone, city, city_ar, customer_type, source, preferred_language, created_at)
select n.g::int, n.name, '010' || lpad((12345600 + n.g * 37)::text, 8, '0'),
       (array['Cairo','Giza','Alexandria','Cairo','Delta'])[1 + (n.g % 5)::int],
       (array['القاهرة','الجيزة','الإسكندرية','القاهرة','الدلتا'])[1 + (n.g % 5)::int],
       case when n.g % 9 = 0 then 'company' else 'individual' end,
       (array['showroom','referral','facebook','website'])[1 + (n.g % 4)::int],
       case when n.g % 7 = 0 then 'en' else 'ar' end,
       current_date - (560 - n.g * 3)::int
from (select row_number() over () as g, name from unnest(array[
 'أحمد محمود','سارة إبراهيم','محمد حسن','نور عبدالله','خالد مصطفى','منى عادل','عمرو السيد','ريم فؤاد','ياسر كمال','هبة سليمان',
 'طارق نصر','دينا مجدي','شريف عزت','إيمان رشدي','مصطفى زكي','رانيا حلمي','وليد شوقي','نهى سعد','حسام الدين علي','سلمى رأفت',
 'كريم يوسف','مروة عاطف','إسلام فاروق','آية خيري','باسم عبدالعزيز','لبنى صبري','حازم جمال','غادة منصور','أيمن بدر','شيماء نبيل',
 'محمود الشربيني','فاطمة الزهراء','عادل قنديل','نادين سامي','هشام رضوان','ميار حسني','علاء الجندي','يسرا مختار','تامر البنا','شركة النور للمقاولات']) as name) n;
select setval('public.customers_id_seq', 40);

insert into public.orders (id, order_no, customer_id, branch_id, sales_rep_id, order_type, channel, status, created_at,
                           confirmed_at, promised_date, delivered_at, delivery_city, cancel_reason)
select i, 'SO-' || lpad(i::text, 4, '0'),
       ((i - 1) * 13 % 40) + 1,
       b.branch_id,
       case b.branch_id when 1 then 1 + i % 2 when 2 then 3 + i % 2 else 5 end,
       'order',
       case i % 5 when 0 then 'online' when 1 then 'phone' else 'showroom' end,
       s.status,
       c.created_at,
       case when s.status in ('draft', 'cancelled') then null else c.created_at + interval '3 hours' end,
       (c.created_at + interval '21 days')::date,
       case when s.status = 'delivered' then c.created_at + make_interval(days => case when a.age > 40 then 19 + i % 9 else 20 end) end,
       case when i % 9 = 0 then 'Delta' when b.branch_id = 1 then 'Cairo' when b.branch_id = 2 then 'Giza' else 'Alexandria' end,
       case when s.status = 'cancelled' then 'العميل غيّر رأيه' end
from generate_series(1, 640) i
cross join lateral (select 540 - floor(i * 540.0 / 640)::int as age) a
cross join lateral (select (current_date - a.age) + make_interval(hours => 10 + i % 8) as created_at) c
cross join lateral (select case when i % 10 in (0,1,2,3) then 1 when i % 10 in (4,5,6) then 2 else 3 end as branch_id) b
cross join lateral (select case
   when i % 29 = 0 then 'cancelled'
   when a.age > 40 then 'delivered'
   when a.age >= 25 then (array['shipped','delivered','ready'])[1 + i % 3]
   when a.age >= 10 then case when i % 4 = 0 then 'ready' else 'production' end
   when a.age >= 3 then case when i % 3 = 0 then 'production' else 'confirmed' end
   else case when i % 2 = 0 then 'draft' else 'confirmed' end end as status) s;
select setval('public.orders_id_seq', 640);

insert into public.order_lines (id, order_id, product_id, quantity, unit_price, line_total, unit_cost)
select o.id, o.id, p.id, q.qty,
       round(p.list_price * (1 + (540 - a.age) / 540.0 * 0.08)),
       round(p.list_price * (1 + (540 - a.age) / 540.0 * 0.08)) * q.qty,
       round(p.unit_cost * (1 + (o.id % 7) / 100.0))
from public.orders o
cross join lateral (select (current_date - o.created_at::date) as age) a
cross join lateral (select case
   when a.age < 100 and o.id % 4 = 0 then 2
   when a.age > 300 and o.id % 6 = 1 then 12
   when a.age < 200 and o.id % 6 = 1 then 14
   else ((o.id * 7) % 15) + 1 end as pid) pick
join public.products p on p.id = pick.pid
cross join lateral (select case when p.id = 15 then 6 when o.id % 4 = 0 then 2 else 1 end as qty) q;

insert into public.order_lines (id, order_id, product_id, quantity, unit_price, line_total, unit_cost)
select 1000 + o.id, o.id, p.id, q.qty, p.list_price, p.list_price * q.qty, p.unit_cost
from public.orders o
cross join lateral (select case when o.id % 2 = 0 then 15 else 14 end as pid) pick
join public.products p on p.id = pick.pid
cross join lateral (select case when p.id = 15 then 4 else 1 end as qty) q
where o.id % 5 = 0;
select setval('public.order_lines_id_seq', 2000);

update public.orders o set subtotal = s.sub
from (select order_id, sum(line_total) as sub from public.order_lines group by order_id) s where s.order_id = o.id;
update public.orders set discount_amount = round(subtotal * case when id % 6 = 0 then 0.05 when id % 11 = 0 then 0.08 else 0 end, 2);
update public.orders set vat_amount = round((subtotal - discount_amount) * vat_pct / 100, 2),
                         total_amount = round((subtotal - discount_amount) * (1 + vat_pct / 100), 2);
update public.orders o set
  product_summary = (select string_agg(p.name_ar || case when l.quantity > 1 then ' × ' || l.quantity else '' end, ' + ' order by l.id)
                     from public.order_lines l join public.products p on p.id = l.product_id where l.order_id = o.id),
  product_summary_en = (select string_agg(p.name_en || case when l.quantity > 1 then ' × ' || l.quantity else '' end, ' + ' order by l.id)
                     from public.order_lines l join public.products p on p.id = l.product_id where l.order_id = o.id);

insert into public.payments (order_id, amount, method, paid_at)
select id, round(total_amount * case when status = 'confirmed' then 0.3 else 0.5 end, 2),
       case when id % 3 = 0 then 'bank_transfer' else 'cash' end, confirmed_at
from public.orders
where status in ('production','ready','shipped','delivered') or (status = 'confirmed' and id % 2 = 0);
insert into public.payments (order_id, amount, method, paid_at)
select id, total_amount - round(total_amount * 0.5, 2), 'cash', delivered_at
from public.orders where status = 'delivered' and id % 13 <> 0;
insert into public.payments (order_id, amount, method, paid_at)
select id, round(total_amount * 0.2, 2), 'bank_transfer', confirmed_at + interval '7 days'
from public.orders where status in ('ready','shipped') and id % 2 = 0;

insert into public.shipments (order_id, cost, shipped_at, delivered_at)
select id, case delivery_city when 'Cairo' then 600 when 'Giza' then 700 when 'Alexandria' then 1500 else 1800 end,
       coalesce(delivered_at - interval '1 day', created_at + interval '18 days'), delivered_at
from public.orders where status in ('shipped','delivered');

insert into public.production_orders (po_no, order_id, product_id, status, quantity, planned_start, planned_end, actual_start, actual_end,
                                      total_steps, completed_steps, current_stage_en, material_cost, labor_cost, standard_cost)
select 'PO-' || lpad(l.id::text, 5, '0'), o.id, l.product_id,
       case when o.status = 'production' then 'in_progress' else 'completed' end,
       l.quantity,
       o.confirmed_at::date, o.confirmed_at::date + 14 + 2 * (l.quantity - 1), o.confirmed_at::date,
       case when o.status = 'production' then null else o.confirmed_at::date + 14 + 2 * (l.quantity - 1) + (l.id % 5) - 2 end,
       6,
       case when o.status = 'production' then 1 + l.id % 5 else 6 end,
       case when o.status = 'production' then (array['edge banding','assembly','sanding','finishing','quality control'])[1 + l.id % 5] end,
       round(l.unit_cost * l.quantity * 0.6 * (1 + (l.id % 9) / 50.0) * case when l.product_id = 13 then 1.3 else 1 end),
       round(l.unit_cost * l.quantity * 0.4 * (1 + (l.id % 7) / 40.0)),
       l.unit_cost * l.quantity
from public.order_lines l join public.orders o on o.id = l.order_id
where o.status in ('production','ready','shipped','delivered');

insert into public.suppliers (id, name_en, name_ar, phone, lead_time_days) values
 (1, 'Delta Wood Co.', 'شركة الدلتا للأخشاب', '0402345678', 14),
 (2, 'Cairo Hardware', 'القاهرة للخردوات', '0223456789', 5),
 (3, 'Nile Paints', 'النيل للدهانات', '0225678901', 7),
 (4, 'Alex Fabrics', 'الإسكندرية للأقمشة', '0334567890', 10),
 (5, 'Euro Veneer Import', 'يورو فينير للاستيراد', '0226789012', 30);
select setval('public.suppliers_id_seq', 5);

insert into public.materials (sku, name_en, name_ar, material_type, unit, stock_qty, reorder_level, unit_cost, supplier_id, warehouse_ar, warehouse_en) values
 ('MAT-001', 'MDF boards 18 mm', 'ألواح MDF 18 مم', 'board', 'board', 124, 80, 950, 1, 'المخزن الرئيسي', 'Main warehouse'),
 ('MAT-002', 'Natural oak wood', 'خشب بلوط طبيعي', 'timber', 'board', 86, 60, 2400, 1, 'المخزن الرئيسي', 'Main warehouse'),
 ('MAT-003', 'Soft-close hinges', 'مفصلات إغلاق هادئ', 'hardware', 'piece', 480, 200, 45, 2, 'مخزن الإكسسوارات', 'Accessories store'),
 ('MAT-004', 'Brass handles', 'مقابض نحاس', 'hardware', 'piece', 24, 100, 120, 2, 'مخزن الإكسسوارات', 'Accessories store'),
 ('MAT-005', 'Walnut veneer sheets', 'شرائح قشرة جوز', 'veneer', 'sheet', 30, 40, 780, 5, 'المخزن الرئيسي', 'Main warehouse'),
 ('MAT-006', 'Beech timber', 'خشب زان', 'timber', 'm3', 12, 8, 21000, 1, 'المخزن الرئيسي', 'Main warehouse'),
 ('MAT-007', 'Wood glue', 'غراء خشب', 'chemical', 'liter', 60, 25, 85, 3, 'مخزن الدهانات', 'Paint store'),
 ('MAT-008', 'Lacquer paint', 'دهان دوكو', 'chemical', 'liter', 35, 40, 260, 3, 'مخزن الدهانات', 'Paint store'),
 ('MAT-009', 'Sandpaper rolls', 'رولات صنفرة', 'consumable', 'roll', 90, 30, 140, 2, 'مخزن الإكسسوارات', 'Accessories store'),
 ('MAT-010', 'Upholstery fabric', 'قماش تنجيد', 'fabric', 'meter', 220, 150, 180, 4, 'مخزن الأقمشة', 'Fabric store'),
 ('MAT-011', 'Foam sheets', 'ألواح إسفنج', 'fabric', 'sheet', 40, 50, 350, 4, 'مخزن الأقمشة', 'Fabric store'),
 ('MAT-012', 'Drawer rails', 'مجاري أدراج', 'hardware', 'pair', 300, 120, 95, 2, 'مخزن الإكسسوارات', 'Accessories store');

insert into public.purchase_orders (supplier_id, ordered_at, expected_at, received_at, total)
select s.id, m.m + 3, m.m + 3 + s.lead_time_days,
       case when m.m + 3 + s.lead_time_days + ((s.id * m.idx) % 5)::int - 1 <= current_date
            then m.m + 3 + s.lead_time_days + ((s.id * m.idx) % 5)::int - 1 end,
       20000 + s.id * 7000 + (m.idx % 4) * 3000
from (select gs::date as m, row_number() over (order by gs) as idx
      from generate_series(date_trunc('month', current_date - 540), date_trunc('month', current_date), interval '1 month') gs) m
cross join public.suppliers s;

insert into public.branch_expenses (branch_id, month_start, category, amount)
select b.id, m::date, 'operations',
       case b.id when 1 then 60000 when 2 then 50000 when 3 then 105000 else 60000 end + ((extract(month from m)::int * b.id) % 5) * 1500
from generate_series(date_trunc('month', current_date - 540), date_trunc('month', current_date) - interval '1 month', interval '1 month') m
cross join public.branches b;

insert into public.boms (code, product_name, description, status) values
 ('BOM-024', 'غرفة نوم مودرن', 'قائمة مواد · إصدار ٣', 'جاهز للإنتاج'),
 ('BOM-023', 'مطبخ خشب بلوط', 'مراجعة الرسم الفني', 'قيد المراجعة'),
 ('BOM-022', 'دولاب ٣ أبواب', 'رسم معتمد', 'معتمد'),
 ('BOM-021', 'ركنة حرف L', 'قائمة مواد · إصدار ٢', 'معتمد');

insert into public.quality_checks (code, order_id, check_name, status)
select 'QC-' || lpad(id::text, 4, '0'), id,
       case when status = 'production' then 'فحص الأبعاد' else 'فحص التشطيب النهائي' end,
       case when status = 'production' then 'بانتظار الفحص' else 'مطابق' end
from public.orders where status in ('production','ready') order by id desc limit 12;

insert into public.factory_settings (id) values (1);
insert into public.approvals (code, title, reason, status, requester_name, created_at) values
 ('APR-012', 'خصم إضافي على طلب مطبخ', 'عميل متكرر · طلب خصم ٨٪', 'pending', 'أحمد علي', now() - interval '2 hours'),
 ('APR-011', 'تعديل أبعاد دولاب', 'تغيير العرض من ١٨٠ إلى ٢٠٠ سم', 'pending', 'منى سمير', now() - interval '5 hours'),
 ('APR-010', 'تصحيح عنوان الفاتورة', 'تحديث عنوان العميل', 'pending', 'كريم فتحي', now() - interval '1 day');
insert into public.tenants (name, plan, users_count, branches_count, manager_email) values
 ('مصنع الأصيل للأثاث', 'Professional', 8, 4, 'manager@alaseel.example'),
 ('دار الخشب', 'Professional', 9, 2, 'owner@darelkhashab.example'),
 ('أوك للتصميم', 'Starter', 4, 1, 'hello@oakdesign.example'),
 ('روّاد الأثاث', 'Enterprise', 31, 6, 'it@rowad.example');
insert into public.plans (code, name, limits, price) values
 ('PLN-01', 'Starter', '5 users · 1 branch', 'EGP 990 / month'),
 ('PLN-02', 'Professional', '25 users · 3 branches', 'EGP 2,490 / month'),
 ('PLN-03', 'Enterprise', 'Custom limits', 'Custom pricing');
insert into public.feature_flags (key, name, enabled, sort) values
 ('offline_queue', 'Offline queue', true, 1), ('eta_sandbox', 'ETA sandbox adapter', false, 2),
 ('preview_3d', '3D preview', true, 3), ('requirement_assistant', 'Requirement assistant', true, 4),
 ('ai_draft_actions', 'AI draft actions', false, 5);
insert into public.announcements (code, title, audience, status) values
 ('ANN-01', 'تحديث جديد: معاينة التصميم ثلاثية الأبعاد', 'جميع المصانع', 'منشور'),
 ('ANN-02', 'صيانة مجدولة يوم الجمعة', 'جميع المصانع', 'مسودة');
insert into public.notifications (title_ar, title_en, link, created_at) values
 ('طلب جاهز للتسليم', 'Order ready for delivery', 'sales', now() - interval '15 minutes'),
 ('طلب موافقة جديد', 'New approval request', 'approvals', now() - interval '40 minutes'),
 ('تحديث معاينة التصميم', 'Design preview update', 'preview', now() - interval '2 hours');
