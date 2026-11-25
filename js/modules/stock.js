import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, docCode } from '../lib/format.js';
import { PERMS } from '../constants.js';

const UNITS = { roll: 'Cuộn', meter: 'Mét' };

// Phiếu gồm phần đầu và dòng chi tiết: nếu dòng lỗi thì xóa phần đầu để không để lại phiếu rỗng.
async function saveWithItems(headerTable, itemTable, linkKey, header, item) {
  const created = await run(db.from(headerTable).insert(header).select('id').single());
  try {
    await run(db.from(itemTable).insert({ [linkKey]: created.id, ...item }));
  } catch (err) {
    await db.from(headerTable).delete().eq('id', created.id);
    throw err;
  }
}

async function saveReceipt({ fabric_id, quantity, supplier_id, note }) {
  if (!(quantity > 0)) throw new Error('Số lượng phải lớn hơn 0');
  await saveWithItems('stock_receipts', 'stock_receipt_items', 'receipt_id',
    { code: docCode('PN'), supplier_id, note }, { fabric_id, quantity });
}

async function saveIssue({ fabric_id, quantity, order_id, note }) {
  if (!(quantity > 0)) throw new Error('Số lượng phải lớn hơn 0');
  const available = state.stock[fabric_id] ?? 0;
  if (available < quantity) throw new Error(`Tồn kho không đủ (còn ${number(available)})`);
  await saveWithItems('stock_issues', 'stock_issue_items', 'issue_id',
    { code: docCode('PX'), order_id, note }, { fabric_id, quantity });
}

// Kiểm kê: nhập số đếm thực tế, hệ thống ghi chênh lệch kèm lý do.
async function saveCount({ fabric_id, counted, reason }) {
  const current = state.stock[fabric_id] ?? 0;
  const diff = Math.round((counted - current) * 1000) / 1000;
  if (diff === 0) throw new Error('Số kiểm kê trùng với tồn hiện tại, không cần điều chỉnh');
  await run(db.from('stock_adjustments').insert({ fabric_id, quantity_diff: diff, reason }));
}

export default {
  title: 'Kho vải',
  writeRoles: PERMS.stock,
  exportName: 'ton-kho-vai',
  filters: [
    { label: 'Màu', get: r => r.color },
    { label: 'Đơn vị', get: r => UNITS[r.unit] },
    { label: 'Tình trạng', get: r => (r.balance < r.min_stock ? 'Sắp hết' : 'Đủ') },
  ],

  async load() {
    const { data, error } = await db.from('v_stock_balance').select('*').order('code');
    const rows = data ?? [];
    state.stock = Object.fromEntries(rows.map(r => [r.fabric_id, Number(r.balance)]));

    const isLow = r => r.balance < r.min_stock;
    const columns = [
      ['Mã', r => esc(r.code)],
      ['Tên vải', r => esc(r.name)],
      ['Màu', r => esc(r.color)],
      ['Đơn vị', r => UNITS[r.unit] ?? ''],
      ['Tồn', r => `<strong class="${isLow(r) ? 'danger' : ''}">${number(r.balance)}</strong>`, r => Number(r.balance)],
      ['Tối thiểu', r => number(r.min_stock), r => Number(r.min_stock)],
      ['Cảnh báo', r => (isLow(r) ? '<span class="danger">Sắp hết</span>' : ''), r => (isLow(r) ? 'Sắp hết' : '')],
    ];
    return { columns, rows, error: error?.message };
  },

  forms: () => [
    {
      title: 'Nhập vải',
      fields: [
        { key: 'fabric_id', label: 'Loại vải', type: 'select', options: state.lookups.fabrics, required: true },
        { key: 'quantity', label: 'Số lượng', type: 'number', required: true },
        { key: 'supplier_id', label: 'Nhà cung cấp', type: 'select', options: state.lookups.suppliers },
        { key: 'note', label: 'Ghi chú' },
      ],
      save: saveReceipt,
    },
    {
      title: 'Xuất vải cho lệnh sản xuất (khu cắt)',
      fields: [
        { key: 'fabric_id', label: 'Loại vải', type: 'select', options: state.lookups.fabrics, required: true },
        { key: 'quantity', label: 'Số lượng', type: 'number', required: true },
        { key: 'order_id', label: 'Lệnh sản xuất', type: 'select', options: state.lookups.orders, required: true },
        { key: 'note', label: 'Ghi chú' },
      ],
      save: saveIssue,
    },
    {
      title: 'Kiểm kê, điều chỉnh tồn',
      hint: 'Nhập số đếm thực tế. Hệ thống tự tính chênh lệch so với tồn hiện tại và lưu lại kèm lý do (xem ở Lịch sử nhập xuất).',
      fields: [
        { key: 'fabric_id', label: 'Loại vải', type: 'select', options: state.lookups.fabrics, required: true },
        { key: 'counted', label: 'Số đếm thực tế', type: 'number', required: true },
        { key: 'reason', label: 'Lý do chênh lệch', required: true },
      ],
      save: saveCount,
    },
  ],
};
