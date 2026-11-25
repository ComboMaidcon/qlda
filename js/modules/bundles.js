import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, dmy } from '../lib/format.js';
import { fetchAll } from '../lib/data.js';
import { toast } from '../lib/ui.js';
import { qrSvg } from '../lib/qr.js';
import { PERMS } from '../constants.js';

const canEdit = () => PERMS.bundles.includes(state.role);
const zonesShown = () => state.zonesInfo.filter(z => state.role !== 'leader' || z.id == state.zoneId);

// Cửa sổ xem trước và in phiếu bó (mỗi phiếu một mã QR). In bằng nút "In phiếu" của trình duyệt.
export async function openTicketSheet(bundles) {
  const sheet = document.createElement('div');
  sheet.className = 'print-sheet';
  sheet.innerHTML = `
    <div class="print-bar no-print">
      <strong>${bundles.length} phiếu bó</strong>
      <span class="muted">Dán mỗi phiếu lên bó vải tương ứng. Công đoạn quét mã khi làm xong bó.</span>
      <span class="spacer"></span>
      <button type="button" data-print>In phiếu</button>
      <button type="button" class="secondary" data-close>Đóng</button>
    </div>
    <div class="tickets"><p class="muted">Đang tạo mã QR...</p></div>`;
  document.body.appendChild(sheet);
  document.body.classList.add('has-print-sheet');
  const close = () => { sheet.remove(); document.body.classList.remove('has-print-sheet'); };
  sheet.querySelector('[data-close]').addEventListener('click', close);
  sheet.querySelector('[data-print]').addEventListener('click', () => window.print());
  try {
    const svgs = await Promise.all(bundles.map(b => qrSvg(b.code)));
    sheet.querySelector('.tickets').innerHTML = bundles.map((b, i) => `
      <div class="ticket">
        <div class="ticket-qr">${svgs[i]}</div>
        <div class="ticket-info">
          <div class="ticket-code">${esc(b.code)}</div>
          <div>Lệnh <strong>${esc(b.production_orders?.code)}</strong></div>
          <div>Size: <strong>${esc(b.size || '-')}</strong></div>
          <div>Số lượng: <strong>${number(b.quantity)}</strong></div>
          <div class="muted">Bó ${b.bundle_no}</div>
        </div>
      </div>`).join('');
  } catch (err) {
    sheet.querySelector('.tickets').innerHTML = `<p class="danger">${esc(err.message)}</p>`;
  }
}

async function loadBundles(orderId) {
  return fetchAll(() => {
    let q = db.from('bundles').select('*, production_orders(code, quantity)');
    if (orderId) q = q.eq('order_id', orderId);
    return q.order('order_id').order('bundle_no');
  });
}

// Tạo n bó liên tiếp cho một lệnh. Tổng số lượng các bó không vượt số lượng lệnh.
async function createBundles({ order_id, size, quantity, count }) {
  if (!(quantity >= 1) || !(count >= 1)) throw new Error('Số lượng mỗi bó và số bó phải từ 1 trở lên');
  if (count > 200) throw new Error('Mỗi lần tạo tối đa 200 bó');
  const { data: order } = await db.from('production_orders').select('id, quantity').eq('id', order_id).single();
  const existing = await loadBundles(order_id);
  const used = existing.reduce((t, b) => t + Number(b.quantity), 0);
  if (used + quantity * count > order.quantity) {
    throw new Error(`Tổng số lượng các bó (${number(used + quantity * count)}) vượt số lượng lệnh (${number(order.quantity)}); đã chia ${number(used)}`);
  }
  const start = existing.reduce((m, b) => Math.max(m, b.bundle_no), 0) + 1;
  const rows = Array.from({ length: count }, (_, i) => ({ order_id, bundle_no: start + i, size, quantity: Math.floor(quantity) }));
  await run(db.from('bundles').insert(rows));
}

