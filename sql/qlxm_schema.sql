-- =====================================================================================
-- QLXM - Schema hoàn chỉnh (Supabase / PostgreSQL 15+). MỘT FILE DUY NHẤT.
-- Chạy một lần trên project Supabase MỚI trong SQL Editor. Không chạy lên database đã có dữ liệu thật.
-- Cuối file có khối tự kiểm tra: báo lỗi nếu thiếu bảng, view, hàm, trigger, RLS hoặc kho ảnh.
--
-- Nội dung (24 bảng, 5 view, RLS theo Bảng 15 của báo cáo):
--   M1 tài khoản, phân quyền, nhật ký       profiles, audit_logs
--   M2 mã hàng, đơn giá, lệnh, định mức vải  products, piece_rates, hourly_rates, production_orders, fabric_norms
--   M3 kho vải và phụ liệu                   suppliers, fabrics, stock_*, accessories, accessory_moves
--   M4 sản lượng, phiếu bó QR                zones, production_logs, bundles, bundle_scans
--   M5 nhân viên, chấm công                  employees, attendance
--   M6 lương                                 payroll_periods, payroll_items (nhân viên xem lương của mình)
--   Trigger: tự điền đơn giá và khu, kiểm tra khu theo hình thức lương, kiểm tồn kho, khóa dữ liệu khi chốt kỳ lương,
--            chặn sửa phiếu kho và sổ phụ liệu đã lập, ghi nhật ký thao tác. anon bị thu hồi mọi quyền.
-- Tạo tài khoản chủ xưởng đầu tiên: Authentication > Add user, rồi chạy (trong SQL Editor):
--   insert into profiles (id, full_name, role) values ('<uuid của user>', 'Chủ xưởng', 'owner');
-- =====================================================================================

-- ---------- LÀM LẠI TỪ ĐẦU (tùy chọn) ----------
-- Nếu báo lỗi kiểu "type app_role already exists" nghĩa là database đã có bản cũ.
-- Khi CHƯA có dữ liệu thật: bỏ dấu "--" ở khối dưới rồi chạy cả file, XÓA SẠCH mọi bảng trong schema public.
-- drop policy if exists product_img_read on storage.objects;
-- drop policy if exists product_img_write on storage.objects;
-- drop schema public cascade;
-- create schema public;
-- grant usage on schema public to postgres, anon, authenticated, service_role;
-- grant all on schema public to postgres, service_role;
-- alter default privileges in schema public grant all on tables to postgres, service_role;
-- alter default privileges in schema public grant all on functions to postgres, service_role;
-- alter default privileges in schema public grant all on sequences to postgres, service_role;

-- ======================================= 1. Kiểu dữ liệu =============================
create type app_role     as enum ('owner', 'manager', 'storekeeper', 'accountant', 'leader', 'worker');
create type pay_kind     as enum ('piece', 'hourly');
create type order_status as enum ('pending', 'in_progress', 'done');
create type period_state as enum ('open', 'closed');
create type fabric_unit  as enum ('roll', 'meter');
create type absence_kind as enum ('leave', 'unpaid');

-- ======================================= 2. Bảng ======================================
-- ---------- 5 khu sản xuất ----------
create table zones (
  id         smallint generated always as identity primary key,
  code       text     not null unique,
  name       text     not null,
  pay_kind   pay_kind not null,
  sort_order smallint not null unique
);
insert into zones (code, name, pay_kind, sort_order) values
  ('cut',       'Cắt',      'hourly', 1),
  ('sew',       'May',      'piece',  2),
  ('accessory', 'Phụ liệu', 'hourly', 3),
  ('iron',      'Là',       'hourly', 4),
  ('pack',      'Đóng gói', 'hourly', 5);

-- ---------- M5: hồ sơ nhân viên ----------
create table employees (
  id         bigint generated always as identity primary key,
  full_name  text     not null check (length(trim(full_name)) > 0),
  phone      text,
  zone_id    smallint not null references zones (id),
  is_leader  boolean  not null default false,
  join_date  date     not null default current_date,
  leave_date date,
  created_at timestamptz not null default now(),
  constraint leave_after_join check (leave_date is null or leave_date >= join_date)
);
create index on employees (zone_id);

-- ---------- M1: tài khoản người dùng (gắn với Supabase Auth) ----------
-- Có liên kết nhân viên thì lấy tên từ nhân viên (full_name để null); không liên kết thì phải có full_name.
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  employee_id bigint unique references employees (id),
  full_name   text,
  role        app_role not null,
  is_active   boolean  not null default true,
  created_at  timestamptz not null default now(),
  constraint name_xor_employee check ((employee_id is null) = (full_name is not null)),
  constraint name_not_blank    check (full_name is null or length(trim(full_name)) > 0),
  constraint leader_needs_employee check (role <> 'leader' or employee_id is not null),
  constraint worker_needs_employee check (role <> 'worker' or employee_id is not null)
);

