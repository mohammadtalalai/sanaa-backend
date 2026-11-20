
-- =====================================================================
-- FurnitureOS + SANAA AI : core schema
-- =====================================================================

-- ---------- roles & profiles ----------
create type public.app_role as enum ('admin', 'manager', 'employee');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_manager() returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'manager')
$$;
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'manager') or public.has_role(auth.uid(), 'employee')
$$;
create or replace function public.is_platform_admin() returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin')
$$;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.is_manager() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.is_manager() to authenticated, service_role;
grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.is_platform_admin() to authenticated, service_role;

create policy "own profile read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_manager() or public.is_platform_admin());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());

create policy "read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_manager() or public.is_platform_admin());

-- first account becomes owner (admin + manager + employee); later accounts start as employee
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  if not exists (select 1 from public.user_roles) then
    insert into public.user_roles (user_id, role) values (new.id, 'admin'), (new.id, 'manager'), (new.id, 'employee');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'employee') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- ERP tables ----------
create table public.branches (
  id serial primary key,
  code text unique not null,
  name_en text not null,
  name_ar text not null,
  branch_type text not null default 'showroom',
  city text,
  created_at timestamptz not null default now()
);

create table public.sales_reps (
  id serial primary key,
  name_en text not null,
  name_ar text not null,
  branch_id int references public.branches(id)
);

