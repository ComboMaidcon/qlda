import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, today } from '../lib/format.js';

export default {
  title: 'Sản lượng',
  writeRoles: ['owner', 'leader'],

  async load() {
    const { data, error } = await db
      .from('production_logs')
      .select('*, production_orders(code), zones(name), employees(full_name)')
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);

    const columns = [
      ['Ngày', r => r.log_date],
      ['Lệnh', r => esc(r.production_orders?.code)],
      ['Khu', r => esc(r.zones?.name)],
      ['Công nhân', r => (r.employees ? esc(r.employees.full_name) : '<span class="muted">Cả khu</span>')],
      ['Đạt', r => number(r.quantity)],
      ['Lỗi', r => number(r.defect_quantity)],
      ['Đơn giá', r => (r.unit_rate != null ? number(r.unit_rate) : '')],
    ];
    return { columns, rows: data ?? [], error: error?.message };
  },

  forms: () => [{
    title: 'Ghi sản lượng',
    hint: 'Khu may (lương sản phẩm): chọn công nhân. Khu khác: để trống công nhân và nhập số lượng cả khu. ' +
          'Mỗi tổ hợp lệnh, khu, công nhân, ngày chỉ có một dòng.',
    fields: [
      { key: 'order_id', label: 'Lệnh sản xuất', type: 'select', options: state.lookups.orders, required: true },
      { key: 'zone_id', label: 'Khu', type: 'select', options: state.lookups.zones, required: true, value: state.zoneId },
      { key: 'employee_id', label: 'Công nhân may', type: 'select', options: state.lookups.sewers },
      { key: 'log_date', label: 'Ngày', type: 'date', required: true, value: today() },
      { key: 'quantity', label: 'Số lượng đạt', type: 'number', required: true },
      { key: 'defect_quantity', label: 'Hàng lỗi', type: 'number', value: 0 },
    ],
    save: values => run(db.from('production_logs').insert(values)),
  }],
};
