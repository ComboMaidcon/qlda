import { db } from '../lib/supabase.js';
import { esc, number, pct } from '../lib/format.js';
import { fetchAll } from '../lib/data.js';
import { NORM_TOLERANCE_PCT } from '../constants.js';

const UNITS = { roll: 'cuộn', meter: 'mét' };

// Đánh giá một dòng (lệnh, loại vải): so vải đã xuất với định mức, dung sai NORM_TOLERANCE_PCT %.
export function judge(planned, issued) {
  if (!(planned > 0)) return 'Chưa có định mức';
  const over = ((issued - planned) / planned) * 100;
  if (over > NORM_TOLERANCE_PCT) return 'Vượt định mức';
  if (over < -NORM_TOLERANCE_PCT) return 'Chưa xuất đủ';
  return 'Đạt định mức';
}

// M2.7: so vải xuất thực tế cho từng lệnh với định mức của mã hàng.
export default {
  title: 'Vải xuất so với định mức',
  exportName: 'vai-xuat-so-voi-dinh-muc',
  filters: [
    { label: 'Đánh giá', get: r => r.verdict },
    { label: 'Lệnh', get: r => r.order?.code },
    { label: 'Vải', get: r => r.fabric?.code },
  ],
  hint: `Vải cần theo định mức = số lượng lệnh x định mức của mã hàng. Lệch quá ${NORM_TOLERANCE_PCT}% so với định mức thì báo "Vượt định mức" ` +
        'hoặc "Chưa xuất đủ". Phiếu xuất đã hủy không được tính.',

  async load() {
    const [usage, orders, fabrics] = await Promise.all([
      fetchAll(() => db.from('v_order_fabric_usage').select('*').order('order_id').order('fabric_id')),
      db.from('production_orders').select('id, code, quantity, products(code)').then(r => r.data ?? []),
      db.from('fabrics').select('id, code, name, color, unit').then(r => r.data ?? []),
    ]);
    const orderOf = Object.fromEntries(orders.map(o => [o.id, o]));
    const fabricOf = Object.fromEntries(fabrics.map(f => [f.id, f]));
    const rows = usage.map(u => ({
      ...u, order: orderOf[u.order_id], fabric: fabricOf[u.fabric_id],
      planned: Number(u.planned_qty), issued: Number(u.issued_qty), diff: Number(u.diff_qty),
      verdict: judge(Number(u.planned_qty), Number(u.issued_qty)),
    }));
    const tone = { 'Vượt định mức': 'danger', 'Chưa xuất đủ': 'muted' };
    const columns = [
      ['Lệnh', r => esc(r.order?.code)],
      ['Mã hàng', r => esc(r.order?.products?.code)],
      ['SL lệnh', r => number(r.order?.quantity), r => Number(r.order?.quantity)],
      ['Loại vải', r => esc(r.fabric ? `${r.fabric.code} - ${r.fabric.name}` : '')],
      ['Đơn vị', r => UNITS[r.fabric?.unit] ?? ''],
      ['Theo định mức', r => number(r.planned), r => r.planned],
      ['Đã xuất', r => number(r.issued), r => r.issued],
      ['Chênh lệch', r => `<span class="${r.verdict === 'Vượt định mức' ? 'danger' : ''}">${r.diff > 0 ? '+' : ''}${number(r.diff)}</span>`, r => r.diff],
      ['% lệch', r => (r.planned > 0 ? `${r.diff > 0 ? '+' : ''}${pct(r.diff, r.planned)}%` : ''), r => (r.planned > 0 ? pct(r.diff, r.planned) : '')],
      ['Đánh giá', r => `<span class="${tone[r.verdict] ?? ''}">${r.verdict}</span>`, r => r.verdict],
    ];
    return { columns, rows };
  },
};
