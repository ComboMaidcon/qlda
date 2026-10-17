import { db, run } from '../lib/supabase.js';
import { esc, number } from '../lib/format.js';

const UNITS = { roll: 'Cuộn', meter: 'Mét' };

export default {
  title: 'Danh mục vải',
  writeRoles: ['owner', 'storekeeper'],

  async load() {
    const { data, error } = await db.from('fabrics').select('*').order('code');
    const columns = [
      ['Mã', f => esc(f.code)],
      ['Tên vải', f => esc(f.name)],
      ['Màu', f => esc(f.color)],
      ['Đơn vị', f => UNITS[f.unit]],
      ['Tồn tối thiểu', f => number(f.min_stock)],
    ];
    return { columns, rows: data ?? [], error: error?.message };
  },

  forms: () => [
    {
      title: 'Thêm loại vải',
      fields: [
        { key: 'code', label: 'Mã vải', required: true },
        { key: 'name', label: 'Tên vải', required: true },
        { key: 'color', label: 'Màu', required: true },
        { key: 'unit', label: 'Đơn vị', type: 'select', options: Object.entries(UNITS), required: true },
        { key: 'min_stock', label: 'Tồn tối thiểu', type: 'number', value: 0 },
      ],
      save: values => run(db.from('fabrics').insert(values)),
    },
    {
      title: 'Thêm nhà cung cấp',
      fields: [
        { key: 'name', label: 'Tên', required: true },
        { key: 'phone', label: 'Điện thoại' },
        { key: 'note', label: 'Ghi chú' },
      ],
      save: values => run(db.from('suppliers').insert(values)),
    },
  ],
};
