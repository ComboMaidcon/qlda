// Edge Function: chủ xưởng tạo tài khoản và đặt lại mật khẩu (cần service_role nên không làm được trong trình duyệt).
// Triển khai:  supabase functions deploy manage-user
// Biến môi trường SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY có sẵn trong Supabase.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const ROLES = ['owner', 'manager', 'storekeeper', 'accountant', 'leader', 'worker'];

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'Chưa đăng nhập' }, 401);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: me } = await admin.from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
    if (!me?.is_active || me.role !== 'owner') return json({ error: 'Chỉ chủ xưởng được quản lý tài khoản' }, 403);

    const body = await req.json();
    if (body.action === 'create') {
      const { email, password, role, employee_id } = body;
      // Ràng buộc name_xor_employee: có liên kết nhân viên thì full_name phải null, không thì bắt buộc có tên.
      const full_name = employee_id ? null : String(body.full_name ?? '').trim() || null;
      if (!email) return json({ error: 'Thiếu email' }, 400);
      if (!employee_id && !full_name) return json({ error: 'Nhập họ tên hoặc liên kết với một nhân viên' }, 400);
      if (!password || password.length < 8) return json({ error: 'Mật khẩu tối thiểu 8 ký tự' }, 400);
      if (!ROLES.includes(role)) return json({ error: 'Vai trò không hợp lệ' }, 400);
      if ((role === 'leader' || role === 'worker') && !employee_id) {
        return json({ error: 'Tổ trưởng và nhân viên phải liên kết với một hồ sơ nhân viên' }, 400);
      }

      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) return json({ error: error.message }, 400);
      const { error: profileError } = await admin.from('profiles').insert({
        id: created.user.id, role, full_name, employee_id: employee_id ?? null, is_active: true,
      });
      if (profileError) {   // không để lại tài khoản không có hồ sơ
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: profileError.message }, 400);
      }
      return json({ ok: true, id: created.user.id });
    }

    if (body.action === 'reset_password') {
      if (!body.password || body.password.length < 8) return json({ error: 'Mật khẩu tối thiểu 8 ký tự' }, 400);
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password });
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    return json({ error: 'Hành động không hợp lệ' }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
