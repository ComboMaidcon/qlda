import { state } from '../state.js';
import { ROLES, NAV } from '../constants.js';
import { esc } from '../lib/format.js';
import { formHtml, bindForm, tableHtml } from '../lib/ui.js';
import { loadLookups } from '../services/lookups.js';
import { isDemo } from '../lib/supabase.js';
import MODULES from '../modules/index.js';

export function renderShell(onLogout) {
  const tabs = NAV[state.role]
    .map(key => `<button data-tab="${key}">${MODULES[key].title}</button>`)
    .join('');

  document.getElementById('app').innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><strong>QLXM</strong><span>Quản lý xưởng may</span></div>
        <nav>${tabs}</nav>
        <div class="account">
          <div>${esc(state.name)}</div>
          <div class="muted">${ROLES[state.role]}</div>
          ${isDemo() ? '<div class="muted">Chế độ demo: dữ liệu mẫu, không lưu</div>' : ''}
          <button class="link" id="logout">Đăng xuất</button>
        </div>
      </aside>
      <main class="content-area">
        <div class="page-title"><h1 id="title"></h1></div>
        <div id="content"></div>
      </main>
    </div>`;

  document.getElementById('logout').addEventListener('click', onLogout);
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

async function renderContent() {
  const module = MODULES[state.tab];
  const content = document.getElementById('content');
  document.getElementById('title').textContent = module.title;
  content.innerHTML = '<p class="muted">Đang tải...</p>';

  const { columns, rows, error } = await module.load();
  const forms = module.forms().filter(form => (form.roles ?? module.writeRoles).includes(state.role));

  content.innerHTML =
    forms.map(formHtml).join('') +
    (error ? `<p class="danger">${esc(error)}</p>` : '') +
    tableHtml(columns, rows);

  const refresh = async () => {
    await loadLookups();   // danh sách chọn có thể đã đổi sau khi lưu
    await renderContent();
  };
  forms.forEach((form, index) => bindForm(form, index, refresh));
}
