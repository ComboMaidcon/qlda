import { db, isDemo, startDemo, stopDemo } from '../lib/supabase.js';
import { DEMO_ACCOUNT } from '../config.js';

export async function currentUser() {
  if (isDemo()) return { id: 'demo', email: DEMO_ACCOUNT.email };
  const { data } = await db.auth.getSession();
  return data.session?.user ?? null;
}

export async function signIn(email, password) {
  if (DEMO_ACCOUNT.enabled && email === DEMO_ACCOUNT.email && password === DEMO_ACCOUNT.password) {
    startDemo();
    return true;
  }
  const { error } = await db.auth.signInWithPassword({ email, password });
  return !error;
}

export async function signOut() {
  if (isDemo()) stopDemo();
  else await db.auth.signOut();
}

// Trả về null nếu tài khoản chưa có hồ sơ hoặc đã bị khóa. Ném lỗi nếu truy vấn thất bại.
export async function loadProfile(user) {
  if (isDemo()) return { role: 'owner', name: 'Tài khoản demo', zoneId: null };

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
  };
}
