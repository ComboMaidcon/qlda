import { db } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, monthNow, daysInMonth, monthBounds } from '../lib/format.js';
import { fetchAll, scoped, zoneKind } from '../lib/data.js';
import { exportMatrix } from '../lib/export.js';

// Bảng công theo tháng của một khu: khu tính giờ hiện giờ công, khu may hiện sản lượng từng ngày.
export default {
  title: 'Bảng công tháng',
  range: 'month',

  async render(host, { month }) {
    const zones = state.lookups.zones;
    if (!zones.length) { host.innerHTML = '<p class="muted">Chưa có khu nào.</p>'; return; }
    const zoneId = Number(state.ctx.timesheetZone ?? zones[0][0]);
    const piece = zoneKind(zoneId) === 'piece';
    const [from, to] = monthBounds(month);
    const days = daysInMonth(month);

    const [employees, records] = await Promise.all([
      fetchAll(() => scoped(db.from('employees').select('id, full_name, join_date, leave_date').eq('zone_id', zoneId).order('full_name'), 'zone_id')),
      piece
        ? fetchAll(() => db.from('production_logs').select('employee_id, log_date, quantity, unit_rate').eq('zone_id', zoneId)
            .not('employee_id').gte('log_date', from).lt('log_date', to).order('id'))
        : fetchAll(() => db.from('attendance').select('employee_id, work_date, hours, overtime_hours, absence, hourly_rate, overtime_factor')
            .eq('zone_id', zoneId).gte('work_date', from).lt('work_date', to).order('id')),
    ]);

    // Người đã chuyển khu giữa tháng vẫn hiện nếu còn bản ghi của khu này.
    const known = new Set(employees.map(e => e.id));
    const extra = [...new Set(records.map(r => r.employee_id))].filter(id => !known.has(id));
    if (extra.length) {
      const { data } = await db.from('employees').select('id, full_name').in('id', extra);
      (data ?? []).forEach(e => employees.push(e));
    }
    const active = employees.filter(e => (!e.leave_date || e.leave_date >= from) && (!e.join_date || e.join_date < to) ||
      records.some(r => r.employee_id === e.id));

    const head = ['Nhân viên', ...Array.from({ length: days }, (_, i) => String(i + 1)),
      ...(piece ? ['Tổng sản lượng', 'Thành tiền'] : ['Tổng giờ', 'Tăng ca', 'Nghỉ phép', 'Nghỉ KL', 'Thành tiền'])];
    const matrix = [head];
    const cls = [];
    active.forEach(emp => {
      const mine = records.filter(r => r.employee_id === emp.id);
      const cells = Array.from({ length: days }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, '0')}`;
        if (piece) {
          const q = mine.filter(r => r.log_date === date).reduce((t, r) => t + Number(r.quantity), 0);
          return q || '';
        }
        const r = mine.find(x => x.work_date === date);
        if (!r) return '';
        if (r.absence === 'leave') return 'P';
        if (r.absence === 'unpaid') return 'K';
        return Number(r.hours) + (Number(r.overtime_hours) ? Number(r.overtime_hours) : 0) ? `${number(r.hours)}${Number(r.overtime_hours) ? `+${number(r.overtime_hours)}` : ''}` : '';
      });
      cls.push(cells);
      if (piece) {
        const total = mine.reduce((t, r) => t + Number(r.quantity), 0);
        matrix.push([emp.full_name, ...cells, total, Math.round(mine.reduce((t, r) => t + Number(r.quantity) * Number(r.unit_rate ?? 0), 0))]);
      } else {
        const hours = mine.reduce((t, r) => t + Number(r.hours), 0);
        const ot = mine.reduce((t, r) => t + Number(r.overtime_hours), 0);
        const pay = mine.reduce((t, r) => t + (Number(r.hours) + Number(r.overtime_hours) * Number(r.overtime_factor)) * Number(r.hourly_rate), 0);
        matrix.push([emp.full_name, ...cells, hours, ot, mine.filter(r => r.absence === 'leave').length,
          mine.filter(r => r.absence === 'unpaid').length, Math.round(pay)]);
      }
    });

    const zoneSelect = `<label class="inline">Khu<select id="ts-zone">${zones.map(([id, name]) =>
      `<option value="${id}"${id == zoneId ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></label>`;
    const body = matrix.slice(1).map((row, r) => `<tr><td>${esc(row[0])}</td>${row.slice(1, days + 1).map((c, i) => {
      const flag = c === 'P' ? ' class="leave"' : c === 'K' ? ' class="off"' : '';
      return `<td${flag}>${esc(c)}</td>`;
    }).join('')}${row.slice(days + 1).map(c => `<td>${typeof c === 'number' ? number(c) : esc(c)}</td>`).join('')}</tr>`).join('');

    host.innerHTML = `
      <div class="toolbar no-print">${zoneSelect}<span class="spacer"></span>
        <button type="button" class="secondary" id="ts-export">Xuất Excel</button>
        <button type="button" class="secondary" id="ts-print">In</button></div>
      <div class="table-wrap"><table class="matrix"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${body || `<tr><td colspan="${head.length}" class="muted">Không có dữ liệu</td></tr>`}</tbody></table></div>
      <p class="hint">${piece ? 'Khu may: mỗi ô là số sản phẩm của công nhân trong ngày.' : 'Mỗi ô: giờ thường (+ giờ tăng ca). P = nghỉ phép, K = nghỉ không lương.'}</p>`;

    host.querySelector('#ts-zone').addEventListener('change', e => {
      state.ctx.timesheetZone = e.target.value;
      document.querySelector(`nav button[data-tab="timesheet"]`).click();
    });
    host.querySelector('#ts-export').addEventListener('click', () => exportMatrix(matrix, `bang-cong-${month}`));
    host.querySelector('#ts-print').addEventListener('click', () => window.print());
  },
};
