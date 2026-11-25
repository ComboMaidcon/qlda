import { db, run } from '../lib/supabase.js';
import { state } from '../state.js';
import { esc } from '../lib/format.js';
import { openModal } from '../lib/ui.js';
import { ROLES } from '../constants.js';

const roleOptions = Object.entries(ROLES);

const NAME_HINT = 'Có liên kết nhân viên thì lấy tên từ nhân viên; không liên kết thì phải nhập họ tên. Tổ trưởng và nhân viên bắt buộc liên kết để biết thuộc khu nào và xem được lương của mình.';

// Database chỉ cho một trong hai: liên kết nhân viên (tên lấy từ nhân viên) hoặc họ tên riêng.
function normalizeProfile({ role, employee_id, full_name }) {
  if ((role === 'leader' || role === 'worker') && !employee_id) throw new Error('Tổ trưởng và nhân viên phải liên kết với một hồ sơ nhân viên');
  if (employee_id) return { role, employee_id, full_name: null };
  if (!full_name) throw new Error('Nhập họ tên, hoặc liên kết với một nhân viên');
  return { role, employee_id: null, full_name };
}

async function invoke(body) {
  const { data, error } = await db.functions.invoke('manage-user', { body });
  if (error) throw new Error(error.message || 'Không gọi được hàm quản lý tài khoản');
  if (data?.error) throw new Error(data.error);
  return data;
}

export default {
  title: 'Tài khoản',
  writeRoles: ['owner'],
  exportName: 'tai-khoan',
  filters: [
    { label: 'Vai trò', get: p => ROLES[p.role] },
    { label: 'Trạng thái', get: p => (p.is_active ? 'Đang dùng' : 'Đã khóa') },
  ],

  async load() {
    const { data, error } = await db.from('profiles').select('*, employees(full_name)').order('full_name');
    const columns = [
      ['Họ tên', p => esc(p.full_name || p.employees?.full_name)],
      ['Vai trò', p => ROLES[p.role] ?? esc(p.role)],
      ['Nhân viên liên kết', p => esc(p.employees?.full_name ?? '')],
      ['Trạng thái', p => (p.is_active ? 'Đang dùng' : '<span class="danger">Đã khóa</span>'), p => (p.is_active ? 'Đang dùng' : 'Đã khóa')],
    ];
    return { columns, rows: data ?? [], error: error?.message };
  },

  rowActions: p => (p.id === state.userId ? [] : [
    { key: 'edit', label: 'Sửa' },
    { key: 'toggle', label: p.is_active ? 'Khóa' : 'Mở khóa', danger: p.is_active },
    { key: 'reset', label: 'Đặt lại mật khẩu' },
  ]),

  async onRowAction(key, row, refresh) {
    if (key === 'toggle') {
      try { await run(db.from('profiles').update({ is_active: !row.is_active }).eq('id', row.id)); await refresh(); } catch (e) { alert(e.message); }
    } else if (key === 'reset') {
      openModal({ title: `Đặt lại mật khẩu: ${row.full_name || row.employees?.full_name}`,
        fields: [{ key: 'password', label: 'Mật khẩu mới (tối thiểu 8 ký tự)', type: 'password', required: true }],
        onSubmit: v => invoke({ action: 'reset_password', user_id: row.id, password: v.password }) });
    } else {
      openModal({ title: `Sửa tài khoản: ${row.full_name || row.employees?.full_name}`,
        hint: NAME_HINT,
        fields: [
          { key: 'role', label: 'Vai trò', type: 'select', options: roleOptions, required: true, value: row.role },
          { key: 'employee_id', label: 'Nhân viên liên kết', type: 'select', options: state.lookups.allEmployees, value: row.employee_id },
          { key: 'full_name', label: 'Họ tên hiển thị (chỉ khi không liên kết nhân viên)', value: row.full_name },
        ],
        onSubmit: v => run(db.from('profiles').update(normalizeProfile(v)).eq('id', row.id)), onDone: refresh });
    }
  },

  forms: () => [{
    title: 'Tạo tài khoản đăng nhập',
    hint: `Tạo qua Edge Function manage-user (xem README). Người dùng đăng nhập bằng email và mật khẩu này, nên đổi mật khẩu ở lần đầu. ${NAME_HINT}`,
    fields: [
      { key: 'email', label: 'Email đăng nhập', type: 'email', required: true },
      { key: 'password', label: 'Mật khẩu tạm (tối thiểu 8 ký tự)', type: 'password', required: true },
      { key: 'role', label: 'Vai trò', type: 'select', options: roleOptions, required: true },
      { key: 'employee_id', label: 'Nhân viên liên kết (bắt buộc với tổ trưởng, nhân viên)', type: 'select', options: state.lookups.allEmployees },
      { key: 'full_name', label: 'Họ tên hiển thị (chỉ khi không liên kết nhân viên)' },
    ],
    save: async ({ email, password, ...profile }) => {
      await invoke({ action: 'create', email, password, ...normalizeProfile(profile) });
    },
  }],
};
