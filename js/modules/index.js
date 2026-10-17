import orders from './orders.js';
import logs from './logs.js';
import attendance from './attendance.js';
import payroll from './payroll.js';
import stock from './stock.js';
import fabrics from './fabrics.js';
import employees from './employees.js';
import products from './products.js';
import rates from './rates.js';

// Mỗi module: { title, writeRoles, load(), forms() }. Form có thể có roles riêng.
export default { orders, logs, attendance, payroll, stock, fabrics, employees, products, rates };
