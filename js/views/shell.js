import { state } from '../state.js';
import { ROLES, NAV, NAV_GROUPS } from '../constants.js';
import { esc, today, monthNow } from '../lib/format.js';
import { formHtml, bindForm, mountTable, openModal } from '../lib/ui.js';
import { loadLookups } from '../services/lookups.js';
import { changePassword } from '../services/auth.js';
import { isDemo } from '../lib/supabase.js';
import MODULES from '../modules/index.js';

let renderSeq = 0;

export function renderShell(onLogout) {
  const allowed = new Set(NAV[state.role]);
  const tabs = NAV_GROUPS
    .map(g => ({ ...g, keys: g.keys.filter(k => allowed.has(k)) }))
    .filter(g => g.keys.length)
    .map(g => `<div class="nav-group">${g.label ? `<div class="nav-label">${g.label}</div>` : ''}${
      g.keys.map(key => `<button data-tab="${key}">${MODULES[key].title}</button>`).join('')}</div>`)
    .join('');

  document.getElementById('app').innerHTML = `
    <div class="layout">
      <aside class="sidebar no-print">
        <div class="brand"><strong>QLXM</strong><span>Quản lý xưởng may</span></div>
        <nav>${tabs}</nav>
        <div class="account">
          <div>${esc(state.name)}</div>
          <div class="muted">${ROLES[state.role]}</div>
          ${isDemo() ? '<div class="muted">Chế độ demo: dữ liệu mẫu, không lưu</div>' : ''}
          <div class="account-links"><button class="link" id="password">Đổi mật khẩu</button> · <button class="link" id="logout">Đăng xuất</button></div>
        </div>
      </aside>
      <main class="content-area">
        <div class="page-title"><h1 id="title"></h1></div>
        <div id="content"></div>
      </main>
    </div>`;

  document.getElementById('logout').addEventListener('click', onLogout);
  document.getElementById('password').addEventListener('click', () => openModal({
    title: 'Đổi mật khẩu',
    fields: [
      { key: 'password', label: 'Mật khẩu mới (tối thiểu 8 ký tự)', type: 'password', required: true },
      { key: 'confirm', label: 'Nhập lại mật khẩu mới', type: 'password', required: true },
    ],
    onSubmit: async ({ password, confirm }) => {
      if (password !== confirm) throw new Error('Hai mật khẩu không khớp');
      await changePassword(password);
    },
  }));
  document.querySelectorAll('nav button').forEach(button => {
    button.addEventListener('click', () => openTab(button.dataset.tab));
  });
  openTab(state.tab);
}

function openTab(key) {
  state.tab = key;
  document.querySelectorAll('nav button').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === key);
  });
  renderContent();
}

function ctxFor(key, module) {
  state.ctx[key] ??= module.range === 'month'
    ? { month: monthNow() }
    : module.range === 'date' ? { from: `${monthNow()}-01`, to: today() } : {};
  return state.ctx[key];
}

function toolbarHtml(module, ctx) {
  if (module.range === 'month') {
    return `<div class="toolbar range no-print"><label class="inline">Tháng<input type="month" name="month" value="${ctx.month}"></label></div>`;
  }
  if (module.range === 'date') {
    return `<div class="toolbar range no-print">
      <label class="inline">Từ ngày<input type="date" name="from" value="${ctx.from}"></label>
      <label class="inline">Đến ngày<input type="date" name="to" value="${ctx.to}"></label></div>`;
  }
  return '';
}

async function renderContent() {
  const seq = ++renderSeq;
  const module = MODULES[state.tab];
  const content = document.getElementById('content');
  document.getElementById('title').textContent = module.title;
  content.innerHTML = '<p class="muted">Đang tải...</p>';

  const ctx = ctxFor(state.tab, module);
  const refresh = async () => {
    await loadLookups();   // danh sách chọn có thể đã đổi sau khi lưu
    await renderContent();
  };

  try {
    const forms = (module.forms?.() ?? []).filter(f => (f.roles ?? module.writeRoles ?? []).includes(state.role));
    const result = module.render ? null : await module.load(ctx);
    if (seq !== renderSeq) return;   // người dùng đã chuyển tab trong lúc tải

    content.innerHTML = `${forms.map((f, i) => formHtml(f, i, i === 0)).join('')}
      ${toolbarHtml(module, ctx)}
      ${result?.error ? `<p class="danger">${esc(result.error)}</p>` : ''}
      ${module.hint ? `<p class="hint">${module.hint}</p>` : ''}
      <div id="module-body"></div>`;

    forms.forEach((form, index) => bindForm(form, index, refresh));
    content.querySelectorAll('.range input').forEach(input => {
      input.addEventListener('change', () => {
        Object.assign(ctx, { [input.name]: input.value });
        if (module.range === 'date' && ctx.from > ctx.to) return;
        renderContent();
      });
    });

    const host = document.getElementById('module-body');
    if (module.render) {
      await module.render(host, ctx, refresh);
    } else {
      mountTable(host, {
        columns: result.columns,
        rows: result.rows,
        footer: result.footer,
        filters: result.filters ?? module.filters,
        exportName: module.exportName,
        actions: module.rowActions && (row => module.rowActions(row)),
        onAction: (key, row) => module.onRowAction(key, row, refresh),
      });
    }
  } catch (err) {
    if (seq === renderSeq) content.innerHTML = `<p class="danger">${esc(err.message || 'Có lỗi xảy ra')}</p>`;
  }
}