// M4.7: phiếu bó. Cắt xong chia thành các bó, in phiếu QR; mỗi khu quét mã khi hoàn thành bó (module "Quét bó").
export default {
  title: 'Phiếu bó',
  writeRoles: PERMS.bundles,
  exportName: 'phieu-bo',
  filters: [
    { label: 'Lệnh', get: b => b.production_orders?.code },
    { label: 'Size', get: b => b.size },
  ],
  hint: 'Mỗi bó đi qua từng khu một lần; ô hiện dấu ✓ khi khu đó đã quét xong (kèm số hàng lỗi nếu có). ' +
        'Số lượng bó đã tạo không sửa được; nhập sai thì xóa bó (chỉ xóa được bó chưa có lượt quét) rồi tạo lại.',

  async load() {
    const [bundles, scans] = await Promise.all([
      loadBundles(),
      fetchAll(() => db.from('bundle_scans').select('*').order('id')),
    ]);
    const zones = zonesShown();
    const scanOf = (bundleId, zoneId) => scans.find(s => s.bundle_id === bundleId && s.zone_id === zoneId);
    const rows = bundles.map(b => ({ ...b, scans: scans.filter(s => s.bundle_id === b.id) }));
    const done = b => zones.filter(z => scanOf(b.id, z.id)).length;
    const columns = [
      ['Mã bó', b => `<strong>${esc(b.code)}</strong>`, b => b.code],
      ['Lệnh', b => esc(b.production_orders?.code)],
      ['Size', b => esc(b.size)],
      ['Số lượng', b => number(b.quantity), b => Number(b.quantity)],
      ...zones.map(z => [z.name, b => {
        const s = scanOf(b.id, z.id);
        return s ? `<span class="ok-mark" title="${dmy(s.scan_date)}">✓${s.defect_quantity ? ` <span class="danger">(${s.defect_quantity} lỗi)</span>` : ''}</span>` : '<span class="muted">-</span>';
      }, b => (scanOf(b.id, z.id) ? 'Đã quét' : 'Chưa')]),
      ['Đã qua', b => `${done(b)}/${zones.length}`, b => done(b)],
    ];
    return { columns, rows };
  },

  rowActions: b => [
    { key: 'print', label: 'In phiếu' },
    ...(canEdit() && !b.scans.length ? [{ key: 'delete', label: 'Xóa', danger: true }] : []),
  ],

  async onRowAction(key, row, refresh) {
    if (key === 'print') return openTicketSheet([row]);
    if (!confirm(`Xóa bó ${row.code}?`)) return;
    try { await run(db.from('bundles').delete().eq('id', row.id)); toast('Đã xóa'); await refresh(); } catch (e) { alert(e.message); }
  },

  forms: () => [
    {
      title: 'Tạo phiếu bó cho lệnh sản xuất',
      hint: 'Ví dụ: lệnh 500 áo, mỗi bó 20 cái, tạo 25 bó. Tạo nhiều size thì tạo từng size một lần. Mã bó tự sinh theo mã lệnh (vd LSX-001-B001).',
      fields: [
        { key: 'order_id', label: 'Lệnh sản xuất', type: 'select', options: state.lookups.orders, required: true },
        { key: 'size', label: 'Size (tùy chọn)' },
        { key: 'quantity', label: 'Số lượng mỗi bó', type: 'number', required: true },
        { key: 'count', label: 'Số bó cần tạo', type: 'number', required: true, value: 1 },
      ],
      save: createBundles,
    },
    {
      title: 'In phiếu bó theo lệnh',
      mount(el) {
        el.innerHTML = `<form class="form-grid">
          <label>Lệnh sản xuất<select name="order_id" required><option value="">Chọn</option>
            ${state.lookups.orders.map(([id, code]) => `<option value="${esc(id)}">${esc(code)}</option>`).join('')}</select></label>
          <button type="submit">Xem và in</button></form>`;
        el.querySelector('form').addEventListener('submit', async e => {
          e.preventDefault();
          const list = await loadBundles(Number(new FormData(e.target).get('order_id')));
          if (!list.length) return toast('Lệnh này chưa có bó nào', true);
          openTicketSheet(list);
        });
      },
    },
  ],
};
