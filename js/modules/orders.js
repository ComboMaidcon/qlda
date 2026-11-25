import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, today, docCode, daysBetween, dmy, pct } from '../lib/format.js';
import { fetchAll, scoped, lastZone } from '../lib/data.js';
import { openModal } from '../lib/ui.js';
import { ORDER_STATUS, PERMS, SOON_DAYS } from '../constants.js';

const canEdit = () => PERMS.orders.includes(state.role);

export default {
  title: 'Lệnh sản xuất',
  writeRoles: PERMS.orders,
  exportName: 'lenh-san-xuat',
  filters: [{ label: 'Trạng thái', get: o => ORDER_STATUS[o.status] }],

  async load() {
    const seeLogs = state.role !== 'storekeeper';   // thủ kho không có quyền xem sản lượng
    const [orders, statuses, logs] = await Promise.all([
      db.from('production_orders').select('*, products(code, name)').order('due_date'),
      db.from('v_order_status').select('order_id, status'),
      seeLogs ? fetchAll(() => scoped(db.from('production_logs').select('order_id, zone_id, quantity').order('id'))) : [],
    ]);
    const statusById = Object.fromEntries((statuses.data ?? []).map(s => [s.order_id, s.status]));
    const done = new Map();   // "lệnh:khu" -> tổng đã làm
    logs.forEach(l => done.set(`${l.order_id}:${l.zone_id}`, (done.get(`${l.order_id}:${l.zone_id}`) ?? 0) + Number(l.quantity)));

    const zones = state.zonesInfo.filter(z => state.role !== 'leader' || z.id == state.zoneId);
    const finalZone = lastZone();
    const rows = (orders.data ?? []).map(o => {
      const status = statusById[o.id] ?? 'pending';
      const finished = done.get(`${o.id}:${finalZone?.id}`) ?? 0;
      return { ...o, status, finished, perZone: zones.map(z => [z.name, done.get(`${o.id}:${z.id}`) ?? 0]) };
    });

    const warning = o => {
      if (o.status === 'done') return '';
      const left = daysBetween(today(), o.due_date);
      if (left < 0) return `<span class="danger">Trễ ${-left} ngày</span>`;
      if (left <= SOON_DAYS) return `<span class="warn">Sắp trễ (còn ${left} ngày)</span>`;
      return '';
    };
    const columns = [
      ['Mã lệnh', o => esc(o.code)],
      ['Mã hàng', o => esc(`${o.products?.code ?? ''} - ${o.products?.name ?? ''}`)],
      ['Số lượng', o => number(o.quantity), o => Number(o.quantity)],
      ['Hạn giao', o => dmy(o.due_date), o => o.due_date],
      ['Cảnh báo', warning, o => (o.status === 'done' ? '' : daysBetween(today(), o.due_date) < 0 ? 'Trễ' : daysBetween(today(), o.due_date) <= SOON_DAYS ? 'Sắp trễ' : '')],
      ...(!seeLogs ? [] : [['Tiến độ các khu', o => `<div class="zone-chips">${o.perZone.map(([name, qty]) =>
        `<span class="zone-chip" style="--p:${Math.min(100, pct(qty, o.quantity))}%" title="${esc(name)}: ${number(qty)}/${number(o.quantity)}">${esc(name)} ${pct(qty, o.quantity)}%</span>`).join('')}</div>`,
        o => o.perZone.map(([name, qty]) => `${name} ${pct(qty, o.quantity)}%`).join('; ')],
      ['Hoàn thành', o => `${pct(o.finished, o.quantity)}%`, o => pct(o.finished, o.quantity)]]),
      ['Trạng thái', o => `<span class="status-${o.status}">${ORDER_STATUS[o.status]}</span>`, o => ORDER_STATUS[o.status]],
      ['Ghi chú', o => esc(o.note)],
    ];
    return { columns, rows, error: orders.error?.message };
  },

  rowActions: row => (canEdit()
    ? [{ key: 'edit', label: 'Sửa' }, ...(row.status === 'pending' ? [{ key: 'delete', label: 'Xóa', danger: true }] : [])]
    : []),

  async onRowAction(key, row, refresh) {
    if (key === 'delete') {
      if (!confirm(`Xóa lệnh ${row.code}?`)) return;
      try { await run(db.from('production_orders').delete().eq('id', row.id)); await refresh(); } catch (e) { alert(e.message); }
      return;
    }
    openModal({
      title: `Sửa lệnh ${row.code}`,
      fields: [
        { key: 'quantity', label: 'Số lượng', type: 'number', required: true, value: row.quantity },
        { key: 'due_date', label: 'Hạn giao', type: 'date', required: true, value: row.due_date },
        { key: 'note', label: 'Ghi chú', value: row.note },
      ],
      onSubmit: values => run(db.from('production_orders').update(values).eq('id', row.id)),
      onDone: refresh,
    });
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
