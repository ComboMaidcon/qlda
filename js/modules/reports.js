import { db } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, today, dmy, addDays, daysBetween, pct, monthNow } from '../lib/format.js';
import { fetchAll, scoped, zoneName, sumBy, groupBy } from '../lib/data.js';
import { mountTable } from '../lib/ui.js';
import { ORDER_STATUS, SOON_DAYS } from '../constants.js';

const num = v => number(v);

// ---- 1. Tồn kho vải ----
async function stockReport() {
  const { data } = await db.from('v_stock_balance').select('*').order('code');
  const rows = data ?? [];
  const units = { roll: 'Cuộn', meter: 'Mét' };
  const low = r => r.balance < r.min_stock;
  return {
    name: 'ton-kho-vai',
    columns: [
      ['Mã', r => esc(r.code)], ['Tên vải', r => esc(r.name)], ['Màu', r => esc(r.color)],
      ['Đơn vị', r => units[r.unit] ?? ''],
      ['Tồn', r => `<strong>${num(r.balance)}</strong>`, r => Number(r.balance)],
      ['Tối thiểu', r => num(r.min_stock), r => Number(r.min_stock)],
      ['Chênh lệch', r => `<span class="${low(r) ? 'danger' : ''}">${num(r.balance - r.min_stock)}</span>`, r => Number(r.balance - r.min_stock)],
      ['Tình trạng', r => (low(r) ? '<span class="danger">Sắp hết</span>' : 'Đủ'), r => (low(r) ? 'Sắp hết' : 'Đủ')],
    ],
    rows,
    filters: [{ label: 'Tình trạng', get: r => (low(r) ? 'Sắp hết' : 'Đủ') }, { label: 'Màu', get: r => r.color }],
  };
}

// ---- 2. Sản lượng theo khu / ngày / tháng ----
async function outputReport(p) {
  const rows = await fetchAll(() => scoped(db.from('production_logs').select('zone_id, log_date, quantity, defect_quantity')
    .gte('log_date', p.from).lte('log_date', p.to).order('id')));
  const zones = state.zonesInfo.filter(z => state.role !== 'leader' || z.id == state.zoneId);

  if (p.group === 'zone') {
    const data = zones.map(z => {
      const mine = rows.filter(r => r.zone_id === z.id);
      return { name: z.name, good: sumBy(mine, r => r.quantity), bad: sumBy(mine, r => r.defect_quantity) };
    });
    return {
      name: 'san-luong-theo-khu',
      columns: [
        ['Khu', r => esc(r.name)],
        ['Đạt', r => num(r.good), r => r.good], ['Lỗi', r => num(r.bad), r => r.bad],
        ['Tỷ lệ lỗi', r => `${pct(r.bad, r.good + r.bad)}%`, r => pct(r.bad, r.good + r.bad)],
      ],
      rows: data,
      footer: list => ['Tổng', num(sumBy(list, r => r.good)), num(sumBy(list, r => r.bad)), ''],
    };
  }

  // Theo ngày hoặc tháng: mỗi dòng một mốc, mỗi cột một khu.
  const keyOf = r => (p.group === 'month' ? r.log_date.slice(0, 7) : r.log_date);
  const grouped = groupBy(rows, keyOf);
  const data = [...grouped.keys()].sort().map(key => {
    const list = grouped.get(key);
    const byZone = Object.fromEntries(zones.map(z => [z.id, sumBy(list.filter(r => r.zone_id === z.id), r => r.quantity)]));
    return { key, byZone, total: sumBy(list, r => r.quantity) };
  });
  return {
    name: `san-luong-theo-${p.group === 'month' ? 'thang' : 'ngay'}`,
    columns: [
      [p.group === 'month' ? 'Tháng' : 'Ngày', r => (p.group === 'month' ? r.key : dmy(r.key)), r => r.key],
      ...zones.map(z => [z.name, r => num(r.byZone[z.id]), r => r.byZone[z.id]]),
      ['Tổng các khu', r => `<strong>${num(r.total)}</strong>`, r => r.total],
    ],
    rows: data,
    footer: list => ['Tổng', ...zones.map(z => num(sumBy(list, r => r.byZone[z.id]))), num(sumBy(list, r => r.total))],
  };
}

