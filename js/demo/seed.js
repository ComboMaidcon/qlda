// Dữ liệu mẫu cho tài khoản demo. Mỗi lần đăng nhập demo tạo một bản mới trong bộ nhớ.
const today = () => new Date().toLocaleDateString('sv-SE');
const addDays = n => new Date(Date.now() + n * 864e5).toLocaleDateString('sv-SE');

export function createSeed() {
  const month = `${today().slice(0, 7)}-01`;
  const day = d => `${today().slice(0, 7)}-${String(d).padStart(2, '0')}`;
  const stamp = new Date().toISOString();

  return {
    zones: [
      { id: 1, code: 'CAT', name: 'Cắt', pay_kind: 'hourly', sort_order: 1 },
      { id: 2, code: 'MAY', name: 'May', pay_kind: 'piece', sort_order: 2 },
      { id: 3, code: 'PHULIEU', name: 'Phụ liệu', pay_kind: 'hourly', sort_order: 3 },
      { id: 4, code: 'HOANTHIEN', name: 'Hoàn thiện', pay_kind: 'hourly', sort_order: 4 },
      { id: 5, code: 'DONGGOI', name: 'Đóng gói', pay_kind: 'hourly', sort_order: 5 },
    ],
    employees: [
      { id: 1, full_name: 'Nguyễn Văn An', phone: '0901000001', zone_id: 1, is_leader: true, join_date: '2025-03-01', leave_date: null },
      { id: 2, full_name: 'Trần Thị Bình', phone: '0901000002', zone_id: 2, is_leader: false, join_date: '2025-03-01', leave_date: null },
      { id: 3, full_name: 'Lê Thị Cúc', phone: '0901000003', zone_id: 2, is_leader: false, join_date: '2025-05-10', leave_date: null },
      { id: 4, full_name: 'Phạm Văn Dũng', phone: '0901000004', zone_id: 4, is_leader: false, join_date: '2025-06-01', leave_date: null },
      { id: 5, full_name: 'Hoàng Thị Em', phone: '0901000005', zone_id: 5, is_leader: false, join_date: '2025-06-01', leave_date: null },
    ],
    products: [
      { id: 1, code: 'AO01', name: 'Áo sơ mi nam', description: 'Tay dài, cổ đức', image_url: null, is_active: true },
      { id: 2, code: 'QU01', name: 'Quần tây nữ', description: 'Ống đứng', image_url: null, is_active: true },
    ],
    piece_rates: [
      { id: 1, product_id: 1, rate: 3500, effective_from: '2026-01-01' },
      { id: 2, product_id: 2, rate: 4200, effective_from: '2026-01-01' },
    ],
    hourly_rates: [1, 3, 4, 5].map((zone_id, i) => (
      { id: i + 1, zone_id, rate: 25000, overtime_factor: 1.5, effective_from: '2026-01-01' }
    )),
    production_orders: [
      { id: 1, code: 'LSX-DEMO-001', product_id: 1, quantity: 500, due_date: addDays(15), note: null },
      { id: 2, code: 'LSX-DEMO-002', product_id: 2, quantity: 200, due_date: addDays(-3), note: null },
    ],
    production_logs: [
      { id: 1, order_id: 1, zone_id: 2, employee_id: 2, log_date: day(1), quantity: 120, defect_quantity: 3, unit_rate: 3500, created_at: stamp },
      { id: 2, order_id: 1, zone_id: 2, employee_id: 3, log_date: day(2), quantity: 150, defect_quantity: 5, unit_rate: 3500, created_at: stamp },
      { id: 3, order_id: 1, zone_id: 1, employee_id: null, log_date: day(1), quantity: 400, defect_quantity: 0, unit_rate: null, created_at: stamp },
      { id: 4, order_id: 2, zone_id: 5, employee_id: null, log_date: day(2), quantity: 200, defect_quantity: 0, unit_rate: null, created_at: stamp },
    ],
    attendance: [
      { id: 1, employee_id: 1, zone_id: 1, work_date: day(1), hours: 8, overtime_hours: 2, hourly_rate: 25000, overtime_factor: 1.5, absence: null },
      { id: 2, employee_id: 4, zone_id: 4, work_date: day(1), hours: 8, overtime_hours: 0, hourly_rate: 25000, overtime_factor: 1.5, absence: null },
      { id: 3, employee_id: 5, zone_id: 5, work_date: day(2), hours: 0, overtime_hours: 0, hourly_rate: 25000, overtime_factor: 1.5, absence: 'leave' },
    ],
    suppliers: [{ id: 1, name: 'Công ty Vải Hà Nội', phone: '0243000000', note: null, is_active: true }],
    fabrics: [
      { id: 1, code: 'V01', name: 'Kate Thái', color: 'Trắng', unit: 'roll', min_stock: 5, is_active: true },
      { id: 2, code: 'V02', name: 'Kaki', color: 'Đen', unit: 'meter', min_stock: 50, is_active: true },
    ],
    stock_receipts: [{ id: 1, code: 'PN-DEMO-001', supplier_id: 1, receipt_date: day(1), is_void: false }],
    stock_receipt_items: [
      { id: 1, receipt_id: 1, fabric_id: 1, quantity: 20 },
      { id: 2, receipt_id: 1, fabric_id: 2, quantity: 40 },
    ],
    stock_issues: [{ id: 1, code: 'PX-DEMO-001', order_id: 1, issue_date: day(2), is_void: false }],
    stock_issue_items: [{ id: 1, issue_id: 1, fabric_id: 1, quantity: 4 }],
    stock_adjustments: [],
    payroll_periods: [{ id: 1, month, status: 'open', closed_by: null, closed_at: null }],
    payroll_items: [],
  };
}
