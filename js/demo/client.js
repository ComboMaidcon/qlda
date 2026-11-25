// Máy khách giả lập một phần API của Supabase (from/select/insert/update/upsert...) trên dữ liệu trong bộ nhớ,
// để chạy giao diện mà không cần database. Mô phỏng các trigger chính: đơn giá, khu, tồn kho, tổng lương.
import { createSeed } from './seed.js';

const EMBED_KEY = {
  products: 'product_id', zones: 'zone_id', employees: 'employee_id',
  production_orders: 'order_id', payroll_periods: 'period_id',
  fabrics: 'fabric_id', suppliers: 'supplier_id', accessories: 'accessory_id', bundles: 'bundle_id',
};
const UNIQUE = {
  products: ['code'], production_orders: ['code'], fabrics: ['code'], payroll_periods: ['month'],
  piece_rates: ['product_id', 'effective_from'], hourly_rates: ['zone_id', 'effective_from'],
  attendance: ['employee_id', 'work_date'],
  production_logs: ['order_id', 'zone_id', 'employee_id', 'log_date'],
  fabric_norms: ['product_id', 'fabric_id'], accessories: ['code'],
  bundles: ['order_id', 'bundle_no'], bundle_scans: ['bundle_id', 'zone_id'],
};

const AUDITED = new Set(['production_logs', 'attendance', 'products', 'production_orders', 'employees',
  'piece_rates', 'hourly_rates', 'payroll_periods', 'fabrics', 'suppliers', 'stock_receipts', 'stock_issues',
  'stock_adjustments', 'profiles', 'fabric_norms', 'accessories', 'accessory_moves', 'bundles', 'bundle_scans']);

const fill = (row, defaults) => {
  const out = { ...row };
  Object.keys(defaults).forEach(key => { if (out[key] == null) out[key] = defaults[key]; });
  return out;
};
const sum = (rows, field) => rows.reduce((total, r) => total + Number(r[field]), 0);

