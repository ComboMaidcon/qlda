import { db, run } from '../lib/supabase.js';
import { esc } from '../lib/format.js';

export default {
  title: 'Mã hàng',
  writeRoles: ['owner', 'manager'],

  async load() {
    const { data, error } = await db.from('products').select('*').order('code');
    const columns = [
      ['Mã hàng', p => esc(p.code)],
      ['Tên', p => esc(p.name)],
      ['Mô tả', p => esc(p.description)],
      ['Trạng thái', p => (p.is_active ? 'Đang sản xuất' : 'Ngừng')],
    ];
    return { columns, rows: data ?? [], error: error?.message };
  },

  forms: () => [{
    title: 'Thêm mã hàng',
    fields: [
      { key: 'code', label: 'Mã hàng', required: true },
      { key: 'name', label: 'Tên', required: true },
      { key: 'description', label: 'Mô tả' },
    ],
    save: values => run(db.from('products').insert(values)),
  }],
};