-- ---------- M2: mã hàng và đơn giá ----------
create table products (
  id          bigint generated always as identity primary key,
  code        text not null unique,
  name        text not null,
  description text,
  image_url   text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table piece_rates (
  id             bigint generated always as identity primary key,
  product_id     bigint  not null references products (id) on delete restrict,
  rate           numeric(12, 2) not null check (rate >= 0),
  effective_from date    not null,
  created_by     uuid default auth.uid() references profiles (id),
  created_at     timestamptz not null default now(),
  unique (product_id, effective_from)
);

create table hourly_rates (
  id              bigint generated always as identity primary key,
  zone_id         smallint not null references zones (id),
  rate            numeric(12, 2) not null check (rate >= 0),
  overtime_factor numeric(4, 2)  not null default 1.5 check (overtime_factor >= 1),
  effective_from  date    not null,
  created_by      uuid default auth.uid() references profiles (id),
  created_at      timestamptz not null default now(),
  unique (zone_id, effective_from)
);

-- ---------- M2: lệnh sản xuất ----------
create table production_orders (
  id         bigint generated always as identity primary key,
  code       text   not null unique,
  product_id bigint not null references products (id),
  quantity   integer not null check (quantity > 0),
  due_date   date   not null,
  note       text,
  created_by uuid default auth.uid() references profiles (id),
  created_at timestamptz not null default now()
);
create index on production_orders (product_id);
create index on production_orders (due_date);

-- ---------- M3: kho vải ----------
create table suppliers (
  id        bigint generated always as identity primary key,
  name      text not null,
  phone     text,
  note      text,
  is_active boolean not null default true
);

create table fabrics (
  id        bigint generated always as identity primary key,
  code      text        not null unique,
  name      text        not null,
  color     text        not null,
  unit      fabric_unit not null,
  min_stock numeric(12, 2) not null default 0 check (min_stock >= 0),
  is_active boolean     not null default true
);

create table stock_receipts (
  id           bigint generated always as identity primary key,
  code         text   not null unique,
  supplier_id  bigint references suppliers (id),
  receipt_date date   not null default current_date,
  note         text,
  is_void      boolean not null default false,
  void_reason  text,
  created_by   uuid default auth.uid() references profiles (id),
  created_at   timestamptz not null default now(),
  constraint receipt_void_reason check (not is_void or length(trim(coalesce(void_reason, ''))) > 0)
);
create index on stock_receipts (supplier_id);
create index on stock_receipts (receipt_date);

create table stock_receipt_items (
  id         bigint generated always as identity primary key,
  receipt_id bigint not null references stock_receipts (id) on delete restrict,
  fabric_id  bigint not null references fabrics (id),
  quantity   numeric(12, 2) not null check (quantity > 0),
  note       text
);
create index on stock_receipt_items (receipt_id);
create index on stock_receipt_items (fabric_id);

create table stock_issues (
  id          bigint generated always as identity primary key,
  code        text   not null unique,
  order_id    bigint references production_orders (id),
  issue_date  date   not null default current_date,
  note        text,
  is_void     boolean not null default false,
  void_reason text,
  created_by  uuid default auth.uid() references profiles (id),
  created_at  timestamptz not null default now(),
  constraint issue_void_reason check (not is_void or length(trim(coalesce(void_reason, ''))) > 0)
);
create index on stock_issues (order_id);
create index on stock_issues (issue_date);

create table stock_issue_items (
  id        bigint generated always as identity primary key,
  issue_id  bigint not null references stock_issues (id) on delete restrict,
  fabric_id bigint not null references fabrics (id),
  quantity  numeric(12, 2) not null check (quantity > 0)
);
create index on stock_issue_items (issue_id);
create index on stock_issue_items (fabric_id);

create table stock_adjustments (
  id            bigint generated always as identity primary key,
  fabric_id     bigint not null references fabrics (id),
  quantity_diff numeric(12, 2) not null check (quantity_diff <> 0),
  reason        text   not null check (length(trim(reason)) > 0),
  adjusted_on   date   not null default current_date,
  created_by    uuid default auth.uid() references profiles (id),
  created_at    timestamptz not null default now()
);
create index on stock_adjustments (fabric_id);

-- ---------- M4: ghi nhận sản xuất ----------
-- Khu may (khoán): một dòng cho mỗi công nhân, unit_rate lấy tự động.
-- Khu giờ: một dòng cho cả khu (employee_id null, unit_rate null).
create table production_logs (
  id              bigint generated always as identity primary key,
  order_id        bigint   not null references production_orders (id) on delete restrict,
  zone_id         smallint not null references zones (id),
  employee_id     bigint references employees (id),
  log_date        date     not null default current_date,
  quantity        integer  not null check (quantity >= 0),
  defect_quantity integer  not null default 0 check (defect_quantity >= 0),
  unit_rate       numeric(12, 2) check (unit_rate is null or unit_rate >= 0),
  note            text,
  created_by      uuid default auth.uid() references profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint piece_log_consistency check ((employee_id is null) = (unit_rate is null)),
  constraint one_log_per_day unique nulls not distinct (order_id, zone_id, employee_id, log_date)
);
create index on production_logs (employee_id, log_date);
create index on production_logs (zone_id, log_date);
create index on production_logs (log_date);

-- ---------- M5: chấm công khu tính giờ ----------
create table attendance (
  id              bigint generated always as identity primary key,
  employee_id     bigint   not null references employees (id),
  zone_id         smallint not null references zones (id),
  work_date       date     not null,
  time_in         time,
  time_out        time,
  hours           numeric(4, 2) not null default 0 check (hours >= 0 and hours <= 24),
  overtime_hours  numeric(4, 2) not null default 0 check (overtime_hours >= 0 and overtime_hours <= 24),
  hourly_rate     numeric(12, 2) not null check (hourly_rate >= 0),
  overtime_factor numeric(4, 2)  not null check (overtime_factor >= 1),
  absence         absence_kind,
  note            text,
  created_by      uuid default auth.uid() references profiles (id),
  created_at      timestamptz not null default now(),
  constraint absence_no_hours check (absence is null or (hours = 0 and overtime_hours = 0)),
  constraint total_hours_max  check (hours + overtime_hours <= 24),
  constraint time_in_out_pair check ((time_in is null) = (time_out is null)),
  unique (employee_id, work_date)
);
create index on attendance (work_date);
create index on attendance (zone_id, work_date);

-- ---------- M6: kỳ lương ----------
create table payroll_periods (
  id         bigint generated always as identity primary key,
  month      date not null unique check (extract(day from month) = 1),
  status     period_state not null default 'open',
  closed_by  uuid references profiles (id),
  closed_at  timestamptz,
  created_at timestamptz not null default now(),
  constraint closed_consistency check ((status = 'closed') = (closed_at is not null))
);

create table payroll_items (
  id            bigint generated always as identity primary key,
  period_id     bigint not null references payroll_periods (id) on delete restrict,
  employee_id   bigint not null references employees (id),
  piece_amount  numeric(14, 2) not null default 0 check (piece_amount  >= 0),
  hourly_amount numeric(14, 2) not null default 0 check (hourly_amount >= 0),
  bonus         numeric(14, 2) not null default 0 check (bonus   >= 0),
  penalty       numeric(14, 2) not null default 0 check (penalty >= 0),
  advance       numeric(14, 2) not null default 0 check (advance >= 0),
  total         numeric(14, 2) generated always as
                (piece_amount + hourly_amount + bonus - penalty - advance) stored,
  note          text,
  unique (period_id, employee_id)
);
create index on payroll_items (employee_id);

-- ---------- Nhật ký thao tác ----------
create table audit_logs (
  id         bigint generated always as identity primary key,
  table_name text not null,
  record_id  text not null,
  action     text not null check (action in ('insert', 'update', 'delete')),
  old_data   jsonb,
  new_data   jsonb,
  user_id    uuid,
  created_at timestamptz not null default now()
);
create index on audit_logs (table_name, record_id);
create index on audit_logs (created_at);

-- ---------- Bổ sung: M2.7 định mức vải, M3.8 phụ liệu, M4.7 phiếu bó ----------
-- ---------- M2.7: định mức vải ----------
-- qty_per_unit: lượng vải cho MỘT sản phẩm, tính theo đơn vị của loại vải (mét hoặc cuộn).
create table fabric_norms (
  id           bigint generated always as identity primary key,
  product_id   bigint not null references products (id) on delete cascade,
  fabric_id    bigint not null references fabrics (id),
  qty_per_unit numeric(10, 3) not null check (qty_per_unit > 0),
  note         text,
  created_by   uuid default auth.uid() references profiles (id),
  created_at   timestamptz not null default now(),
  unique (product_id, fabric_id)
);
create index on fabric_norms (fabric_id);

-- ---------- M3.8: phụ liệu ----------
create table accessories (
  id        bigint generated always as identity primary key,
  code      text not null unique,
  name      text not null check (length(trim(name)) > 0),
  unit      text not null check (length(trim(unit)) > 0),   -- cái, bộ, cuộn, gói...
  min_stock numeric(12, 2) not null default 0 check (min_stock >= 0),
  is_active boolean not null default true
);

-- Sổ nhập xuất phụ liệu: mỗi dòng không sửa, không xóa; nhập sai thì ghi dòng 'adjust' kèm lý do.
-- quantity có dấu: receipt > 0, issue < 0, adjust khác 0. Tồn = tổng quantity.
create table accessory_moves (
  id           bigint generated always as identity primary key,
  accessory_id bigint not null references accessories (id),
  kind         text   not null check (kind in ('receipt', 'issue', 'adjust')),
  quantity     numeric(12, 2) not null check (quantity <> 0),
  move_date    date   not null default current_date,
  order_id     bigint references production_orders (id),
  supplier_id  bigint references suppliers (id),
  note         text,
  created_by   uuid default auth.uid() references profiles (id),
  created_at   timestamptz not null default now(),
  constraint move_sign check ((kind = 'receipt' and quantity > 0) or (kind = 'issue' and quantity < 0) or kind = 'adjust'),
  constraint adjust_needs_note check (kind <> 'adjust' or length(trim(coalesce(note, ''))) > 0)
);
create index on accessory_moves (accessory_id);
create index on accessory_moves (move_date);
create index on accessory_moves (order_id);

-- ---------- M4.7: phiếu bó và quét công đoạn ----------
-- Một lệnh cắt thành nhiều bó; mỗi bó có mã (vd LSX-001-B003) in thành mã QR dán lên bó.
create table bundles (
  id         bigint generated always as identity primary key,
  order_id   bigint   not null references production_orders (id) on delete restrict,
  bundle_no  integer  not null check (bundle_no > 0),
  code       text     not null unique,
  size       text,
  quantity   integer  not null check (quantity > 0),
  note       text,
  created_by uuid default auth.uid() references profiles (id),
  created_at timestamptz not null default now(),
  unique (order_id, bundle_no)
);

-- Mỗi bó đi qua mỗi khu một lần. Khu may (khoán) phải ghi công nhân may bó đó; khu khác không ghi.
create table bundle_scans (
  id              bigint generated always as identity primary key,
  bundle_id       bigint   not null references bundles (id) on delete restrict,
  zone_id         smallint not null references zones (id),
  employee_id     bigint references employees (id),
  defect_quantity integer  not null default 0 check (defect_quantity >= 0),
  scan_date       date     not null default current_date,
  scanned_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references profiles (id),
  unique (bundle_id, zone_id)
);
create index on bundle_scans (zone_id, scan_date);
create index on bundle_scans (employee_id);

-- ======================================= 3. Hàm tiện ích ==============================
-- Vai trò, khu, nhân viên của người đang đăng nhập (null nếu chưa có hồ sơ hoặc bị khóa).
create function app_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create function app_employee() returns bigint
language sql stable security definer set search_path = public as $$
  select employee_id from profiles where id = auth.uid() and is_active
$$;

create function app_zone() returns smallint
language sql stable security definer set search_path = public as $$
  select e.zone_id from profiles p join employees e on e.id = p.employee_id
  where p.id = auth.uid() and p.is_active
$$;

-- Tháng của ngày d đã chốt lương chưa.
create function is_period_closed(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from payroll_periods where month = date_trunc('month', d)::date and status = 'closed')
$$;

-- Tồn kho hiện tại của một loại vải = nhập - xuất (phiếu chưa hủy) + điều chỉnh kiểm kê.
create function fabric_balance(p_fabric bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(i.quantity) from stock_receipt_items i join stock_receipts h on h.id = i.receipt_id
                   where i.fabric_id = p_fabric and not h.is_void), 0)
       - coalesce((select sum(i.quantity) from stock_issue_items i join stock_issues h on h.id = i.issue_id
                   where i.fabric_id = p_fabric and not h.is_void), 0)
       + coalesce((select sum(quantity_diff) from stock_adjustments where fabric_id = p_fabric), 0)
