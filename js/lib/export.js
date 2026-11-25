import { plain } from './data.js';

let xlsxLoading;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  xlsxLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => { xlsxLoading = null; reject(new Error('Không tải được thư viện Excel')); };
    document.head.appendChild(script);
  });
  return xlsxLoading;
}

// columns: [[tiêu đề, render, raw?], ...]. Cột tiêu đề rỗng bị bỏ. raw(row) trả số/chuỗi gốc cho Excel.
export function toMatrix(columns, rows, footer) {
  const used = columns.map((c, i) => [c, i]).filter(([c]) => c[0]);
  const cell = (col, row) => (col[2] ? col[2](row) : plain(col[1](row)));
  const matrix = [used.map(([c]) => plain(c[0]))];
  rows.forEach(r => matrix.push(used.map(([c]) => cell(c, r))));
  if (footer) matrix.push(used.map(([, i]) => plain(footer[i] ?? '')));
  return matrix;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvOf(matrix) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '﻿' + matrix.map(r => r.map(q).join(',')).join('\r\n');
}

// Xuất ma trận ra .xlsx; nếu không tải được thư viện thì rơi về .csv (Excel mở được, có BOM cho tiếng Việt).
export async function exportMatrix(matrix, name) {
  const stamp = new Date().toLocaleDateString('sv-SE');
  try {
    const XLSX = await loadXlsx();
    const sheet = XLSX.utils.aoa_to_sheet(matrix);
    sheet['!cols'] = matrix[0].map((_, c) => ({ wch: Math.min(40, Math.max(8, ...matrix.map(r => String(r[c] ?? '').length)) + 2) }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, name.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
    XLSX.writeFile(book, `${name}-${stamp}.xlsx`);
  } catch {
    download(new Blob([csvOf(matrix)], { type: 'text/csv;charset=utf-8' }), `${name}-${stamp}.csv`);
  }
}
