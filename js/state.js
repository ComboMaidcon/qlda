// Trạng thái dùng chung toàn ứng dụng.
export const state = {
  userId: null,
  role: null,
  name: '',
  zoneId: null,
  tab: null,
  lookups: {},   // danh sách chọn cho form: [[id, nhãn], ...]
  stock: {},     // tồn kho theo fabric_id
};
