import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number } from '../lib/format.js';
import { openModal } from '../lib/ui.js';
import { PERMS } from '../constants.js';

const canEdit = () => PERMS.accessories.includes(state.role);

async function saveMove(kind, { accessory_id, quantity, order_id, supplier_id, note }) {
  if (!(quantity > 0)) throw new Error('Số lượng phải lớn hơn 0');
  const available = state.accStock?.[accessory_id] ?? 0;
  if (kind === 'issue' && quantity > available) throw new Error(`Tồn phụ liệu không đủ (còn ${number(available)})`);
  await run(db.from('accessory_moves').insert({
    accessory_id, kind, quantity: kind === 'issue' ? -quantity : quantity, order_id: order_id ?? null, supplier_id: supplier_id ?? null, note,
  }));
}

// Kiểm kê: nhập số đếm thực tế, hệ thống ghi chênh lệch kèm lý do.
async function saveCount({ accessory_id, counted, reason }) {
  const diff = Math.round((counted - (state.accStock?.[accessory_id] ?? 0)) * 100) / 100;
  if (diff === 0) throw new Error('Số kiểm kê trùng với tồn hiện tại, không cần điều chỉnh');
  await run(db.from('accessory_moves').insert({ accessory_id, kind: 'adjust', quantity: diff, note: reason }));
}

// M3.8: phụ liệu (khuy, khóa kéo, móc...) tồn kho. Sổ nhập xuất không sửa, không xóa; sai thì kiểm kê điều chỉnh.
export default {
  title: 'Kho phụ liệu',
  writeRoles: PERMS.accessories,
  exportName: 'ton-kho-phu-lieu',
  filters: [
    { label: 'Đơn vị', get: a => a.unit },
    { label: 'Tình trạng', get: a => (a.balance < a.min_stock ? 'Sắp hết' : 'Đủ') },
  ],

  async load() {
    const { data, error } = await db.from('v_accessory_balance').select('*').order('code');
    const rows = (data ?? []).map(a => ({ ...a, balance: Number(a.balance), min_stock: Number(a.min_stock) }));
    state.accStock = Object.fromEntries(rows.map(a => [a.accessory_id, a.balance]));
    const low = a => a.balance < a.min_stock;
    const columns = [
      ['Mã', a => esc(a.code)],
      ['Tên phụ liệu', a => esc(a.name)],
      ['Đơn vị', a => esc(a.unit)],
      ['Tồn', a => `<strong class="${low(a) ? 'danger' : ''}">${number(a.balance)}</strong>`, a => a.balance],
      ['Tối thiểu', a => number(a.min_stock), a => a.min_stock],
      ['Cảnh báo', a => (low(a) ? '<span class="danger">Sắp hết</span>' : (a.is_active === false ? '<span class="muted">Ngừng dùng</span>' : '')),
        a => (low(a) ? 'Sắp hết' : '')],
    ];
    return { columns, rows, error: error?.message };
  },

  rowActions: a => (canEdit() ? [{ key: 'edit', label: 'Sửa' }, { key: 'toggle', label: a.is_active === false ? 'Dùng lại' : 'Ngừng dùng' }] : []),

  async onRowAction(key, row, refresh) {
    if (key === 'toggle') {
      try { await run(db.from('accessories').update({ is_active: row.is_active === false }).eq('id', row.accessory_id)); await refresh(); } catch (e) { alert(e.message); }
      return;
    }
    openModal({
      title: `Sửa phụ liệu ${row.code}`,
      fields: [
        { key: 'name', label: 'Tên phụ liệu', required: true, value: row.name },
        { key: 'unit', label: 'Đơn vị (cái, bộ, cuộn...)', required: true, value: row.unit },
        { key: 'min_stock', label: 'Tồn tối thiểu', type: 'number', value: row.min_stock },
      ],
      onSubmit: v => run(db.from('accessories').update({ ...v, min_stock: v.min_stock ?? 0 }).eq('id', row.accessory_id)),
      onDone: refresh,
    });
  },

  forms: () => [
    {
      title: 'Nhập phụ liệu',
      fields: [
        { key: 'accessory_id', label: 'Phụ liệu', type: 'select', options: state.lookups.accessories, required: true },
        { key: 'quantity', label: 'Số lượng', type: 'number', required: true },
        { key: 'supplier_id', label: 'Nhà cung cấp', type: 'select', options: state.lookups.suppliers },
        { key: 'note', label: 'Ghi chú' },
      ],
      save: v => saveMove('receipt', v),
    },
    {
      title: 'Xuất phụ liệu cho lệnh sản xuất',
      fields: [
        { key: 'accessory_id', label: 'Phụ liệu', type: 'select', options: state.lookups.accessories, required: true },
        { key: 'quantity', label: 'Số lượng', type: 'number', required: true },
        { key: 'order_id', label: 'Lệnh sản xuất', type: 'select', options: state.lookups.orders, required: true },
        { key: 'note', label: 'Ghi chú' },
      ],
      save: v => saveMove('issue', v),
    },
    {
      title: 'Kiểm kê, điều chỉnh tồn',
      hint: 'Nhập số đếm thực tế. Hệ thống tự tính chênh lệch so với tồn hiện tại và lưu lại kèm lý do (xem ở Lịch sử phụ liệu).',
      fields: [
        { key: 'accessory_id', label: 'Phụ liệu', type: 'select', options: state.lookups.accessories, required: true },
        { key: 'counted', label: 'Số đếm thực tế', type: 'number', required: true },
        { key: 'reason', label: 'Lý do chênh lệch', required: true },
      ],
      save: saveCount,
    },
    {
      title: 'Thêm loại phụ liệu',
      fields: [
        { key: 'code', label: 'Mã', required: true },
        { key: 'name', label: 'Tên phụ liệu', required: true },
        { key: 'unit', label: 'Đơn vị (cái, bộ, cuộn...)', required: true },
        { key: 'min_stock', label: 'Tồn tối thiểu', type: 'number', value: 0 },
      ],
      save: v => run(db.from('accessories').insert({ ...v, min_stock: v.min_stock ?? 0 })),
    },
  ],
};
