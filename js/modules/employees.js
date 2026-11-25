import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, today, dmy } from '../lib/format.js';
import { scoped, zoneName, zoneKind } from '../lib/data.js';
import { openModal } from '../lib/ui.js';
import { PERMS, PAY_KIND } from '../constants.js';

const canEdit = () => PERMS.employees.includes(state.role);
const bool = v => v === true || v === 'true';

export default {
  title: 'Nhân viên',
  writeRoles: PERMS.employees,
  exportName: 'nhan-vien',
  filters: [
    { label: 'Khu', get: e => e.zones?.name },
    { label: 'Trạng thái', get: e => (e.leave_date ? 'Đã nghỉ' : 'Đang làm'), default: 'Đang làm' },
  ],

  async load() {
    const { data, error } = await scoped(db.from('employees').select('*, zones(name)').order('full_name'));
    const columns = [
      ['Họ tên', e => esc(e.full_name)],
      ['Điện thoại', e => esc(e.phone)],
      ['Khu', e => esc(e.zones?.name)],
      ['Hình thức lương', e => PAY_KIND[zoneKind(e.zone_id)] ?? ''],
      ['Tổ trưởng', e => (e.is_leader ? 'Có' : '')],
      ['Ngày vào', e => dmy(e.join_date), e => e.join_date],
      ['Trạng thái', e => (e.leave_date ? `Nghỉ từ ${dmy(e.leave_date)}` : 'Đang làm'), e => (e.leave_date ? 'Đã nghỉ' : 'Đang làm')],
    ];
    return { columns, rows: data ?? [], error: error?.message };
  },

  rowActions: e => (canEdit()
    ? [{ key: 'edit', label: 'Sửa' },
       ...(e.leave_date ? [{ key: 'return', label: 'Làm lại' }] : [{ key: 'transfer', label: 'Chuyển khu' }, { key: 'leave', label: 'Nghỉ việc', danger: true }])]
    : []),

  async onRowAction(key, row, refresh) {
    const update = values => run(db.from('employees').update(values).eq('id', row.id));
    if (key === 'return') {
      if (!confirm(`Cho ${row.full_name} làm lại?`)) return;
      try { await update({ leave_date: null }); await refresh(); } catch (e) { alert(e.message); }
      return;
    }
    const base = { onDone: refresh };
    if (key === 'leave') {
      openModal({ ...base, title: `Nghỉ việc: ${row.full_name}`,
        fields: [{ key: 'leave_date', label: 'Ngày nghỉ', type: 'date', required: true, value: today() }],
        onSubmit: update });
    } else if (key === 'transfer') {
      openModal({ ...base, title: `Chuyển khu: ${row.full_name}`,
        hint: `Đang ở khu ${esc(zoneName(row.zone_id))}. Chấm công và sản lượng cũ vẫn giữ khu lúc ghi; từ nay tính theo khu mới (đơn giá và hình thức lương của khu mới).`,
        fields: [{ key: 'zone_id', label: 'Khu mới', type: 'select', options: state.lookups.allZones.filter(([id]) => id != row.zone_id), required: true }],
        onSubmit: update });
    } else {
      openModal({ ...base, title: `Sửa nhân viên`,
        fields: [
          { key: 'full_name', label: 'Họ tên', required: true, value: row.full_name },
          { key: 'phone', label: 'Điện thoại', value: row.phone },
          { key: 'is_leader', label: 'Tổ trưởng', type: 'select', required: true, value: String(!!row.is_leader), options: [['true', 'Có'], ['false', 'Không']] },
          { key: 'join_date', label: 'Ngày vào', type: 'date', required: true, value: row.join_date },
        ],
        onSubmit: v => update({ ...v, is_leader: bool(v.is_leader) }) });
    }
  },

  forms: () => [{
    title: 'Thêm nhân viên',
    fields: [
      { key: 'full_name', label: 'Họ tên', required: true },
      { key: 'phone', label: 'Điện thoại' },
      { key: 'zone_id', label: 'Khu', type: 'select', options: state.lookups.allZones, required: true },
      { key: 'is_leader', label: 'Tổ trưởng', type: 'select', options: [['true', 'Có'], ['false', 'Không']], required: true, value: 'false' },
      { key: 'join_date', label: 'Ngày vào', type: 'date', required: true, value: today() },
    ],
    save: values => run(db.from('employees').insert({ ...values, is_leader: bool(values.is_leader) })),
  }],
};
