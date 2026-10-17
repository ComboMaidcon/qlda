import { signIn } from '../services/auth.js';
import { esc } from '../lib/format.js';
import { DEMO_ACCOUNT } from '../config.js';

export function renderLogin(message, onSuccess) {
  document.getElementById('app').innerHTML = `
    <form class="login panel" id="login-form">
      <h1>QLXM</h1>
      <p class="muted">Đăng nhập hệ thống quản lý xưởng may</p>
      ${message ? `<p class="danger">${esc(message)}</p>` : ''}
      <label>Email<input name="email" type="email" required></label>
      <label>Mật khẩu<input name="password" type="password" required></label>
      <button type="submit">Đăng nhập</button>
      ${DEMO_ACCOUNT.enabled ? `<p class="muted">Tài khoản thử: ${DEMO_ACCOUNT.email} / ${DEMO_ACCOUNT.password}</p>` : ''}
    </form>`;

  document.getElementById('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const ok = await signIn(form.get('email'), form.get('password'));
    if (ok) onSuccess();
    else renderLogin('Sai email hoặc mật khẩu', onSuccess);
  });
}