// ---- 3. Tiến độ lệnh sản xuất ----
async function progressReport() {
  const [orders, statuses, logs] = await Promise.all([
    db.from('production_orders').select('*, products(code, name)').order('due_date').then(r => r.data ?? []),
    db.from('v_order_status').select('order_id, status').then(r => r.data ?? []),
    fetchAll(() => db.from('production_logs').select('order_id, zone_id, quantity').order('id')),
  ]);
  const statusOf = Object.fromEntries(statuses.map(s => [s.order_id, s.status]));
  const zones = state.zonesInfo;
  const final = zones.reduce((a, b) => (!a || b.sort_order > a.sort_order ? b : a), null);
  const rows = orders.map(o => {
    const status = statusOf[o.id] ?? 'pending';
    const done = Object.fromEntries(zones.map(z => [z.id, sumBy(logs.filter(l => l.order_id === o.id && l.zone_id === z.id), l => l.quantity)]));
    const left = daysBetween(today(), o.due_date);
    const warn = status === 'done' ? '' : left < 0 ? 'Trễ hạn' : left <= SOON_DAYS ? 'Sắp trễ' : '';
    return { ...o, status, done, left, warn, finished: done[final?.id] ?? 0 };
  }).sort((a, b) => (a.status === 'done') - (b.status === 'done') || a.due_date.localeCompare(b.due_date));

  return {
    name: 'tien-do-lenh',
    columns: [
      ['Mã lệnh', r => esc(r.code)],
      ['Mã hàng', r => esc(`${r.products?.code ?? ''} - ${r.products?.name ?? ''}`)],
      ['Số lượng', r => num(r.quantity), r => Number(r.quantity)],
      ['Hạn giao', r => dmy(r.due_date), r => r.due_date],
      ['Còn (ngày)', r => (r.status === 'done' ? '' : r.left), r => (r.status === 'done' ? '' : r.left)],
      ...zones.map(z => [z.name, r => `${num(r.done[z.id])} (${pct(r.done[z.id], r.quantity)}%)`, r => r.done[z.id]]),
      ['Hoàn thành', r => `${pct(r.finished, r.quantity)}%`, r => pct(r.finished, r.quantity)],
      ['Trạng thái', r => `<span class="status-${r.status}">${ORDER_STATUS[r.status]}</span>`, r => ORDER_STATUS[r.status]],
      ['Cảnh báo', r => (r.warn ? `<span class="${r.warn === 'Trễ hạn' ? 'danger' : 'warn'}">${r.warn}</span>` : ''), r => r.warn],
    ],
    rows,
    filters: [{ label: 'Cảnh báo', get: r => r.warn || 'Bình thường' }, { label: 'Trạng thái', get: r => ORDER_STATUS[r.status] }],
  };
}

// ---- 4. Bảng lương tổng hợp ----
async function payrollReport(p) {
  if (!p.period) return { name: 'luong', columns: [['Thông báo', () => 'Chưa có kỳ lương nào']], rows: [] };
  const { data } = await db.from('payroll_items').select('*, employees(full_name, zone_id)').eq('period_id', p.period).limit(1000);
  const items = (data ?? []).map(r => ({ ...r, zone: zoneName(r.employees?.zone_id) }));
  const money = ['piece_amount', 'hourly_amount', 'bonus', 'penalty', 'advance', 'total'];
  const labels = ['Lương sản phẩm', 'Lương giờ', 'Thưởng', 'Phạt', 'Tạm ứng', 'Thực lĩnh'];
  const cols = money.map((k, i) => [labels[i], r => (k === 'total' ? `<strong>${num(r[k])}</strong>` : num(r[k])), r => Number(r[k])]);
  const footer = list => ['Tổng', '', ...money.map(k => num(sumBy(list, r => r[k])))];

  if (p.by === 'zone') {
    const rows = [...groupBy(items, r => r.zone).entries()].map(([zone, list]) => ({
      zone, count: list.length, ...Object.fromEntries(money.map(k => [k, sumBy(list, r => r[k])])),
    }));
    return { name: 'luong-theo-khu', rows,
      columns: [['Khu', r => esc(r.zone)], ['Số người', r => r.count, r => r.count], ...cols],
      footer: list => ['Tổng', num(sumBy(list, r => r.count)), ...money.map(k => num(sumBy(list, r => r[k])))] };
  }
  return { name: 'luong-tong-hop', rows: items.sort((a, b) => (a.employees?.full_name ?? '').localeCompare(b.employees?.full_name ?? '', 'vi')),
    columns: [['Nhân viên', r => esc(r.employees?.full_name)], ['Khu', r => esc(r.zone)], ...cols], footer,
    filters: [{ label: 'Khu', get: r => r.zone }] };
}

