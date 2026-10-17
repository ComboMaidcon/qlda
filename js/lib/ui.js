import { esc } from './format.js';

export function toast(message, isError = false) {
  const el = document.createElement('div');
  el.className = isError ? 'toast error' : 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
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

  const extra = field.type === 'number' ? ' step="any" min="0"' : '';
  return `<input ${attrs} type="${field.type ?? 'text'}"${extra} value="${esc(field.value ?? '')}">`;
}

export function formHtml(form, index) {
  const fields = form.fields.map(f => `<label>${f.label}${fieldHtml(f)}</label>`).join('');
  const hint = form.hint ? `<p class="hint">${form.hint}</p>` : '';
  return `
    <section class="panel">
      <h2>${form.title}</h2>
      <form id="form-${index}" class="form-grid">${fields}<button type="submit">Lưu</button></form>
      ${hint}
    </section>`;
}

function readValues(formEl, fields) {
  const values = {};
  new FormData(formEl).forEach((raw, key) => {
    const field = fields.find(f => f.key === key);
    if (raw === '') values[key] = null;
    else values[key] = field.type === 'number' ? Number(raw) : raw;
  });
  return values;
}

export function bindForm(form, index, onSaved) {
  const el = document.getElementById(`form-${index}`);
  el.addEventListener('submit', async event => {
    event.preventDefault();
    const button = el.querySelector('button');
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

// columns: [[tiêu đề, (dòng) => html], ...]
export function tableHtml(columns, rows) {
  const head = columns.map(([label]) => `<th>${label}</th>`).join('');
  const body = rows.length
    ? rows.map(row => `<tr>${columns.map(([, render]) => `<td>${render(row)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length}" class="muted">Chưa có dữ liệu</td></tr>`;
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
