import { esc } from './format.js';
import { plain } from './data.js';
import { PAGE_SIZE } from '../constants.js';
import { toMatrix, exportMatrix } from './export.js';

export function toast(message, isError = false) {
  const el = document.createElement('div');
  el.className = isError ? 'toast error' : 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function fieldHtml(field) {
  const attrs = `name="${field.key}"${field.required ? ' required' : ''}`;

  if (field.type === 'select') {
    const placeholder = field.required ? 'Chọn' : 'Không chọn';
    const options = [['', placeholder], ...(field.options ?? [])];
    const items = options.map(([value, label]) => {
      const selected = String(value) === String(field.value ?? '') ? ' selected' : '';
      return `<option value="${esc(value)}"${selected}>${esc(label)}</option>`;
    });
    return `<select ${attrs}>${items.join('')}</select>`;
  }
  if (field.type === 'file') return `<input ${attrs} type="file" accept="${esc(field.accept ?? '')}">`;

  const extra = field.type === 'number'
    ? ` step="any" min="${field.min ?? 0}"`
    : field.type === 'password' ? ` minlength="${field.minlength ?? 8}" autocomplete="new-password"` : '';
  return `<input ${attrs} type="${field.type ?? 'text'}"${extra} value="${esc(field.value ?? '')}">`;
}

const labelHtml = f => `<label>${f.label}${fieldHtml(f)}</label>`;

export function formHtml(form, index, open = false) {
  const hint = form.hint ? `<p class="hint">${form.hint}</p>` : '';
  const body = form.mount
    ? `<div id="form-${index}" class="custom-form"></div>`
    : `<form id="form-${index}" class="form-grid">${form.fields.map(labelHtml).join('')}<button type="submit">Lưu</button></form>${hint}`;
  return `<details class="panel form-panel no-print"${open ? ' open' : ''}><summary>${form.title}</summary>${body}</details>`;
}

function readValues(formEl, fields) {
  const values = {};
  new FormData(formEl).forEach((raw, key) => {
    const field = fields.find(f => f.key === key);
    if (raw instanceof File) values[key] = raw.size ? raw : null;
    else if (raw === '') values[key] = null;
    else values[key] = field?.type === 'number' ? Number(raw) : raw;
  });
  return values;
}

export function bindForm(form, index, onSaved) {
  const el = document.getElementById(`form-${index}`);
  if (form.mount) return form.mount(el, onSaved);
  el.addEventListener('submit', async event => {
    event.preventDefault();
    const button = el.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      await form.save(readValues(el, form.fields));
      toast('Đã lưu');
      await onSaved();
    } catch (err) {
      toast(err.message || 'Có lỗi xảy ra', true);
      button.disabled = false;
    }
  });
}

// Hộp thoại nhập liệu (sửa bản ghi, đổi mật khẩu...). onSubmit(values) ném lỗi để giữ hộp thoại mở.
export function openModal({ title, fields, hint, submitLabel = 'Lưu', onSubmit, onDone }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';
  dialog.innerHTML = `
    <h2>${esc(title)}</h2>
    <form class="modal-form">
      ${fields.map(labelHtml).join('')}
      ${hint ? `<p class="hint">${hint}</p>` : ''}
      <div class="modal-actions">
        <button type="button" class="secondary" data-cancel>Hủy</button>
        <button type="submit">${esc(submitLabel)}</button>
      </div>
    </form>`;
  document.body.appendChild(dialog);
  const close = () => { dialog.close(); dialog.remove(); };
  dialog.addEventListener('cancel', () => dialog.remove());
  dialog.querySelector('[data-cancel]').addEventListener('click', close);
  const formEl = dialog.querySelector('form');
  formEl.addEventListener('submit', async event => {
    event.preventDefault();
    const button = formEl.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      await onSubmit(readValues(formEl, fields));
      close();
      toast('Đã lưu');
      await onDone?.();
    } catch (err) {
      toast(err.message || 'Có lỗi xảy ra', true);
      button.disabled = false;
    }
  });
  dialog.showModal();
}

