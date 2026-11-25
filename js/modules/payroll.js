import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, monthBounds, dmy } from '../lib/format.js';
import { fetchAll, zoneName } from '../lib/data.js';
import { openModal, openInfo } from '../lib/ui.js';
import { PERMS } from '../constants.js';

const canCalc = () => PERMS.payrollCalc.includes(state.role);

async function createPeriod({ month }) {
  await run(db.from('payroll_periods').insert({ month: `${month}-01` }));
}

// Tổng hợp lương sản phẩm và lương giờ từ sản lượng, chấm công trong tháng.
// Giữ nguyên thưởng, phạt, tạm ứng đã nhập. Nhân viên không còn dữ liệu trong tháng được đưa về 0.
async function calculate({ period_id }) {
  const period = await run(db.from('payroll_periods').select('month, status').eq('id', period_id).single());
  if (period.status !== 'open') throw new Error('Kỳ lương đã chốt');
  const [from, to] = monthBounds(period.month);

  const [logs, days, existing] = await Promise.all([
    fetchAll(() => db.from('production_logs').select('employee_id, quantity, unit_rate')
      .not('employee_id', 'is', null).gte('log_date', from).lt('log_date', to).order('id')),
    fetchAll(() => db.from('attendance').select('employee_id, hours, overtime_hours, hourly_rate, overtime_factor')
      .gte('work_date', from).lt('work_date', to).order('id')),
    run(db.from('payroll_items').select('employee_id').eq('period_id', period_id)),
  ]);

  const totals = new Map();
  const add = (id, key, amount) => {
    const t = totals.get(id) ?? { piece_amount: 0, hourly_amount: 0 };
    t[key] += amount;
    totals.set(id, t);
  };
  logs.forEach(l => add(l.employee_id, 'piece_amount', l.quantity * (l.unit_rate ?? 0)));
  days.forEach(d => add(d.employee_id, 'hourly_amount', (d.hours + d.overtime_hours * d.overtime_factor) * d.hourly_rate));

  if (!totals.size && !existing.length) throw new Error('Tháng này chưa có sản lượng hoặc chấm công');
  const items = [...totals].map(([employee_id, t]) => ({
    period_id: Number(period_id),
    employee_id,
    piece_amount: Math.round(t.piece_amount),
    hourly_amount: Math.round(t.hourly_amount),
  }));
  if (items.length) await run(db.from('payroll_items').upsert(items, { onConflict: 'period_id,employee_id' }));

  const stale = existing.filter(e => !totals.has(e.employee_id));
  for (const e of stale) {
    await run(db.from('payroll_items').update({ piece_amount: 0, hourly_amount: 0 }).eq('period_id', period_id).eq('employee_id', e.employee_id));
  }
}

async function closePeriod({ period_id }) {
  if (!confirm('Chốt kỳ lương? Sau khi chốt, sản lượng và chấm công của tháng này bị khóa.')) {
    throw new Error('Đã hủy');
  }
  await run(db.from('payroll_periods').update({
    status: 'closed', closed_at: new Date().toISOString(), closed_by: state.userId,
  }).eq('id', period_id));
}

// Chi tiết để đối chiếu: từng ngày sản lượng, từng ngày công của nhân viên trong kỳ.
async function showDetail(row) {
  const [from, to] = monthBounds(row.payroll_periods.month);
  const [logs, days] = await Promise.all([
    run(db.from('production_logs').select('log_date, quantity, unit_rate, production_orders(code)').eq('employee_id', row.employee_id)
      .gte('log_date', from).lt('log_date', to).order('log_date')),
    run(db.from('attendance').select('work_date, hours, overtime_hours, hourly_rate, overtime_factor, absence').eq('employee_id', row.employee_id)
      .gte('work_date', from).lt('work_date', to).order('work_date')),
  ]);
  const table = (head, body) => `<div class="table-wrap"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td colspan="${head.length}" class="muted">Không có</td></tr>`}</tbody></table></div>`;
  const logRows = logs.map(l => `<tr><td>${dmy(l.log_date)}</td><td>${esc(l.production_orders?.code)}</td><td>${number(l.quantity)}</td><td>${number(l.unit_rate)}</td><td>${number(l.quantity * l.unit_rate)}</td></tr>`).join('');
  const dayRows = days.map(d => `<tr><td>${dmy(d.work_date)}</td><td>${number(d.hours)}</td><td>${number(d.overtime_hours)}</td><td>${number(d.hourly_rate)}</td><td>${number((d.hours + d.overtime_hours * d.overtime_factor) * d.hourly_rate)}</td></tr>`).join('');
  openInfo(`Chi tiết lương ${row.employees?.full_name} - ${row.payroll_periods.month.slice(0, 7)}`,
    `<h2>Sản lượng (lương khoán)</h2>${table(['Ngày', 'Lệnh', 'Số lượng', 'Đơn giá', 'Thành tiền'], logRows)}
     <h2 style="margin-top:14px">Chấm công (lương giờ)</h2>${table(['Ngày', 'Giờ thường', 'Tăng ca', 'Đơn giá giờ', 'Thành tiền'], dayRows)}`);
}

function printSlip(row) {
  const w = window.open('', '_blank');
  if (!w) { alert('Trình duyệt đang chặn cửa sổ in, hãy cho phép pop-up.'); return; }
  const line = (label, value, strong) => `<tr><td>${label}</td><td style="text-align:right">${strong ? '<b>' : ''}${number(value)}${strong ? '</b>' : ''}</td></tr>`;
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Phiếu lương</title>
    <body style="font:14px system-ui;max-width:420px;margin:30px auto">
    <h2>PHIẾU LƯƠNG THÁNG ${esc(row.payroll_periods.month.slice(5, 7))}/${esc(row.payroll_periods.month.slice(0, 4))}</h2>
    <p>Nhân viên: <b>${esc(row.employees?.full_name)}</b><br>Khu: ${esc(zoneName(row.employees?.zone_id))}</p>
    <table style="width:100%;border-collapse:collapse" cellpadding="5" border="1">
      ${line('Lương sản phẩm', row.piece_amount)}${line('Lương giờ', row.hourly_amount)}${line('Thưởng', row.bonus)}
      ${line('Phạt', -row.penalty)}${line('Tạm ứng', -row.advance)}${line('Thực lĩnh', row.total, true)}
    </table>${row.note ? `<p>Ghi chú: ${esc(row.note)}</p>` : ''}
    <script>window.onload = () => window.print();<\/script></body>`);
  w.document.close();
}

