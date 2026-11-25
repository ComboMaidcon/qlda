import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, dmy, addDays } from '../lib/format.js';
import { fetchAll } from '../lib/data.js';
import { openModal } from '../lib/ui.js';
import { PERMS } from '../constants.js';

const chunk = (list, n = 200) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

async function itemsOf(table, key, ids) {
  const out = [];
  for (const part of chunk(ids)) {
    const { data, error } = await db.from(table).select('*').in(key, part);
    if (error) throw new Error(error.message);
    out.push(...data);
  }
  return out;
}

export default {
  title: 'Lịch sử nhập xuất',
  range: 'date',
  exportName: 'lich-su-kho',
  filters: [
    { label: 'Loại', get: r => r.kind },
    { label: 'Vải', get: r => r.fabric },
    { label: 'Trạng thái', get: r => (r.void ? 'Đã hủy' : 'Hiệu lực') },
  ],

  async load({ from, to }) {
    const [receipts, issues, adjustments, fabrics, suppliers] = await Promise.all([
      fetchAll(() => db.from('stock_receipts').select('*').gte('receipt_date', from).lte('receipt_date', to).order('id')),
      fetchAll(() => db.from('stock_issues').select('*').gte('issue_date', from).lte('issue_date', to).order('id')),
      fetchAll(() => db.from('stock_adjustments').select('*').gte('created_at', from).lt('created_at', addDays(to, 1)).order('id')),
      db.from('fabrics').select('id, code, name, color').then(r => r.data ?? []),
      db.from('suppliers').select('id, name').then(r => r.data ?? []),
    ]);
    const [rItems, iItems] = await Promise.all([
      itemsOf('stock_receipt_items', 'receipt_id', receipts.map(r => r.id)),
      itemsOf('stock_issue_items', 'issue_id', issues.map(r => r.id)),
    ]);
    const fabric = id => { const f = fabrics.find(x => x.id == id); return f ? `${f.code} - ${f.name} (${f.color})` : ''; };
    const supplier = id => suppliers.find(s => s.id == id)?.name ?? '';
    const order = id => state.lookups.orders.find(([oid]) => oid == id)?.[1] ?? '';

    const rows = [
      ...rItems.map(i => { const h = receipts.find(x => x.id === i.receipt_id);
        return { table: 'stock_receipts', id: h.id, date: h.receipt_date, kind: 'Nhập', code: h.code, fabric: fabric(i.fabric_id),
          qty: Number(i.quantity), partner: supplier(h.supplier_id), note: h.note, void: h.is_void }; }),
      ...iItems.map(i => { const h = issues.find(x => x.id === i.issue_id);
        return { table: 'stock_issues', id: h.id, date: h.issue_date, kind: 'Xuất', code: h.code, fabric: fabric(i.fabric_id),
          qty: -Number(i.quantity), partner: order(h.order_id), note: h.note, void: h.is_void }; }),
      ...adjustments.map(a => ({ table: 'stock_adjustments', id: a.id, date: String(a.created_at).slice(0, 10), kind: 'Kiểm kê',
        code: `KK-${a.id}`, fabric: fabric(a.fabric_id), qty: Number(a.quantity_diff), partner: '', note: a.reason, void: false })),
    ].sort((a, b) => (b.date.localeCompare(a.date)) || (b.id - a.id));

    const columns = [
      ['Ngày', r => dmy(r.date), r => r.date],
      ['Loại', r => r.kind],
      ['Số phiếu', r => esc(r.code)],
      ['Vải', r => esc(r.fabric)],
      ['Số lượng', r => `<span class="${r.qty < 0 ? 'danger' : ''}">${r.qty > 0 ? '+' : ''}${number(r.qty)}</span>`, r => r.qty],
      ['Nhà cung cấp / Lệnh', r => esc(r.partner)],
      ['Ghi chú / Lý do', r => esc(r.note)],
      ['Trạng thái', r => (r.void ? '<span class="muted">Đã hủy</span>' : 'Hiệu lực'), r => (r.void ? 'Đã hủy' : 'Hiệu lực')],
    ];
    return { columns, rows };
  },

  rowActions: row => (PERMS.stock.includes(state.role) && !row.void && row.table !== 'stock_adjustments'
    ? [{ key: 'void', label: 'Hủy phiếu', danger: true }] : []),

  onRowAction(key, row, refresh) {
    openModal({
      title: `Hủy phiếu ${row.code}`,
      hint: 'Tồn kho sẽ được tính lại, phiếu vẫn lưu trong lịch sử. Không hủy được nếu làm tồn kho âm. Phiếu đã hủy không khôi phục được.',
      fields: [{ key: 'void_reason', label: 'Lý do hủy (bắt buộc)', required: true }],
      submitLabel: 'Hủy phiếu',
      onSubmit: v => run(db.from(row.table).update({ is_void: true, void_reason: v.void_reason }).eq('id', row.id)),
      onDone: refresh,
    });
  },
};
