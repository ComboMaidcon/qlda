import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number } from '../lib/format.js';

// month: 'YYYY-MM-01' -> [đầu tháng, đầu tháng sau]
function monthBounds(month) {
  const [year, m] = month.split('-').map(Number);
  const next = m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, '0')}-01`;
  return [month, next];
}

async function createPeriod({ month }) {
  await run(db.from('payroll_periods').insert({ month: `${month}-01` }));
}

// Tổng hợp lương sản phẩm và lương giờ từ sản lượng, chấm công trong tháng.
// Giữ nguyên thưởng, phạt, tạm ứng đã nhập (upsert chỉ ghi hai cột lương).
async function calculate({ period_id }) {
  const period = await run(db.from('payroll_periods').select('month, status').eq('id', period_id).single());
  if (period.status !== 'open') throw new Error('Kỳ lương đã chốt');
  const [from, to] = monthBounds(period.month);

  const [logs, days] = await Promise.all([
    run(db.from('production_logs').select('employee_id, quantity, unit_rate')
      .not('employee_id', 'is', null).gte('log_date', from).lt('log_date', to)),
    run(db.from('attendance').select('employee_id, hours, overtime_hours, hourly_rate, overtime_factor')
      .gte('work_date', from).lt('work_date', to)),
  ]);

  const totals = new Map();
  const add = (id, key, amount) => {
    const t = totals.get(id) ?? { piece_amount: 0, hourly_amount: 0 };
    t[key] += amount;
    totals.set(id, t);
  };
  logs.forEach(l => add(l.employee_id, 'piece_amount', l.quantity * (l.unit_rate ?? 0)));
  days.forEach(d => add(d.employee_id, 'hourly_amount', (d.hours + d.overtime_hours * d.overtime_factor) * d.hourly_rate));

  if (!totals.size) throw new Error('Tháng này chưa có sản lượng hoặc chấm công');
  const items = [...totals].map(([employee_id, t]) => ({
    period_id: Number(period_id),
    employee_id,
    piece_amount: Math.round(t.piece_amount),
    hourly_amount: Math.round(t.hourly_amount),
  }));
  await run(db.from('payroll_items').upsert(items, { onConflict: 'period_id,employee_id' }));
}

async function adjust({ period_id, employee_id, bonus, penalty, advance, note }) {
  const updated = await run(
    db.from('payroll_items')
      .update({ bonus: bonus ?? 0, penalty: penalty ?? 0, advance: advance ?? 0, note })
      .eq('period_id', period_id).eq('employee_id', employee_id).select('id')
  );
  if (!updated.length) throw new Error('Chưa có dòng lương của nhân viên này, hãy tính lương trước');
}

async function closePeriod({ period_id }) {
  if (!confirm('Chốt kỳ lương? Sau khi chốt, sản lượng và chấm công của tháng này bị khóa.')) {
    throw new Error('Đã hủy');
  }
  await run(db.from('payroll_periods').update({
    status: 'closed', closed_at: new Date().toISOString(), closed_by: state.userId,
  }).eq('id', period_id));
}

export default {
  title: 'Lương',
  writeRoles: ['owner', 'accountant'],

  async load() {
    const { data, error } = await db
      .from('payroll_items')
      .select('*, payroll_periods(month, status), employees(full_name)')
      .order('period_id', { ascending: false })
      .limit(300);

    const columns = [
      ['Kỳ', r => `${r.payroll_periods.month.slice(0, 7)}${r.payroll_periods.status === 'closed' ? ' (đã chốt)' : ''}`],
      ['Nhân viên', r => esc(r.employees?.full_name)],
      ['Lương sản phẩm', r => number(r.piece_amount)],
      ['Lương giờ', r => number(r.hourly_amount)],
      ['Thưởng', r => number(r.bonus)],
      ['Phạt', r => number(r.penalty)],
      ['Tạm ứng', r => number(r.advance)],
      ['Thực lĩnh', r => `<strong>${number(r.total)}</strong>`],
      ['Ghi chú', r => esc(r.note)],
    ];
    return { columns, rows: data ?? [], error: error?.message };
  },

  forms: () => [
    {
      title: 'Tạo kỳ lương',
      fields: [{ key: 'month', label: 'Tháng', type: 'month', required: true }],
      save: createPeriod,
    },
    {
      title: 'Tính lương từ sản lượng và chấm công',
      hint: 'Tính lại được nhiều lần khi kỳ còn mở. Thưởng, phạt, tạm ứng đã nhập được giữ nguyên.',
      fields: [{ key: 'period_id', label: 'Kỳ lương', type: 'select', options: state.lookups.openPeriods, required: true }],
      save: calculate,
    },
    {
      title: 'Thưởng, phạt, tạm ứng',
      fields: [
        { key: 'period_id', label: 'Kỳ lương', type: 'select', options: state.lookups.openPeriods, required: true },
        { key: 'employee_id', label: 'Nhân viên', type: 'select', options: state.lookups.allEmployees, required: true },
        { key: 'bonus', label: 'Thưởng', type: 'number', value: 0 },
        { key: 'penalty', label: 'Phạt', type: 'number', value: 0 },
        { key: 'advance', label: 'Tạm ứng', type: 'number', value: 0 },
        { key: 'note', label: 'Ghi chú' },
      ],
      save: adjust,
    },
    {
      title: 'Chốt kỳ lương',
      fields: [{ key: 'period_id', label: 'Kỳ lương', type: 'select', options: state.lookups.openPeriods, required: true }],
      save: closePeriod,
    },
  ],
};
