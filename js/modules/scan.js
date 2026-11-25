import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc, number, today } from '../lib/format.js';
import { fetchAll, scoped, zoneKind, zoneName } from '../lib/data.js';
import { toast } from '../lib/ui.js';
import { canScan, startScanner } from '../lib/qr.js';
import { PERMS } from '../constants.js';

let lastEmployee = '';   // công nhân may vừa chọn, để chọn nhanh cho bó kế tiếp

const hhmm = iso => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '');

// M4.7: tổ trưởng quét mã QR trên phiếu bó (camera, máy quét mã vạch, hoặc gõ mã) để ghi bó đã xong khu mình.
export default {
  title: 'Quét bó',
  writeRoles: PERMS.scan,

  async render(host, ctx, refresh) {
    const zoneId = state.zoneId;
    const kind = zoneKind(zoneId);
    host.innerHTML = `
      <section class="panel scan-panel">
        <h3>Khu ${esc(zoneName(zoneId))}: quét phiếu bó</h3>
        <form class="scan-form no-print">
          <label>Mã bó (quét bằng máy quét hoặc gõ rồi Enter)
            <input name="code" autocomplete="off" autofocus placeholder="vd LSX-001-B001"></label>
          <button type="submit">Tìm bó</button>
          <button type="button" class="secondary" data-camera>Mở camera</button>
        </form>
        <div class="scan-video-box" hidden><video muted playsinline></video></div>
        <div class="scan-result"></div>
      </section>
      <h3>Đã quét hôm nay (khu ${esc(zoneName(zoneId))})</h3>
      <div class="scan-today"></div>`;
    const form = host.querySelector('.scan-form');
    const result = host.querySelector('.scan-result');
    const input = form.elements.code;
    const videoBox = host.querySelector('.scan-video-box');
    let stop = null;

    const stopCamera = () => { stop?.(); stop = null; videoBox.hidden = true; host.querySelector('[data-camera]').textContent = 'Mở camera'; };

    async function lookup(raw) {
      const code = String(raw ?? '').trim();
      if (!code) return;
      result.innerHTML = '<p class="muted">Đang tìm...</p>';
      const { data: bundle, error } = await db.from('bundles').select('*, production_orders(code)').eq('code', code).maybeSingle();
      if (error) { result.innerHTML = `<p class="danger">${esc(error.message)}</p>`; return; }
      if (!bundle) { result.innerHTML = `<p class="danger">Không có bó nào mã "${esc(code)}".</p>`; return; }
      const { data: scans } = await db.from('bundle_scans').select('*').eq('bundle_id', bundle.id);
      const mine = (scans ?? []).find(s => s.zone_id == zoneId);
      const head = `<p class="scan-bundle"><strong>${esc(bundle.code)}</strong> · lệnh ${esc(bundle.production_orders?.code)} · size ${esc(bundle.size || '-')} · <strong>${number(bundle.quantity)}</strong> cái</p>`;
      if (mine) {
        result.innerHTML = `${head}<p class="danger">Khu ${esc(zoneName(zoneId))} đã quét bó này lúc ${hhmm(mine.scanned_at)}${mine.defect_quantity ? ` (${mine.defect_quantity} lỗi)` : ''}. Quét nhầm thì xóa ở danh sách bên dưới rồi quét lại.</p>`;
        return;
      }
      const employeeField = kind === 'piece'
        ? `<label>Công nhân may bó này<select name="employee_id" required><option value="">Chọn</option>
            ${state.lookups.sewers.map(([id, name]) => `<option value="${esc(id)}"${String(id) === String(lastEmployee) ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></label>` : '';
      result.innerHTML = `${head}
        <form class="form-grid scan-confirm">
          ${employeeField}
          <label>Số hàng lỗi<input name="defect" type="number" min="0" max="${bundle.quantity}" step="1" value="0"></label>
          <button type="submit">Xác nhận xong khu ${esc(zoneName(zoneId))}</button>
        </form>`;
      result.querySelector('form').addEventListener('submit', async e => {
        e.preventDefault();
        const f = new FormData(e.target);
        const button = e.target.querySelector('button');
        button.disabled = true;
        try {
          const employee = f.get('employee_id');
          await run(db.from('bundle_scans').insert({
            bundle_id: bundle.id, zone_id: zoneId, employee_id: employee ? Number(employee) : null,
            defect_quantity: Number(f.get('defect') || 0), scan_date: today(),
          }));
          if (employee) lastEmployee = employee;
          toast(`Đã ghi bó ${bundle.code}`);
          result.innerHTML = '';
          input.value = '';
          await drawToday();
          input.focus();
        } catch (err) {
          toast(err.message, true);
          button.disabled = false;
        }
      });
    }

    async function drawToday() {
      const box = host.querySelector('.scan-today');
      const scans = await fetchAll(() => scoped(db.from('bundle_scans').select('*, bundles(code, size, quantity, order_id), employees(full_name)')
        .eq('scan_date', today()).order('id', { ascending: false })));
      const total = scans.reduce((t, s) => t + Number(s.bundles?.quantity ?? 0), 0);
      box.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Giờ</th><th>Mã bó</th><th>Size</th><th>Số lượng</th><th>Lỗi</th><th>Công nhân</th><th></th></tr></thead>
        <tbody>${scans.map(s => `<tr>
          <td>${hhmm(s.scanned_at)}</td><td><strong>${esc(s.bundles?.code)}</strong></td><td>${esc(s.bundles?.size)}</td>
          <td>${number(s.bundles?.quantity)}</td><td>${number(s.defect_quantity)}</td><td>${esc(s.employees?.full_name)}</td>
          <td class="actions"><button type="button" class="small danger-btn" data-undo="${s.id}">Xóa</button></td></tr>`).join('')
          || '<tr><td colspan="7" class="muted">Chưa quét bó nào hôm nay</td></tr>'}</tbody>
        ${scans.length ? `<tfoot><tr class="total-row"><td>Tổng</td><td>${scans.length} bó</td><td></td><td>${number(total)}</td><td colspan="3"></td></tr></tfoot>` : ''}
      </table></div>`;
    }

    form.addEventListener('submit', e => { e.preventDefault(); lookup(input.value); });
    host.querySelector('.scan-today').addEventListener('click', async e => {
      const btn = e.target.closest('[data-undo]');
      if (!btn || !confirm('Xóa lượt quét này (quét nhầm)? Thao tác được ghi vào nhật ký.')) return;
      try { await run(db.from('bundle_scans').delete().eq('id', Number(btn.dataset.undo))); toast('Đã xóa lượt quét'); await drawToday(); result.innerHTML = ''; }
      catch (err) { toast(err.message, true); }
    });
    host.querySelector('[data-camera]').addEventListener('click', async e => {
      if (stop) return stopCamera();
      if (!canScan()) return toast('Trình duyệt này không mở được camera. Hãy dùng máy quét hoặc gõ mã.', true);
      try {
        videoBox.hidden = false;
        stop = await startScanner(videoBox.querySelector('video'), text => { input.value = text; lookup(text); });
        e.target.textContent = 'Tắt camera';
      } catch (err) {
        videoBox.hidden = true;
        toast(err.name === 'NotAllowedError' ? 'Chưa cho phép dùng camera. Hãy bật quyền camera cho trang này.' : (err.message || 'Không mở được camera'), true);
      }
    });
    // Rời trang thì tắt camera (nội dung tab bị thay).
    new MutationObserver((_, obs) => { if (!host.isConnected) { stopCamera(); obs.disconnect(); } })
      .observe(document.getElementById('content'), { childList: true });

    await drawToday();
    input.focus();
  },
};