export function createDemoClient() {
  const tables = createSeed();
  const byId = (table, id) => tables[table].find(r => r.id == id) ?? null;
  const nextId = table => Math.max(0, ...tables[table].map(r => r.id)) + 1;

  const latestRate = (table, key, value, date) =>
    tables[table]
      .filter(r => r[key] == value && r.effective_from <= date)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];

  function stockOf(fabricId) {
    const live = (items, headers, link) => items.filter(
      i => i.fabric_id == fabricId && !tables[headers].find(h => h.id == i[link]).is_void);
    return sum(live(tables.stock_receipt_items, 'stock_receipts', 'receipt_id'), 'quantity')
      - sum(live(tables.stock_issue_items, 'stock_issues', 'issue_id'), 'quantity')
      + sum(tables.stock_adjustments.filter(a => a.fabric_id == fabricId), 'quantity_diff');
  }

  const views = {
    v_employees: () => tables.employees.map(e => ({
      ...e, pay_kind: byId('zones', e.zone_id)?.pay_kind, is_active: !e.leave_date,
    })),
    v_stock_balance: () => tables.fabrics.map(f => ({ ...f, fabric_id: f.id, balance: stockOf(f.id) })),
    v_accessory_balance: () => tables.accessories.map(a => ({
      ...a, accessory_id: a.id, balance: sum(tables.accessory_moves.filter(m => m.accessory_id == a.id), 'quantity'),
    })),
    v_order_fabric_usage: () => {
      const keys = new Map();
      const slot = (orderId, fabricId) => {
        const k = `${orderId}-${fabricId}`;
        if (!keys.has(k)) keys.set(k, { order_id: orderId, fabric_id: fabricId, planned_qty: 0, issued_qty: 0 });
        return keys.get(k);
      };
      tables.production_orders.forEach(o => tables.fabric_norms.filter(n => n.product_id == o.product_id)
        .forEach(n => { slot(o.id, n.fabric_id).planned_qty = o.quantity * n.qty_per_unit; }));
      tables.stock_issue_items.forEach(i => {
        const head = byId('stock_issues', i.issue_id);
        if (head && !head.is_void && head.order_id != null) slot(head.order_id, i.fabric_id).issued_qty += Number(i.quantity);
      });
      return [...keys.values()].map(r => ({ ...r, diff_qty: r.issued_qty - r.planned_qty }));
    },
    v_order_status: () => {
      const lastZone = tables.zones.reduce((a, b) => (b.sort_order > a.sort_order ? b : a));
      return tables.production_orders.map(o => {
        const logs = tables.production_logs.filter(l => l.order_id === o.id);
        const finished = sum(logs.filter(l => l.zone_id === lastZone.id), 'quantity');
        const status = finished >= o.quantity ? 'done' : logs.length ? 'in_progress' : 'pending';
        return { order_id: o.id, status };
      });
    },
  };

  const retotal = row => {
    if (row.piece_amount === undefined) return row;
    row.total = Number(row.piece_amount) + Number(row.hourly_amount) + Number(row.bonus)
      - Number(row.penalty) - Number(row.advance);
    return row;
  };
  const assertOpen = periodId => {
    if (byId('payroll_periods', periodId)?.status !== 'open') throw new Error('Kỳ lương đã chốt');
  };

  // Mô phỏng trigger BEFORE INSERT của database.
  const hooks = {
    employees: r => ({ ...r, is_leader: r.is_leader === true || r.is_leader === 'true', leave_date: r.leave_date ?? null }),
    products: r => fill(r, { is_active: true }),
    suppliers: r => fill(r, { is_active: true }),
    stock_adjustments: r => fill(r, { reason: '' }),
    accessories: r => fill(r, { is_active: true, min_stock: 0 }),
    accessory_moves: r => {
      const q = Number(r.quantity);
      if ((r.kind === 'receipt' && q <= 0) || (r.kind === 'issue' && q >= 0) || q === 0) throw new Error('Dữ liệu không hợp lệ (move_sign)');
      if (r.kind === 'adjust' && !String(r.note ?? '').trim()) throw new Error('Điều chỉnh phải có lý do');
      const balance = sum(tables.accessory_moves.filter(m => m.accessory_id == r.accessory_id), 'quantity');
      if (balance + q < 0) throw new Error(`Tồn phụ liệu không đủ (còn ${balance})`);
      return fill(r, { move_date: new Date().toLocaleDateString('sv-SE') });
    },
    bundles: r => {
      const order = byId('production_orders', r.order_id);
      return { ...r, code: `${order.code}-B${String(r.bundle_no).padStart(3, '0')}` };
    },
    bundle_scans: r => {
      const bundle = byId('bundles', r.bundle_id);
      const kind = byId('zones', r.zone_id)?.pay_kind;
      const defect = Number(r.defect_quantity ?? 0);
      if (defect > bundle.quantity) throw new Error(`Số lỗi (${defect}) lớn hơn số lượng của bó (${bundle.quantity})`);
      if (r.employee_id != null && byId('employees', r.employee_id).zone_id != r.zone_id) throw new Error('Công nhân không thuộc khu này');
      if (kind === 'piece' && r.employee_id == null) throw new Error('Khu may phải chọn công nhân may bó này');
      if (kind !== 'piece' && r.employee_id != null) throw new Error('Khu này tính theo giờ, không ghi công nhân');
      return fill({ ...r, defect_quantity: defect }, { scan_date: new Date().toLocaleDateString('sv-SE'), scanned_at: new Date().toISOString() });
    },
    stock_receipts: r => fill(r, { is_void: false, receipt_date: new Date().toLocaleDateString('sv-SE') }),
    stock_issues: r => fill(r, { is_void: false, issue_date: new Date().toLocaleDateString('sv-SE') }),
    payroll_periods: r => fill(r, { status: 'open', closed_at: null }),
    payroll_items: r => {
      assertOpen(r.period_id);
      return retotal(fill(r, { piece_amount: 0, hourly_amount: 0, bonus: 0, penalty: 0, advance: 0 }));
    },
    stock_issue_items: r => {
      if (stockOf(r.fabric_id) < r.quantity) throw new Error('Tồn kho không đủ');
      return r;
    },
    production_logs: r => {
      const base = fill(r, { defect_quantity: 0 });
      if (!r.employee_id) return fill(base, { unit_rate: null });
      const order = byId('production_orders', r.order_id);
      const rate = latestRate('piece_rates', 'product_id', order.product_id, r.log_date);
      if (!rate) throw new Error('Chưa có đơn giá cho mã hàng này');
      return { ...base, zone_id: byId('employees', r.employee_id).zone_id, unit_rate: Number(rate.rate) };
    },
    attendance: r => {
      const employee = byId('employees', r.employee_id);
      const rate = latestRate('hourly_rates', 'zone_id', employee.zone_id, r.work_date);
      if (!rate) throw new Error('Chưa có đơn giá giờ cho khu này');
      return fill({ ...r, zone_id: employee.zone_id, hourly_rate: Number(rate.rate), overtime_factor: Number(rate.overtime_factor) },
        { hours: 0, overtime_hours: 0 });
    },
  };

  // Mô phỏng trigger ghi nhật ký thao tác của database.
  const audit = (table, action, before, after) => {
    if (!AUDITED.has(table)) return;
    tables.audit_logs.push({
      id: nextId('audit_logs'), table_name: table, record_id: String((after ?? before).id), action,
      old_data: before, new_data: after, user_id: 'demo', created_at: new Date().toISOString(),
    });
  };

  function insertRow(table, input) {
    const row = hooks[table] ? hooks[table](input) : { ...input };
    const keys = UNIQUE[table];
    if (keys && tables[table].some(x => keys.every(k => (x[k] ?? null) == (row[k] ?? null)))) {
      throw new Error('Dữ liệu bị trùng, bản ghi đã tồn tại');
    }
    const saved = { ...row, id: row.id ?? nextId(table), created_at: new Date().toISOString() };
    tables[table].push(saved);
    audit(table, 'insert', null, { ...saved });
    return saved;
  }

  // Gắn bản ghi liên quan cho các cột dạng "tên_bảng(cột, cột)".
  function embed(rows, columns) {
    const names = [...columns.matchAll(/(\w+)\([^)]*\)/g)].map(m => m[1]);
    return rows.map(row => {
      const out = { ...row };
      names.forEach(name => { out[name] = byId(name, row[EMBED_KEY[name]]); });
      return out;
    });
  }

  class Query {
    constructor(table) {
      Object.assign(this, { table, op: 'select', columns: '*', filters: [], sorts: [], max: null, payload: null, opts: {}, shape: null, wantRows: false });
    }
    select(columns = '*') { if (this.op !== 'select') this.wantRows = true; this.columns = columns; return this; }
    insert(values) { this.op = 'insert'; this.payload = values; return this; }
    update(values) { this.op = 'update'; this.payload = values; return this; }
    upsert(values, opts = {}) { this.op = 'upsert'; this.payload = values; this.opts = opts; return this; }
    eq(col, value) { this.filters.push(r => r[col] == value); return this; }
    gte(col, value) { this.filters.push(r => r[col] >= value); return this; }
    lt(col, value) { this.filters.push(r => r[col] < value); return this; }
    lte(col, value) { this.filters.push(r => r[col] <= value); return this; }
    in(col, values) { this.filters.push(r => values.some(v => r[col] == v)); return this; }
    range(from, to) { this.window = [from, to]; return this; }
    delete() { this.op = 'delete'; return this; }
    not(col) { this.filters.push(r => r[col] != null); return this; }   // dùng cho .not(col, 'is', null)
    order(col, { ascending = true } = {}) { this.sorts.push({ col, ascending }); return this; }
    limit(n) { this.max = n; return this; }
    single() { this.shape = 'single'; return this; }
    maybeSingle() { this.shape = 'maybe'; return this; }
    then(resolve, reject) { return this.execute().then(resolve, reject); }

    async execute() {
      try {
        const rows = this.rows();
        if (this.shape === 'single') {
          if (!rows.length) throw new Error('Không tìm thấy dòng nào');
          return { data: rows[0], error: null };
        }
        if (this.shape === 'maybe') return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      } catch (err) {
        return { data: null, error: { message: err.message } };
      }
    }

    rows() {
      if (this.op === 'insert') return this.done(toList(this.payload).map(r => insertRow(this.table, r)));
      if (this.op === 'update') return this.done(this.update_());
      if (this.op === 'delete') return this.done(this.delete_());
      if (this.op === 'upsert') return this.done(this.upsert_());
      return this.read();
    }
    done(rows) { return this.wantRows ? rows.map(r => ({ ...r })) : []; }

    update_() {
      const targets = tables[this.table].filter(r => this.filters.every(f => f(r)));
      targets.forEach(row => {
        if (this.table === 'payroll_items') assertOpen(row.period_id);
        const before = { ...row };
        Object.assign(row, this.payload);
        if (this.table === 'payroll_items') retotal(row);
        audit(this.table, 'update', before, { ...row });
      });
      return targets;
    }

    delete_() {
      const targets = tables[this.table].filter(r => this.filters.every(f => f(r)));
      targets.forEach(row => {
        if (this.table === 'payroll_items') assertOpen(row.period_id);
        if (this.table === 'bundles' && tables.bundle_scans.some(x => x.bundle_id === row.id)) {
          throw new Error('Dữ liệu đang được dùng ở nơi khác nên không xóa hoặc sửa được.');
        }
        if (this.table === 'production_orders' && tables.production_logs.some(l => l.order_id === row.id)) {
          throw new Error('Dữ liệu đang được dùng ở nơi khác nên không xóa hoặc sửa được.');
        }
        tables[this.table].splice(tables[this.table].indexOf(row), 1);
        audit(this.table, 'delete', { ...row }, null);
      });
      return targets;
    }

    upsert_() {
      const keys = this.opts.onConflict.split(',');
      return toList(this.payload).map(item => {
        const existing = tables[this.table].find(x => keys.every(k => x[k] == item[k]));
        if (!existing) return insertRow(this.table, item);
        assertOpen(existing.period_id);
        return retotal(Object.assign(existing, item));
      });
    }

    read() {
      const source = views[this.table] ? views[this.table]() : tables[this.table];
      if (!source) throw new Error(`Không có bảng ${this.table}`);
      let rows = source.filter(r => this.filters.every(f => f(r)));
      rows = [...rows].sort((a, b) => {
        for (const { col, ascending } of this.sorts) {
          const x = a[col] ?? '', y = b[col] ?? '';
          if (x !== y) return (x > y ? 1 : -1) * (ascending ? 1 : -1);
        }
        return 0;
      });
      if (this.window) rows = rows.slice(this.window[0], this.window[1] + 1);
      if (this.max != null) rows = rows.slice(0, this.max);
      return embed(rows, this.columns);
    }
  }

  const toList = value => (Array.isArray(value) ? value : [value]);

  // Giả lập Edge Function manage-user: chỉ tạo hồ sơ trong bộ nhớ.
  async function invoke(name, body) {
    if (name !== 'manage-user') return { data: null, error: { message: 'Không có hàm ' + name } };
    if (body.action === 'create') {
      insertRow('profiles', { id: `u${Date.now()}`, role: body.role, is_active: true,
        full_name: body.employee_id ? null : body.full_name, employee_id: body.employee_id ?? null });
    }
    return { data: { ok: true }, error: null };
  }
  return { from: table => new Query(table), invoke };
}
