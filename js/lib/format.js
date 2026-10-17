export function esc(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  return String(value ?? '').replace(/[&<>"]/g, ch => map[ch]);
}

export const number = value => Number(value).toLocaleString('vi-VN');

// YYYY-MM-DD theo giờ địa phương.
export const today = () => new Date().toLocaleDateString('sv-SE');

// Mã chứng từ, ví dụ PN-261007-482.
export function docCode(prefix) {
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `${prefix}-${today().slice(2).replace(/-/g, '')}-${suffix}`;
}
