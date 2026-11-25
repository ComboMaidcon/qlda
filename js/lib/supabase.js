import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { createDemoClient } from '../demo/client.js';

const real = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let demo = null;
let demoRole = null;

export const isDemo = () => demo !== null;
export const getDemoRole = () => demoRole;
export const startDemo = role => { demo = createDemoClient(); demoRole = role; };
export const stopDemo = () => { demo = null; demoRole = null; };

// Mọi truy vấn dữ liệu đi qua db: dùng dữ liệu mẫu khi ở chế độ demo, ngược lại gọi Supabase.
export const db = {
  from: table => (demo ?? real).from(table),
  auth: real.auth,
  storage: { from: bucket => real.storage.from(bucket) },
  functions: {
    invoke: (name, options) => (demo ? demo.invoke(name, options?.body) : real.functions.invoke(name, options)),
  },
};

const FRIENDLY = {
  '23505': 'Dữ liệu bị trùng: bản ghi này đã tồn tại. Nếu cần đổi, hãy dùng nút Sửa.',
  '23503': 'Dữ liệu đang được dùng ở nơi khác nên không xóa hoặc sửa được.',
  '42501': 'Bạn không có quyền thực hiện thao tác này.',
};

// Chạy một truy vấn, ném lỗi (đã dịch sang tiếng Việt dễ hiểu) nếu có.
export async function run(query) {
  const { data, error } = await query;
  if (error) {
    let message = FRIENDLY[error.code] ?? error.message;
    if (/row-level security/i.test(error.message)) message = FRIENDLY['42501'];
    if (error.code === '23514') message = `Dữ liệu không hợp lệ (${error.message})`;
    throw Object.assign(new Error(message), { code: error.code });
  }
  return data;
}