create table public.customers (
  id serial primary key,
  name text not null,
  phone text,
  city text default 'Cairo',
  city_ar text default 'القاهرة',
  customer_type text not null default 'individual',
  source text not null default 'showroom',
  preferred_language text not null default 'ar',
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.product_categories (
  code text primary key,
  name_en text not null,
  name_ar text not null
);

create table public.products (
  id serial primary key,
  sku text unique not null,
  name_en text not null,
  name_ar text not null,
  category_code text references public.product_categories(code),
  catalog_type text,
  wood_en text, wood_ar text, finish_en text, finish_ar text,
  width_cm numeric, depth_cm numeric, height_cm numeric,
  list_price numeric not null default 0,
  unit_cost numeric not null default 0,
  active boolean not null default true
);

create table public.orders (
  id serial primary key,
  order_no text unique not null,
  customer_id int references public.customers(id),
  branch_id int references public.branches(id),
  sales_rep_id int references public.sales_reps(id),
  order_type text not null default 'order',
  channel text not null default 'showroom',
  status text not null default 'draft',
  product_summary text,
  design jsonb,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  promised_date date,
  delivered_at timestamptz,
  updated_at timestamptz not null default now(),
  subtotal numeric not null default 0,
  discount_amount numeric not null default 0,
  vat_pct numeric not null default 14,
  vat_amount numeric not null default 0,
  total_amount numeric not null default 0,
  delivery_city text,
  cancel_reason text,
  invoice_confirmed_at timestamptz,
  customer_tax_id text,
  source_quotation_no text,
  created_by uuid
);
create index orders_customer_idx on public.orders (customer_id);
create index orders_confirmed_idx on public.orders (confirmed_at);

create table public.order_lines (
  id serial primary key,
  order_id int not null references public.orders(id) on delete cascade,
  product_id int not null references public.products(id),
  description text,
  quantity int not null default 1,
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  unit_cost numeric not null default 0
);
create index order_lines_order_idx on public.order_lines (order_id);

create table public.payments (
  id serial primary key,
  order_id int not null references public.orders(id) on delete cascade,
  amount numeric not null check (amount > 0),
  method text not null default 'cash',
  paid_at timestamptz not null default now(),
  recorded_by uuid
);
create index payments_order_idx on public.payments (order_id);

create table public.production_orders (
  id serial primary key,
  po_no text unique not null,
  order_id int references public.orders(id) on delete cascade,
  product_id int references public.products(id),
  status text not null default 'planned',
  quantity int not null default 1,
  planned_start date, planned_end date, actual_start date, actual_end date,
  total_steps int not null default 6,
  completed_steps int not null default 0,
  current_stage_en text,
  material_cost numeric not null default 0,
  labor_cost numeric not null default 0,
  standard_cost numeric not null default 0
);

create table public.suppliers (
  id serial primary key,
  name_en text not null,
  name_ar text not null,
  phone text,
  lead_time_days int not null default 7
);

create table public.materials (
  id serial primary key,
  sku text unique not null,
  name_en text not null,
  name_ar text not null,
  material_type text not null,
  unit text not null,
  stock_qty numeric not null default 0,
  reorder_level numeric not null default 0,
  unit_cost numeric not null default 0,
  supplier_id int references public.suppliers(id),
  warehouse_ar text, warehouse_en text
);

create table public.purchase_orders (
  id serial primary key,
  supplier_id int references public.suppliers(id),
  ordered_at date not null,
  expected_at date,
  received_at date,
  total numeric not null default 0
);

create table public.branch_expenses (
  id serial primary key,
  branch_id int references public.branches(id),
  month_start date not null,
  category text not null default 'operations',
  amount numeric not null default 0
);

create table public.shipments (
  id serial primary key,
  order_id int references public.orders(id) on delete cascade,
  cost numeric not null default 0,
  shipped_at timestamptz,
  delivered_at timestamptz
);

create table public.boms (
  id serial primary key,
  code text unique not null,
  product_name text not null,
  description text,
  status text not null default 'draft'
);

create table public.quality_checks (
  id serial primary key,
  code text unique not null,
  order_id int references public.orders(id) on delete cascade,
  check_name text not null,
  status text not null default 'pending'
);

-- grants + RLS for ERP tables
do $$
declare t text;
begin
  foreach t in array array['branches','sales_reps','customers','product_categories','products','orders','order_lines','payments',
                           'production_orders','suppliers','materials','purchase_orders','branch_expenses','shipments','boms','quality_checks']
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- reference data: staff read, manager writes
do $$
declare t text;
begin
  foreach t in array array['branches','sales_reps','product_categories','products','production_orders','suppliers','materials',
                           'purchase_orders','branch_expenses','shipments','boms','quality_checks']
  loop
    execute format('create policy "staff read" on public.%I for select to authenticated using (public.is_staff())', t);
    execute format('create policy "manager insert" on public.%I for insert to authenticated with check (public.is_manager())', t);
    execute format('create policy "manager update" on public.%I for update to authenticated using (public.is_manager()) with check (public.is_manager())', t);
    execute format('create policy "manager delete" on public.%I for delete to authenticated using (public.is_manager())', t);
  end loop;
end $$;

-- customers: all staff read/create, manager edits/deletes
create policy "staff read" on public.customers for select to authenticated using (public.is_staff());
create policy "staff insert" on public.customers for insert to authenticated with check (public.is_staff());
create policy "manager or creator update" on public.customers for update to authenticated
  using (public.is_manager() or created_by = auth.uid()) with check (public.is_manager() or created_by = auth.uid());
create policy "manager delete" on public.customers for delete to authenticated using (public.is_manager());

-- orders: manager sees all, employee sees own
create policy "manager or own read" on public.orders for select to authenticated
  using (public.is_manager() or (public.is_staff() and created_by = auth.uid()));
create policy "staff insert own" on public.orders for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid());
create policy "manager or own draft update" on public.orders for update to authenticated
  using (public.is_manager() or (public.is_staff() and created_by = auth.uid()))
  with check (public.is_manager() or (public.is_staff() and created_by = auth.uid()));
create policy "manager delete" on public.orders for delete to authenticated using (public.is_manager());

create policy "via order read" on public.order_lines for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy "via order insert" on public.order_lines for insert to authenticated
  with check (exists (select 1 from public.orders o where o.id = order_id));
create policy "via order update" on public.order_lines for update to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy "via order delete" on public.order_lines for delete to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

create policy "via order read" on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy "staff insert via order" on public.payments for insert to authenticated
  with check (public.is_staff() and recorded_by = auth.uid() and exists (select 1 from public.orders o where o.id = order_id));
