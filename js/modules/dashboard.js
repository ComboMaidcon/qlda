import { db } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, today, addDays, daysBetween, dmy, pct } from '../lib/format.js';
import { fetchAll, lastZone, sumBy } from '../lib/data.js';
import { barChart, hBars, progressBar } from '../lib/charts.js';
import { SOON_DAYS } from '../constants.js';

// Ô số liệu bấm được: chuyển sang tab có danh sách chi tiết.
const kpi = (label, value, go, alert = false) =>
  `<button type="button" class="kpi${alert ? ' alert' : ''}" data-go="${go}"><span class="label">${label}</span><span class="value">${value}</span></button>`;

const goTo = key => document.querySelector(`nav button[data-tab="${key}"]`)?.click();

export default {
  title: 'Tổng quan',

  async render(host) {
    const final = lastZone();
    const monthStart = `${today().slice(0, 7)}-01`;
    const chartFrom = addDays(today(), -13);
    const since = chartFrom < monthStart ? chartFrom : monthStart;
    const isOwner = state.role === 'owner';

    const [orders, statuses, recent, finalLogs, stock, payroll] = await Promise.all([
      db.from('production_orders').select('id, code, quantity, due_date, products(name)').order('due_date').then(r => r.data ?? []),
      db.from('v_order_status').select('order_id, status').then(r => r.data ?? []),
      fetchAll(() => db.from('production_logs').select('zone_id, log_date, quantity').gte('log_date', since).order('id')),
      final ? fetchAll(() => db.from('production_logs').select('order_id, quantity').eq('zone_id', final.id).order('id')) : [],
      db.from('v_stock_balance').select('*').order('code').then(r => r.data ?? []),
      isOwner
        ? db.from('payroll_items').select('total, period_id, payroll_periods(month, status)').order('period_id', { ascending: false }).limit(300).then(r => r.data ?? [])
        : [],
    ]);

    const statusOf = Object.fromEntries(statuses.map(s => [s.order_id, s.status]));
    const doneOf = {};
    finalLogs.forEach(l => { doneOf[l.order_id] = (doneOf[l.order_id] ?? 0) + Number(l.quantity); });
    const open = orders.filter(o => statusOf[o.id] !== 'done');
    const late = open.filter(o => o.due_date < today());
    const soon = open.filter(o => o.due_date >= today() && daysBetween(today(), o.due_date) <= SOON_DAYS);
    const low = stock.filter(f => f.balance < f.min_stock);

    const monthLogs = recent.filter(l => l.log_date >= monthStart);
    const finishedMonth = final ? sumBy(monthLogs.filter(l => l.zone_id === final.id), l => l.quantity) : 0;

    const days = Array.from({ length: 14 }, (_, i) => addDays(chartFrom, i));
    const perDay = days.map(d => ({
      label: d.slice(8),
      hl: d === today(),
      value: final ? sumBy(recent.filter(l => l.log_date === d && l.zone_id === final.id), l => l.quantity) : 0,
    }));

    const perZone = state.zonesInfo.map(z => ({ label: z.name, value: sumBy(monthLogs.filter(l => l.zone_id === z.id), l => l.quantity) }));

    let payrollKpi = '';
    if (isOwner && payroll.length) {
      const pid = payroll[0].period_id;
      const p = payroll[0].payroll_periods;
      payrollKpi = kpi(`Lương kỳ ${p.month.slice(0, 7)}${p.status === 'open' ? ' (tạm tính)' : ''}`, number(sumBy(payroll.filter(r => r.period_id === pid), r => r.total)), 'payroll');
    }

    const watchList = [...open].sort((x, y) => x.due_date.localeCompare(y.due_date));
    const watch = watchList.slice(0, 8).map(o => {
      const p = pct(doneOf[o.id] ?? 0, o.quantity);
      const left = daysBetween(today(), o.due_date);
      const flag = left < 0 ? `<span class="danger">Trễ ${-left} ngày</span>`
        : left <= SOON_DAYS ? `<span class="warn">Còn ${left} ngày</span>` : `Hạn ${dmy(o.due_date)}`;
      return `<button type="button" class="watch-row" data-go="orders"><span class="code">${esc(o.code)}</span><span class="name">${esc(o.products?.name)}</span>
        <span class="pct">${progressBar(p)} ${p}%</span><span class="due">${flag}</span></button>`;
    }).join('');
    const finished14 = sumBy(perDay, d => d.value);

    host.innerHTML = `
      <div class="kpis">
        ${kpi('Lệnh đang sản xuất', statuses.filter(s => s.status === 'in_progress').length, 'orders')}
        ${kpi('Lệnh trễ hạn', late.length, 'orders', late.length > 0)}
        ${kpi(`Sắp trễ trong ${SOON_DAYS} ngày`, soon.length, 'orders', soon.length > 0)}
        ${kpi('Vải sắp hết', low.length, 'stock', low.length > 0)}
        ${kpi(`Thành phẩm tháng này${final ? `, khu ${esc(final.name)}` : ''}`, number(finishedMonth), 'logs')}
        ${payrollKpi}
      </div>
      <div class="dash">
        <section class="panel span-2">
          <div class="panel-head"><h2>Thành phẩm 14 ngày gần nhất</h2><span class="muted">Tổng ${number(finished14)}${final ? `, khu ${esc(final.name)}` : ''}</span></div>
          ${barChart(perDay, { title: 'Thành phẩm theo ngày' })}</section>
        <section class="panel">
          <div class="panel-head"><h2>Sản lượng các khu tháng này</h2></div>
          ${hBars(perZone)}</section>
        <section class="panel span-2">
          <div class="panel-head"><h2>Lệnh cần theo dõi</h2><span class="muted">${watchList.length > 8 ? `8 trong ${watchList.length} lệnh, gần hạn nhất` : `${watchList.length} lệnh đang mở`}</span></div>
          ${watch ? `<div class="watch">${watch}</div>` : '<p class="muted">Không có lệnh đang mở</p>'}</section>
        <section class="panel">
          <div class="panel-head"><h2>Tồn vải so với mức tối thiểu</h2></div>
          ${hBars(stock.map(f => ({ label: `${f.code} ${f.color}`, value: Number(f.balance), mark: Number(f.min_stock), warn: f.balance < f.min_stock })))}
          <p class="hint">Vạch đen là mức tồn tối thiểu; thanh đỏ là loại vải đang dưới mức đó.</p></section>
      </div>`;
    host.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => goTo(el.dataset.go)));
  },
};
