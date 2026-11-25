import { db, run } from '../lib/supabase.js';
import { esc, number } from '../lib/format.js';
import { openModal } from '../lib/ui.js';
import { PERMS } from '../constants.js';
import { state } from '../state.js';

const UNITS = { roll: 'Cuộn', meter: 'Mét' };
const canEdit = () => PERMS.fabrics.includes(state.role);

export default {
  title: 'Danh mục vải',
  writeRoles: PERMS.fabrics,
  exportName: 'danh-muc-vai',
  filters: [
    { label: 'Đơn vị', get: f => UNITS[f.unit] },
    { label: 'Trạng thái', get: f => (f.is_active === false ? 'Ngừng dùng' : 'Đang dùng') },
  ],

  async load() {
    const { data, error } = await db.from('fabrics').select('*').order('code');
    const columns = [
      ['Mã', f => esc(f.code)],
      ['Tên vải', f => esc(f.name)],
      ['Màu', f => esc(f.color)],
      ['Đơn vị', f => UNITS[f.unit]],
      ['Tồn tối thiểu', f => number(f.min_stock), f => Number(f.min_stock)],
      ['Trạng thái', f => (f.is_active === false ? '<span class="muted">Ngừng dùng</span>' : 'Đang dùng'), f => (f.is_active === false ? 'Ngừng dùng' : 'Đang dùng')],
    ];
    return { columns, rows: data ?? [], error: error?.message };
  },

  rowActions: f => (canEdit()
    ? [{ key: 'edit', label: 'Sửa' }, { key: 'toggle', label: f.is_active === false ? 'Dùng lại' : 'Ngừng dùng' }] : []),

  async onRowAction(key, row, refresh) {
    if (key === 'toggle') {
      try { await run(db.from('fabrics').update({ is_active: row.is_active === false }).eq('id', row.id)); await refresh(); } catch (e) { alert(e.message); }
      return;
    }
    openModal({
      title: `Sửa vải ${row.code}`,
      fields: [
        { key: 'name', label: 'Tên vải', required: true, value: row.name },
        { key: 'color', label: 'Màu', required: true, value: row.color },
        { key: 'unit', label: 'Đơn vị', type: 'select', options: Object.entries(UNITS), required: true, value: row.unit },
        { key: 'min_stock', label: 'Tồn tối thiểu', type: 'number', value: row.min_stock },
      ],
      onSubmit: values => run(db.from('fabrics').update({ ...values, min_stock: values.min_stock ?? 0 }).eq('id', row.id)),
      onDone: refresh,
    });
  },

  forms: () => [{
    title: 'Thêm loại vải',
    fields: [
      { key: 'code', label: 'Mã vải', required: true },
      { key: 'name', label: 'Tên vải', required: true },
      { key: 'color', label: 'Màu', required: true },
      { key: 'unit', label: 'Đơn vị', type: 'select', options: Object.entries(UNITS), required: true },
      { key: 'min_stock', label: 'Tồn tối thiểu', type: 'number', value: 0 },
    ],
    save: values => run(db.from('fabrics').insert(values)),
  }],
};
