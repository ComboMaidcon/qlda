import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, today } from '../lib/format.js';

export default {
  title: 'Nhân viên',
  writeRoles: ['owner', 'manager'],

  async load() {
    const { data, error } = await db.from('employees').select('*, zones(name)').order('full_name');
    const columns = [
      ['Họ tên', e => esc(e.full_name)],
      ['Điện thoại', e => esc(e.phone)],
      ['Khu', e => esc(e.zones?.name)],
      ['Tổ trưởng', e => (e.is_leader ? 'Có' : '')],
      ['Ngày vào', e => e.join_date],
      ['Trạng thái', e => (e.leave_date ? `Nghỉ từ ${e.leave_date}` : 'Đang làm')],
    ];
    return { columns, rows: data ?? [], error: error?.message };
  },

  forms: () => [
    {
      title: 'Thêm nhân viên',
      fields: [
        { key: 'full_name', label: 'Họ tên', required: true },
        { key: 'phone', label: 'Điện thoại' },
        { key: 'zone_id', label: 'Khu', type: 'select', options: state.lookups.zones, required: true },
        { key: 'is_leader', label: 'Tổ trưởng', type: 'select', options: [['true', 'Có'], ['false', 'Không']], required: true, value: 'false' },
        { key: 'join_date', label: 'Ngày vào', type: 'date', required: true, value: today() },
      ],
      save: values => run(db.from('employees').insert(values)),
    },
    {
      title: 'Ghi nhận nghỉ việc',
      fields: [
        { key: 'employee_id', label: 'Nhân viên', type: 'select', options: state.lookups.employees, required: true },
        { key: 'leave_date', label: 'Ngày nghỉ', type: 'date', required: true, value: today() },
      ],
      save: ({ employee_id, leave_date }) =>
        run(db.from('employees').update({ leave_date }).eq('id', employee_id)),
    },
  ],
};
