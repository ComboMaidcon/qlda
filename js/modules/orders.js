import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, today, docCode } from '../lib/format.js';
import { ORDER_STATUS } from '../constants.js';

export default {
  title: 'Lệnh sản xuất',
  writeRoles: ['owner', 'manager'],

  async load() {
    const [orders, statuses] = await Promise.all([
      db.from('production_orders').select('*, products(code, name)').order('due_date'),
      db.from('v_order_status').select('order_id, status'),
    ]);
    const statusById = Object.fromEntries((statuses.data ?? []).map(s => [s.order_id, s.status]));
    const rows = (orders.data ?? []).map(o => ({ ...o, status: statusById[o.id] ?? 'pending' }));

    const isLate = o => o.due_date < today() && o.status !== 'done';
    const columns = [
      ['Mã lệnh', o => esc(o.code)],
      ['Mã hàng', o => esc(`${o.products?.code ?? ''} - ${o.products?.name ?? ''}`)],
      ['Số lượng', o => number(o.quantity)],
      ['Hạn giao', o => `<span class="${isLate(o) ? 'danger' : ''}">${o.due_date}</span>`],
      ['Trạng thái', o => `<span class="status-${o.status}">${ORDER_STATUS[o.status]}</span>`],
    ];
    return { columns, rows, error: orders.error?.message };
  },

  forms: () => [{
    title: 'Tạo lệnh sản xuất',
    fields: [
      { key: 'code', label: 'Mã lệnh', required: true, value: docCode('LSX') },
      { key: 'product_id', label: 'Mã hàng', type: 'select', options: state.lookups.products, required: true },
      { key: 'quantity', label: 'Số lượng', type: 'number', required: true },
      { key: 'due_date', label: 'Hạn giao', type: 'date', required: true },
      { key: 'note', label: 'Ghi chú' },
    ],
    save: values => run(db.from('production_orders').insert(values)),
  }],
};
