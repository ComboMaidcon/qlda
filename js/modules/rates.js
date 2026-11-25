import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, today, dmy } from '../lib/format.js';
import { PERMS } from '../constants.js';

export default {
  title: 'Đơn giá',
  writeRoles: PERMS.rates,
  exportName: 'don-gia',
  filters: [
    { label: 'Loại', get: r => r.kind },
    { label: 'Hiệu lực', get: r => r.state },
  ],

  async load() {
    const [piece, hourly] = await Promise.all([
      db.from('piece_rates').select('id, rate, effective_from, product_id, products(code, name)'),
      db.from('hourly_rates').select('id, rate, overtime_factor, effective_from, zone_id, zones(name)'),
    ]);

    const rows = [
      ...(piece.data ?? []).map(r => ({
        table: 'piece_rates', key: `p${r.product_id}`, kind: 'Theo sản phẩm', name: `${r.products?.code} - ${r.products?.name}`,
        id: r.id, rate: r.rate, factor: '', from: r.effective_from,
      })),
      ...(hourly.data ?? []).map(r => ({
        table: 'hourly_rates', key: `h${r.zone_id}`, kind: 'Theo giờ', name: r.zones?.name,
        id: r.id, rate: r.rate, factor: r.overtime_factor, from: r.effective_from,
      })),
    ];
    // Với mỗi đối tượng: bản mới nhất có ngày áp dụng <= hôm nay là "Đang áp dụng", sau hôm nay là "Chưa áp dụng", còn lại "Đã thay".
    const currentFrom = {};
    rows.forEach(r => { if (r.from <= today() && (!currentFrom[r.key] || r.from > currentFrom[r.key])) currentFrom[r.key] = r.from; });
    rows.forEach(r => { r.state = r.from > today() ? 'Chưa áp dụng' : r.from === currentFrom[r.key] ? 'Đang áp dụng' : 'Đã thay'; });
    rows.sort((a, b) => a.name.localeCompare(b.name, 'vi') || b.from.localeCompare(a.from));

    const columns = [
      ['Loại', r => r.kind],
      ['Đối tượng', r => esc(r.name)],
      ['Đơn giá', r => number(r.rate), r => Number(r.rate)],
      ['Hệ số tăng ca', r => r.factor, r => r.factor],
      ['Áp dụng từ', r => dmy(r.from), r => r.from],
      ['Hiệu lực', r => `<span class="${r.state === 'Đang áp dụng' ? 'ok' : r.state === 'Chưa áp dụng' ? 'warn' : 'muted'}">${r.state}</span>`, r => r.state],
    ];
    return { columns, rows, error: piece.error?.message ?? hourly.error?.message };
  },

  // Đơn giá đã áp dụng là lịch sử, không sửa hay xóa; chỉ xóa được dòng chưa đến ngày áp dụng.
  rowActions: row => (PERMS.rates.includes(state.role) && row.state === 'Chưa áp dụng'
    ? [{ key: 'delete', label: 'Xóa', danger: true }] : []),

  async onRowAction(key, row, refresh) {
    if (!confirm('Xóa đơn giá chưa áp dụng này?')) return;
    try { await run(db.from(row.table).delete().eq('id', row.id)); await refresh(); } catch (e) { alert(e.message); }
  },

  forms: () => [
    {
      title: 'Thêm đơn giá theo sản phẩm',
      hint: 'Đơn giá mới có hiệu lực từ ngày áp dụng; sản lượng đã ghi giữ đơn giá lúc ghi. Đơn giá cũ được giữ làm lịch sử.',
      fields: [
        { key: 'product_id', label: 'Mã hàng', type: 'select', options: state.lookups.products, required: true },
        { key: 'rate', label: 'Đơn giá / sản phẩm', type: 'number', required: true },
        { key: 'effective_from', label: 'Áp dụng từ', type: 'date', required: true, value: today() },
      ],
      save: values => run(db.from('piece_rates').insert(values)),
    },
    {
      title: 'Thêm đơn giá theo giờ',
      fields: [
        { key: 'zone_id', label: 'Khu', type: 'select', options: state.lookups.allZones, required: true },
        { key: 'rate', label: 'Đơn giá / giờ', type: 'number', required: true },
        { key: 'overtime_factor', label: 'Hệ số tăng ca', type: 'number', required: true, value: 1.5 },
        { key: 'effective_from', label: 'Áp dụng từ', type: 'date', required: true, value: today() },
      ],
      save: values => run(db.from('hourly_rates').insert(values)),
    },
  ],
};
