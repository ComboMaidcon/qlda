import { db, run } from '../lib/supabase.js';
import { esc, number, today } from '../lib/format.js';
import { openModal } from '../lib/ui.js';
import { uploadImage, safeImageUrl } from '../services/storage.js';
import { PERMS } from '../constants.js';
import { state } from '../state.js';

const canEdit = () => PERMS.products.includes(state.role);
const RATE_VIEWERS = ['owner', 'manager', 'accountant'];

// Gộp ảnh tải lên (ưu tiên) với đường dẫn ảnh nhập tay.
async function withImage({ image_file, ...values }) {
  if (image_file) values.image_url = await uploadImage(image_file);
  else if (!values.image_url) delete values.image_url;
  return values;
}

export default {
  title: 'Mã hàng',
  writeRoles: PERMS.products,
  exportName: 'ma-hang',
  filters: [{ label: 'Trạng thái', get: p => (p.is_active ? 'Đang sản xuất' : 'Ngừng') }],

  async load() {
    const seeRates = RATE_VIEWERS.includes(state.role);   // Bảng 15: tổ trưởng chỉ xem mã hàng, không xem đơn giá
    const [products, rates] = await Promise.all([
      db.from('products').select('*').order('code'),
      seeRates ? db.from('piece_rates').select('product_id, rate, effective_from').lte('effective_from', today()) : { data: [] },
    ]);
    // Đơn giá hiện hành = đơn giá có ngày áp dụng gần nhất không vượt quá hôm nay.
    const current = {};
    (rates.data ?? []).forEach(r => {
      if (!current[r.product_id] || r.effective_from > current[r.product_id].effective_from) current[r.product_id] = r;
    });
    const columns = [
      ['', p => (safeImageUrl(p.image_url) ? `<img class="thumb" src="${esc(safeImageUrl(p.image_url))}" alt="" loading="lazy">` : '')],
      ['Mã hàng', p => esc(p.code)],
      ['Tên', p => esc(p.name)],
      ['Mô tả', p => esc(p.description)],
      ...(seeRates ? [['Đơn giá may hiện hành', p => (current[p.id] ? number(current[p.id].rate) : '<span class="warn">Chưa có</span>'), p => current[p.id]?.rate ?? '']] : []),
      ['Trạng thái', p => (p.is_active ? 'Đang sản xuất' : 'Ngừng'), p => (p.is_active ? 'Đang sản xuất' : 'Ngừng')],
    ];
    return { columns, rows: products.data ?? [], error: products.error?.message };
  },

  rowActions: () => (canEdit() ? [{ key: 'edit', label: 'Sửa' }, { key: 'delete', label: 'Xóa', danger: true }] : []),

  async onRowAction(key, row, refresh) {
    if (key === 'delete') {
      if (!confirm(`Xóa mã hàng ${row.code}? Mã đã có lệnh sản xuất thì không xóa được, hãy chọn "Ngừng sản xuất" khi sửa.`)) return;
      try { await run(db.from('products').delete().eq('id', row.id)); await refresh(); } catch (e) { alert(e.message); }
      return;
    }
    openModal({
      title: `Sửa mã hàng ${row.code}`,
      fields: [
        { key: 'name', label: 'Tên', required: true, value: row.name },
        { key: 'description', label: 'Mô tả', value: row.description },
        { key: 'image_file', label: 'Ảnh mẫu mới (để trống nếu giữ ảnh cũ)', type: 'file', accept: 'image/*' },
        { key: 'is_active', label: 'Trạng thái', type: 'select', required: true, value: String(row.is_active),
          options: [['true', 'Đang sản xuất'], ['false', 'Ngừng sản xuất']] },
      ],
      onSubmit: async values => run(db.from('products').update({ ...(await withImage(values)), is_active: values.is_active === 'true' }).eq('id', row.id)),
      onDone: refresh,
    });
  },

  forms: () => [{
    title: 'Thêm mã hàng',
    hint: 'Sau khi thêm mã hàng, vào tab Đơn giá để khai báo đơn giá may (cần có thì mới ghi được sản lượng khu may).',
    fields: [
      { key: 'code', label: 'Mã hàng', required: true },
      { key: 'name', label: 'Tên', required: true },
      { key: 'description', label: 'Mô tả' },
      { key: 'image_file', label: 'Ảnh mẫu (tối đa 2 MB)', type: 'file', accept: 'image/*' },
    ],
    save: async values => run(db.from('products').insert(await withImage(values))),
  }],
};
