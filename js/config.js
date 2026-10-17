// Supabase > Project Settings > API. Chỉ dùng anon/publishable key, KHÔNG dùng service_role.
export const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';

// Tài khoản thử: đăng nhập không cần database. Dữ liệu mẫu nằm trong bộ nhớ trình duyệt,
// mất khi tải lại trang. Đặt enabled: false khi triển khai thật.
export const DEMO_ACCOUNT = { enabled: true, email: 'demo@qlxm.local', password: 'demo1234' };