export function openInfo(title, html) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal wide';
  dialog.innerHTML = `<h2>${esc(title)}</h2><div class="modal-body">${html}</div>
    <div class="modal-actions"><button type="button" class="secondary" data-close>Đóng</button></div>`;
  document.body.appendChild(dialog);
  const close = () => { dialog.close(); dialog.remove(); };
  dialog.addEventListener('cancel', () => dialog.remove());
  dialog.querySelector('[data-close]').addEventListener('click', close);
  dialog.showModal();
}

// Bảng có tìm kiếm, lọc, phân trang, nút thao tác từng dòng, xuất Excel và in.
// cfg: { columns, rows, footer(rowsDaLoc)|[], filters:[{label,get,default?}], actions(row)->[{key,label,danger}],
//        onAction(key,row), exportName, pageSize, search }
export function mountTable(el, cfg) {
  const { columns, rows, filters = [], actions, onAction, exportName, pageSize = PAGE_SIZE } = cfg;
  const texts = rows.map(r => columns.map(([, render]) => plain(render(r))).join(' ').toLowerCase());
  const options = filters.map(f => [...new Set(rows.map(f.get).filter(v => v != null && v !== ''))]
    .sort((a, b) => String(a).localeCompare(String(b), 'vi')));
  const view = {
    q: '', page: 1, all: false,
    values: filters.map((f, i) => (options[i].map(String).includes(String(f.default)) ? String(f.default) : '')),
  };

  el.innerHTML = `
    <div class="toolbar no-print">
      ${cfg.search === false ? '' : '<input type="search" class="search" placeholder="Tìm kiếm">'}
      ${filters.map((f, i) => `<label class="inline">${esc(f.label)}<select data-filter="${i}">
        <option value="">Tất cả</option>
        ${options[i].map(v => `<option value="${esc(v)}"${String(v) === view.values[i] ? ' selected' : ''}>${esc(v)}</option>`).join('')}
      </select></label>`).join('')}
      <span class="spacer"></span>
      ${exportName ? '<button type="button" class="secondary" data-export>Xuất Excel</button><button type="button" class="secondary" data-print>In</button>' : ''}
    </div>
    <div class="table-body"></div>`;
  const body = el.querySelector('.table-body');

  const visible = () => rows.map((_, i) => i).filter(i =>
    (!view.q || texts[i].includes(view.q)) &&
    filters.every((f, k) => view.values[k] === '' || String(f.get(rows[i])) === view.values[k]));
  const footerCells = list => (typeof cfg.footer === 'function' ? cfg.footer(list) : cfg.footer);

  function draw() {
    const idx = visible();
    const pages = Math.max(1, Math.ceil(idx.length / pageSize));
    view.page = Math.min(view.page, pages);
    const shown = view.all ? idx : idx.slice((view.page - 1) * pageSize, view.page * pageSize);
    const hasActions = !!actions;
    const head = columns.map(([label]) => `<th>${label}</th>`).join('') + (hasActions ? '<th class="no-print actions-col"></th>' : '');
    const lines = shown.map(i => {
      const row = rows[i];
      const buttons = hasActions ? actions(row).map(a =>
        `<button type="button" class="small ${a.danger ? 'danger-btn' : 'secondary'}" data-act="${a.key}" data-i="${i}">${esc(a.label)}</button>`).join(' ') : '';
      return `<tr>${columns.map(([, render]) => `<td>${render(row)}</td>`).join('')}${hasActions ? `<td class="actions no-print">${buttons}</td>` : ''}</tr>`;
    }).join('');
    const empty = `<tr><td colspan="${columns.length + (hasActions ? 1 : 0)}" class="muted">Không có dữ liệu</td></tr>`;
    const foot = footerCells(idx.map(i => rows[i]));
    const tfoot = foot && idx.length
      ? `<tfoot><tr class="total-row">${foot.map(c => `<td>${c ?? ''}</td>`).join('')}${hasActions ? '<td class="no-print"></td>' : ''}</tr></tfoot>` : '';
    const pager = !view.all && idx.length > pageSize ? `
      <div class="pager no-print">
        <span class="muted">${(view.page - 1) * pageSize + 1}–${Math.min(idx.length, view.page * pageSize)} / ${idx.length} dòng</span>
        <button type="button" class="secondary small" data-page="${view.page - 1}" ${view.page <= 1 ? 'disabled' : ''}>Trước</button>
        <span>${view.page} / ${pages}</span>
        <button type="button" class="secondary small" data-page="${view.page + 1}" ${view.page >= pages ? 'disabled' : ''}>Sau</button>
      </div>` : `<div class="pager no-print"><span class="muted">${idx.length} dòng</span></div>`;
    body.innerHTML = `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${lines || empty}</tbody>${tfoot}</table></div>${pager}`;
  }

  el.addEventListener('input', e => {
    if (e.target.classList.contains('search')) { view.q = e.target.value.trim().toLowerCase(); view.page = 1; draw(); }
  });
  el.addEventListener('change', e => {
    if (e.target.dataset.filter !== undefined) { view.values[Number(e.target.dataset.filter)] = e.target.value; view.page = 1; draw(); }
  });
  el.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.page) { view.page = Number(btn.dataset.page); draw(); }
    else if (btn.dataset.act) onAction?.(btn.dataset.act, rows[Number(btn.dataset.i)]);
    else if ('export' in btn.dataset) {
      const list = visible().map(i => rows[i]);
      exportMatrix(toMatrix(columns, list, footerCells(list)), exportName);
    } else if ('print' in btn.dataset) {
      view.all = true; draw(); window.print(); view.all = false; draw();
    }
  });
  draw();
}

