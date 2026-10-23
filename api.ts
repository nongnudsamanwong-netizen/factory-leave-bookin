import { createClient } from '@supabase/supabase-js';
import type {
  AuditLog, Booking, BookingFilters, DayCount, Employee, EmployeeAdmin, Shift, Role,
} from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

// Only the public anon key is used. It can do nothing except call the
// SECURITY DEFINER functions, which validate the session token server-side.
const supabase = isConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

/** Error carrying the server error code (e.g. QUOTA_FULL). */
export class ApiError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new ApiError('NOT_CONFIGURED');
  let res;
  try {
    res = await supabase.rpc(fn, args);
  } catch {
    throw new ApiError('NETWORK');
  }
  if (res.error) {
    const code = (res.error.message || '').trim();
    if (/^[A-Z_]+$/.test(code)) throw new ApiError(code);
    if (res.error.code === '42501') throw new ApiError('FORBIDDEN');
    if (!res.status || res.status >= 500 && !res.error.code) throw new ApiError('NETWORK');
    throw new ApiError('UNKNOWN', res.error.message);
  }
  return res.data as T;
}

const nil = (v?: string) => (v ? v : null);

export const api = {
  login: (employeeId: string, pin?: string) =>
    rpc<
      | { status: 'ok'; token: string; employee: Employee; is_admin: boolean }
      | { status: 'pin_required' | 'pin_invalid' }
    >('login', { p_employee_id: employeeId, p_pin: pin ?? null }),

  logout: (token: string) => rpc<void>('logout', { p_token: token }),

  me: (token: string) =>
    rpc<{ employee: Employee; is_admin: boolean; today: string; quota: number }>('me', { p_token: token }),

  calendarCounts: (token: string, from: string, to: string) =>
    rpc<DayCount[]>('get_calendar_counts', { p_token: token, p_from: from, p_to: to }),

  myBookings: (token: string) => rpc<Booking[]>('get_my_bookings', { p_token: token }),

  bookLeave: (token: string, date: string, reason: string) =>
    rpc<Booking & { shift_count: number; quota: number }>('book_leave', {
      p_token: token, p_leave_date: date, p_reason: reason,
    }),

  cancelMyBooking: (token: string, id: number) =>
    rpc<Booking>('cancel_my_booking', { p_token: token, p_booking_id: id }),

  // ---------------- admin ----------------
  listEmployees: (token: string) => rpc<EmployeeAdmin[]>('admin_list_employees', { p_token: token }),

  saveEmployee: (
    token: string,
    e: { id: string | null; employee_id: string; full_name: string; department: string;
         shift: Shift; role: Role; is_active: boolean },
  ) =>
    rpc<EmployeeAdmin>('admin_save_employee', {
      p_token: token, p_id: e.id, p_employee_id: e.employee_id, p_full_name: e.full_name,
      p_department: e.department, p_shift: e.shift, p_role: e.role, p_is_active: e.is_active,
    }),

  setPin: (token: string, employeeRef: string, pin: string) =>
    rpc<void>('admin_set_pin', { p_token: token, p_employee: employeeRef, p_pin: pin }),

  listBookings: (token: string, f: BookingFilters) =>
    rpc<Booking[]>('admin_list_bookings', {
      p_token: token, p_from: nil(f.from), p_to: nil(f.to), p_department: nil(f.department),
      p_shift: nil(f.shift), p_status: nil(f.status), p_type: nil(f.type), p_search: nil(f.search),
    }),

  cancelBooking: (token: string, id: number, reason: string) =>
    rpc<Booking>('admin_cancel_booking', { p_token: token, p_booking_id: id, p_reason: reason }),

  updateBooking: (token: string, id: number, date: string, reason: string) =>
    rpc<Booking>('admin_update_booking', {
      p_token: token, p_booking_id: id, p_leave_date: date, p_reason: reason,
    }),

  specialBooking: (
    token: string,
    s: { employeeRef: string; date: string; reason: string; approvedBy: string;
         approvedAt: string; note: string },
  ) =>
    rpc<Booking & { shift_count: number }>('admin_special_booking', {
      p_token: token, p_employee: s.employeeRef, p_leave_date: s.date, p_reason: s.reason,
      p_approved_by: s.approvedBy, p_approved_at: s.approvedAt, p_approval_note: s.note || null,
    }),

  auditLogs: (token: string, limit = 200) =>
    rpc<AuditLog[]>('admin_audit_logs', { p_token: token, p_limit: limit }),
};