create policy "manager delete" on public.payments for delete to authenticated using (public.is_manager());

-- ---------- app (UI) tables ----------
create table public.approvals (
  id serial primary key,
  code text unique not null,
  title text not null,
  reason text not null,
  status text not null default 'pending',
  order_id int references public.orders(id) on delete set null,
  requested_by uuid,
  requester_name text,
  decided_by uuid,
  decision_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
grant select, insert, update on public.approvals to authenticated;
grant all on public.approvals to service_role;
alter table public.approvals enable row level security;
create policy "manager or requester read" on public.approvals for select to authenticated
  using (public.is_manager() or requested_by = auth.uid());
create policy "staff request" on public.approvals for insert to authenticated
  with check (public.is_staff() and requested_by = auth.uid());
create policy "manager decide" on public.approvals for update to authenticated using (public.is_manager()) with check (public.is_manager());

create table public.factory_settings (
  id int primary key default 1 check (id = 1),
  factory_name_ar text not null default 'مصنع الأصيل للأثاث',
  factory_name_en text not null default 'Al Aseel Furniture',
  branch_label_ar text not null default 'الفرع الرئيسي · القاهرة',
  branch_label_en text not null default 'Main branch · Cairo',
  phone text default '+20 2 2400 1234',
  tax_pct numeric not null default 14,
  employee_discount_limit numeric not null default 5,
  support_status text not null default 'none',
  support_until timestamptz,
  updated_at timestamptz not null default now()
);
grant select, update on public.factory_settings to authenticated;
grant all on public.factory_settings to service_role;
alter table public.factory_settings enable row level security;
create policy "signed in read" on public.factory_settings for select to authenticated using (true);
create policy "manager or admin update" on public.factory_settings for update to authenticated
  using (public.is_manager() or public.is_platform_admin()) with check (public.is_manager() or public.is_platform_admin());

create table public.tenants (
  id serial primary key,
  name text not null,
  plan text not null default 'Professional',
  users_count int not null default 1,
  branches_count int not null default 1,
  manager_email text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create table public.plans (
  code text primary key,
  name text not null,
  limits text not null,
  price text not null
);
create table public.feature_flags (
  key text primary key,
  name text not null,
  enabled boolean not null default false,
  sort int not null default 0
);
create table public.announcements (
  id serial primary key,
  code text unique not null,
  title text not null,
  audience text not null default 'جميع المصانع',
  status text not null default 'draft',
  created_at timestamptz not null default now()
);
do $$
declare t text;
begin
  foreach t in array array['tenants','plans','feature_flags','announcements'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "signed in read" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "admin insert" on public.%I for insert to authenticated with check (public.is_platform_admin())', t);
    execute format('create policy "admin update" on public.%I for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())', t);
    execute format('create policy "admin delete" on public.%I for delete to authenticated using (public.is_platform_admin())', t);
  end loop;
end $$;

create table public.audit_log (
  id bigserial primary key,
  actor uuid,
  actor_name text,
  action text not null,
  created_at timestamptz not null default now()
);
grant select, insert on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "manager admin or own read" on public.audit_log for select to authenticated
  using (public.is_manager() or public.is_platform_admin() or actor = auth.uid());
create policy "write own entries" on public.audit_log for insert to authenticated with check (actor = auth.uid());

create table public.notifications (
  id serial primary key,
  title_ar text not null,
  title_en text not null,
  link text not null default 'sales',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "signed in read" on public.notifications for select to authenticated using (true);
create policy "staff insert" on public.notifications for insert to authenticated with check (public.is_staff() or public.is_platform_admin());
create policy "signed in mark read" on public.notifications for update to authenticated using (true) with check (true);

create table public.shifts (
  id serial primary key,
  employee uuid not null,
  opening_cash numeric not null default 1000,
  cash_received numeric not null default 0,
  counted_cash numeric,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
grant select, insert, update on public.shifts to authenticated;
grant all on public.shifts to service_role;
alter table public.shifts enable row level security;
create policy "own or manager read" on public.shifts for select to authenticated using (employee = auth.uid() or public.is_manager());
create policy "own insert" on public.shifts for insert to authenticated with check (employee = auth.uid() and public.is_staff());
create policy "own open shift update" on public.shifts for update to authenticated
  using (employee = auth.uid() and closed_at is null) with check (employee = auth.uid());

-- ---------- SANAA AI tables (written only by the server) ----------
create table public.chat_sessions (
  session_id text primary key,
  language varchar(2) not null default 'ar',
  status varchar(20) not null,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.quotations (
  quotation_no varchar(32) primary key,
  session_id text references public.chat_sessions(session_id),
  customer_name text,
  customer_phone varchar(20),
  language varchar(2) not null default 'ar',
  item jsonb not null,
  pricing jsonb not null,
  currency varchar(3) not null default 'EGP',
  total numeric(14,2) not null,
  valid_until date not null,
  status varchar(20) not null default 'draft',
  design_id varchar(40),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create index quotations_phone_idx on public.quotations (customer_phone);
create table public.designs (
  design_id varchar(40) primary key,
  quotation_no varchar(32) not null references public.quotations(quotation_no),
  session_id text references public.chat_sessions(session_id),
  spec jsonb not null,
  files jsonb not null,
  dimension_check jsonb not null,
  status varchar(20) not null default 'pending',
  feedback text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
create index designs_quotation_idx on public.designs (quotation_no);
create table public.analysis_reports (
  id bigserial primary key,
  question text not null,
  language varchar(2) not null,
  sql text,
  result jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create table public.monthly_reports (
  id bigserial primary key,
  period text not null,
  language varchar(2) not null,
  report jsonb not null,
  markdown text,
  created_at timestamptz not null default now()
);
create table public.login_attempts (
  id bigserial primary key,
  ip text not null,
  attempted_at timestamptz not null default now()
);
create index login_attempts_ip_idx on public.login_attempts (ip, attempted_at);

grant all on public.chat_sessions, public.quotations, public.designs, public.analysis_reports, public.monthly_reports, public.login_attempts to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on public.quotations, public.designs, public.analysis_reports, public.monthly_reports to authenticated;
alter table public.chat_sessions enable row level security;
alter table public.quotations enable row level security;
alter table public.designs enable row level security;
alter table public.analysis_reports enable row level security;
alter table public.monthly_reports enable row level security;
alter table public.login_attempts enable row level security;
create policy "manager read" on public.quotations for select to authenticated using (public.is_manager());
create policy "manager read" on public.designs for select to authenticated using (public.is_manager());
create policy "manager admin read" on public.analysis_reports for select to authenticated using (public.is_manager() or public.is_platform_admin());
create policy "manager read" on public.monthly_reports for select to authenticated using (public.is_manager());

-- =====================================================================
-- analytics schema: curated read-only views (same names/columns as the SANAA model)
-- =====================================================================
create schema if not exists analytics;

create or replace view analytics.v_as_of as select current_date as as_of;

create or replace view analytics.v_sales_lines as
select l.id as line_id, o.id as order_id, o.order_no,
       o.confirmed_at::date as sale_date, date_trunc('month', o.confirmed_at)::date as sale_month,
       o.branch_id, b.name_en as branch_name_en, b.name_ar as branch_name_ar,
       o.order_type, o.channel, o.status as order_status, o.delivery_city,
       p.id as product_id, p.sku, p.name_en as product_name_en, p.name_ar as product_name_ar,
       p.category_code, c.name_en as category_name_en, c.name_ar as category_name_ar,
       p.wood_en, p.wood_ar, p.finish_en, p.finish_ar, p.width_cm, p.depth_cm, p.height_cm,
       l.quantity,
       round(l.line_total * (o.subtotal - o.discount_amount) / nullif(o.subtotal, 0), 2) as net_revenue,
       round(l.unit_cost * l.quantity, 2) as cogs,
       round(l.line_total * (o.subtotal - o.discount_amount) / nullif(o.subtotal, 0), 2) - round(l.unit_cost * l.quantity, 2) as gross_profit
from public.order_lines l
join public.orders o on o.id = l.order_id
join public.products p on p.id = l.product_id
left join public.product_categories c on c.code = p.category_code
left join public.branches b on b.id = o.branch_id
where o.confirmed_at is not null and o.status <> 'cancelled';

create or replace view analytics.v_orders as
select o.id as order_id, o.order_no, o.customer_id, o.branch_id, b.name_en as branch_name_en, b.name_ar as branch_name_ar,
       o.sales_rep_id, r.name_en as sales_rep_en, r.name_ar as sales_rep_ar,
       o.order_type, o.channel, o.status, o.created_at, o.confirmed_at,
       date_trunc('month', o.confirmed_at)::date as sale_month, o.promised_date, o.delivered_at,
       (o.confirmed_at is not null and o.status <> 'cancelled') as is_sale,
       o.subtotal, o.discount_amount,
       round(o.discount_amount / nullif(o.subtotal, 0) * 100, 2) as discount_pct,
       o.subtotal - o.discount_amount as net_amount, o.vat_amount, o.total_amount,
       (o.delivered_at is not null and o.delivered_at::date > o.promised_date) as delivered_late,
       (o.delivered_at::date - o.confirmed_at::date) as days_to_deliver,
       o.delivery_city, o.cancel_reason
from public.orders o
left join public.branches b on b.id = o.branch_id
left join public.sales_reps r on r.id = o.sales_rep_id;

create or replace view analytics.v_monthly_sales as
select sale_month, branch_id, branch_name_en, branch_name_ar,
       count(distinct order_id) as orders, sum(quantity) as units,
       sum(net_revenue) as net_revenue, sum(cogs) as cogs, sum(gross_profit) as gross_profit,
       round(sum(gross_profit) / nullif(sum(net_revenue), 0) * 100, 2) as gross_margin_pct
from analytics.v_sales_lines
group by sale_month, branch_id, branch_name_en, branch_name_ar;

create or replace view analytics.v_product_performance as
select p.id as product_id, p.sku, p.name_en as product_name_en, p.name_ar as product_name_ar,
       p.category_code, c.name_en as category_name_en, c.name_ar as category_name_ar,
       coalesce(sum(s.quantity), 0) as units, count(distinct s.order_id) as orders,
       coalesce(sum(s.net_revenue), 0) as net_revenue, coalesce(sum(s.cogs), 0) as cogs,
       coalesce(sum(s.gross_profit), 0) as gross_profit,
       round(sum(s.gross_profit) / nullif(sum(s.net_revenue), 0) * 100, 2) as gross_margin_pct,
       min(s.sale_date) as first_sale, max(s.sale_date) as last_sale
from public.products p
left join public.product_categories c on c.code = p.category_code
left join analytics.v_sales_lines s on s.product_id = p.id
group by p.id, p.sku, p.name_en, p.name_ar, p.category_code, c.name_en, c.name_ar;

create or replace view analytics.v_branch_monthly_pnl as
with sales as (
  select sale_month as m, branch_id, sum(net_revenue) as revenue, sum(cogs) as cogs
  from analytics.v_sales_lines group by 1, 2
), delivery as (
  select date_trunc('month', o.confirmed_at)::date as m, o.branch_id, sum(s.cost) as cost
  from public.shipments s join public.orders o on o.id = s.order_id
  where o.confirmed_at is not null and o.status <> 'cancelled' group by 1, 2
), expenses as (
  select month_start as m, branch_id, sum(amount) as amount from public.branch_expenses group by 1, 2
), keys as (
  select m, branch_id from sales union select m, branch_id from delivery union select m, branch_id from expenses
)
select k.m as month_start, b.id as branch_id, b.code as branch_code, b.name_en as branch_name_en, b.name_ar as branch_name_ar,
       b.branch_type,
       coalesce(s.revenue, 0) as revenue, coalesce(s.cogs, 0) as cogs, coalesce(d.cost, 0) as delivery_cost,
       coalesce(s.revenue, 0) - coalesce(s.cogs, 0) as gross_profit,
       coalesce(e.amount, 0) as operating_expenses,
       coalesce(s.revenue, 0) - coalesce(s.cogs, 0) - coalesce(d.cost, 0) - coalesce(e.amount, 0) as net_profit
from keys k
join public.branches b on b.id = k.branch_id
left join sales s on s.m = k.m and s.branch_id = k.branch_id
left join delivery d on d.m = k.m and d.branch_id = k.branch_id
left join expenses e on e.m = k.m and e.branch_id = k.branch_id;

create or replace view analytics.v_company_monthly_pnl as
select month_start, sum(revenue) as revenue, sum(cogs) as cogs, sum(delivery_cost) as delivery_cost,
       sum(gross_profit) as gross_profit, sum(operating_expenses) as operating_expenses, sum(net_profit) as net_profit,
       round(sum(net_profit) / nullif(sum(revenue), 0) * 100, 2) as net_margin_pct
from analytics.v_branch_monthly_pnl
group by month_start;

create or replace view analytics.v_order_tracking as
select o.id as order_id, o.order_no, o.customer_id, o.branch_id, o.status,
       case o.status when 'draft' then 'مسودة' when 'confirmed' then 'مؤكد' when 'production' then 'قيد التصنيع'
         when 'ready' then 'جاهز للتسليم' when 'shipped' then 'في الطريق إليك' when 'delivered' then 'تم التسليم'
         when 'cancelled' then 'ملغي' else o.status end as status_label_ar,
       case o.status when 'draft' then 'Draft' when 'confirmed' then 'Confirmed' when 'production' then 'In production'
         when 'ready' then 'Ready for delivery' when 'shipped' then 'On the way' when 'delivered' then 'Delivered'
         when 'cancelled' then 'Cancelled' else o.status end as status_label_en,
       case o.status when 'draft' then 0 when 'confirmed' then 1 when 'production' then 2 when 'ready' then 3
         when 'shipped' then 4 when 'delivered' then 5 else -1 end as status_seq,
       o.created_at, o.confirmed_at, o.promised_date, o.delivered_at, o.updated_at as last_update_at,
       coalesce(po.total_steps, 0) as total_steps, coalesce(po.completed_steps, 0) as completed_steps,
       o.total_amount, coalesce(pay.paid, 0) as paid_amount, o.total_amount - coalesce(pay.paid, 0) as balance_due
from public.orders o
left join (select order_id, sum(total_steps) as total_steps, sum(completed_steps) as completed_steps
           from public.production_orders where status <> 'cancelled' group by order_id) po on po.order_id = o.id
left join (select order_id, sum(amount) as paid from public.payments group by order_id) pay on pay.order_id = o.id;

create or replace view analytics.v_inventory_status as
select m.id as material_id, m.sku, m.name_en, m.name_ar, m.material_type, m.unit, m.stock_qty, m.reorder_level,
       round(m.stock_qty * m.unit_cost, 2) as stock_value,
       case when m.stock_qty <= m.reorder_level then 'LOW' else 'OK' end as stock_status,
       s.name_en as supplier_name_en, s.name_ar as supplier_name_ar, s.lead_time_days
from public.materials m left join public.suppliers s on s.id = m.supplier_id;

create or replace view analytics.v_production_status as
select po.id as production_order_id, po.po_no, o.order_no, o.branch_id as sales_branch_id, p.sku,
       p.name_en as product_name_en, p.name_ar as product_name_ar, po.status, po.quantity,
       po.planned_start, po.planned_end, po.actual_start, po.actual_end, po.total_steps, po.completed_steps,
       po.current_stage_en,
       ((po.actual_end is null and po.status not in ('completed', 'cancelled') and po.planned_end < current_date)
         or (po.actual_end is not null and po.actual_end > po.planned_end)) as is_late,
       po.material_cost, po.labor_cost, po.standard_cost
from public.production_orders po
left join public.orders o on o.id = po.order_id
left join public.products p on p.id = po.product_id;

create or replace view analytics.v_customer_summary as
select c.id as customer_id, c.city, c.city_ar, c.customer_type, c.source, c.preferred_language, c.created_at,
       count(o.order_id) filter (where o.is_sale) as orders_count,
       coalesce(sum(o.net_amount) filter (where o.is_sale), 0) as lifetime_net_revenue,
       min(o.confirmed_at) as first_order_at, max(o.confirmed_at) as last_order_at
from public.customers c left join analytics.v_orders o on o.customer_id = c.id
group by c.id, c.city, c.city_ar, c.customer_type, c.source, c.preferred_language, c.created_at;

create or replace view analytics.v_supplier_monthly as
select date_trunc('month', po.ordered_at)::date as month_start, s.id as supplier_id, s.name_en, s.name_ar,
       count(*) as purchase_orders, sum(po.total) as total_spend,
       round(avg(greatest(po.received_at - po.expected_at, 0))::numeric, 2) as avg_delay_days,
       count(*) filter (where po.received_at > po.expected_at) as late_deliveries
from public.purchase_orders po join public.suppliers s on s.id = po.supplier_id
group by 1, s.id, s.name_en, s.name_ar;

-- read-only analyst role: only the analytics views, never v_order_tracking
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'ai_readonly') then
    create role ai_readonly nologin;
  end if;
end $$;
grant usage on schema analytics to ai_readonly;
grant select on all tables in schema analytics to ai_readonly;
revoke select on analytics.v_order_tracking from ai_readonly;
grant ai_readonly to service_role;

-- runs one validated SELECT as ai_readonly inside a read-only transaction
create or replace function public.run_analytics_sql(p_sql text, p_max_rows int default 100)
returns jsonb language plpgsql security invoker set search_path = analytics, pg_catalog as $$
declare
  result jsonb;
  lim int := least(greatest(coalesce(p_max_rows, 100), 1), 5000) + 1;
begin
  perform set_config('transaction_read_only', 'on', true);
  perform set_config('statement_timeout', '15000', true);
  set local role ai_readonly;
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) q limit %s) t', p_sql, lim) into result;
  return result;
end $$;
revoke execute on function public.run_analytics_sql(text, int) from public, anon, authenticated;
grant execute on function public.run_analytics_sql(text, int) to service_role;

-- Phase 5 order tracking: always filtered by order_no AND customer_id
create or replace function public.track_order(p_customer_id int, p_order_no text)
returns jsonb language sql stable security definer set search_path = public, analytics as $$
  select coalesce(jsonb_agg(t), '[]'::jsonb) from (
    select order_id, order_no, customer_id, branch_id, status, status_label_ar, status_label_en, status_seq,
           created_at, confirmed_at, promised_date, delivered_at, last_update_at, total_steps, completed_steps,
           total_amount, paid_amount, balance_due
    from analytics.v_order_tracking where order_no = p_order_no and customer_id = p_customer_id limit 1) t
$$;
create or replace function public.customer_orders(p_customer_id int)
returns jsonb language sql stable security definer set search_path = public, analytics as $$
  select coalesce(jsonb_agg(t), '[]'::jsonb) from (
    select order_no, status, status_label_ar, status_label_en, created_at, promised_date, delivered_at, total_amount, balance_due
    from analytics.v_order_tracking where customer_id = p_customer_id order by created_at desc limit 50) t
$$;
create or replace function public.order_production(p_order_no text)
returns jsonb language sql stable security definer set search_path = public, analytics as $$
  select coalesce(jsonb_agg(t order by t.po_no), '[]'::jsonb) from (
    select po_no, sku, product_name_en, product_name_ar, status, quantity, planned_end, actual_end, total_steps,
           completed_steps, current_stage_en, is_late
    from analytics.v_production_status where order_no = p_order_no) t
$$;
create or replace function public.analytics_views_info()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(table_name, cols), '{}'::jsonb) from (
    select table_name, jsonb_agg(column_name::text order by ordinal_position) as cols
    from information_schema.columns where table_schema = 'analytics' group by table_name) x
$$;
revoke execute on function public.track_order(int, text) from public, anon, authenticated;
revoke execute on function public.customer_orders(int) from public, anon, authenticated;
revoke execute on function public.order_production(text) from public, anon, authenticated;
revoke execute on function public.analytics_views_info() from public, anon, authenticated;
grant execute on function public.track_order(int, text) to service_role;
grant execute on function public.customer_orders(int) to service_role;
grant execute on function public.order_production(text) to service_role;
grant execute on function public.analytics_views_info() to service_role;

-- dashboard numbers for the signed-in staff member (manager: whole factory, employee: own orders)
create or replace function public.dashboard_summary()
returns jsonb language plpgsql stable security definer set search_path = public, analytics as $$
declare
  uid uuid := auth.uid();
  mgr boolean := public.is_manager();
  result jsonb;
begin
  if not public.is_staff() then
    raise exception 'not allowed';
  end if;
  with my as (
    select o.* from public.orders o where mgr or o.created_by = uid
  ), paid as (
    select order_id, sum(amount) as paid from public.payments group by order_id
  ), months as (
    select generate_series(date_trunc('month', current_date) - interval '11 months', date_trunc('month', current_date), interval '1 month')::date as m
  ), monthly as (
    select m.m, coalesce(sum(my.subtotal - my.discount_amount) filter (where my.confirmed_at is not null and my.status <> 'cancelled'), 0) as revenue
    from months m left join my on date_trunc('month', my.confirmed_at)::date = m.m
    group by m.m order by m.m
  )
  select jsonb_build_object(
    'month_sales', (select coalesce(sum(subtotal - discount_amount), 0) from my where confirmed_at >= date_trunc('month', current_date) and status <> 'cancelled'),
    'prev_month_sales', (select coalesce(sum(subtotal - discount_amount), 0) from my where confirmed_at >= date_trunc('month', current_date) - interval '1 month' and confirmed_at < date_trunc('month', current_date) and status <> 'cancelled'),
    'active_orders', (select count(*) from my where status in ('draft','confirmed','production','ready','shipped')),
    'in_production', (select count(*) from my where status = 'production'),
    'ready', (select count(*) from my where status in ('ready','shipped')),
    'drafts', (select count(*) from my where status = 'draft'),
    'confirmed', (select count(*) from my where status = 'confirmed'),
    'monthly', (select jsonb_agg(jsonb_build_object('month', m, 'revenue', revenue) order by m) from monthly),
    'payments_due', (select coalesce(sum(my.total_amount - coalesce(p.paid, 0)), 0) from my left join paid p on p.order_id = my.id where my.status in ('ready','shipped','delivered') and my.total_amount - coalesce(p.paid, 0) > 0),
    'payments_due_customers', (select count(distinct my.customer_id) from my left join paid p on p.order_id = my.id where my.status in ('ready','shipped','delivered') and my.total_amount - coalesce(p.paid, 0) > 0),
    'low_stock', (select count(*) from public.materials where stock_qty <= reorder_level),
    'low_stock_first_ar', (select name_ar from public.materials where stock_qty <= reorder_level order by stock_qty / nullif(reorder_level, 0) limit 1),
    'low_stock_first_en', (select name_en from public.materials where stock_qty <= reorder_level order by stock_qty / nullif(reorder_level, 0) limit 1),
    'pending_approvals', (select count(*) from public.approvals where status = 'pending' and (mgr or requested_by = uid))
  ) into result;
  return result;
end $$;
revoke execute on function public.dashboard_summary() from public, anon;
grant execute on function public.dashboard_summary() to authenticated, service_role;

-- keep updated_at fresh on orders
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();
