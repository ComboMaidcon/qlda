import { db, isDemo, startDemo, stopDemo, getDemoRole } from '../lib/supabase.js';
import { DEMO_ACCOUNT } from '../config.js';
import { DEMO_ROLES } from '../constants.js';

export async function currentUser() {
  if (isDemo()) return { id: 'demo', email: DEMO_ACCOUNT.email };
  const { data } = await db.auth.getSession();
  return data.session?.user ?? null;
}

export async function signIn(email, password, demoRole = 'owner') {
  if (DEMO_ACCOUNT.enabled && email === DEMO_ACCOUNT.email && password === DEMO_ACCOUNT.password) {
    startDemo(demoRole);
    return true;
  }
  const { error } = await db.auth.signInWithPassword({ email, password });
  return !error;
}

export async function signOut() {
  if (isDemo()) stopDemo();
  else await db.auth.signOut();
}

export async function changePassword(password) {
  if (isDemo()) return;   // demo không có tài khoản thật
  const { error } = await db.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

// Trả về null nếu tài khoản chưa có hồ sơ hoặc đã bị khóa. Ném lỗi nếu truy vấn thất bại.
export async function loadProfile(user) {
  if (isDemo()) {
    const demo = DEMO_ROLES.find(r => r.key === getDemoRole()) ?? DEMO_ROLES[0];
    return { role: demo.role, name: `Demo - ${demo.label}`, zoneId: demo.zoneId, employeeId: demo.employeeId ?? null };
  }

  const { data, error } = await db
    .from('profiles')
    .select('role, is_active, full_name, employee_id')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data || !data.is_active) return null;

  let employee = null;
  if (data.employee_id) {
    const result = await db
      .from('employees')
      .select('full_name, zone_id')
      .eq('id', data.employee_id)
      .maybeSingle();
    employee = result.data;
  }

  return {
    role: data.role,
    name: data.full_name || employee?.full_name || user.email,
    zoneId: employee?.zone_id ?? null,
    employeeId: data.employee_id ?? null,
  };
}