$$;

-- M6.8: kỳ lương đã chốt hay chưa (nhân viên không đọc được bảng kỳ lương nên cần hàm riêng)
create function period_is_closed(p_period bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from payroll_periods where id = p_period and status = 'closed')
$$;
-- ======================================= 4. View (ứng dụng dùng) ======================
create view v_employees with (security_invoker = true) as
  select e.*, z.pay_kind,
         (e.leave_date is null or e.leave_date > current_date) as is_active
  from employees e join zones z on z.id = e.zone_id;

create view v_stock_balance with (security_invoker = true) as
  select f.id as fabric_id, f.code, f.name, f.color, f.unit, f.min_stock, f.is_active,
         coalesce(r.q, 0) - coalesce(i.q, 0) + coalesce(a.q, 0) as balance
  from fabrics f
  left join (select it.fabric_id, sum(it.quantity) q from stock_receipt_items it
             join stock_receipts h on h.id = it.receipt_id where not h.is_void group by it.fabric_id) r on r.fabric_id = f.id
  left join (select it.fabric_id, sum(it.quantity) q from stock_issue_items it
             join stock_issues h on h.id = it.issue_id where not h.is_void group by it.fabric_id) i on i.fabric_id = f.id
  left join (select fabric_id, sum(quantity_diff) q from stock_adjustments group by fabric_id) a on a.fabric_id = f.id;

-- Trạng thái lệnh: hoàn thành khi khu cuối (sort_order lớn nhất) đủ số lượng; đang làm khi đã có sản lượng.
-- View này chạy với quyền chủ view để mọi vai trò đều thấy trạng thái đúng (tổ trưởng không thấy sản lượng khu khác).
create view v_order_status as
  with fin as (select id from zones order by sort_order desc limit 1),
       done as (select l.order_id, sum(l.quantity) q from production_logs l
                where l.zone_id = (select id from fin) group by l.order_id),
       started as (select distinct order_id from production_logs)
  select o.id as order_id,
         (case when coalesce(d.q, 0) >= o.quantity then 'done'
               when s.order_id is not null then 'in_progress'
               else 'pending' end)::order_status as status,
         coalesce(d.q, 0) as finished_quantity
  from production_orders o
  left join done d on d.order_id = o.id
  left join started s on s.order_id = o.id
  where app_role() is not null;

