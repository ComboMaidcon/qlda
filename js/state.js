// Trạng thái dùng chung toàn ứng dụng.
export const state = {
  userId: null,
  role: null,
  name: '',
  zoneId: null,
  employeeId: null,   // nhân viên gắn với tài khoản (tổ trưởng, nhân viên)
  tab: null,
  ctx: {},        // bộ lọc theo từng tab (khoảng ngày, tháng)
  zonesInfo: [],  // [{id, name, pay_kind, sort_order}] mọi khu
  lookups: {},    // danh sách chọn cho form: [[id, nhãn], ...]
  stock: {},      // tồn kho theo fabric_id
};
