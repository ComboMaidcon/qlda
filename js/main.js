import { state } from './state.js';
import { NAV } from './constants.js';
import { currentUser, loadProfile, signOut } from './services/auth.js';
import { loadLookups } from './services/lookups.js';
import { renderLogin } from './views/login.js';
import { renderShell } from './views/shell.js';

async function start() {
  const user = await currentUser();
  if (!user) return renderLogin('', start);

  let profile;
  try {
    profile = await loadProfile(user);
  } catch (err) {
    await signOut();
    return renderLogin('Không đọc được hồ sơ: ' + err.message, start);
  }

  if (!profile) {
    await signOut();
    return renderLogin('Tài khoản chưa được cấp quyền. Hãy nhờ chủ xưởng tạo hồ sơ trong bảng profiles.', start);
  }

  Object.assign(state, profile, { userId: user.id, tab: NAV[profile.role][0] });
  await loadLookups();
  renderShell(async () => {
    await signOut();
    start();
  });
}

start();
