import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, today, dmy, addDays } from '../lib/format.js';
import { fetchAll, scoped, zoneKind } from '../lib/data.js';
import { openModal, gridForm } from '../lib/ui.js';
import { PERMS } from '../constants.js';

const canEdit = () => PERMS.logs.includes(state.role);

// Khu may (khoán sản phẩm) phải chọn công nhân; khu giờ ghi cả khu, không chọn công nhân.
function checkZone(values) {
  const kind = zoneKind(values.zone_id);
  if (kind === 'piece' && !values.employee_id) throw new Error('Khu may phải chọn công nhân');
  if (kind !== 'piece' && values.employee_id) throw new Error('Khu này ghi theo cả khu, hãy bỏ trống công nhân');
}

export default {
  title: 'Sản lượng',
  writeRoles: PERMS.logs,
  range: 'date',
  exportName: 'san-luong',
  filters: [
    { label: 'Khu', get: r => r.zones?.name },
    { label: 'Lệnh', get: r => r.production_orders?.code },
  ],

  async load({ from, to }) {
    const rows = await fetchAll(() => scoped(
      db.from('production_logs')
        .select('*, production_orders(code), zones(name), employees(full_name)')
        .gte('log_date', from).lte('log_date', to)
        .order('log_date', { ascending: false }).order('id', { ascending: false })));

    const money = r => (r.unit_rate != null ? r.quantity * r.unit_rate : null);
    const columns = [
      ['Ngày', r => dmy(r.log_date), r => r.log_date],
      ['Lệnh', r => esc(r.production_orders?.code)],
      ['Khu', r => esc(r.zones?.name)],
      ['Công nhân', r => (r.employees ? esc(r.employees.full_name) : '<span class="muted">Cả khu</span>'), r => r.employees?.full_name ?? 'Cả khu'],
      ['Đạt', r => number(r.quantity), r => Number(r.quantity)],
      ['Lỗi', r => number(r.defect_quantity), r => Number(r.defect_quantity)],
      ['Đơn giá', r => (r.unit_rate != null ? number(r.unit_rate) : ''), r => r.unit_rate],
      ['Thành tiền', r => (money(r) != null ? number(money(r)) : ''), money],
    ];
    const footer = list => ['Tổng', '', '', '', number(list.reduce((t, r) => t + Number(r.quantity), 0)),
      number(list.reduce((t, r) => t + Number(r.defect_quantity), 0)), '',
      number(list.reduce((t, r) => t + (money(r) ?? 0), 0))];
    return { columns, rows, footer };
  },

  rowActions: () => (canEdit() ? [{ key: 'edit', label: 'Sửa' }, { key: 'delete', label: 'Xóa', danger: true }] : []),

  async onRowAction(key, row, refresh) {
    if (key === 'delete') {
      if (!confirm('Xóa bản ghi sản lượng này? (thao tác được ghi vào nhật ký)')) return;
      try { await run(db.from('production_logs').delete().eq('id', row.id)); await refresh(); } catch (e) { alert(e.message); }
      return;
    }
    openModal({
      title: `Sửa sản lượng ${dmy(row.log_date)} - ${row.production_orders?.code ?? ''}`,
      hint: 'Chỉ sửa được số lượng. Nhập sai lệnh, khu, công nhân hoặc ngày: hãy xóa rồi nhập lại. Mọi thay đổi được lưu trong nhật ký.',
      fields: [
        { key: 'quantity', label: 'Số lượng đạt', type: 'number', required: true, value: row.quantity },
        { key: 'defect_quantity', label: 'Hàng lỗi', type: 'number', value: row.defect_quantity },
      ],
      onSubmit: values => run(db.from('production_logs').update({ ...values, defect_quantity: values.defect_quantity ?? 0 }).eq('id', row.id)),
      onDone: refresh,
    });
  },

  forms: () => {
    const sewZones = state.lookups.zones.filter(([id]) => zoneKind(id) === 'piece');
    const forms = [{
      title: 'Ghi sản lượng',
      hint: 'Khu may (lương sản phẩm): chọn công nhân. Khu khác: để trống công nhân và nhập số lượng cả khu. ' +
            'Mỗi tổ hợp lệnh, khu, công nhân, ngày chỉ có một dòng; nhập sai thì dùng nút Sửa ở bảng bên dưới.',
      fields: [
        { key: 'order_id', label: 'Lệnh sản xuất', type: 'select', options: state.lookups.orders, required: true },
        { key: 'zone_id', label: 'Khu', type: 'select', options: state.lookups.zones, required: true, value: state.zoneId },
        { key: 'employee_id', label: 'Công nhân may', type: 'select', options: state.lookups.sewers },
        { key: 'log_date', label: 'Ngày', type: 'date', required: true, value: today() },
        { key: 'quantity', label: 'Số lượng đạt', type: 'number', required: true },
        { key: 'defect_quantity', label: 'Hàng lỗi', type: 'number', value: 0 },
      ],
      save: values => { checkZone(values); return run(db.from('production_logs').insert(values)); },
    }];

    if (sewZones.length) {
      forms.push(gridForm({
        title: 'Nhập nhanh khu may (một dòng một công nhân)',
        hint: 'Để trống số lượng với công nhân không làm hôm đó. Đơn giá tự lấy theo mã hàng tại ngày nhập.',
        top: [
          { key: 'order_id', label: 'Lệnh sản xuất', type: 'select', options: state.lookups.orders, required: true },
          { key: 'zone_id', label: 'Khu', type: 'select', options: sewZones, required: true, value: sewZones[0][0] },
          { key: 'log_date', label: 'Ngày', type: 'date', required: true, value: today() },
        ],
        redrawOn: ['zone_id'],
        rows: top => state.lookups.activeRows
          .filter(e => e.zone_id == top.zone_id && e.pay_kind === 'piece')
          .map(e => ({ id: e.id, label: e.full_name })),
        cols: [
          { key: 'quantity', label: 'Số lượng đạt', include: true },
          { key: 'defect_quantity', label: 'Hàng lỗi' },
        ],
        save: (top, entries) => run(db.from('production_logs').insert(entries.map(({ id, values }) => ({
          order_id: top.order_id, zone_id: top.zone_id, log_date: top.log_date, employee_id: id,
          quantity: values.quantity, defect_quantity: values.defect_quantity ?? 0,
        })))),
      }));
    }
    return forms;
  },
};