-- Mỗi (lệnh, loại vải): vải theo định mức (= số lượng lệnh x định mức), vải đã xuất (phiếu chưa hủy), chênh lệch.
-- Vải xuất cho lệnh nhưng chưa có định mức vẫn hiện (định mức = 0). Quyền xem theo RLS của người gọi.
create view v_order_fabric_usage with (security_invoker = true) as
  with issued as (
    select h.order_id, i.fabric_id, sum(i.quantity) as issued_qty
    from stock_issue_items i join stock_issues h on h.id = i.issue_id
    where not h.is_void and h.order_id is not null
    group by h.order_id, i.fabric_id),
  planned as (
    select o.id as order_id, n.fabric_id, o.quantity * n.qty_per_unit as planned_qty
    from production_orders o join fabric_norms n on n.product_id = o.product_id)
  select coalesce(p.order_id, s.order_id)   as order_id,
         coalesce(p.fabric_id, s.fabric_id) as fabric_id,
         coalesce(p.planned_qty, 0)         as planned_qty,
         coalesce(s.issued_qty, 0)          as issued_qty,
         coalesce(s.issued_qty, 0) - coalesce(p.planned_qty, 0) as diff_qty
  from planned p full join issued s on s.order_id = p.order_id and s.fabric_id = p.fabric_id;

create view v_accessory_balance with (security_invoker = true) as
  select a.id as accessory_id, a.code, a.name, a.unit, a.min_stock, a.is_active,
         coalesce(sum(m.quantity), 0) as balance
  from accessories a left join accessory_moves m on m.accessory_id = a.id
  group by a.id;

-- ======================================= 5. Trigger ===================================
-- ---------- Sản lượng: tự điền khu, đơn giá; kiểm tra khu; khóa khi chốt kỳ ----------
create function trg_production_logs() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_emp employees;
  v_kind pay_kind;
  v_product bigint;
  v_rate numeric;
  v_date date := case when tg_op = 'INSERT' then new.log_date else old.log_date end;
begin
  if is_period_closed(v_date) then
    raise exception 'Kỳ lương tháng % đã chốt, không thêm, sửa, xóa sản lượng được', to_char(v_date, 'MM/YYYY');
  end if;

  if tg_op = 'DELETE' then return old; end if;

  if tg_op = 'UPDATE' then
    if (new.order_id, new.zone_id, new.employee_id, new.log_date) is distinct from
       (old.order_id, old.zone_id, old.employee_id, old.log_date)
       or new.unit_rate is distinct from old.unit_rate then
      raise exception 'Không sửa được lệnh, khu, công nhân, ngày hay đơn giá; hãy xóa rồi nhập lại';
    end if;
    new.updated_at := now();
    return new;
  end if;

  -- INSERT
  if new.employee_id is not null then
    select * into v_emp from employees where id = new.employee_id;
    if not found then raise exception 'Không tìm thấy công nhân'; end if;
    if v_emp.leave_date is not null and v_emp.leave_date < new.log_date then
      raise exception 'Công nhân % đã nghỉ việc trước ngày %', v_emp.full_name, new.log_date;
    end if;
    new.zone_id := v_emp.zone_id;
    select pay_kind into v_kind from zones where id = new.zone_id;
    if v_kind <> 'piece' then
      raise exception 'Công nhân này thuộc khu tính giờ; hãy ghi sản lượng cả khu (bỏ trống công nhân)';
    end if;
    select product_id into v_product from production_orders where id = new.order_id;
    select rate into v_rate from piece_rates
      where product_id = v_product and effective_from <= new.log_date
      order by effective_from desc limit 1;
    if v_rate is null then
      raise exception 'Chưa có đơn giá may của mã hàng này tại ngày %', new.log_date;
    end if;
    new.unit_rate := v_rate;
  else
    select pay_kind into v_kind from zones where id = new.zone_id;
    if v_kind = 'piece' then raise exception 'Khu may phải chọn công nhân'; end if;
    new.unit_rate := null;
  end if;
  return new;
end $$;

create trigger trg_production_logs before insert or update or delete on production_logs
  for each row execute function trg_production_logs();

-- ---------- Chấm công: tự điền khu, đơn giá giờ; chỉ khu tính giờ; khóa khi chốt kỳ ----------
create function trg_attendance() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_emp employees;
  v_kind pay_kind;
  v_rate hourly_rates;
  v_date date := case when tg_op = 'INSERT' then new.work_date else old.work_date end;
begin
  if is_period_closed(v_date) then
    raise exception 'Kỳ lương tháng % đã chốt, không thêm, sửa, xóa chấm công được', to_char(v_date, 'MM/YYYY');
  end if;

  if tg_op = 'DELETE' then return old; end if;

  if tg_op = 'UPDATE' then
    if (new.employee_id, new.zone_id, new.work_date, new.hourly_rate, new.overtime_factor) is distinct from
       (old.employee_id, old.zone_id, old.work_date, old.hourly_rate, old.overtime_factor) then
      raise exception 'Không sửa được nhân viên, ngày, khu hay đơn giá; hãy xóa rồi chấm công lại';
    end if;
    return new;
  end if;

  select * into v_emp from employees where id = new.employee_id;
  if not found then raise exception 'Không tìm thấy nhân viên'; end if;
  if v_emp.leave_date is not null and v_emp.leave_date < new.work_date then
    raise exception 'Nhân viên % đã nghỉ việc trước ngày %', v_emp.full_name, new.work_date;
  end if;
  select pay_kind into v_kind from zones where id = v_emp.zone_id;
  if v_kind <> 'hourly' then
    raise exception 'Nhân viên khu may tính khoán sản phẩm, không chấm công theo giờ';
  end if;
  select * into v_rate from hourly_rates
    where zone_id = v_emp.zone_id and effective_from <= new.work_date
    order by effective_from desc limit 1;
  if not found then raise exception 'Chưa có đơn giá giờ cho khu này tại ngày %', new.work_date; end if;

  new.zone_id := v_emp.zone_id;
  new.hourly_rate := v_rate.rate;
  new.overtime_factor := v_rate.overtime_factor;
  return new;
end $$;

create trigger trg_attendance before insert or update or delete on attendance
  for each row execute function trg_attendance();

-- ---------- Kho: kiểm tồn khi xuất, khóa dòng phiếu, hủy phiếu có kiểm tra ----------
create function trg_issue_items() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_balance numeric;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Dòng phiếu xuất đã lập không sửa hay xóa được; hãy hủy phiếu (kèm lý do) và lập phiếu mới';
  end if;
  if exists (select 1 from stock_issues where id = new.issue_id and is_void) then
    raise exception 'Phiếu xuất đã hủy';
  end if;
  perform 1 from fabrics where id = new.fabric_id for update;   -- tuần tự hóa các lần xuất cùng loại vải
  v_balance := fabric_balance(new.fabric_id);
  if v_balance < new.quantity then
    raise exception 'Tồn kho không đủ (còn %)', v_balance;
  end if;
  return new;
