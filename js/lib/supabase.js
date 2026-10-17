import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { createDemoClient } from '../demo/client.js';

const real = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let demo = null;

export const isDemo = () => demo !== null;
export const startDemo = () => { demo = createDemoClient(); };
export const stopDemo = () => { demo = null; };

// Mọi truy vấn dữ liệu đi qua db: dùng dữ liệu mẫu khi ở chế độ demo, ngược lại gọi Supabase.
export const db = {
  from: table => (demo ?? real).from(table),
  auth: real.auth,
};

// Chạy một truy vấn, ném lỗi nếu có để nơi gọi xử lý.
export async function run(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