// Bảng nhập nhanh: mỗi dòng một đối tượng (công nhân, nhân viên), nhập nhiều dòng rồi lưu một lần.
// cfg: { title, hint, top:[field], redrawOn:[key], rows(topValues)->[{id,label}], cols:[{key,label,type,options,value,include}],
//        save(topValues, entries:[{id, values}]) }
export function gridForm(cfg) {
  return {
    title: cfg.title,
    mount(el, onSaved) {
      const topHtml = cfg.top.map(labelHtml).join('');
      el.innerHTML = `
        <form class="grid-form">
          <div class="form-grid">${topHtml}</div>
          <div class="grid-wrap"></div>
          <button type="submit">Lưu tất cả</button>
        </form>
        ${cfg.hint ? `<p class="hint">${cfg.hint}</p>` : ''}`;
      const formEl = el.querySelector('form');
      const wrap = el.querySelector('.grid-wrap');
      const topKeys = cfg.top.map(f => f.key);
      const topValues = () => Object.fromEntries(Object.entries(readValues(formEl, cfg.top)).filter(([k]) => topKeys.includes(k)));

      const cellHtml = (id, col) => {
        const name = `${id}__${col.key}`;
        if (col.type === 'select') {
          return `<select name="${name}">${[['', ''], ...col.options].map(([v, l]) =>
            `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`;
        }
        return `<input name="${name}" type="number" step="any" min="0" value="${esc(col.value ?? '')}">`;
      };
      const draw = () => {
        const list = cfg.rows(topValues());
        wrap.innerHTML = list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Họ tên</th>${cfg.cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
          <tbody>${list.map(r => `<tr><td>${esc(r.label)}</td>${cfg.cols.map(c => `<td>${cellHtml(r.id, c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>` : '<p class="muted">Chọn khu có nhân viên để nhập.</p>';
        wrap.dataset.ids = JSON.stringify(list.map(r => r.id));
      };
      // Chỉ dựng lại bảng khi đổi trường quyết định danh sách dòng (ví dụ khu), để không mất số đã gõ.
      formEl.addEventListener('change', e => { if ((cfg.redrawOn ?? []).includes(e.target.name)) draw(); });
      draw();

      formEl.addEventListener('submit', async event => {
        event.preventDefault();
        const button = formEl.querySelector('button[type=submit]');
        button.disabled = true;
        try {
          const ids = JSON.parse(wrap.dataset.ids || '[]');
          const entries = [];
          ids.forEach(id => {
            const values = {};
            cfg.cols.forEach(c => {
              const raw = formEl.elements[`${id}__${c.key}`].value;
              values[c.key] = raw === '' ? null : c.type === 'select' ? raw : Number(raw);
            });
            if (cfg.cols.some(c => c.include && values[c.key] != null)) entries.push({ id, values });
          });
          if (!entries.length) throw new Error('Chưa nhập dòng nào');
          await cfg.save(topValues(), entries);
          toast(`Đã lưu ${entries.length} dòng`);
          await onSaved();
        } catch (err) {
          toast(err.message || 'Có lỗi xảy ra', true);
          button.disabled = false;
        }
      });
    },
  };
}
