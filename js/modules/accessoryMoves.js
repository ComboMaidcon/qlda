import { db } from '../lib/supabase.js';
import { esc, number, dmy } from '../lib/format.js';
import { fetchAll } from '../lib/data.js';

const KINDS = { receipt: 'Nhập', issue: 'Xuất', adjust: 'Điều chỉnh' };

export default {
  title: 'Lịch sử phụ liệu',
  range: 'date',
  exportName: 'lich-su-phu-lieu',
  filters: [
    { label: 'Loại', get: m => KINDS[m.kind] },
    { label: 'Phụ liệu', get: m => m.accessories?.name },
    { label: 'Lệnh', get: m => m.production_orders?.code },
  ],

  async load({ from, to }) {
    const rows = await fetchAll(() => db.from('accessory_moves')
      .select('*, accessories(code, name, unit), production_orders(code), suppliers(name)')
      .gte('move_date', from).lte('move_date', to)
      .order('move_date', { ascending: false }).order('id', { ascending: false }));
    const columns = [
      ['Ngày', m => dmy(m.move_date), m => m.move_date],
      ['Loại', m => KINDS[m.kind]],
      ['Phụ liệu', m => esc(m.accessories ? `${m.accessories.code} - ${m.accessories.name}` : '')],
      ['Số lượng', m => `<span class="${m.quantity < 0 ? 'danger' : ''}">${m.quantity > 0 ? '+' : ''}${number(m.quantity)}</span> ${esc(m.accessories?.unit)}`, m => Number(m.quantity)],
      ['Lệnh', m => esc(m.production_orders?.code)],
      ['Nhà cung cấp', m => esc(m.suppliers?.name)],
      ['Ghi chú', m => esc(m.note)],
    ];
    return { columns, rows };
  },
};
