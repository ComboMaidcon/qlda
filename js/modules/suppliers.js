import { db, run } from '../lib/supabase.js';
import { esc } from '../lib/format.js';
import { openModal } from '../lib/ui.js';
import { PERMS } from '../constants.js';
import { state } from '../state.js';

const canEdit = () => PERMS.fabrics.includes(state.role);

export default {
  title: 'Nhà cung cấp',
  writeRoles: PERMS.fabrics,
  exportName: 'nha-cung-cap',

  async load() {
    const { data, error } = await db.from('suppliers').select('*').order('name');
    const columns = [
      ['Tên', s => esc(s.name)],
      ['Điện thoại', s => esc(s.phone)],
      ['Ghi chú', s => esc(s.note)],
      ['Trạng thái', s => (s.is_active === false ? '<span class="muted">Ngừng</span>' : 'Đang dùng')],
    ];
    return { columns, rows: data ?? [], error: error?.message };
  },

  rowActions: s => (canEdit()
    ? [{ key: 'edit', label: 'Sửa' }, { key: 'toggle', label: s.is_active === false ? 'Dùng lại' : 'Ngừng' }] : []),

  async onRowAction(key, row, refresh) {
    if (key === 'toggle') {
      try { await run(db.from('suppliers').update({ is_active: row.is_active === false }).eq('id', row.id)); await refresh(); } catch (e) { alert(e.message); }
      return;
    }
    openModal({
      title: `Sửa nhà cung cấp`,
      fields: [
        { key: 'name', label: 'Tên', required: true, value: row.name },
        { key: 'phone', label: 'Điện thoại', value: row.phone },
        { key: 'note', label: 'Ghi chú', value: row.note },
      ],
      onSubmit: values => run(db.from('suppliers').update(values).eq('id', row.id)),
      onDone: refresh,
    });
  },

  forms: () => [{
    title: 'Thêm nhà cung cấp',
    fields: [
      { key: 'name', label: 'Tên', required: true },
      { key: 'phone', label: 'Điện thoại' },
      { key: 'note', label: 'Ghi chú' },
    ],
    save: values => run(db.from('suppliers').insert(values)),
  }],
};
