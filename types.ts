export type Shift = 'A' | 'B';
export type Role = 'employee' | 'admin';
export type BookingStatus = 'active' | 'cancelled';
export type BookingType = 'normal' | 'special';

export interface Employee {
  id: string;
  employee_id: string;
  full_name: string;
  department: string;
  shift: Shift;
  role: Role;
}

export interface EmployeeAdmin extends Employee {
  is_active: boolean;
  has_pin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Session {
  token: string;
  employee: Employee;
  isAdmin: boolean;
}

export interface DayCount {
  leave_date: string; // yyyy-MM-dd
  shift: Shift;
  count: number;
  special_count: number;
}

export interface Booking {
  id: number;
  employee_ref: string;
  employee_code: string;
  employee_name: string;
  leave_date: string;
  shift: Shift;
  department: string;
  leave_reason: string;
  status: BookingStatus;
  booking_type: BookingType;
  approved_by: string | null;
  approved_at: string | null;
  approval_note: string | null;
  created_by_code: string;
  created_by_name: string;
  cancelled_by_code: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingFilters {
  from?: string;
  to?: string;
  department?: string;
  shift?: '' | Shift;
  status?: '' | BookingStatus;
  type?: '' | BookingType;
  search?: string;
}

export interface AuditLog {
  id: number;
  action: string;
  affected_record_id: string | null;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  actor_code: string | null;
  actor_name: string | null;
}
