export function esc(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  return String(value ?? '').replace(/[&<>"]/g, ch => map[ch]);
}

export const number = value => Number(value ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });

// YYYY-MM-DD theo giờ địa phương.
export const today = () => new Date().toLocaleDateString('sv-SE');
export const monthNow = () => today().slice(0, 7);

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
}
export const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 864e5);

// 2026-10-07 -> 07/10/2026
export const dmy = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');

// 'YYYY-MM' hoặc 'YYYY-MM-01' -> [đầu tháng, đầu tháng sau]
export function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return [`${y}-${String(m).padStart(2, '0')}-01`, next];
}
export const daysInMonth = month => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

// Giờ giữa hai mốc 'HH:MM', làm tròn 0,25 giờ. Qua nửa đêm thì cộng 24 giờ.
export function hoursBetween(timeIn, timeOut) {
  const toMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let diff = toMin(timeOut) - toMin(timeIn);
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 4) / 4;
}

export const pct = (done, total) => (total > 0 ? Math.round((done / total) * 100) : 0);

// Mã chứng từ, ví dụ PN-261007-482.
export function docCode(prefix) {
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `${prefix}-${today().slice(2).replace(/-/g, '')}-${suffix}`;
}
