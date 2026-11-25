import { db } from '../lib/supabase.js';
import { state } from '../state.js';

async function fetchAll(table, columns, orderBy) {
  const { data } = await db.from(table).select(columns).order(orderBy);
  return data ?? [];
}

export async function loadLookups() {
  const [products, employees, zones, suppliers, fabrics, orders, periods, accessories] = await Promise.all([
    fetchAll('products', 'id, code, name, is_active', 'code'),
    fetchAll('v_employees', '*', 'full_name'),
    fetchAll('zones', '*', 'sort_order'),
    fetchAll('suppliers', 'id, name, is_active', 'name'),
    fetchAll('fabrics', 'id, code, name, color, is_active', 'code'),
    fetchAll('production_orders', 'id, code', 'code'),
    fetchAll('payroll_periods', 'id, month, status', 'month'),
    fetchAll('accessories', 'id, code, name, unit, is_active', 'code'),
  ]);

  // Tổ trưởng chỉ làm việc với khu của mình.
  const mine = state.role === 'leader';
  const inScope = e => !mine || e.zone_id == state.zoneId;
  const visibleZones = zones.filter(z => !mine || z.id == state.zoneId);

  const active = employees.filter(e => e.is_active && inScope(e));
  const names = list => list.map(e => [e.id, e.full_name]);
  const live = list => list.filter(x => x.is_active !== false);

  state.zonesInfo = zones.map(z => ({ id: z.id, name: z.name, pay_kind: z.pay_kind, sort_order: z.sort_order }));
  state.lookups = {
    products: live(products).map(p => [p.id, `${p.code} - ${p.name}`]),
    employees: names(active),
    allEmployees: names(employees.filter(inScope)),
    sewers: names(active.filter(e => e.pay_kind === 'piece')),
    hourly: names(active.filter(e => e.pay_kind === 'hourly')),
    activeRows: active,                    // đủ cột, dùng cho bảng nhập nhanh
    zones: visibleZones.map(z => [z.id, z.name]),
    allZones: zones.map(z => [z.id, z.name]),
    suppliers: live(suppliers).map(s => [s.id, s.name]),
    fabrics: live(fabrics).map(f => [f.id, `${f.code} - ${f.name} (${f.color})`]),
    accessories: live(accessories).map(a => [a.id, `${a.code} - ${a.name} (${a.unit})`]),
    orders: orders.map(o => [o.id, o.code]),
    openPeriods: periods.filter(p => p.status === 'open').reverse().map(p => [p.id, p.month.slice(0, 7)]),
    allPeriods: [...periods].reverse().map(p => [p.id, p.month.slice(0, 7)]),
  };
}
