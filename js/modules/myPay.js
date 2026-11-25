import { db } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, dmy, monthBounds } from '../lib/format.js';
import { openInfo } from '../lib/ui.js';

const money = v => number(v);

// M6.8: nhân viên xem lương của chính mình. Chỉ hiện kỳ lương đã chốt (database chặn dòng của người khác và kỳ chưa chốt).
async function openDetail(item) {
  const [from, to] = monthBounds(item.payroll_periods.month);
  const [logs, attendance] = await Promise.all([
    db.from('production_logs').select('*, production_orders(code)').eq('employee_id', state.employeeId)
      .gte('log_date', from).lt('log_date', to).order('log_date').then(r => r.data ?? []),
    db.from('attendance').select('*').eq('employee_id', state.employeeId)
      .gte('work_date', from).lt('work_date', to).order('work_date').then(r => r.data ?? []),
  ]);
  const logRows = logs.map(l => `<tr><td>${dmy(l.log_date)}</td><td>${esc(l.production_orders?.code)}</td><td>${number(l.quantity)}</td>
    <td>${money(l.unit_rate)}</td><td>${money(l.quantity * l.unit_rate)}</td></tr>`).join('');
  const attRows = attendance.map(a => `<tr><td>${dmy(a.work_date)}</td><td>${a.absence ? (a.absence === 'leave' ? 'Nghỉ phép' : 'Nghỉ không lương') : ''}</td>
    <td>${number(a.hours)}</td><td>${number(a.overtime_hours)}</td></tr>`).join('');
  openInfo(`Chi tiết lương tháng ${item.payroll_periods.month.slice(5, 7)}/${item.payroll_periods.month.slice(0, 4)}`, `
    <p>Lương sản phẩm <strong>${money(item.piece_amount)}</strong> · Lương giờ <strong>${money(item.hourly_amount)}</strong> · Thưởng ${money(item.bonus)}
       · Phạt ${money(item.penalty)} · Ứng ${money(item.advance)} · <strong>Thực lĩnh ${money(item.total)}</strong></p>
    ${item.note ? `<p class="muted">Ghi chú: ${esc(item.note)}</p>` : ''}
    ${logs.length ? `<h3>Sản lượng khoán</h3><div class="table-wrap"><table><thead><tr><th>Ngày</th><th>Lệnh</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>${logRows}</tbody></table></div>` : ''}
    ${attendance.length ? `<h3>Chấm công</h3><div class="table-wrap"><table><thead><tr><th>Ngày</th><th>Nghỉ</th><th>Giờ thường</th><th>Giờ tăng ca</th></tr></thead><tbody>${attRows}</tbody></table></div>` : ''}
    ${!logs.length && !attendance.length ? '<p class="muted">Không có dữ liệu chi tiết trong tháng này.</p>' : ''}`);
}

export default {
  title: 'Lương của tôi',
  exportName: 'luong-cua-toi',
  hint: 'Chỉ hiển thị các kỳ lương đã được chủ xưởng chốt. Thắc mắc về số liệu, hãy báo kế toán hoặc quản lý.',

  async load() {
    if (!state.employeeId) return { columns: [], rows: [], error: 'Tài khoản chưa liên kết với hồ sơ nhân viên. Hãy nhờ chủ xưởng liên kết.' };
    const { data, error } = await db.from('payroll_items').select('*, payroll_periods(month, status)').eq('employee_id', state.employeeId);
    const rows = (data ?? []).filter(i => i.payroll_periods?.status === 'closed')
      .sort((a, b) => b.payroll_periods.month.localeCompare(a.payroll_periods.month));
    const columns = [
      ['Tháng', i => `${i.payroll_periods.month.slice(5, 7)}/${i.payroll_periods.month.slice(0, 4)}`, i => i.payroll_periods.month],
      ['Lương sản phẩm', i => money(i.piece_amount), i => Number(i.piece_amount)],
      ['Lương giờ', i => money(i.hourly_amount), i => Number(i.hourly_amount)],
      ['Thưởng', i => money(i.bonus), i => Number(i.bonus)],
      ['Phạt', i => money(i.penalty), i => Number(i.penalty)],
      ['Ứng trước', i => money(i.advance), i => Number(i.advance)],
      ['Thực lĩnh', i => `<strong>${money(i.total)}</strong>`, i => Number(i.total)],
      ['Ghi chú', i => esc(i.note)],
    ];
    return { columns, rows, error };
  },

  rowActions: () => [{ key: 'detail', label: 'Chi tiết' }],
  onRowAction: (key, row) => openDetail(row),
};
