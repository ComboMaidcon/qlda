import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, today } from '../lib/format.js';

export default {
  title: 'Đơn giá',
  writeRoles: ['owner'],

  async load() {
    const [piece, hourly] = await Promise.all([
      db.from('piece_rates').select('rate, effective_from, products(code, name)'),
      db.from('hourly_rates').select('rate, overtime_factor, effective_from, zones(name)'),
    ]);

    const rows = [
      ...(piece.data ?? []).map(r => ({
        kind: 'Theo sản phẩm', name: `${r.products?.code} - ${r.products?.name}`,
        rate: r.rate, factor: '', from: r.effective_from,
      })),
      ...(hourly.data ?? []).map(r => ({
        kind: 'Theo giờ', name: r.zones?.name,
        rate: r.rate, factor: r.overtime_factor, from: r.effective_from,
      })),
    ].sort((a, b) => b.from.localeCompare(a.from));

    const columns = [
      ['Loại', r => r.kind],
      ['Đối tượng', r => esc(r.name)],
      ['Đơn giá', r => number(r.rate)],
      ['Hệ số tăng ca', r => r.factor],
      ['Áp dụng từ', r => r.from],
    ];
    return { columns, rows, error: piece.error?.message ?? hourly.error?.message };
  },

  forms: () => [
    {
      title: 'Thêm đơn giá theo sản phẩm',
      hint: 'Đơn giá mới có hiệu lực từ ngày áp dụng; sản lượng đã ghi giữ đơn giá lúc ghi.',
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
        { key: 'zone_id', label: 'Khu', type: 'select', options: state.lookups.zones, required: true },
        { key: 'rate', label: 'Đơn giá / giờ', type: 'number', required: true },
        { key: 'overtime_factor', label: 'Hệ số tăng ca', type: 'number', required: true, value: 1.5 },
        { key: 'effective_from', label: 'Áp dụng từ', type: 'date', required: true, value: today() },
      ],
      save: values => run(db.from('hourly_rates').insert(values)),
    },
  ],
};
