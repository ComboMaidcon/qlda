import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, today } from '../lib/format.js';
import { ABSENCE } from '../constants.js';

export default {
  title: 'Chấm công',
  writeRoles: ['owner', 'leader'],

  async load() {
    const { data, error } = await db
      .from('attendance')
      .select('*, employees(full_name), zones(name)')
      .order('work_date', { ascending: false })
      .limit(100);

    const columns = [
      ['Ngày', r => r.work_date],
      ['Nhân viên', r => esc(r.employees?.full_name)],
      ['Khu', r => esc(r.zones?.name)],
      ['Giờ', r => r.hours],
      ['Tăng ca', r => r.overtime_hours],
      ['Nghỉ', r => ABSENCE[r.absence] ?? ''],
      ['Đơn giá giờ', r => number(r.hourly_rate)],
    ];
    return { columns, rows: data ?? [], error: error?.message };
  },

  forms: () => [{
    title: 'Chấm công (khu tính giờ)',
    fields: [
      { key: 'employee_id', label: 'Nhân viên', type: 'select', options: state.lookups.hourly, required: true },
      { key: 'work_date', label: 'Ngày', type: 'date', required: true, value: today() },
      { key: 'hours', label: 'Giờ thường', type: 'number', value: 8 },
      { key: 'overtime_hours', label: 'Giờ tăng ca', type: 'number', value: 0 },
      { key: 'absence', label: 'Nghỉ', type: 'select', options: Object.entries(ABSENCE) },
    ],
    save(values) {
      // Ngày nghỉ bắt buộc 0 giờ (ràng buộc trong database).
      if (values.absence) Object.assign(values, { hours: 0, overtime_hours: 0 });
      return run(db.from('attendance').insert(values));
    },
  }],
};
