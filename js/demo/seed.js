// Dữ liệu mẫu cho tài khoản demo. Mỗi lần đăng nhập demo tạo một bản mới trong bộ nhớ.
const today = () => new Date().toLocaleDateString('sv-SE');
const addDays = n => new Date(Date.now() + n * 864e5).toLocaleDateString('sv-SE');

export function createSeed() {
  const month = `${today().slice(0, 7)}-01`;
  const day = d => `${today().slice(0, 7)}-${String(d).padStart(2, '0')}`;
  const stamp = new Date().toISOString();
  const prev = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  const prevMonth = prev.toLocaleDateString('sv-SE');                       // đầu tháng trước
  const prevDay = d => `${prevMonth.slice(0, 7)}-${String(d).padStart(2, '0')}`;

  // Sản lượng và chấm công mẫu từ đầu tháng đến hôm nay để báo cáo, biểu đồ có số liệu.
  const dd = Math.min(Number(today().slice(8)), 28);
  const logs = [];
  const attendance = [];
  for (let d = 1; d <= dd; d++) {
    const base = { log_date: day(d), defect_quantity: d % 4 === 0 ? 2 : 0, created_at: stamp };
    logs.push({ id: logs.length + 1, order_id: 1, zone_id: 2, employee_id: 2, quantity: 30 + (d % 5) * 4, unit_rate: 3500, ...base });
    logs.push({ id: logs.length + 1, order_id: 1, zone_id: 2, employee_id: 3, quantity: 26 + (d % 4) * 5, unit_rate: 3500, ...base });
    logs.push({ id: logs.length + 1, order_id: 1, zone_id: 1, employee_id: null, quantity: 70 + (d % 3) * 6, unit_rate: null, ...base });
    logs.push({ id: logs.length + 1, order_id: 2, zone_id: 5, employee_id: null, quantity: 12 + (d % 6) * 2, unit_rate: null, ...base });
    [[1, 1], [4, 4], [5, 5], [7, 3]].forEach(([employee_id, zone_id]) => {
      attendance.push({ id: attendance.length + 1, employee_id, zone_id, work_date: day(d), hours: 8, overtime_hours: d % 7 === 0 ? 2 : 0,
        hourly_rate: 25000, overtime_factor: 1.5, absence: null });
    });
  }

  // Tháng trước: vài ngày sản lượng khoán của Trần Thị Bình (id 2) và chấm công của Phạm Văn Dũng (id 4), để xem "Lương của tôi".
  [3, 4, 5, 6, 7].forEach(d => {
    logs.push({ id: logs.length + 1, order_id: 2, zone_id: 2, employee_id: 2, log_date: prevDay(d), quantity: 40 + d, defect_quantity: 0, unit_rate: 4200, created_at: stamp });
    attendance.push({ id: attendance.length + 1, employee_id: 4, zone_id: 4, work_date: prevDay(d), hours: 8, overtime_hours: 0,
      hourly_rate: 25000, overtime_factor: 1.5, absence: null });
  });

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
      { id: 6, full_name: 'Vũ Thị Phương', phone: '0901000006', zone_id: 2, is_leader: true, join_date: '2025-04-01', leave_date: null },
      { id: 7, full_name: 'Đặng Văn Quang', phone: '0901000007', zone_id: 3, is_leader: false, join_date: '2025-07-01', leave_date: null },
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
    production_logs: logs,
    attendance,
    profiles: [
      { id: 'demo', role: 'owner', is_active: true, full_name: 'Chủ xưởng (demo)', employee_id: null },
      { id: 'demo-2', role: 'accountant', is_active: true, full_name: 'Kế toán (demo)', employee_id: null },
      { id: 'demo-3', role: 'leader', is_active: true, full_name: null, employee_id: 6 },
    ],
    audit_logs: [],
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
    stock_issues: [
      { id: 1, code: 'PX-DEMO-001', order_id: 1, issue_date: day(2), is_void: false },
      { id: 2, code: 'PX-DEMO-002', order_id: 1, issue_date: day(3), is_void: false },
    ],
    stock_issue_items: [{ id: 1, issue_id: 1, fabric_id: 1, quantity: 4 }, { id: 2, issue_id: 2, fabric_id: 2, quantity: 30 }],
    stock_adjustments: [],
    payroll_periods: [
      { id: 1, month: prevMonth, status: 'closed', closed_by: 'demo', closed_at: stamp },
      { id: 2, month, status: 'open', closed_by: null, closed_at: null },
    ],
    payroll_items: [
      { id: 1, period_id: 1, employee_id: 2, piece_amount: 1500000, hourly_amount: 0, bonus: 100000, penalty: 0, advance: 200000, total: 1400000, note: 'Thưởng chuyên cần' },
      { id: 2, period_id: 1, employee_id: 4, piece_amount: 0, hourly_amount: 1000000, bonus: 0, penalty: 50000, advance: 0, total: 950000, note: null },
    ],
    // M2.7 định mức vải: áo sơ mi AO01 cần 0,01 cuộn Kate và 0,05 m Kaki cho mỗi cái
    fabric_norms: [
      { id: 1, product_id: 1, fabric_id: 1, qty_per_unit: 0.01, note: 'Vải chính' },
      { id: 2, product_id: 1, fabric_id: 2, qty_per_unit: 0.05, note: 'Vải phối' },
    ],
    // M3.8 phụ liệu
    accessories: [
      { id: 1, code: 'PL01', name: 'Khuy 4 lỗ', unit: 'cái', min_stock: 300, is_active: true },
      { id: 2, code: 'PL02', name: 'Khóa kéo 20cm', unit: 'cái', min_stock: 50, is_active: true },
    ],
    accessory_moves: [
      { id: 1, accessory_id: 1, kind: 'receipt', quantity: 500, move_date: day(1), order_id: null, supplier_id: 1, note: null },
      { id: 2, accessory_id: 1, kind: 'issue', quantity: -250, move_date: day(2), order_id: 1, supplier_id: null, note: null },
      { id: 3, accessory_id: 2, kind: 'receipt', quantity: 100, move_date: day(1), order_id: null, supplier_id: 1, note: null },
    ],
    // M4.7 phiếu bó và lượt quét
    bundles: [
      { id: 1, order_id: 1, bundle_no: 1, code: 'LSX-DEMO-001-B001', size: 'M', quantity: 20, note: null },
      { id: 2, order_id: 1, bundle_no: 2, code: 'LSX-DEMO-001-B002', size: 'L', quantity: 20, note: null },
      { id: 3, order_id: 1, bundle_no: 3, code: 'LSX-DEMO-001-B003', size: 'L', quantity: 10, note: null },
    ],
    bundle_scans: [
      { id: 1, bundle_id: 1, zone_id: 1, employee_id: null, defect_quantity: 0, scan_date: today(), scanned_at: stamp },
      { id: 2, bundle_id: 2, zone_id: 1, employee_id: null, defect_quantity: 0, scan_date: today(), scanned_at: stamp },
      { id: 3, bundle_id: 3, zone_id: 1, employee_id: null, defect_quantity: 0, scan_date: today(), scanned_at: stamp },
      { id: 4, bundle_id: 1, zone_id: 2, employee_id: 2, defect_quantity: 1, scan_date: today(), scanned_at: stamp },
    ],
  };
}
