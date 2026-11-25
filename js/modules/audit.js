import { db } from '../lib/supabase.js';
import { esc, addDays } from '../lib/format.js';
import { fetchAll } from '../lib/data.js';
import { TABLE_LABELS } from '../constants.js';

const ACTION = { insert: 'Thêm', update: 'Sửa', delete: 'Xóa' };
const SKIP = new Set(['id', 'created_at', 'updated_at']);
const short = v => (v == null || v === '' ? '(trống)' : String(v).length > 40 ? String(v).slice(0, 40) + '…' : String(v));

function summary(row) {
  const { old_data: before, new_data: after } = row;
  if (row.action === 'update') {
    const changes = Object.keys(after ?? {}).filter(k => !SKIP.has(k) && JSON.stringify(before?.[k]) !== JSON.stringify(after[k]))
      .map(k => `${k}: ${short(before?.[k])} → ${short(after[k])}`);
    return changes.join('; ') || '(không đổi)';
  }
  const data = row.action === 'insert' ? after : before;
  return Object.entries(data ?? {}).filter(([k, v]) => !SKIP.has(k) && v != null && v !== '').map(([k, v]) => `${k}: ${short(v)}`).join('; ');
}

export default {
  title: 'Nhật ký thao tác',
  range: 'date',
  exportName: 'nhat-ky',
  filters: [
    { label: 'Bảng', get: r => TABLE_LABELS[r.table_name] ?? r.table_name },
    { label: 'Hành động', get: r => ACTION[r.action] },
    { label: 'Người', get: r => r.who },
  ],

  async load({ from, to }) {
    const [rows, profiles] = await Promise.all([
      fetchAll(() => db.from('audit_logs').select('*').gte('created_at', from).lt('created_at', addDays(to, 1))
        .order('created_at', { ascending: false }).order('id', { ascending: false })),
      db.from('profiles').select('id, full_name').then(r => r.data ?? []),
    ]);
    const nameOf = id => profiles.find(p => p.id === id)?.full_name ?? (id ? String(id).slice(0, 8) : 'Hệ thống');
    rows.forEach(r => { r.who = nameOf(r.user_id); });

    const columns = [
      ['Thời gian', r => new Date(r.created_at).toLocaleString('vi-VN'), r => r.created_at],
      ['Người thao tác', r => esc(r.who)],
      ['Bảng', r => TABLE_LABELS[r.table_name] ?? esc(r.table_name)],
      ['Hành động', r => ACTION[r.action]],
      ['Mã bản ghi', r => esc(r.record_id)],
      ['Chi tiết', r => `<span title="${esc(summary(r))}">${esc(summary(r).slice(0, 110))}</span>`, r => summary(r)],
    ];
    return { columns, rows };
  },
};
