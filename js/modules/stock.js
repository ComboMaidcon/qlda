import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, docCode } from '../lib/format.js';

const UNITS = { roll: 'Cuộn', meter: 'Mét' };

async function saveReceipt({ fabric_id, quantity, supplier_id, note }) {
  const header = await run(
    db.from('stock_receipts').insert({ code: docCode('PN'), supplier_id, note }).select('id').single()
  );
  await run(db.from('stock_receipt_items').insert({ receipt_id: header.id, fabric_id, quantity }));
}

async function saveIssue({ fabric_id, quantity, order_id, note }) {
  const available = state.stock[fabric_id] ?? 0;
  if (available < quantity) throw new Error(`Tồn kho không đủ (còn ${available})`);

  const header = await run(
    db.from('stock_issues').insert({ code: docCode('PX'), order_id, note }).select('id').single()
  );
  await run(db.from('stock_issue_items').insert({ issue_id: header.id, fabric_id, quantity }));
}

export default {
  title: 'Kho vải',
  writeRoles: ['owner', 'storekeeper'],

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
      ['Tồn', r => `<strong class="${isLow(r) ? 'danger' : ''}">${number(r.balance)}</strong>`],
      ['Tối thiểu', r => number(r.min_stock)],
      ['', r => (isLow(r) ? '<span class="danger">Sắp hết</span>' : '')],
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
      title: 'Xuất vải cho lệnh sản xuất',
      fields: [
        { key: 'fabric_id', label: 'Loại vải', type: 'select', options: state.lookups.fabrics, required: true },
        { key: 'quantity', label: 'Số lượng', type: 'number', required: true },
        { key: 'order_id', label: 'Lệnh sản xuất', type: 'select', options: state.lookups.orders },
        { key: 'note', label: 'Ghi chú' },
      ],
      save: saveIssue,
    },
  ],
};