const REPORTS = {
  stock: { label: 'Tồn kho vải', roles: ['owner', 'manager', 'storekeeper'], run: stockReport },
  output: { label: 'Sản lượng theo khu, ngày, tháng', roles: ['owner', 'manager', 'leader'], run: outputReport },
  progress: { label: 'Tiến độ lệnh, lệnh sắp trễ hạn', roles: ['owner', 'manager'], run: progressReport },
  payroll: { label: 'Bảng lương tổng hợp theo tháng', roles: ['owner', 'accountant'], run: payrollReport },
};

export default {
  title: 'Báo cáo',

  async render(host, ctx) {
    const available = Object.entries(REPORTS).filter(([, r]) => r.roles.includes(state.role));
    if (!available.length) { host.innerHTML = '<p class="muted">Vai trò của bạn chưa có báo cáo nào.</p>'; return; }
    const periods = state.lookups.allPeriods;
    Object.assign(ctx, {
      report: available.some(([k]) => k === ctx.report) ? ctx.report : available[0][0],
      from: ctx.from ?? `${monthNow()}-01`, to: ctx.to ?? today(),
      group: ctx.group ?? 'zone', by: ctx.by ?? 'employee', period: ctx.period ?? periods[0]?.[0],
    });

    const select = (id, label, opts, value) => `<label class="inline">${label}<select id="${id}">${opts.map(([v, l]) =>
      `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const controls = () => `<div class="toolbar no-print">
      ${select('r-report', 'Báo cáo', available.map(([k, r]) => [k, r.label]), ctx.report)}
      ${ctx.report === 'output' ? `
        <label class="inline">Từ<input type="date" id="r-from" value="${ctx.from}"></label>
        <label class="inline">Đến<input type="date" id="r-to" value="${ctx.to}"></label>
        ${select('r-group', 'Nhóm theo', [['zone', 'Khu'], ['day', 'Ngày'], ['month', 'Tháng']], ctx.group)}` : ''}
      ${ctx.report === 'payroll' ? `${select('r-period', 'Kỳ lương', periods, ctx.period)}
        ${select('r-by', 'Nhóm theo', [['employee', 'Nhân viên'], ['zone', 'Khu']], ctx.by)}` : ''}
    </div><div id="report-result"><p class="muted">Đang tải...</p></div>`;

    async function draw() {
      host.innerHTML = controls();
      const bind = (id, key) => host.querySelector(id)?.addEventListener('change', e => { ctx[key] = e.target.value; draw(); });
      bind('#r-report', 'report'); bind('#r-from', 'from'); bind('#r-to', 'to');
      bind('#r-group', 'group'); bind('#r-period', 'period'); bind('#r-by', 'by');
      try {
        const result = await REPORTS[ctx.report].run(ctx);
        mountTable(host.querySelector('#report-result'), { ...result, exportName: result.name });
      } catch (err) {
        host.querySelector('#report-result').innerHTML = `<p class="danger">${esc(err.message)}</p>`;
      }
    }
    await draw();
  },
};
