export const ROLES = {
  owner: 'Chủ xưởng',
  manager: 'Quản lý',
  storekeeper: 'Thủ kho',
  accountant: 'Kế toán',
  leader: 'Tổ trưởng',
};

// Module mỗi vai trò được thấy (RLS trong database vẫn là lớp chặn thật sự).
export const NAV = {
  owner: ['orders', 'logs', 'attendance', 'payroll', 'stock', 'fabrics', 'employees', 'products', 'rates'],
  manager: ['orders', 'logs', 'attendance', 'employees', 'products', 'rates'],
  storekeeper: ['stock', 'fabrics'],
  accountant: ['orders', 'logs', 'attendance', 'payroll', 'employees', 'rates'],
  leader: ['orders', 'logs', 'attendance'],
};

export const ORDER_STATUS = {
  pending: 'Chưa làm',
  in_progress: 'Đang làm',
  done: 'Hoàn thành',
};

export const ABSENCE = {
  leave: 'Nghỉ phép',
  unpaid: 'Nghỉ không lương',
};
