import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, today, dmy, hoursBetween } from '../lib/format.js';
import { fetchAll, scoped } from '../lib/data.js';
import { openModal, gridForm } from '../lib/ui.js';
import { ABSENCE, PERMS, STD_HOURS } from '../constants.js';

const canEdit = () => PERMS.attendance.includes(state.role);
const money = r => (Number(r.hours) + Number(r.overtime_hours) * Number(r.overtime_factor)) * Number(r.hourly_rate);

// Có giờ vào/ra thì tự tính giờ thường và tăng ca; ngày nghỉ bắt buộc 0 giờ (ràng buộc trong database).
function normalize(values) {
  const out = { ...values };
  if (out.time_in && out.time_out) {
    const total = hoursBetween(out.time_in, out.time_out);
    out.hours = Math.min(total, STD_HOURS);
    out.overtime_hours = Math.max(0, total - STD_HOURS);
  } else if (out.time_in || out.time_out) {
    throw new Error('Nhập đủ cả giờ vào và giờ ra, hoặc bỏ trống cả hai');
  }
  if (out.absence) Object.assign(out, { hours: 0, overtime_hours: 0, time_in: null, time_out: null });
  out.hours ??= 0;
  out.overtime_hours ??= 0;
  Object.keys(out).forEach(k => { if (out[k] == null && (k === 'time_in' || k === 'time_out')) delete out[k]; });
  return out;
}

export default {
  title: 'Chấm công',
  writeRoles: PERMS.attendance,
  range: 'date',
  exportName: 'cham-cong',
  filters: [
    { label: 'Khu', get: r => r.zones?.name },
    { label: 'Nhân viên', get: r => r.employees?.full_name },
  ],

  async load({ from, to }) {
    const rows = await fetchAll(() => scoped(
      db.from('attendance').select('*, employees(full_name), zones(name)')
        .gte('work_date', from).lte('work_date', to)
        .order('work_date', { ascending: false }).order('id', { ascending: false })));

    const columns = [
      ['Ngày', r => dmy(r.work_date), r => r.work_date],
      ['Nhân viên', r => esc(r.employees?.full_name)],
      ['Khu', r => esc(r.zones?.name)],
      ['Giờ vào', r => esc(r.time_in?.slice(0, 5) ?? ''), r => r.time_in?.slice(0, 5) ?? ''],
      ['Giờ ra', r => esc(r.time_out?.slice(0, 5) ?? ''), r => r.time_out?.slice(0, 5) ?? ''],
      ['Giờ thường', r => number(r.hours), r => Number(r.hours)],
      ['Tăng ca', r => number(r.overtime_hours), r => Number(r.overtime_hours)],
      ['Nghỉ', r => ABSENCE[r.absence] ?? ''],
      ['Đơn giá giờ', r => number(r.hourly_rate), r => Number(r.hourly_rate)],
      ['Thành tiền', r => number(money(r)), money],
    ];
    const footer = list => ['Tổng', '', '', '', '', number(list.reduce((t, r) => t + Number(r.hours), 0)),
      number(list.reduce((t, r) => t + Number(r.overtime_hours), 0)), '', '', number(list.reduce((t, r) => t + money(r), 0))];
    return { columns, rows, footer };
  },

  rowActions: () => (canEdit() ? [{ key: 'edit', label: 'Sửa' }, { key: 'delete', label: 'Xóa', danger: true }] : []),

  async onRowAction(key, row, refresh) {
    if (key === 'delete') {
      if (!confirm('Xóa bản ghi chấm công này? (thao tác được ghi vào nhật ký)')) return;
      try { await run(db.from('attendance').delete().eq('id', row.id)); await refresh(); } catch (e) { alert(e.message); }
      return;
    }
    openModal({
      title: `Sửa chấm công ${row.employees?.full_name ?? ''} ngày ${dmy(row.work_date)}`,
      hint: 'Nhập giờ vào và ra thì hệ thống tự tính giờ thường (tối đa 8 giờ) và tăng ca. Nghỉ thì giờ về 0.',
      fields: [
        { key: 'time_in', label: 'Giờ vào', type: 'time', value: row.time_in?.slice(0, 5) },
        { key: 'time_out', label: 'Giờ ra', type: 'time', value: row.time_out?.slice(0, 5) },
        { key: 'hours', label: 'Giờ thường', type: 'number', value: row.hours },
        { key: 'overtime_hours', label: 'Giờ tăng ca', type: 'number', value: row.overtime_hours },
        { key: 'absence', label: 'Nghỉ', type: 'select', options: Object.entries(ABSENCE), value: row.absence },
      ],
      onSubmit: values => {
        const v = normalize(values);
        v.absence ??= null;
        if (row.time_in !== undefined) { v.time_in ??= null; v.time_out ??= null; }
        return run(db.from('attendance').update(v).eq('id', row.id));
      },
      onDone: refresh,
    });
  },

  forms: () => {
    const hourlyZones = state.lookups.zones.filter(([id]) => state.zonesInfo.find(z => z.id == id)?.pay_kind === 'hourly');
    const forms = [{
      title: 'Chấm công một nhân viên (khu tính giờ)',
      hint: 'Nhập giờ vào và giờ ra thì tự tính giờ thường (tối đa 8 giờ) và tăng ca; hoặc nhập thẳng số giờ.',
      fields: [
        { key: 'employee_id', label: 'Nhân viên', type: 'select', options: state.lookups.hourly, required: true },
        { key: 'work_date', label: 'Ngày', type: 'date', required: true, value: today() },
        { key: 'time_in', label: 'Giờ vào', type: 'time' },
        { key: 'time_out', label: 'Giờ ra', type: 'time' },
        { key: 'hours', label: 'Giờ thường', type: 'number', value: 8 },
        { key: 'overtime_hours', label: 'Giờ tăng ca', type: 'number', value: 0 },
        { key: 'absence', label: 'Nghỉ', type: 'select', options: Object.entries(ABSENCE) },
      ],
      save: values => run(db.from('attendance').insert(normalize(values))),
    }];

    if (hourlyZones.length) {
      forms.push(gridForm({
        title: 'Chấm công cả khu trong một ngày',
        hint: 'Mặc định 8 giờ cho mọi người. Xóa số giờ của người vắng, hoặc chọn loại nghỉ. Dòng để trống hoàn toàn sẽ bị bỏ qua.',
        top: [
          { key: 'zone_id', label: 'Khu', type: 'select', options: hourlyZones, required: true, value: hourlyZones[0][0] },
          { key: 'work_date', label: 'Ngày', type: 'date', required: true, value: today() },
        ],
        redrawOn: ['zone_id'],
        rows: top => state.lookups.activeRows
          .filter(e => e.zone_id == top.zone_id && e.pay_kind === 'hourly')
          .map(e => ({ id: e.id, label: e.full_name })),
        cols: [
          { key: 'hours', label: 'Giờ thường', value: 8, include: true },
          { key: 'overtime_hours', label: 'Tăng ca', value: 0 },
          { key: 'absence', label: 'Nghỉ', type: 'select', options: Object.entries(ABSENCE), include: true },
        ],
        save: (top, entries) => run(db.from('attendance').insert(entries.map(({ id, values }) => normalize({
          employee_id: id, work_date: top.work_date, hours: values.hours, overtime_hours: values.overtime_hours, absence: values.absence,
        })))),
      }));
    }
    return forms;
  },
};
