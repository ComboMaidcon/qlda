import { db } from '../lib/supabase.js';
import { state } from '../state.js';

async function fetchAll(table, columns, orderBy) {
  const { data } = await db.from(table).select(columns).order(orderBy);
  return data ?? [];
}

export async function loadLookups() {
  const [products, employees, zones, suppliers, fabrics, orders, periods] = await Promise.all([
    fetchAll('products', 'id, code, name', 'code'),
    fetchAll('v_employees', 'id, full_name, pay_kind, is_active', 'full_name'),
    fetchAll('zones', 'id, name', 'sort_order'),
    fetchAll('suppliers', 'id, name', 'name'),
    fetchAll('fabrics', 'id, code, name, color', 'code'),
    fetchAll('production_orders', 'id, code', 'code'),
    fetchAll('payroll_periods', 'id, month, status', 'month'),
  ]);

  const active = employees.filter(e => e.is_active);
  const names = list => list.map(e => [e.id, e.full_name]);
  const periodLabel = p => p.month.slice(0, 7);

  state.lookups = {
    products: products.map(p => [p.id, `${p.code} - ${p.name}`]),
    employees: names(active),
    allEmployees: names(employees),
    sewers: names(active.filter(e => e.pay_kind === 'piece')),
    hourly: names(active.filter(e => e.pay_kind === 'hourly')),
    zones: zones.map(z => [z.id, z.name]),
    suppliers: suppliers.map(s => [s.id, s.name]),
    fabrics: fabrics.map(f => [f.id, `${f.code} - ${f.name} (${f.color})`]),
    orders: orders.map(o => [o.id, o.code]),
    openPeriods: periods.filter(p => p.status === 'open').reverse().map(p => [p.id, periodLabel(p)]),
  };
}
