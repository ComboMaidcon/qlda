import dashboard from './dashboard.js';
import orders from './orders.js';
import logs from './logs.js';
import attendance from './attendance.js';
import timesheet from './timesheet.js';
import payroll from './payroll.js';
import stock from './stock.js';
import stockHistory from './stockHistory.js';
import fabrics from './fabrics.js';
import suppliers from './suppliers.js';
import employees from './employees.js';
import products from './products.js';
import rates from './rates.js';
import reports from './reports.js';
import accounts from './accounts.js';
import audit from './audit.js';
import norms from './norms.js';
import fabricUsage from './fabricUsage.js';
import accessories from './accessories.js';
import accessoryMoves from './accessoryMoves.js';
import bundles from './bundles.js';
import scan from './scan.js';
import myPay from './myPay.js';

// Mỗi module: { title, writeRoles, load(ctx) | render(host, ctx), forms(), rowActions(row), onRowAction(), filters, range, exportName }.
export default {
  dashboard, orders, logs, attendance, timesheet, payroll, stock, stockHistory,
  fabrics, suppliers, employees, products, rates, reports, accounts, audit,
  norms, fabricUsage, accessories, accessoryMoves, bundles, scan, myPay,
};
