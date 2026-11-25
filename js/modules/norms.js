import { db, run } from '../lib/supabase.js';
import { esc, number } from '../lib/format.js';
import { openModal } from '../lib/ui.js';
import { PERMS } from '../constants.js';
import { state } from '../state.js';

const UNITS = { roll: 'cuộn', meter: 'mét' };
const canEdit = () => PERMS.norms.includes(state.role);

// M2.7: định mức vải cho MỘT sản phẩm của mỗi mã hàng, tính theo đơn vị của loại vải.
export default {
  title: 'Định mức vải',
  writeRoles: PERMS.norms,
  exportName: 'dinh-muc-vai',
  filters: [
    { label: 'Mã hàng', get: n => n.products?.code },
    { label: 'Vải', get: n => (n.fabrics ? `${n.fabrics.code} - ${n.fabrics.name}` : '') },
  ],
  hint: 'Định mức là lượng vải cho <strong>một sản phẩm</strong>, theo đơn vị của loại vải (mét hoặc cuộn). ' +
        'Vải cần cho một lệnh = số lượng lệnh x định mức. Xem so sánh với vải đã xuất ở mục "Vải xuất so với định mức".',

  async load() {
    const { data, error } = await db.from('fabric_norms').select('*, products(code, name), fabrics(code, name, color, unit)');
    const rows = (data ?? []).sort((a, b) => String(a.products?.code).localeCompare(String(b.products?.code)));
    const columns = [
      ['Mã hàng', n => esc(n.products?.code)],
      ['Tên hàng', n => esc(n.products?.name)],
      ['Loại vải', n => esc(n.fabrics ? `${n.fabrics.code} - ${n.fabrics.name} (${n.fabrics.color})` : '')],
      ['Định mức / sản phẩm', n => `<strong>${number(n.qty_per_unit)}</strong> ${UNITS[n.fabrics?.unit] ?? ''}`, n => Number(n.qty_per_unit)],
      ['Ghi chú', n => esc(n.note)],
    ];
    return { columns, rows, error: error?.message };
  },

  rowActions: () => (canEdit() ? [{ key: 'edit', label: 'Sửa' }, { key: 'delete', label: 'Xóa', danger: true }] : []),

  async onRowAction(key, row, refresh) {
    if (key === 'delete') {
      if (!confirm('Xóa định mức này?')) return;
      try { await run(db.from('fabric_norms').delete().eq('id', row.id)); await refresh(); } catch (e) { alert(e.message); }
      return;
    }
    openModal({
      title: `Sửa định mức ${row.products?.code} - ${row.fabrics?.code}`,
      fields: [
        { key: 'qty_per_unit', label: `Định mức / sản phẩm (${UNITS[row.fabrics?.unit] ?? ''})`, type: 'number', required: true, value: row.qty_per_unit },
        { key: 'note', label: 'Ghi chú', value: row.note },
      ],
      onSubmit: v => {
        if (!(v.qty_per_unit > 0)) throw new Error('Định mức phải lớn hơn 0');
        return run(db.from('fabric_norms').update(v).eq('id', row.id));
      },
      onDone: refresh,
    });
  },

  forms: () => [{
    title: 'Thêm định mức vải',
    fields: [
      { key: 'product_id', label: 'Mã hàng', type: 'select', options: state.lookups.products, required: true },
      { key: 'fabric_id', label: 'Loại vải', type: 'select', options: state.lookups.fabrics, required: true },
      { key: 'qty_per_unit', label: 'Định mức cho 1 sản phẩm', type: 'number', required: true },
      { key: 'note', label: 'Ghi chú (vd: vải chính, vải lót)' },
    ],
    save: v => {
      if (!(v.qty_per_unit > 0)) throw new Error('Định mức phải lớn hơn 0');
      return run(db.from('fabric_norms').insert(v));
    },
  }],
};
