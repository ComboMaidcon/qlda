export const ROLES = {
  owner: 'Chủ xưởng',
  manager: 'Quản lý',
  storekeeper: 'Thủ kho',
  accountant: 'Kế toán',
  leader: 'Tổ trưởng',
  worker: 'Nhân viên',
};

// Quyền GHI theo Bảng 15 của báo cáo. Sửa tại đây nếu chủ xưởng đổi quy định.
// Quyền XEM do NAV bên dưới quyết định; RLS trong database vẫn là lớp chặn thật sự.
export const PERMS = {
  orders: ['owner', 'manager'],
  logs: ['leader'],
  attendance: ['manager', 'leader'],
  stock: ['storekeeper'],
  fabrics: ['storekeeper'],
  employees: ['owner', 'manager'],
  products: ['owner', 'manager'],
  rates: ['owner'],
  payrollCalc: ['accountant'],
  payrollClose: ['owner'],
  accounts: ['owner'],
  norms: ['owner', 'manager'],        // M2.7 định mức vải
  accessories: ['storekeeper'],      // M3.8 phụ liệu
  bundles: ['owner', 'manager'],     // M4.7 tạo, in, xóa phiếu bó
  scan: ['leader'],                  // M4.7 quét bó theo công đoạn (khu của mình)
};

// Menu mỗi vai trò được thấy (thứ tự = thứ tự hiển thị, tab đầu là trang mở đầu).
export const NAV = {
  owner: ['dashboard', 'orders', 'logs', 'bundles', 'attendance', 'timesheet', 'payroll', 'stock', 'stockHistory',
          'fabrics', 'suppliers', 'norms', 'fabricUsage', 'accessories', 'accessoryMoves', 'employees', 'products',
          'rates', 'reports', 'accounts', 'audit'],
  manager: ['dashboard', 'orders', 'logs', 'bundles', 'attendance', 'timesheet', 'stock', 'stockHistory',
            'norms', 'fabricUsage', 'accessories', 'accessoryMoves', 'employees', 'products', 'rates', 'reports'],
  storekeeper: ['stock', 'stockHistory', 'fabrics', 'suppliers', 'accessories', 'accessoryMoves', 'norms',
                'fabricUsage', 'orders', 'reports'],
  accountant: ['payroll', 'orders', 'logs', 'attendance', 'timesheet', 'stock', 'fabricUsage', 'accessories',
               'accessoryMoves', 'employees', 'products', 'rates', 'reports'],
  leader: ['logs', 'scan', 'bundles', 'attendance', 'timesheet', 'orders', 'employees', 'products', 'reports'],
  worker: ['myPay'],
};

// Nhóm hiển thị trong thanh bên. Chỉ hiện mục mà vai trò có trong NAV; nhóm không còn mục nào thì ẩn.
export const NAV_GROUPS = [
  { label: '', keys: ['dashboard', 'myPay'] },
  { label: 'Sản xuất', keys: ['orders', 'bundles', 'logs', 'scan'] },
  { label: 'Kho', keys: ['stock', 'stockHistory', 'fabrics', 'suppliers', 'norms', 'fabricUsage', 'accessories', 'accessoryMoves'] },
  { label: 'Nhân sự và lương', keys: ['attendance', 'timesheet', 'payroll', 'employees'] },
  { label: 'Danh mục', keys: ['products', 'rates'] },
  { label: 'Báo cáo và hệ thống', keys: ['reports', 'accounts', 'audit'] },
];

// Vai trò chọn được khi đăng nhập tài khoản demo (để thử phân quyền).
export const DEMO_ROLES = [
  { key: 'owner', label: 'Chủ xưởng', role: 'owner', zoneId: null },
  { key: 'manager', label: 'Quản lý', role: 'manager', zoneId: null },
  { key: 'storekeeper', label: 'Thủ kho', role: 'storekeeper', zoneId: null },
  { key: 'accountant', label: 'Kế toán', role: 'accountant', zoneId: null },
  { key: 'leader-may', label: 'Tổ trưởng khu May', role: 'leader', zoneId: 2 },
  { key: 'leader-cat', label: 'Tổ trưởng khu Cắt', role: 'leader', zoneId: 1 },
  { key: 'worker', label: 'Nhân viên (Trần Thị Bình, khu May)', role: 'worker', zoneId: 2, employeeId: 2 },
];

export const ORDER_STATUS = {
  pending: 'Chưa làm',
  in_progress: 'Đang làm',
  done: 'Hoàn thành',
};

export const ABSENCE = {
  leave: 'Nghỉ phép',
  unpaid: 'Nghỉ không lương',
};

export const PAY_KIND = { piece: 'Khoán sản phẩm', hourly: 'Theo giờ' };

export const SOON_DAYS = 3;     // lệnh còn ≤ 3 ngày đến hạn mà chưa xong = "sắp trễ"
export const PAGE_SIZE = 20;    // số dòng mỗi trang ở các danh sách
export const NORM_TOLERANCE_PCT = 5;  // vải xuất vượt định mức quá 5% thì cảnh báo
export const STD_HOURS = 8;     // giờ thường mỗi ngày, vượt quá tính là tăng ca

export const TABLE_LABELS = {
  production_logs: 'Sản lượng', attendance: 'Chấm công', products: 'Mã hàng',
  production_orders: 'Lệnh sản xuất', employees: 'Nhân viên', piece_rates: 'Đơn giá sản phẩm',
  hourly_rates: 'Đơn giá giờ', payroll_items: 'Dòng lương', payroll_periods: 'Kỳ lương',
  fabrics: 'Loại vải', suppliers: 'Nhà cung cấp', stock_receipts: 'Phiếu nhập',
  stock_issues: 'Phiếu xuất', stock_adjustments: 'Kiểm kê', profiles: 'Tài khoản',
  fabric_norms: 'Định mức vải', accessories: 'Phụ liệu', accessory_moves: 'Nhập xuất phụ liệu',
  bundles: 'Phiếu bó', bundle_scans: 'Lượt quét bó',
};