end $$;
create trigger trg_issue_items before insert or update or delete on stock_issue_items
  for each row execute function trg_issue_items();

create function trg_receipt_items() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Dòng phiếu nhập đã lập không sửa hay xóa được; hãy hủy phiếu (kèm lý do) và lập phiếu mới';
  end if;
  if exists (select 1 from stock_receipts where id = new.receipt_id and is_void) then
    raise exception 'Phiếu nhập đã hủy';
  end if;
  return new;
end $$;
create trigger trg_receipt_items before insert or update or delete on stock_receipt_items
  for each row execute function trg_receipt_items();

-- Hủy phiếu nhập không được làm tồn âm; không khôi phục phiếu đã hủy.
create function trg_receipts_void() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if old.is_void and not new.is_void then
    raise exception 'Không khôi phục được phiếu đã hủy';
  end if;
  if not old.is_void and new.is_void then
    for r in select fabric_id, sum(quantity) q from stock_receipt_items where receipt_id = new.id group by fabric_id loop
      perform 1 from fabrics where id = r.fabric_id for update;
      if fabric_balance(r.fabric_id) - r.q < 0 then
        raise exception 'Hủy phiếu % làm tồn kho âm (vải đã được xuất)', new.code;
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger trg_receipts_void before update on stock_receipts
  for each row execute function trg_receipts_void();

create function trg_issues_void() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.is_void and not new.is_void then
    raise exception 'Không khôi phục được phiếu đã hủy';
  end if;
  return new;
end $$;
create trigger trg_issues_void before update on stock_issues
  for each row execute function trg_issues_void();

-- Kiểm kê: không làm tồn âm; bản ghi kiểm kê không sửa, xóa.
create function trg_adjustments() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Bản ghi kiểm kê không sửa hay xóa được; hãy lập bản ghi điều chỉnh mới';
  end if;
  perform 1 from fabrics where id = new.fabric_id for update;
  if fabric_balance(new.fabric_id) + new.quantity_diff < 0 then
    raise exception 'Điều chỉnh làm tồn kho âm';
  end if;
  return new;
end $$;
create trigger trg_adjustments before insert or update or delete on stock_adjustments
  for each row execute function trg_adjustments();

-- ---------- Lương: chỉ sửa khi kỳ còn mở; chốt xong không mở lại ----------
create function trg_payroll_items() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_period bigint := coalesce(new.period_id, old.period_id);
begin
  if tg_op = 'UPDATE' and new.period_id <> old.period_id then
    raise exception 'Không chuyển dòng lương sang kỳ khác';
  end if;
  if exists (select 1 from payroll_periods where id = v_period and status = 'closed') then
    raise exception 'Kỳ lương đã chốt, không sửa được';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_payroll_items before insert or update or delete on payroll_items
  for each row execute function trg_payroll_items();

create function trg_payroll_periods() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'closed' then raise exception 'Không xóa kỳ lương đã chốt'; end if;
    return old;
  end if;
  if old.status = 'closed' then
    raise exception 'Kỳ lương đã chốt, không mở lại hay sửa được';
  end if;
  if new.month <> old.month then raise exception 'Không đổi tháng của kỳ lương'; end if;
  if new.status = 'closed' then
    new.closed_at := now();
    new.closed_by := auth.uid();
  end if;
  return new;
end $$;
create trigger trg_payroll_periods before update or delete on payroll_periods
  for each row execute function trg_payroll_periods();

-- ---------- Tài khoản: luôn còn ít nhất một chủ xưởng đang hoạt động ----------
create function trg_profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner' and old.is_active
     and (tg_op = 'DELETE' or new.role <> 'owner' or not new.is_active)
     and not exists (select 1 from profiles where role = 'owner' and is_active and id <> old.id) then
    raise exception 'Phải còn ít nhất một chủ xưởng đang hoạt động';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_profiles_guard before update or delete on profiles
  for each row execute function trg_profiles_guard();

-- ---------- Phụ liệu: sổ nhập xuất chỉ thêm, không sửa, không xóa ----------
create function trg_accessory_moves() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_balance numeric;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Dòng nhập xuất phụ liệu không sửa hay xóa được; hãy ghi một dòng điều chỉnh (kiểm kê) kèm lý do';
  end if;
  perform 1 from accessories where id = new.accessory_id for update;   -- tuần tự hóa theo từng loại phụ liệu
  select coalesce(sum(quantity), 0) into v_balance from accessory_moves where accessory_id = new.accessory_id;
  if v_balance + new.quantity < 0 then
    raise exception 'Tồn phụ liệu không đủ (còn %)', v_balance;
  end if;
  return new;
end $$;
create trigger trg_accessory_moves before insert or update or delete on accessory_moves
  for each row execute function trg_accessory_moves();

-- ---------- Phiếu bó: tự sinh mã bó; lượt quét kiểm tra khu, công nhân, khóa khi chốt kỳ ----------
create function trg_bundles() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if tg_op = 'UPDATE' and (new.order_id, new.bundle_no, new.code, new.quantity) is distinct from
     (old.order_id, old.bundle_no, old.code, old.quantity) then
    raise exception 'Không sửa lệnh, số bó, mã hay số lượng của bó; hãy xóa rồi tạo lại';
  end if;
  if tg_op = 'INSERT' then
    select code into v_code from production_orders where id = new.order_id;
    new.code := v_code || '-B' || lpad(new.bundle_no::text, 3, '0');
  end if;
  return new;
end $$;
create trigger trg_bundles before insert or update on bundles
  for each row execute function trg_bundles();

create function trg_bundle_scans() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_qty integer;
  v_emp employees;
  v_kind pay_kind;
begin
  if tg_op = 'UPDATE' then raise exception 'Lượt quét không sửa được; hãy xóa rồi quét lại'; end if;
  if tg_op = 'DELETE' then
    if is_period_closed(old.scan_date) then
      raise exception 'Kỳ lương tháng % đã chốt, không xóa lượt quét được', to_char(old.scan_date, 'MM/YYYY');
    end if;
    return old;
  end if;
  if is_period_closed(new.scan_date) then
    raise exception 'Kỳ lương tháng % đã chốt, không quét thêm được', to_char(new.scan_date, 'MM/YYYY');
  end if;
  select quantity into v_qty from bundles where id = new.bundle_id;
  if new.defect_quantity > v_qty then
    raise exception 'Số lỗi (%) lớn hơn số lượng của bó (%)', new.defect_quantity, v_qty;
  end if;
  select pay_kind into v_kind from zones where id = new.zone_id;
  if new.employee_id is not null then
    select * into v_emp from employees where id = new.employee_id;
    if not found then raise exception 'Không tìm thấy công nhân'; end if;
    if v_emp.zone_id <> new.zone_id then raise exception 'Công nhân % không thuộc khu này', v_emp.full_name; end if;
    if v_emp.leave_date is not null and v_emp.leave_date < new.scan_date then
      raise exception 'Công nhân % đã nghỉ việc trước ngày %', v_emp.full_name, new.scan_date;
    end if;
  end if;
  if v_kind = 'piece' and new.employee_id is null then raise exception 'Khu may phải chọn công nhân may bó này'; end if;
  if v_kind <> 'piece' and new.employee_id is not null then raise exception 'Khu này tính theo giờ, không ghi công nhân'; end if;
  return new;
