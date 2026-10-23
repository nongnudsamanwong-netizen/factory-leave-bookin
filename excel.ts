import * as XLSX from 'xlsx';
import type { Booking, BookingFilters } from './types';
import { fmtTs } from './dates';
import { SHIFT_LABEL, STATUS_LABEL, TYPE_LABEL } from './messages';

/**
 * Neutralise spreadsheet formula injection: any user-entered text that starts
 * with = + - @ TAB or CR is prefixed with an apostrophe so Excel treats it as text.
 */
export function safeCell(v: unknown): string | number {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v;
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export const EXCEL_HEADERS = [
  'Booking ID', 'Employee ID', 'Employee Name', 'Department', 'Shift', 'Leave Date',
  'Leave Reason', 'Booking Date and Time', 'Booking Status', 'Booking Type',
  'Approved By', 'Approval Date and Time', 'Created By', 'Last Updated Date and Time',
] as const;

export function bookingToRow(b: Booking): (string | number)[] {
  return [
    b.id,
    safeCell(b.employee_code),
    safeCell(b.employee_name),
    safeCell(b.department),
    b.shift,
    b.leave_date,
    safeCell(b.leave_reason),
    fmtTs(b.created_at),
    b.status === 'active' ? 'Active' : 'Cancelled',
    b.booking_type === 'special' ? 'Special' : 'Normal',
    safeCell(b.approved_by ?? ''),
    fmtTs(b.approved_at),
    safeCell(`${b.created_by_code} - ${b.created_by_name}`),
    fmtTs(b.updated_at),
  ];
}

export function exportFileName(f: BookingFilters): string {
  const today = new Date().toISOString().slice(0, 10);
  const from = f.from || 'start';
  const to = f.to || today;
  const extra = [f.shift && `Shift${f.shift}`, f.type, f.status].filter(Boolean).join('_');
  return `Leave_Bookings_${from}_to_${to}${extra ? '_' + extra : ''}.xlsx`;
}

export function exportBookings(rows: Booking[], f: BookingFilters, exportedBy: string): string {
  const wb = XLSX.utils.book_new();

  const data = [EXCEL_HEADERS as unknown as string[], ...rows.map(bookingToRow)];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [8, 12, 26, 16, 7, 12, 40, 18, 12, 11, 24, 18, 26, 18].map((wch) => ({ wch }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length - 1, c: EXCEL_HEADERS.length - 1 } }) };
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, 'Bookings');

  const info: (string | number)[][] = [
    ['Factory Leave Booking System — Export'],
    [],
    ['Exported at (Asia/Bangkok)', fmtTs(new Date().toISOString())],
    ['Exported by', safeCell(exportedBy)],
    ['Records', rows.length],
    ['Active', rows.filter((r) => r.status === 'active').length],
    ['Cancelled', rows.filter((r) => r.status === 'cancelled').length],
    ['Special bookings', rows.filter((r) => r.booking_type === 'special').length],
    [],
    ['Applied filters'],
    ['Leave date from', f.from || '(any)'],
    ['Leave date to', f.to || '(any)'],
    ['Department', safeCell(f.department || '(all)')],
    ['Shift', f.shift ? SHIFT_LABEL[f.shift] : '(all)'],
    ['Status', f.status ? STATUS_LABEL[f.status] : '(all)'],
    ['Booking type', f.type ? TYPE_LABEL[f.type] : '(all)'],
    ['Search', safeCell(f.search || '(none)')],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(info);
  wsInfo['!cols'] = [{ wch: 28 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Report Info');

  wb.Props = {
    Title: 'Leave Bookings',
    Subject: `Filters: ${JSON.stringify(f)}`,
    Author: exportedBy,
    CreatedDate: new Date(),
  };

  const name = exportFileName(f);
  XLSX.writeFile(wb, name, { bookType: 'xlsx', compression: true });
  return name;
}
