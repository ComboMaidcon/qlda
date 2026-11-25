import { esc, number } from './format.js';

// Cột đứng: items = [{label, value, hl?}]. SVG thuần, màu theo biến CSS.
// Cột có hl = true lấy màu nhấn (thường là ngày hôm nay), các cột còn lại màu trung tính.
// Trục đáy có vạch chia như thước dây: vạch dài ở mỗi nhãn.
export function barChart(items, { title = '', height = 220 } = {}) {
  if (!items.length || items.every(i => !i.value)) return '<p class="muted">Chưa có dữ liệu</p>';
  const w = 720, pad = { l: 8, r: 8, t: 24, b: 36 };
  const max = Math.max(...items.map(i => i.value));
  const slot = (w - pad.l - pad.r) / items.length;
  const bar = Math.min(32, slot * 0.6);
  const base = height - pad.b;
  const grid = [0.5, 1].map(f => {
    const y = base - (base - pad.t) * f;
    return `<line class="gridline" x1="${pad.l}" x2="${w - pad.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
  }).join('');
  const tape = Array.from({ length: items.length * 2 + 1 }, (_, i) => {
    const x = pad.l + (slot * i) / 2;
    const long = i % 2 === 1;
    return `<line class="tape" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${base}" y2="${base + (long ? 8 : 4)}"/>`;
  }).join('');
  const bars = items.map((item, i) => {
    const h = Math.max(item.value ? 2 : 0, ((base - pad.t) * item.value) / max);
    const x = pad.l + slot * i + (slot - bar) / 2;
    const y = base - h;
    const cx = (x + bar / 2).toFixed(1);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bar.toFixed(1)}" height="${h.toFixed(1)}" rx="3" class="bar${item.hl ? ' hl' : ''}"><title>${esc(item.label)}: ${number(item.value)}</title></rect>
      ${item.value ? `<text x="${cx}" y="${(y - 6).toFixed(1)}" text-anchor="middle" class="val">${number(item.value)}</text>` : ''}
      <text x="${cx}" y="${base + 24}" text-anchor="middle" class="tick">${esc(item.label)}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${height}" role="img" aria-label="${esc(title)}">${grid}<line class="axis" x1="${pad.l}" x2="${w - pad.r}" y1="${base}" y2="${base}"/>${tape}${bars}</svg>`;
}

// Thanh ngang: items = [{label, value, max?, mark?, warn?, note?}]; mark = vạch mốc (ví dụ tồn tối thiểu).
export function hBars(items) {
  if (!items.length) return '<p class="muted">Chưa có dữ liệu</p>';
  const top = Math.max(...items.map(i => Math.max(i.max ?? 0, i.value, i.mark ?? 0)), 1);
  return `<div class="hbars">${items.map(i => `
    <div class="hbar-row">
      <span class="hbar-label">${esc(i.label)}</span>
      <span class="hbar-track">
        <span class="hbar-fill${i.warn ? ' warn' : ''}" style="width:${Math.min(100, (i.value / top) * 100)}%"></span>
        ${i.mark != null ? `<span class="hbar-mark" style="left:${Math.min(100, (i.mark / top) * 100)}%" title="Tối thiểu ${number(i.mark)}"></span>` : ''}
      </span>
      <span class="hbar-value">${i.note ?? number(i.value)}</span>
    </div>`).join('')}</div>`;
}

export const progressBar = percent =>
  `<span class="progress" title="${percent}%"><span style="width:${Math.min(100, percent)}%"></span></span>`;
