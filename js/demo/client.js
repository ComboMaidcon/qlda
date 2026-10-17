// Máy khách giả lập một phần API của Supabase (from/select/insert/update/upsert...) trên dữ liệu trong bộ nhớ,
// để chạy giao diện mà không cần database. Mô phỏng các trigger chính: đơn giá, khu, tồn kho, tổng lương.
import { createSeed } from './seed.js';

const EMBED_KEY = {
  products: 'product_id', zones: 'zone_id', employees: 'employee_id',
  production_orders: 'order_id', payroll_periods: 'period_id',
};
const UNIQUE = {
  products: ['code'], production_orders: ['code'], fabrics: ['code'], payroll_periods: ['month'],
  piece_rates: ['product_id', 'effective_from'], hourly_rates: ['zone_id', 'effective_from'],
  attendance: ['employee_id', 'work_date'],
  production_logs: ['order_id', 'zone_id', 'employee_id', 'log_date'],
};

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

  function insertRow(table, input) {
    const row = hooks[table] ? hooks[table](input) : { ...input };
    const keys = UNIQUE[table];
    if (keys && tables[table].some(x => keys.every(k => (x[k] ?? null) == (row[k] ?? null)))) {
      throw new Error('Dữ liệu bị trùng, bản ghi đã tồn tại');
    }
    const saved = { ...row, id: nextId(table), created_at: new Date().toISOString() };
    tables[table].push(saved);
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
      if (this.op === 'upsert') return this.done(this.upsert_());
      return this.read();
    }
    done(rows) { return this.wantRows ? rows.map(r => ({ ...r })) : []; }

    update_() {
      const targets = tables[this.table].filter(r => this.filters.every(f => f(r)));
      targets.forEach(row => {
        if (this.table === 'payroll_items') assertOpen(row.period_id);
        Object.assign(row, this.payload);
        if (this.table === 'payroll_items') retotal(row);
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
      if (this.max != null) rows = rows.slice(0, this.max);
      return embed(rows, this.columns);
    }
  }

  const toList = value => (Array.isArray(value) ? value : [value]);
  return { from: table => new Query(table) };
}
