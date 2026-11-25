import { db, isDemo } from '../lib/supabase.js';

const BUCKET = 'product-images';
const MAX_BYTES = 2 * 1024 * 1024;

// Tải ảnh mẫu lên Supabase Storage (bucket công khai product-images), trả về URL.
// Demo: đổi ảnh thành data URL trong bộ nhớ.
export async function uploadImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Chỉ nhận file ảnh');
  if (file.size > MAX_BYTES) throw new Error('Ảnh tối đa 2 MB');
  if (isDemo()) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Không đọc được ảnh'));
      reader.readAsDataURL(file);
    });
  }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw new Error('Không tải được ảnh: ' + error.message);
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Chỉ cho phép http(s) và data:image để tránh chèn đường dẫn độc hại vào thẻ img.
export const safeImageUrl = url => (/^(https?:\/\/|data:image\/)/i.test(url ?? '') ? url : '');