end $$;
create trigger trg_bundle_scans before insert or update or delete on bundle_scans
  for each row execute function trg_bundle_scans();

-- ---------- Nhật ký thao tác ----------
create function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_logs (table_name, record_id, action, new_data, user_id)
    values (tg_table_name, to_jsonb(new)->>'id', 'insert', to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    if to_jsonb(old) is distinct from to_jsonb(new) then
      insert into audit_logs (table_name, record_id, action, old_data, new_data, user_id)
      values (tg_table_name, to_jsonb(new)->>'id', 'update', to_jsonb(old), to_jsonb(new), auth.uid());
    end if;
    return new;
  else
    insert into audit_logs (table_name, record_id, action, old_data, user_id)
    values (tg_table_name, to_jsonb(old)->>'id', 'delete', to_jsonb(old), auth.uid());
    return old;
  end if;
end $$;

-- payroll_items không ghi vì "Tính lương" ghi lại hàng loạt; kỳ lương và dòng gốc đã được ghi.
do $$
declare t text;
begin
  foreach t in array array['production_logs', 'attendance', 'products', 'production_orders', 'employees',
    'piece_rates', 'hourly_rates', 'payroll_periods', 'fabrics', 'suppliers', 'stock_receipts', 'stock_issues',
    'stock_adjustments', 'profiles', 'fabric_norms', 'accessories', 'accessory_moves', 'bundles', 'bundle_scans']
  loop
    execute format('create trigger trg_audit after insert or update or delete on %I for each row execute function audit_row()', t);
  end loop;
end $$;

-- ======================================= 6. RLS theo Bảng 15 ==========================
-- Viết tắt trong policy: (select app_role()) được cache một lần cho cả câu truy vấn.
alter table zones               enable row level security;
alter table employees           enable row level security;
alter table profiles            enable row level security;
alter table products            enable row level security;
alter table piece_rates         enable row level security;
alter table hourly_rates        enable row level security;
alter table production_orders   enable row level security;
alter table suppliers           enable row level security;
alter table fabrics             enable row level security;
alter table stock_receipts      enable row level security;
alter table stock_receipt_items enable row level security;
alter table stock_issues        enable row level security;
alter table stock_issue_items   enable row level security;
alter table stock_adjustments   enable row level security;
alter table production_logs     enable row level security;
alter table attendance          enable row level security;
alter table payroll_periods     enable row level security;
alter table payroll_items       enable row level security;
alter table audit_logs          enable row level security;
alter table fabric_norms        enable row level security;
alter table accessories         enable row level security;
alter table accessory_moves     enable row level security;
alter table bundles             enable row level security;
alter table bundle_scans        enable row level security;

-- Khu
create policy zones_read on zones for select to authenticated using ((select app_role()) is not null);

-- Nhân viên: chủ xưởng, quản lý, kế toán xem hết; tổ trưởng xem khu mình; mọi người xem hồ sơ của chính mình
create policy emp_read on employees for select to authenticated using (
  (select app_role()) in ('owner', 'manager', 'accountant')
  or ((select app_role()) = 'leader' and zone_id = (select app_zone()))
  or id = (select app_employee()));
create policy emp_insert on employees for insert to authenticated with check ((select app_role()) in ('owner', 'manager'));
create policy emp_update on employees for update to authenticated
  using ((select app_role()) in ('owner', 'manager')) with check ((select app_role()) in ('owner', 'manager'));
create policy emp_delete on employees for delete to authenticated using ((select app_role()) = 'owner');

-- Tài khoản: mỗi người đọc hồ sơ mình, chủ xưởng quản lý tất cả (tạo tài khoản qua Edge Function)
create policy prof_read on profiles for select to authenticated
  using (id = auth.uid() or (select app_role()) = 'owner');
create policy prof_owner_insert on profiles for insert to authenticated with check ((select app_role()) = 'owner');
create policy prof_owner_update on profiles for update to authenticated
  using ((select app_role()) = 'owner') with check ((select app_role()) = 'owner');
create policy prof_owner_delete on profiles for delete to authenticated using ((select app_role()) = 'owner');

-- Mã hàng: mọi vai trò xem; chủ xưởng, quản lý sửa
create policy prod_read on products for select to authenticated using ((select app_role()) is not null);
create policy prod_insert on products for insert to authenticated with check ((select app_role()) in ('owner', 'manager'));
create policy prod_update on products for update to authenticated
  using ((select app_role()) in ('owner', 'manager')) with check ((select app_role()) in ('owner', 'manager'));
create policy prod_delete on products for delete to authenticated using ((select app_role()) in ('owner', 'manager'));

-- Đơn giá: chủ xưởng sửa; quản lý, kế toán xem
create policy prate_read on piece_rates for select to authenticated using ((select app_role()) in ('owner', 'manager', 'accountant'));
create policy prate_insert on piece_rates for insert to authenticated with check ((select app_role()) = 'owner');
create policy prate_delete on piece_rates for delete to authenticated using ((select app_role()) = 'owner');
create policy hrate_read on hourly_rates for select to authenticated using ((select app_role()) in ('owner', 'manager', 'accountant'));
create policy hrate_insert on hourly_rates for insert to authenticated with check ((select app_role()) = 'owner');
create policy hrate_delete on hourly_rates for delete to authenticated using ((select app_role()) = 'owner');

-- Lệnh sản xuất: mọi vai trò xem; chủ xưởng, quản lý sửa
create policy ord_read on production_orders for select to authenticated using ((select app_role()) is not null);
create policy ord_insert on production_orders for insert to authenticated with check ((select app_role()) in ('owner', 'manager'));
create policy ord_update on production_orders for update to authenticated
  using ((select app_role()) in ('owner', 'manager')) with check ((select app_role()) in ('owner', 'manager'));
create policy ord_delete on production_orders for delete to authenticated using ((select app_role()) in ('owner', 'manager'));

-- Kho vải: chủ xưởng, quản lý, kế toán xem; thủ kho toàn quyền
create policy sup_read on suppliers for select to authenticated using ((select app_role()) in ('owner', 'manager', 'storekeeper', 'accountant'));
create policy sup_insert on suppliers for insert to authenticated with check ((select app_role()) = 'storekeeper');
create policy sup_update on suppliers for update to authenticated
  using ((select app_role()) = 'storekeeper') with check ((select app_role()) = 'storekeeper');

create policy fab_read on fabrics for select to authenticated using ((select app_role()) in ('owner', 'manager', 'storekeeper', 'accountant'));
create policy fab_insert on fabrics for insert to authenticated with check ((select app_role()) = 'storekeeper');
create policy fab_update on fabrics for update to authenticated
  using ((select app_role()) = 'storekeeper') with check ((select app_role()) = 'storekeeper');

create policy rec_read on stock_receipts for select to authenticated using ((select app_role()) in ('owner', 'manager', 'storekeeper', 'accountant'));
create policy rec_insert on stock_receipts for insert to authenticated with check ((select app_role()) = 'storekeeper');
create policy rec_update on stock_receipts for update to authenticated
  using ((select app_role()) = 'storekeeper') with check ((select app_role()) = 'storekeeper');
create policy rec_delete on stock_receipts for delete to authenticated using ((select app_role()) = 'storekeeper');
create policy reci_read on stock_receipt_items for select to authenticated using ((select app_role()) in ('owner', 'manager', 'storekeeper', 'accountant'));
create policy reci_insert on stock_receipt_items for insert to authenticated with check ((select app_role()) = 'storekeeper');

create policy iss_read on stock_issues for select to authenticated using ((select app_role()) in ('owner', 'manager', 'storekeeper', 'accountant'));
create policy iss_insert on stock_issues for insert to authenticated with check ((select app_role()) = 'storekeeper');
create policy iss_update on stock_issues for update to authenticated
  using ((select app_role()) = 'storekeeper') with check ((select app_role()) = 'storekeeper');
create policy iss_delete on stock_issues for delete to authenticated using ((select app_role()) = 'storekeeper');
create policy issi_read on stock_issue_items for select to authenticated using ((select app_role()) in ('owner', 'manager', 'storekeeper', 'accountant'));
create policy issi_insert on stock_issue_items for insert to authenticated with check ((select app_role()) = 'storekeeper');

create policy adj_read on stock_adjustments for select to authenticated using ((select app_role()) in ('owner', 'manager', 'storekeeper', 'accountant'));
create policy adj_insert on stock_adjustments for insert to authenticated with check ((select app_role()) = 'storekeeper');

-- Sản lượng: chủ xưởng, quản lý, kế toán xem; nhân viên xem của mình; tổ trưởng xem và nhập, sửa, xóa trong khu mình
create policy log_read on production_logs for select to authenticated using (
  (select app_role()) in ('owner', 'manager', 'accountant')
  or ((select app_role()) = 'leader' and zone_id = (select app_zone()))
  or ((select app_role()) = 'worker' and employee_id = (select app_employee())));
create policy log_insert on production_logs for insert to authenticated
  with check ((select app_role()) = 'leader' and zone_id = (select app_zone()));
create policy log_update on production_logs for update to authenticated
  using ((select app_role()) = 'leader' and zone_id = (select app_zone()))
  with check ((select app_role()) = 'leader' and zone_id = (select app_zone()));
create policy log_delete on production_logs for delete to authenticated
  using ((select app_role()) = 'leader' and zone_id = (select app_zone()));

-- Chấm công: chủ xưởng, kế toán xem; quản lý xem, sửa; tổ trưởng nhập, sửa trong khu mình
create policy att_read on attendance for select to authenticated using (
  (select app_role()) in ('owner', 'manager', 'accountant')
  or ((select app_role()) = 'leader' and zone_id = (select app_zone()))
  or ((select app_role()) = 'worker' and employee_id = (select app_employee())));
create policy att_insert on attendance for insert to authenticated with check (
  (select app_role()) = 'manager' or ((select app_role()) = 'leader' and zone_id = (select app_zone())));
create policy att_update on attendance for update to authenticated
  using ((select app_role()) = 'manager' or ((select app_role()) = 'leader' and zone_id = (select app_zone())))
  with check ((select app_role()) = 'manager' or ((select app_role()) = 'leader' and zone_id = (select app_zone())));
create policy att_delete on attendance for delete to authenticated
  using ((select app_role()) = 'manager' or ((select app_role()) = 'leader' and zone_id = (select app_zone())));

-- Lương: kế toán tạo kỳ, tính, nhập thưởng/phạt; chủ xưởng chốt kỳ; hai vai trò này xem; nhân viên chỉ xem dòng của mình ở kỳ đã chốt
create policy pper_read on payroll_periods for select to authenticated using (
  (select app_role()) in ('owner', 'accountant') or ((select app_role()) = 'worker' and status = 'closed'));
create policy pper_insert on payroll_periods for insert to authenticated with check ((select app_role()) = 'accountant');
create policy pper_update on payroll_periods for update to authenticated
  using ((select app_role()) = 'owner') with check ((select app_role()) = 'owner');
create policy pitem_read on payroll_items for select to authenticated using (
  (select app_role()) in ('owner', 'accountant')
  or ((select app_role()) = 'worker' and employee_id = (select app_employee()) and period_is_closed(period_id)));
create policy pitem_insert on payroll_items for insert to authenticated with check ((select app_role()) = 'accountant');
create policy pitem_update on payroll_items for update to authenticated
  using ((select app_role()) = 'accountant') with check ((select app_role()) = 'accountant');

-- Định mức vải: chủ xưởng, quản lý sửa; thủ kho, kế toán xem
create policy norm_read on fabric_norms for select to authenticated
  using ((select app_role()) in ('owner', 'manager', 'storekeeper', 'accountant'));
create policy norm_insert on fabric_norms for insert to authenticated with check ((select app_role()) in ('owner', 'manager'));
create policy norm_update on fabric_norms for update to authenticated
  using ((select app_role()) in ('owner', 'manager')) with check ((select app_role()) in ('owner', 'manager'));
create policy norm_delete on fabric_norms for delete to authenticated using ((select app_role()) in ('owner', 'manager'));

-- Phụ liệu: thủ kho toàn quyền; chủ xưởng, quản lý, kế toán xem (giống kho vải)
create policy acc_read on accessories for select to authenticated
  using ((select app_role()) in ('owner', 'manager', 'storekeeper', 'accountant'));
create policy acc_insert on accessories for insert to authenticated with check ((select app_role()) = 'storekeeper');
create policy acc_update on accessories for update to authenticated
  using ((select app_role()) = 'storekeeper') with check ((select app_role()) = 'storekeeper');
create policy accm_read on accessory_moves for select to authenticated
  using ((select app_role()) in ('owner', 'manager', 'storekeeper', 'accountant'));
create policy accm_insert on accessory_moves for insert to authenticated with check ((select app_role()) = 'storekeeper');

-- Bó: chủ xưởng, quản lý tạo, xóa; kế toán, tổ trưởng xem (tổ trưởng cần tra mã khi quét)
create policy bun_read on bundles for select to authenticated
  using ((select app_role()) in ('owner', 'manager', 'accountant', 'leader'));
create policy bun_insert on bundles for insert to authenticated with check ((select app_role()) in ('owner', 'manager'));
create policy bun_update on bundles for update to authenticated
  using ((select app_role()) in ('owner', 'manager')) with check ((select app_role()) in ('owner', 'manager'));
create policy bun_delete on bundles for delete to authenticated using ((select app_role()) in ('owner', 'manager'));

-- Lượt quét: tổ trưởng quét, xóa trong khu mình; chủ xưởng, quản lý, kế toán xem hết
create policy scan_read on bundle_scans for select to authenticated using (
  (select app_role()) in ('owner', 'manager', 'accountant')
  or ((select app_role()) = 'leader' and zone_id = (select app_zone())));
create policy scan_insert on bundle_scans for insert to authenticated
  with check ((select app_role()) = 'leader' and zone_id = (select app_zone()));
create policy scan_delete on bundle_scans for delete to authenticated
  using ((select app_role()) = 'leader' and zone_id = (select app_zone()));

-- Nhật ký: chỉ chủ xưởng xem; không ai sửa, xóa (chỉ trigger ghi)
create policy audit_read on audit_logs for select to authenticated using ((select app_role()) = 'owner');

-- ======================================= 7. Quyền truy cập ============================
-- Khách chưa đăng nhập (anon) không được gì; người đăng nhập đi qua RLS ở trên.
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on functions from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Hàm tiện ích chỉ cho người đã đăng nhập gọi; trigger chạy bằng quyền chủ hàm.
revoke execute on function app_role(), app_employee(), app_zone(), is_period_closed(date), period_is_closed(bigint), fabric_balance(bigint) from public, anon;
grant  execute on function app_role(), app_employee(), app_zone(), is_period_closed(date), period_is_closed(bigint), fabric_balance(bigint) to authenticated;

-- ======================================= 8. Kho ảnh mẫu mã hàng =======================
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
    on conflict (id) do nothing;
    execute 'drop policy if exists product_img_read on storage.objects';
    execute 'drop policy if exists product_img_write on storage.objects';
    execute 'create policy product_img_read on storage.objects for select using (bucket_id = ''product-images'')';
    execute 'create policy product_img_write on storage.objects for insert to authenticated
             with check (bucket_id = ''product-images'' and (select app_role()) in (''owner'', ''manager''))';
  end if;
end $$;

-- ======================================= 9. Ghi chú vận hành ==========================
-- * Sao lưu: bật Backups trong Supabase (hoặc pg_dump theo lịch), giữ 7 bản, khôi phục thử một lần trước khi bàn giao.
-- * Edge Function manage-user tạo tài khoản bằng service_role nên không bị RLS chặn.
-- * Mỗi ngày một dòng sản lượng cho mỗi (lệnh, khu, công nhân): ràng buộc one_log_per_day. Nếu xưởng cần nhập theo ca,
--   thêm cột shift vào ràng buộc này.

-- ======================================= 10. Tự kiểm tra =============================
-- Báo lỗi (và dừng) nếu thiếu bất kỳ thành phần nào mà ứng dụng cần.
do $$
declare
  v_tables text[] := array['zones','employees','profiles','products','piece_rates','hourly_rates','production_orders',
    'suppliers','fabrics','stock_receipts','stock_receipt_items','stock_issues','stock_issue_items','stock_adjustments',
    'production_logs','attendance','payroll_periods','payroll_items','audit_logs',
    'fabric_norms','accessories','accessory_moves','bundles','bundle_scans'];
  v_views text[] := array['v_employees','v_stock_balance','v_order_status','v_order_fabric_usage','v_accessory_balance'];
  v_funcs text[] := array['app_role','app_employee','app_zone','is_period_closed','period_is_closed','fabric_balance','audit_row'];
  v_triggers text[][] := array[
    ['production_logs','trg_production_logs'],['attendance','trg_attendance'],['stock_issue_items','trg_issue_items'],
    ['stock_receipt_items','trg_receipt_items'],['stock_receipts','trg_receipts_void'],['stock_issues','trg_issues_void'],
    ['stock_adjustments','trg_adjustments'],['payroll_items','trg_payroll_items'],['payroll_periods','trg_payroll_periods'],
    ['profiles','trg_profiles_guard'],['accessory_moves','trg_accessory_moves'],['bundles','trg_bundles'],
    ['bundle_scans','trg_bundle_scans']];
  v_name text;
  v_missing text := '';
  i int;
begin
  foreach v_name in array v_tables loop
    if to_regclass('public.' || v_name) is null then v_missing := v_missing || ' bảng ' || v_name || ';';
    else
      if not (select relrowsecurity from pg_class where oid = ('public.' || v_name)::regclass) then
        v_missing := v_missing || ' RLS của ' || v_name || ';';
      end if;
      if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = v_name) then
        v_missing := v_missing || ' policy của ' || v_name || ';';
      end if;
      if v_name not in ('payroll_items','zones','stock_receipt_items','stock_issue_items','audit_logs')
         and not exists (select 1 from pg_trigger where tgrelid = ('public.' || v_name)::regclass and tgname = 'trg_audit') then
        v_missing := v_missing || ' nhật ký của ' || v_name || ';';
      end if;
    end if;
  end loop;
  foreach v_name in array v_views loop
    if to_regclass('public.' || v_name) is null then v_missing := v_missing || ' view ' || v_name || ';'; end if;
  end loop;
  foreach v_name in array v_funcs loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = v_name) then
      v_missing := v_missing || ' hàm ' || v_name || ';';
    end if;
  end loop;
  for i in 1 .. array_length(v_triggers, 1) loop
    if not exists (select 1 from pg_trigger where tgrelid = ('public.' || v_triggers[i][1])::regclass and tgname = v_triggers[i][2]) then
      v_missing := v_missing || ' trigger ' || v_triggers[i][2] || ';';
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    foreach v_name in array v_tables loop
      if has_table_privilege('anon', 'public.' || v_name, 'select') then v_missing := v_missing || ' anon còn quyền đọc ' || v_name || ';'; end if;
    end loop;
  end if;
  if to_regclass('storage.buckets') is not null
     and not exists (select 1 from storage.buckets where id = 'product-images') then
    v_missing := v_missing || ' kho ảnh product-images;';
  end if;
  if (select count(*) from zones) <> 5 then v_missing := v_missing || ' đủ 5 khu sản xuất;'; end if;
  if v_missing <> '' then raise exception 'QLXM thiếu:%', v_missing; end if;
  raise notice 'QLXM: đủ % bảng, % view, % hàm, % trigger nghiệp vụ, RLS và policy cho mọi bảng.',
    array_length(v_tables, 1), array_length(v_views, 1), array_length(v_funcs, 1), array_length(v_triggers, 1);
end $$;
