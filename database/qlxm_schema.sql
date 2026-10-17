create type app_role     as enum ('owner', 'manager', 'storekeeper', 'accountant', 'leader');
create type pay_kind     as enum ('piece', 'hourly');
create type order_status as enum ('pending', 'in_progress', 'done');
create type period_state as enum ('open', 'closed');
create type fabric_unit  as enum ('roll', 'meter');
create type absence_kind as enum ('leave', 'unpaid');

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
create table profiles (
  id          uuid primary key ,
  employee_id bigint unique references employees (id),
  full_name   text,
  role        app_role not null,
  is_active   boolean  not null default true,
  created_at  timestamptz not null default now(),
  constraint name_xor_employee check ((employee_id is null) = (full_name is not null)),
  constraint name_not_blank    check (full_name is null or length(trim(full_name)) > 0),
  constraint leader_needs_employee check (role <> 'leader' or employee_id is not null)
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
  created_by     uuid references profiles (id),
  created_at     timestamptz not null default now(),
  unique (product_id, effective_from)
);

create table hourly_rates (
  id              bigint generated always as identity primary key,
  zone_id         smallint not null references zones (id),
  rate            numeric(12, 2) not null check (rate >= 0),
  overtime_factor numeric(4, 2)  not null default 1.5 check (overtime_factor >= 1),
  effective_from  date    not null,
  created_by      uuid references profiles (id),
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
  created_by uuid references profiles (id),
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
  created_by   uuid references profiles (id),
  created_at   timestamptz not null default now(),
  constraint receipt_void_reason check (not is_void or length(trim(coalesce(void_reason, ''))) > 0)
);
create index on stock_receipts (supplier_id);

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
  id         bigint generated always as identity primary key,
  code       text   not null unique,
  order_id   bigint references production_orders (id),
  issue_date date   not null default current_date,
  note       text,
  is_void    boolean not null default false,
  void_reason text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  constraint issue_void_reason check (not is_void or length(trim(coalesce(void_reason, ''))) > 0)
);
create index on stock_issues (order_id);

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
  created_by    uuid references profiles (id),
  created_at    timestamptz not null default now()
);
create index on stock_adjustments (fabric_id);

-- ---------- M4: ghi nhận sản xuất ----------
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
  created_by      uuid references profiles (id),
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
  hours           numeric(4, 2) not null default 0 check (hours >= 0 and hours <= 24),
  overtime_hours  numeric(4, 2) not null default 0 check (overtime_hours >= 0 and overtime_hours <= 24),
  hourly_rate     numeric(12, 2) not null check (hourly_rate >= 0),
  overtime_factor numeric(4, 2)  not null check (overtime_factor >= 1),
  absence         absence_kind,
  note            text,
  created_by      uuid references profiles (id),
  created_at      timestamptz not null default now(),
  constraint absence_no_hours check (absence is null or (hours = 0 and overtime_hours = 0)),
  constraint total_hours_max  check (hours + overtime_hours <= 24),
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