export default {
  title: 'Lương',
  writeRoles: [...PERMS.payrollCalc, ...PERMS.payrollClose],
  exportName: 'bang-luong',
  hint: 'Chọn một kỳ ở bộ lọc để xem và xuất bảng lương của kỳ đó.',

  async load() {
    const { data, error } = await db
      .from('payroll_items')
      .select('*, payroll_periods(month, status), employees(full_name, zone_id)')
      .order('period_id', { ascending: false })
      .limit(1000);

    const rows = data ?? [];
    const latest = rows[0] ? `${rows[0].payroll_periods.month.slice(0, 7)}${rows[0].payroll_periods.status === 'closed' ? ' (đã chốt)' : ''}` : undefined;
    const periodLabel = r => `${r.payroll_periods.month.slice(0, 7)}${r.payroll_periods.status === 'closed' ? ' (đã chốt)' : ''}`;
    const columns = [
      ['Kỳ', periodLabel],
      ['Nhân viên', r => esc(r.employees?.full_name)],
      ['Khu', r => esc(zoneName(r.employees?.zone_id))],
      ['Lương sản phẩm', r => number(r.piece_amount), r => Number(r.piece_amount)],
      ['Lương giờ', r => number(r.hourly_amount), r => Number(r.hourly_amount)],
      ['Thưởng', r => number(r.bonus), r => Number(r.bonus)],
      ['Phạt', r => number(r.penalty), r => Number(r.penalty)],
      ['Tạm ứng', r => number(r.advance), r => Number(r.advance)],
      ['Thực lĩnh', r => `<strong>${number(r.total)}</strong>`, r => Number(r.total)],
      ['Ghi chú', r => esc(r.note)],
    ];
    const sum = (list, k) => number(list.reduce((t, r) => t + Number(r[k]), 0));
    const footer = list => ['Tổng', `${list.length} người`, '', sum(list, 'piece_amount'), sum(list, 'hourly_amount'),
      sum(list, 'bonus'), sum(list, 'penalty'), sum(list, 'advance'), `<strong>${sum(list, 'total')}</strong>`, ''];
    return { columns, rows, error: error?.message, footer, filters: [
      { label: 'Kỳ', get: periodLabel, default: latest },
      { label: 'Khu', get: r => zoneName(r.employees?.zone_id) },
    ] };
  },

  rowActions: row => [
    { key: 'detail', label: 'Chi tiết' },
    { key: 'slip', label: 'In phiếu' },
    ...(canCalc() && row.payroll_periods.status === 'open' ? [{ key: 'adjust', label: 'Thưởng/phạt' }] : []),
  ],

  async onRowAction(key, row, refresh) {
    if (key === 'detail') { try { await showDetail(row); } catch (e) { alert(e.message); } return; }
    if (key === 'slip') { printSlip(row); return; }
    openModal({
      title: `Thưởng, phạt, tạm ứng: ${row.employees?.full_name}`,
      fields: [
        { key: 'bonus', label: 'Thưởng', type: 'number', value: row.bonus },
        { key: 'penalty', label: 'Phạt', type: 'number', value: row.penalty },
        { key: 'advance', label: 'Tạm ứng', type: 'number', value: row.advance },
        { key: 'note', label: 'Ghi chú', value: row.note },
      ],
      onSubmit: v => run(db.from('payroll_items').update({ bonus: v.bonus ?? 0, penalty: v.penalty ?? 0, advance: v.advance ?? 0, note: v.note })
        .eq('period_id', row.period_id).eq('employee_id', row.employee_id)),
      onDone: refresh,
    });
  },

  forms: () => [
    {
      title: 'Tạo kỳ lương',
      roles: PERMS.payrollCalc,
      fields: [{ key: 'month', label: 'Tháng', type: 'month', required: true }],
      save: createPeriod,
    },
    {
      title: 'Tính lương từ sản lượng và chấm công',
      roles: PERMS.payrollCalc,
      hint: 'Tính lại được nhiều lần khi kỳ còn mở. Thưởng, phạt, tạm ứng đã nhập được giữ nguyên.',
      fields: [{ key: 'period_id', label: 'Kỳ lương', type: 'select', options: state.lookups.openPeriods, required: true }],
      save: calculate,
    },
    {
      title: 'Chốt kỳ lương (chủ xưởng)',
      roles: PERMS.payrollClose,
      hint: 'Chốt xong, sản lượng và chấm công của tháng bị khóa, không tính lại được.',
      fields: [{ key: 'period_id', label: 'Kỳ lương', type: 'select', options: state.lookups.openPeriods, required: true }],
      save: closePeriod,
    },
  ],
};
