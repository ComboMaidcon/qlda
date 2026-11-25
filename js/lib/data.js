import { state } from '../state.js';

// Supabase giới hạn 1000 dòng mỗi lần: đọc theo trang cho tới khi hết.
// makeQuery phải trả về một truy vấn MỚI mỗi lần gọi và có order() ổn định.
export async function fetchAll(makeQuery, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

// Tổ trưởng chỉ thấy khu của mình (lớp phụ cho giao diện; chặn thật sự là RLS trong database).
export function scoped(query, column = 'zone_id') {
  return state.role === 'leader' ? query.eq(column, state.zoneId ?? -1) : query;
}

export const zoneName = id => state.zonesInfo.find(z => z.id == id)?.name ?? '';
export const zoneKind = id => state.zonesInfo.find(z => z.id == id)?.pay_kind;
export const lastZone = () => state.zonesInfo.reduce((a, b) => (!a || b.sort_order > a.sort_order ? b : a), null);

export const plain = html => String(html ?? '')
  .replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();

export const sumBy = (rows, fn) => rows.reduce((total, r) => total + Number(fn(r) ?? 0), 0);

export function groupBy(rows, keyFn) {
  const map = new Map();
  rows.forEach(r => {
    const key = keyFn(r);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  });
  return map;
}
